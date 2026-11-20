import "server-only";
import { notFound, redirect } from "next/navigation";
import { requireViewer, type Viewer } from "./session";

/**
 * Gate for moderation pages. Non-staff get a 404 (the area's existence is not advertised).
 * This is a UI gate only: the database refuses every moderation read and action for non-staff
 * (views filter on private.is_staff(), functions call private.require_staff()).
 */
export async function requireStaff(nextPath: string): Promise<Viewer> {
  const viewer = await requireViewer(nextPath);
  const p = viewer.profile;
  if (p && !p.onboarded) redirect("/onboarding");
  if (!p || p.deletionRequested || p.suspended || (p.role !== "moderator" && p.role !== "admin"))
    notFound();
  return viewer;
}

/** Gate for admin pages; same rules as requireStaff. The database re-checks every admin call. */
export async function requireAdmin(nextPath: string): Promise<Viewer> {
  const viewer = await requireViewer(nextPath);
  const p = viewer.profile;
  if (p && !p.onboarded) redirect("/onboarding");
  if (!p || p.deletionRequested || p.suspended || p.role !== "admin") notFound();
  return viewer;
}

export function isStaffRole(role: string | undefined): boolean {
  return role === "moderator" || role === "admin";
}
