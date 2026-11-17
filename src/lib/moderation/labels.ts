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
};

/** The moderation queue filters (brief: pending, approved, rejected, returned). */
export const QUEUE_FILTERS = ["pending", "returned", "rejected", "approved"] as const;
export type QueueFilter = (typeof QUEUE_FILTERS)[number];

export const queueLabels: Record<QueueFilter, string> = {
  pending: "Pending",
  returned: "Changes requested",
  rejected: "Rejected",
  approved: "Approved",
};

export function isQueueFilter(v: unknown): v is QueueFilter {
  return typeof v === "string" && (QUEUE_FILTERS as readonly string[]).includes(v);
}
