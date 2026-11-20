import type { Database } from "@/lib/supabase/database.types";

export type ReportReason = Database["public"]["Enums"]["report_reason"];

export const reportReasonLabels: Record<ReportReason, string> = {
  nda: "Confidential or NDA material",
  personal_info: "Personal or contact details",
  defamation: "Attacks a person",
  spam: "Spam or advertising",
  fake: "Fake or misleading",
  other: "Something else",
};

export const REPORT_REASONS = Object.keys(reportReasonLabels) as ReportReason[];

export function isReportReason(v: unknown): v is ReportReason {
  return typeof v === "string" && (REPORT_REASONS as string[]).includes(v);
}

export const COMMENT_MIN = 2;
export const COMMENT_MAX = 2000;
export const REPORT_DETAILS_MAX = 1000;

/** Fixed, safe messages for errors raised by the community database functions. */
export function communityErrorMessage(raw: string, what: "comment" | "report" | "vote"): string {
  if (raw.includes("limit_reached")) {
    return what === "comment"
      ? "You have posted a lot of comments in the last hour. Please try again later."
      : "You already have 10 open reports. Please wait until moderators review them.";
  }
  if (raw.includes("forbidden")) {
    return what === "vote"
      ? "You cannot vote on your own experience."
      : "You cannot report your own post or comment.";
  }
  if (raw.includes("suspended")) return "Your account is suspended. You can still read everything.";
  if (raw.includes("comments_paused")) return "Comments are paused by the site team for now.";
  if (raw.includes("not_found")) return "This is no longer available. Reload the page.";
  if (raw.includes("invalid_input")) {
    return what === "comment"
      ? `Write between ${COMMENT_MIN} and ${COMMENT_MAX} characters.`
      : "Check the values and try again.";
  }
  if (raw.includes("onboarding_required")) return "Finish setting up your account first.";
  if (raw.includes("not_authenticated")) return "Your session ended. Sign in again.";
  return "That could not be saved. Please try again.";
}
