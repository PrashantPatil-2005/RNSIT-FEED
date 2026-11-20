"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizeForm, toPayload, validateForSubmit } from "@/lib/experience/draft";
import { isUuid } from "@/lib/data/filters";
import { getViewer } from "@/lib/auth/session";
import type { DbClient } from "@/lib/supabase/server";

/**
 * Draft and submission actions. Every call re-checks the signed-in, onboarded user on the server,
 * and every value from the browser goes through normalizeForm/toPayload (whitelisted fields, strict
 * types and limits). The database functions then authorize again (author only, draft/returned only)
 * and enforce versions, completeness, limits and duplicate protection.
 */

export type SaveResult =
  | { ok: true; id: string; version: number; notSaved: string[] }
  | { ok: false; code: SaveErrorCode };

export type SaveErrorCode =
  | "signed_out"
  | "not_onboarded"
  | "conflict"
  | "not_editable"
  | "not_found"
  | "draft_limit"
  | "invalid"
  | "suspended"
  | "failed";

function versionOf(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1_000_000 ? v : null;
}

type MemberDb = { db: DbClient; error?: undefined } | { error: "signed_out" | "not_onboarded" };

async function memberDb(): Promise<MemberDb> {
  const viewer = await getViewer();
  if (!viewer) return { error: "signed_out" as const };
  if (!viewer.profile?.onboarded) return { error: "not_onboarded" as const };
  return { db: viewer.db };
}

function mapError(message: string): SaveErrorCode {
  if (message.includes("version_conflict")) return "conflict";
  if (message.includes("invalid_state")) return "not_editable";
  if (message.includes("not_found")) return "not_found";
  if (message.includes("limit_reached")) return "draft_limit";
  if (message.includes("invalid_input")) return "invalid";
  if (message.includes("onboarding_required")) return "not_onboarded";
  if (message.includes("suspended")) return "suspended";
  return "failed";
}

/** Autosave and manual save. `id` null creates a new draft. */
export async function saveDraftAction(input: {
  id: unknown;
  version: unknown;
  form: unknown;
}): Promise<SaveResult> {
  const m = await memberDb();
  if (m.error) return { ok: false, code: m.error };
  const id = typeof input.id === "string" && isUuid(input.id) ? input.id : null;
  const version = versionOf(input.version);
  if (id && version === null) return { ok: false, code: "invalid" };

  const { payload, notSaved } = toPayload(normalizeForm(input.form));
  const { data, error } = await m.db.rpc("save_draft", {
    p_id: id as string,
    p_expected_version: version as number,
    p_payload: payload as never,
  });
  if (error) return { ok: false, code: mapError(error.message) };
  const res = data as { id?: unknown; row_version?: unknown } | null;
  if (!res || typeof res.id !== "string" || versionOf(res.row_version) === null) {
    return { ok: false, code: "failed" };
  }
  return { ok: true, id: res.id, version: res.row_version as number, notSaved };
}

export type SubmitResult = { ok: false; code: SubmitErrorCode; issues?: string[] };
export type SubmitErrorCode =
  | SaveErrorCode
  | "incomplete"
  | "duplicate"
  | "pending_limit"
  | "already_submitted"
  | "posting_paused";

/**
 * Saves the final state and submits it for moderation in one server round trip. On success the
 * post is `pending` (never public) and the user is sent to their list.
 */
export async function submitExperienceAction(input: {
  id: unknown;
  version: unknown;
  form: unknown;
}): Promise<SubmitResult> {
  const form = normalizeForm(input.form);
  const issues = validateForSubmit(form);
  if (issues.length) return { ok: false, code: "incomplete", issues: issues.map((i) => i.message) };

  const saved = await saveDraftAction({ id: input.id, version: input.version, form });
  if (!saved.ok) {
    return { ok: false, code: saved.code === "not_editable" ? "already_submitted" : saved.code };
  }
  const m = await memberDb();
  if (m.error) return { ok: false, code: m.error };
  const { error } = await m.db.rpc("submit_experience", { p_id: saved.id });
  if (error) {
    const msg = error.message;
    if (msg.includes("duplicate_submission")) return { ok: false, code: "duplicate" };
    if (msg.includes("posting_paused")) return { ok: false, code: "posting_paused" };
    if (msg.includes("incomplete")) return { ok: false, code: "incomplete" };
    if (msg.includes("limit_reached")) return { ok: false, code: "pending_limit" };
    if (msg.includes("invalid_state")) return { ok: false, code: "already_submitted" };
    return { ok: false, code: mapError(msg) };
  }
  revalidatePath("/my/experiences");
  redirect("/my/experiences?submitted=1");
}

/** Deletes a draft (only drafts; the database refuses anything else). */
export async function deleteDraftAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const m = await memberDb();
  if (m.error || !isUuid(id)) redirect("/my/experiences?error=failed");
  const { error } = await m.db.rpc("delete_draft", { p_id: id });
  revalidatePath("/my/experiences");
  redirect(error ? "/my/experiences?error=failed" : "/my/experiences?deleted=1");
}

/** Pulls a pending post back to draft before review (O-4). */
export async function cancelSubmissionAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const m = await memberDb();
  if (m.error || !isUuid(id)) redirect("/my/experiences?error=failed");
  const { error } = await m.db.rpc("cancel_submission", { p_id: id });
  revalidatePath("/my/experiences");
  redirect(error ? "/my/experiences?error=failed" : `/share/${id}?cancelled=1`);
}
