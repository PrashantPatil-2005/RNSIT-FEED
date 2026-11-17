"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ui/ActionForm";
import { getViewer, type Viewer } from "@/lib/auth/session";
import {
  COMMENT_MAX,
  COMMENT_MIN,
  communityErrorMessage,
  isReportReason,
  REPORT_DETAILS_MAX,
} from "@/lib/community/labels";
import { isUuid } from "@/lib/data/filters";

/**
 * Member actions on a published experience. The database re-checks everything: a verified,
 * onboarded member; the post is approved; authors cannot vote on or report their own post; one
 * vote per member; rate limits on comments and open reports.
 */
async function member(): Promise<Viewer | null> {
  const v = await getViewer();
  const p = v?.profile;
  if (!v || !p || !p.onboarded || p.deletionRequested) return null;
  return v;
}

const SIGN_IN: ActionState = { error: "Sign in with your RNSIT account and finish setup first." };

function field(data: FormData, key: string, max: number): string {
  return String(data.get(key) ?? "")
    .trim()
    .slice(0, max);
}

function refresh(id: string) {
  revalidatePath(`/experiences/${id}`);
}

export interface HelpfulState {
  count: number;
  voted: boolean;
  error?: string;
}

export async function helpfulAction(prev: HelpfulState, data: FormData): Promise<HelpfulState> {
  const v = await member();
  if (!v) return { ...prev, error: SIGN_IN.error };
  const id = field(data, "id", 40);
  const helpful = data.get("helpful") === "1";
  if (!isUuid(id)) return { ...prev, error: "Invalid request." };
  const { data: count, error } = await v.db.rpc("set_helpful_vote", {
    p_experience: id,
    p_helpful: helpful,
  });
  if (error || typeof count !== "number") {
    return { ...prev, error: communityErrorMessage(error?.message ?? "", "vote") };
  }
  refresh(id);
  return { count, voted: helpful };
}

export async function addCommentAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  const v = await member();
  if (!v) return SIGN_IN;
  const id = field(data, "id", 40);
  const body = field(data, "body", COMMENT_MAX + 1);
  if (!isUuid(id)) return { error: "Invalid request." };
  if (body.length < COMMENT_MIN || body.length > COMMENT_MAX) {
    return { error: `Write between ${COMMENT_MIN} and ${COMMENT_MAX} characters.` };
  }
  const { error } = await v.db.rpc("add_comment", { p_experience: id, p_body: body });
  if (error) return { error: communityErrorMessage(error.message, "comment") };
  refresh(id);
  return { ok: "Comment posted." };
}

export async function deleteCommentAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const v = await member();
  if (!v) return SIGN_IN;
  const id = field(data, "id", 40);
  const comment = field(data, "comment", 40);
  if (!isUuid(id) || !isUuid(comment)) return { error: "Invalid request." };
  const { error } = await v.db.rpc("delete_my_comment", { p_id: comment });
  if (error) return { error: communityErrorMessage(error.message, "comment") };
  refresh(id);
  return { ok: "Comment deleted." };
}

export async function reportExperienceAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const v = await member();
  if (!v) return SIGN_IN;
  const id = field(data, "id", 40);
  const reason = field(data, "reason", 30);
  const details = field(data, "details", REPORT_DETAILS_MAX);
  if (!isUuid(id)) return { error: "Invalid request." };
  if (!isReportReason(reason)) return { error: "Choose a reason." };
  const { error } = await v.db.rpc("report_experience", {
    p_id: id,
    p_reason: reason,
    p_details: details || undefined,
  });
  if (error) return { error: communityErrorMessage(error.message, "report") };
  refresh(id);
  return { ok: "Thank you. Moderators will review your report." };
}

export async function reportCommentAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const v = await member();
  if (!v) return SIGN_IN;
  const id = field(data, "id", 40);
  const comment = field(data, "comment", 40);
  const reason = field(data, "reason", 30);
  const details = field(data, "details", REPORT_DETAILS_MAX);
  if (!isUuid(id) || !isUuid(comment)) return { error: "Invalid request." };
  if (!isReportReason(reason)) return { error: "Choose a reason." };
  const { error } = await v.db.rpc("report_comment", {
    p_id: comment,
    p_reason: reason,
    p_details: details || undefined,
  });
  if (error) return { error: communityErrorMessage(error.message, "report") };
  refresh(id);
  return { ok: "Thank you. Moderators will review this comment." };
}
