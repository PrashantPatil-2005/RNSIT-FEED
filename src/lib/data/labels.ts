import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];
export type OpportunityType = Enums["opportunity_type"];
export type CampusType = Enums["campus_type"];
export type ResultType = Enums["result_type"];
export type RoundType = Enums["round_type"];

export const opportunityLabels: Record<OpportunityType, string> = {
  internship: "Internship",
  full_time: "Full-time",
  both: "Internship + Full-time",
};

export const campusLabels: Record<CampusType, string> = {
  on_campus: "On-campus",
  off_campus: "Off-campus",
};

export const resultLabels: Record<ResultType, string> = {
  selected: "Selected",
  rejected: "Not selected",
  waitlisted: "Waitlisted",
};

export const roundLabels: Record<RoundType, string> = {
  oa: "Online assessment",
  technical: "Technical",
  hr: "HR",
  gd: "Group discussion",
  managerial: "Managerial",
};

/** Formats a `YYYY-MM-DD` date (the public views expose dates only) without timezone drift. */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

export function isKey<T extends string>(record: Record<T, string>, value: unknown): value is T {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(record, value);
}
