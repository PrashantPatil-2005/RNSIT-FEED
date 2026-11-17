import type { Database } from "@/lib/supabase/database.types";

export type ReasonCode = Database["public"]["Enums"]["reason_code"];
export type ModAction = Database["public"]["Enums"]["mod_action"];
export type ExpStatus = Database["public"]["Enums"]["exp_status"];

export const reasonLabels: Record<ReasonCode, string> = {
  nda: "Confidential or NDA material",
  personal_info: "Personal information",
  defamation: "Attacks a person",
  low_quality: "Too little detail / unclear",
  duplicate: "Duplicate",
  other: "Other",
};

export const REASON_CODES = Object.keys(reasonLabels) as ReasonCode[];

export const actionLabels: Partial<Record<ModAction, string>> = {
  submit: "Submitted",
  resubmit: "Resubmitted",
  approve: "Approved",
  return: "Changes requested",
  reject: "Rejected",
  remove: "Removed",
  restore: "Restored",
  withdraw: "Withdrawn by author",
  cancel_submission: "Pulled back by author",
  resolve_report: "Report acted on",
  dismiss_report: "Report dismissed",
  remove_comment: "Comment removed",
  restore_comment: "Comment restored",
  resolve_comment_report: "Comment report acted on",
  dismiss_comment_report: "Comment report dismissed",
};

/** The moderation queue filters (brief: pending, approved, rejected, returned) plus removed. */
export const QUEUE_FILTERS = ["pending", "returned", "rejected", "approved", "removed"] as const;
export type QueueFilter = (typeof QUEUE_FILTERS)[number];

export const queueLabels: Record<QueueFilter, string> = {
  pending: "Pending",
  returned: "Changes requested",
  rejected: "Rejected",
  approved: "Approved",
  removed: "Removed",
};

/** Maps database errors from staff functions to fixed, safe messages. */
export function staffErrorMessage(raw: string): string {
  if (raw.includes("reason_required")) return "Choose a reason.";
  if (raw.includes("invalid_state")) return "Someone already handled this. Reload the page.";
  if (raw.includes("version_conflict")) return "The post changed. Reload and review it again.";
  if (raw.includes("forbidden")) return "You cannot moderate your own post or comment.";
  if (raw.includes("not_found")) return "It no longer exists. Reload the page.";
  return "That could not be saved. Please try again.";
}

export function isQueueFilter(v: unknown): v is QueueFilter {
  return typeof v === "string" && (QUEUE_FILTERS as readonly string[]).includes(v);
}
