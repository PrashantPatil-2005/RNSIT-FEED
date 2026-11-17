import "server-only";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient, type DbClient } from "@/lib/supabase/server";

export type UserRole = Database["public"]["Enums"]["user_role"];

export interface Profile {
  id: string;
  fullName: string;
  role: UserRole;
  departmentId: number | null;
  batchId: number | null;
  onboarded: boolean;
  deletionRequested: boolean;
}

export interface Viewer {
  db: DbClient;
  user: User;
  profile: Profile | null;
}

/**
 * The signed-in user for this request, verified with the Auth server (getUser), plus their own
 * profile row (RLS lets a user read only their own). Memoised per request so the header and the
 * page share one lookup. Returns null for visitors.
 *
 * The role shown here is for display only: every permission is enforced again in the database.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const db = await createSupabaseServerClient();
  if (!db) return null;
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;
  const { data: p } = await db
    .from("profiles")
    .select("id, full_name, role, department_id, batch_id, onboarded_at, deletion_requested_at")
    .eq("id", user.id)
    .maybeSingle();
  return {
    db,
    user,
    profile: p
      ? {
          id: p.id,
          fullName: p.full_name,
          role: p.role,
          departmentId: p.department_id,
          batchId: p.batch_id,
          onboarded: p.onboarded_at !== null,
          deletionRequested: p.deletion_requested_at !== null,
        }
      : null,
  };
});

/** For protected pages: sends visitors to sign-in (the proxy does this too; this is the backstop). */
export async function requireViewer(nextPath: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`);
  return viewer;
}
