import type { UserRole } from "@/lib/auth/session";

export const ROLES = [
  "student",
  "alumni",
  "moderator",
  "admin",
] as const satisfies readonly UserRole[];

export const roleLabels: Record<UserRole, string> = {
  student: "Student",
  alumni: "Alumni",
  moderator: "Moderator",
  admin: "Admin",
};

export const rolePlurals: Record<UserRole, string> = {
  student: "Students",
  alumni: "Alumni",
  moderator: "Moderators",
  admin: "Admins",
};

export function isRole(v: unknown): v is UserRole {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

export const ADMIN_SECTIONS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users and roles" },
  { href: "/admin/team", label: "Moderator team" },
  { href: "/admin/invites", label: "Alumni invites" },
  { href: "/admin/companies", label: "Companies" },
  { href: "/admin/topics", label: "Topics" },
  { href: "/admin/reference", label: "Departments and batches" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/audit", label: "Audit log" },
] as const;

export const auditActionLabels: Record<string, string> = {
  bootstrap_admin: "First admin created",
  set_role: "Role changed",
  correct_name: "Name corrected",
  reveal_author: "Anonymous author revealed",
  view_usn: "USN viewed",
  view_audit: "Audit log viewed",
  manage_company: "Company list changed",
  manage_topic: "Topic list changed",
  take_usn_case: "USN case taken",
  notify_usn_holder: "USN holder notified",
  approve_usn_case: "USN case approved",
  deny_usn_case: "USN case denied",
  execute_usn_release: "USN released",
  invite_alumnus: "Alumnus invited",
  revoke_alumni_invite: "Alumni invite revoked",
  assign_moderator_department: "Moderator assigned to department",
  unassign_moderator_department: "Moderator removed from department",
  moderator_step_down: "Moderator stepped down",
  owner_auto_admin: "Owner signed up as admin",
  change_setting: "Site setting changed",
  manage_reference: "Departments or batches changed",
};

/**
 * Maps database error codes raised by the admin functions to fixed, safe messages. `context`
 * picks the right wording where one code means different limits (two admins; four moderators per
 * department).
 */
export function adminErrorMessage(raw: string, context: "role" | "department" = "role"): string {
  const known: [string, string][] = [
    ["reason_required", "Write a reason of at least 10 characters. It is kept in the audit log."],
    [
      "reason_has_email",
      "Do not put an email address in the reason; the audit log must not hold one.",
    ],
    [
      "limit_reached",
      context === "department"
        ? "This department already has four moderators. Remove one first."
        : "There can be at most two admins.",
    ],
    ["not_moderator", "Only moderators can cover a department. Make them a moderator first."],
    ["already_assigned", "This moderator already covers that department."],
    ["owner_protected", "The owner's role cannot be changed."],
    ["owner_only", "Only the owner can appoint or remove admins."],
    ["last_admin", "The last admin cannot be removed. Appoint another admin first."],
    ["not_needed", "College addresses can sign in directly; they do not need an invite."],
    ["already_registered", "An account with this address already exists."],
    ["already_invited", "This address already has an open invite."],
    ["companies_name_lower_key", "A company with this name already exists."],
    ["companies_slug_key", "A company with this web address already exists."],
    ["company_aliases_alias_lower_key", "This alias is already used."],
    ["topics_name_lower_key", "A topic with this name already exists."],
    ["topics_slug_key", "A topic with this short code already exists."],
    [
      "in_use",
      "Posts or members still use this, so it cannot be deleted. Hide or merge it instead.",
    ],
    ["departments_code_key", "A department with this code already exists."],
    ["batches_grad_year_key", "This batch already exists."],
    ["not_found", "It no longer exists. Reload the page."],
    ["forbidden", "Not allowed. Admins cannot change their own role."],
    ["invalid_input", "Check the values and try again."],
    ["check constraint", "Check the values and try again."],
  ];
  return (
    known.find(([code]) => raw.includes(code))?.[1] ?? "That could not be saved. Please try again."
  );
}
