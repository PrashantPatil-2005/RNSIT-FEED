"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/ui/ActionForm";
import { getViewer, type Viewer } from "@/lib/auth/session";
import { isStaffRole } from "@/lib/auth/staff";
import { isUuid } from "@/lib/data/filters";
import { REASON_CODES, staffErrorMessage, type ReasonCode } from "@/lib/moderation/labels";

export interface DecisionState {
  error?: string;
  /** Echo of the submitted reason/note: React resets forms after an action, so the panel
   *  re-renders with these instead of losing the moderator's text. */
  values?: { action: string; reason: string; note: string };
  attempt?: number;
  /** Set when the post changed or was decided elsewhere: the reviewer must reload. */
  stale?: boolean;
}

const ACTIONS = ["approve", "return", "reject"] as const;
type Decision = (typeof ACTIONS)[number];

/**
 * Records a moderation decision. Inputs are validated here, then moderate_experience re-checks
 * everything in the database: staff role (read from the database, never from the request), not
 * the moderator's own post, status still pending (row lock), the reviewed version, and a reason
 * code plus a note for "request changes" and "reject".
 */
export async function decideAction(
  prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const result = await decide(formData);
  return {
    ...result,
    values: {
      action: String(formData.get("action") ?? "").slice(0, 10),
      reason: String(formData.get("reason") ?? "").slice(0, 20),
      note: String(formData.get("note") ?? "").slice(0, 1000),
    },
    attempt: (prev.attempt ?? 0) + 1,
  };
}

async function decide(formData: FormData): Promise<Pick<DecisionState, "error" | "stale">> {
  const viewer = await getViewer();
  if (!viewer || !isStaffRole(viewer.profile?.role))
    return { error: "You are not allowed to moderate." };

  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? "") as Decision;
  const version = Number(formData.get("version"));
  const reasonRaw = String(formData.get("reason") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!isUuid(id) || !ACTIONS.includes(action) || !Number.isInteger(version) || version < 0) {
    return { error: "Invalid request." };
  }
  let reason: ReasonCode | undefined;
  if (action !== "approve") {
    if (!(REASON_CODES as string[]).includes(reasonRaw)) return { error: "Choose a reason." };
    reason = reasonRaw as ReasonCode;
    if (note.length < 10) return { error: "Write a note for the author (at least 10 characters)." };
    if (note.length > 1000) return { error: "The note is too long (1000 characters at most)." };
  }

  const { error } = await viewer.db.rpc("moderate_experience", {
    p_id: id,
    p_action: action,
    p_reason: reason,
    p_note: action === "approve" ? undefined : note,
    p_expected_version: version,
  });
  if (error) {
    const m = error.message;
    if (m.includes("version_conflict")) {
      return {
        stale: true,
        error:
          "The author changed this experience after you opened it. Reload and review the latest version.",
      };
    }
    if (m.includes("invalid_state")) {
      return { stale: true, error: "Another moderator already decided on this experience." };
    }
    if (m.includes("forbidden"))
      return { error: "You cannot moderate this experience (for example, your own post)." };
    if (m.includes("note_required"))
      return { error: "Write a note for the author (at least 10 characters)." };
    if (m.includes("reason_required")) return { error: "Choose a reason." };
    if (m.includes("not_found")) return { stale: true, error: "This experience no longer exists." };
    return { error: "The decision could not be saved. Please try again." };
  }
  revalidatePath("/moderation");
  revalidatePath("/experiences");
  revalidatePath("/", "layout");
  redirect(`/moderation?done=${action}`);
}

// ---------- Reports, comments, and published posts ----------
// Each action re-checks the staff role here; the database checks it again (require_staff), refuses
// a moderator's own post or comment, locks the row, and writes the moderation history.

async function staffViewer(): Promise<Viewer | null> {
  const v = await getViewer();
  const p = v?.profile;
  if (!v || !p || !isStaffRole(p.role) || !p.onboarded || p.deletionRequested || p.suspended)
    return null;
  return v;
}

const STAFF_ONLY: ActionState = { error: "You are not allowed to moderate." };

function val(data: FormData, key: string, max = 1000): string {
  return String(data.get(key) ?? "")
    .trim()
    .slice(0, max);
}

function reasonOf(data: FormData): ReasonCode | undefined {
  const r = val(data, "reason", 30);
  return (REASON_CODES as string[]).includes(r) ? (r as ReasonCode) : undefined;
}

function refreshStaff(experienceId?: string) {
  revalidatePath("/moderation", "layout");
  revalidatePath("/experiences");
  revalidatePath("/companies");
  if (experienceId) revalidatePath(`/experiences/${experienceId}`);
}

/** Post report: dismiss, act without removing, or act and remove the post (reason required). */
export async function resolveReportAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const v = await staffViewer();
  if (!v) return STAFF_ONLY;
  const id = val(data, "id", 40);
  const experience = val(data, "experience", 40);
  const outcome = val(data, "outcome", 20);
  const reason = reasonOf(data);
  if (!isUuid(id) || !isUuid(experience)) return { error: "Invalid request." };
  if (!["dismiss", "action", "remove"].includes(outcome)) return { error: "Choose an outcome." };
  if (outcome === "remove" && !reason) return { error: "Choose a reason for removing the post." };
  const { error } = await v.db.rpc("resolve_report", {
    p_id: id,
    p_outcome: outcome === "dismiss" ? "dismissed" : "actioned",
    p_reason: reason,
    p_remove: outcome === "remove",
  });
  if (error) return { error: staffErrorMessage(error.message) };
  refreshStaff(experience);
  return {
    ok:
      outcome === "dismiss"
        ? "Report dismissed."
        : outcome === "remove"
          ? "Post removed from public view."
          : "Report marked as acted on.",
  };
}

/** Comment report: dismiss, or act and optionally remove the comment (reason required). */
export async function resolveCommentReportAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const v = await staffViewer();
  if (!v) return STAFF_ONLY;
  const id = val(data, "id", 40);
  const experience = val(data, "experience", 40);
  const outcome = val(data, "outcome", 20);
  const reason = reasonOf(data);
  if (!isUuid(id) || !isUuid(experience)) return { error: "Invalid request." };
  if (!["dismiss", "action", "remove"].includes(outcome)) return { error: "Choose an outcome." };
  if (outcome === "remove" && !reason)
    return { error: "Choose a reason for removing the comment." };
  const { error } = await v.db.rpc("resolve_comment_report", {
    p_id: id,
    p_outcome: outcome === "dismiss" ? "dismissed" : "actioned",
    p_reason: reason,
    p_remove: outcome === "remove",
  });
  if (error) return { error: staffErrorMessage(error.message) };
  refreshStaff(experience);
  return {
    ok:
      outcome === "dismiss"
        ? "Report dismissed."
        : outcome === "remove"
          ? "Comment removed."
          : "Report marked as acted on.",
  };
}

/** Remove or restore a single comment from the review page. */
export async function moderateCommentAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const v = await staffViewer();
  if (!v) return STAFF_ONLY;
  const id = val(data, "comment", 40);
  const experience = val(data, "experience", 40);
  const action = val(data, "action", 10);
  const reason = reasonOf(data);
  if (!isUuid(id) || !isUuid(experience) || !["remove", "restore"].includes(action)) {
    return { error: "Invalid request." };
  }
  if (action === "remove" && !reason) return { error: "Choose a reason." };
  const { error } = await v.db.rpc("moderate_comment", {
    p_id: id,
    p_action: action,
    p_reason: action === "remove" ? reason : undefined,
  });
  if (error) return { error: staffErrorMessage(error.message) };
  refreshStaff(experience);
  return { ok: action === "remove" ? "Comment removed." : "Comment restored." };
}

/** Take a published post down (reason required, optional note to the author) or put it back. */
export async function removeOrRestorePostAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const v = await staffViewer();
  if (!v) return STAFF_ONLY;
  const id = val(data, "id", 40);
  const action = val(data, "action", 10);
  const version = Number(data.get("version"));
  const reason = reasonOf(data);
  const note = val(data, "note");
  if (!isUuid(id) || !["remove", "restore"].includes(action) || !Number.isInteger(version)) {
    return { error: "Invalid request." };
  }
  if (action === "remove" && !reason) return { error: "Choose a reason." };
  const { error } = await v.db.rpc("moderate_experience", {
    p_id: id,
    p_action: action,
    p_reason: action === "remove" ? reason : undefined,
    p_note: action === "remove" && note ? note : undefined,
    p_expected_version: version,
  });
  if (error) return { error: staffErrorMessage(error.message) };
  refreshStaff(id);
  return {
    ok: action === "remove" ? "Removed from public view." : "Restored. It is public again.",
  };
}
