import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Public site switches and banner notice set by admins (migration 026). */
export interface SiteStatus {
  notice: string | null;
  signupsOpen: boolean;
  postingOpen: boolean;
  commentsOpen: boolean;
}

const OPEN: SiteStatus = { notice: null, signupsOpen: true, postingOpen: true, commentsOpen: true };

/**
 * Reads public.site_status() once per request. Display only: the database enforces every switch.
 * If it cannot be read, everything is shown as open and the database still refuses closed actions.
 */
export const getSiteStatus = cache(async (): Promise<SiteStatus> => {
  const db = await createSupabaseServerClient();
  if (!db) return OPEN;
  const { data, error } = await db.rpc("site_status");
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return OPEN;
  const d = data as Record<string, unknown>;
  return {
    notice: typeof d.notice === "string" && d.notice.trim() ? d.notice.trim() : null,
    signupsOpen: d.signups_open !== false,
    postingOpen: d.posting_open !== false,
    commentsOpen: d.comments_open !== false,
  };
});
