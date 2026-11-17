import type { UserRole } from "./session";

/**
 * Single source of truth for what each role sees in the UI: its home page after sign-in, the staff
 * links in the header, and the plain-language summary on /account. Display only: every page gate
 * (src/lib/auth/staff.ts) and every database function enforces the role again.
 *
 * Plan: docs/ROLES-AND-STAFF-PANEL.md (P1, decision D-R1).
 */

export interface StaffLink {
  href: string;
  label: string;
  roles: readonly UserRole[];
}

const STAFF: readonly UserRole[] = ["moderator", "admin"];
const ADMIN: readonly UserRole[] = ["admin"];

export const STAFF_LINKS: readonly StaffLink[] = [
  { href: "/moderation", label: "Moderation queue", roles: STAFF },
  { href: "/moderation/reports", label: "Reports", roles: STAFF },
  { href: "/admin", label: "Admin dashboard", roles: ADMIN },
  { href: "/admin/users", label: "Users and roles", roles: ADMIN },
  { href: "/admin/team", label: "Moderator team", roles: ADMIN },
];

/** Staff links this role may open, in menu order. Empty for students, alumni and unknown roles. */
export function staffLinksFor(role: UserRole | null | undefined): StaffLink[] {
  if (!role) return [];
  return STAFF_LINKS.filter((l) => l.roles.includes(role));
}

/** Where a role lands after sign-in when no destination was asked for. */
export function homeForRole(role: UserRole | null | undefined): string {
  if (role === "admin") return "/admin";
  if (role === "moderator") return "/moderation";
  return "/";
}

const MEMBER = [
  "Read every experience, company page and search result",
  "Share your placement experiences (named or anonymous)",
  "Mark posts helpful, comment and report problems",
];

/** What each role can do, shown on /account. */
export const roleAbilities: Record<UserRole, readonly string[]> = {
  student: MEMBER,
  alumni: [...MEMBER, "Your posts show the Placed badge"],
  moderator: [
    ...MEMBER,
    "Review pending posts: approve, request changes or reject",
    "Handle reports on published posts",
    "You can never moderate your own posts, and anonymous authors stay hidden from you",
  ],
  admin: [
    ...MEMBER,
    "Everything a moderator can do",
    "Appoint moderators and admins, invite alumni, manage the company list",
    "Read the audit log (each view is itself recorded)",
  ],
};
