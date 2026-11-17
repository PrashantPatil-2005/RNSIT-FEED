"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ui/ActionForm";
import { adminErrorMessage, auditActionLabels, isRole, roleLabels } from "@/lib/admin/labels";
import { getViewer, type Viewer } from "@/lib/auth/session";
import { isUuid } from "@/lib/data/filters";

/**
 * Admin actions. Each one re-checks the caller here, then calls an audited database function that
 * checks the admin role again from the database (never from the request) and writes the audit row.
 */
async function adminViewer(): Promise<Viewer | null> {
  const v = await getViewer();
  const p = v?.profile;
  if (!v || !p || p.role !== "admin" || !p.onboarded || p.deletionRequested) return null;
  return v;
}

const NOT_ALLOWED: ActionState = { error: "You are not allowed to do this." };

function text(data: FormData, key: string, max = 1000): string {
  return String(data.get(key) ?? "")
    .trim()
    .slice(0, max);
}

function reasonError(reason: string): string | null {
  if (reason.length < 10) return adminErrorMessage("reason_required");
  return null;
}

export async function setRoleAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  const v = await adminViewer();
  if (!v) return NOT_ALLOWED;
  const user = text(data, "user", 40);
  const role = text(data, "role", 20);
  const reason = text(data, "reason");
  if (!isUuid(user) || !isRole(role)) return { error: "Invalid request." };
  if (user === v.user.id) return { error: adminErrorMessage("forbidden") };
  // Promoting to admin is the most powerful change, so it needs an explicit confirmation.
  if (role === "admin" && data.get("confirm_admin") !== "yes") {
    return { error: "Tick the box to confirm making this person an admin." };
  }
  const bad = reasonError(reason);
  if (bad) return { error: bad };
  const { error } = await v.db.rpc("admin_set_user_role", {
    p_user: user,
    p_role: role,
    p_reason: reason,
  });
  if (error) return { error: adminErrorMessage(error.message) };
  revalidatePath("/admin", "layout");
  return {
    ok:
      role === "moderator"
        ? "Role changed to Moderator. Assign their departments on the Team page."
        : `Role changed to ${roleLabels[role]}.`,
  };
}

export async function correctNameAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  const v = await adminViewer();
  if (!v) return NOT_ALLOWED;
  const user = text(data, "user", 40);
  const name = text(data, "name", 200);
  const reason = text(data, "reason");
  if (!isUuid(user)) return { error: "Invalid request." };
  if (name.length < 1 || name.length > 120)
    return { error: "Enter a name of 1 to 120 characters." };
  const bad = reasonError(reason);
  if (bad) return { error: bad };
  const { error } = await v.db.rpc("admin_correct_name", {
    p_user: user,
    p_name: name,
    p_reason: reason,
  });
  if (error) return { error: adminErrorMessage(error.message) };
  revalidatePath("/admin", "layout");
  revalidatePath("/experiences");
  return { ok: "Name corrected." };
}

export async function inviteAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  const v = await adminViewer();
  if (!v) return NOT_ALLOWED;
  const email = text(data, "email", 254).toLowerCase();
  const reason = text(data, "reason");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a full email address." };
  const bad = reasonError(reason);
  if (bad) return { error: bad };
  if (reason.includes("@")) return { error: adminErrorMessage("reason_has_email") };
  const { error } = await v.db.rpc("admin_invite_alumnus", { p_email: email, p_reason: reason });
  if (error) return { error: adminErrorMessage(error.message) };
  revalidatePath("/admin", "layout");
  return {
    ok: "Invite created. Ask the alumnus to sign in with Google using exactly that address within 14 days.",
  };
}

export async function revokeInviteAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  const v = await adminViewer();
  if (!v) return NOT_ALLOWED;
  const id = text(data, "id", 40);
  const reason = text(data, "reason");
  if (!isUuid(id)) return { error: "Invalid request." };
  const bad = reasonError(reason);
  if (bad) return { error: bad };
  if (reason.includes("@")) return { error: adminErrorMessage("reason_has_email") };
  const { error } = await v.db.rpc("admin_revoke_alumni_invite", { p_id: id, p_reason: reason });
  if (error) return { error: adminErrorMessage(error.message) };
  revalidatePath("/admin", "layout");
  return { ok: "Invite revoked." };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function createCompanyAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const v = await adminViewer();
  if (!v) return NOT_ALLOWED;
  const name = text(data, "name", 200);
  const slug = slugify(text(data, "slug", 200) || name);
  const reason = text(data, "reason");
  if (name.length < 1 || name.length > 120)
    return { error: "Enter a name of 1 to 120 characters." };
  if (!/^[a-z0-9-]{1,80}$/.test(slug))
    return { error: "Enter a web address using a–z, 0–9 and -." };
  const bad = reasonError(reason);
  if (bad) return { error: bad };
  const { error } = await v.db.rpc("admin_create_company", {
    p_name: name,
    p_slug: slug,
    p_reason: reason,
  });
  if (error) return { error: adminErrorMessage(error.message) };
  revalidatePath("/admin", "layout");
  revalidatePath("/companies");
  revalidatePath("/share");
  return { ok: `Added ${name} (/companies/${slug}).` };
}

export async function addAliasAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  const v = await adminViewer();
  if (!v) return NOT_ALLOWED;
  const company = text(data, "company", 40);
  const alias = text(data, "alias", 200);
  const reason = text(data, "reason");
  if (!isUuid(company)) return { error: "Choose a company." };
  if (alias.length < 1 || alias.length > 120)
    return { error: "Enter an alias of 1 to 120 characters." };
  const bad = reasonError(reason);
  if (bad) return { error: bad };
  const { error } = await v.db.rpc("admin_add_company_alias", {
    p_company: company,
    p_alias: alias,
    p_reason: reason,
  });
  if (error) return { error: adminErrorMessage(error.message) };
  revalidatePath("/admin", "layout");
  return { ok: `Alias "${alias}" added.` };
}

export interface AuditRow {
  id: number;
  action: string;
  actor: string;
  target: string | null;
  reason: string;
  ref: string | null;
  at: string;
}

export interface AuditState {
  error?: string;
  rows?: AuditRow[];
}

/** Reading the audit log is itself audited, so it needs a reason (database rule). */
export async function viewAuditAction(_prev: AuditState, data: FormData): Promise<AuditState> {
  const v = await adminViewer();
  if (!v) return { error: NOT_ALLOWED.error };
  const reason = text(data, "reason");
  const bad = reasonError(reason);
  if (bad) return { error: bad };
  const { data: rows, error } = await v.db.rpc("admin_list_audit", {
    p_reason: reason,
    p_limit: 100,
  });
  if (error || !rows) return { error: adminErrorMessage(error?.message ?? "") };

  const ids = [
    ...new Set(rows.flatMap((r) => [r.actor_id, r.target_user_id]).filter(Boolean)),
  ] as string[];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: people } = await v.db.from("profiles").select("id, full_name").in("id", ids);
    for (const p of people ?? []) names.set(p.id, p.full_name);
  }
  const who = (id: string | null) => (id ? (names.get(id) ?? "Deleted account") : null);
  return {
    rows: rows.map((r) => ({
      id: r.id,
      action: auditActionLabels[r.action] ?? r.action,
      actor: who(r.actor_id) ?? "System",
      target: who(r.target_user_id),
      reason: r.reason,
      ref: r.evidence_ref ?? (r.case_id ? `usn_case:${r.case_id}` : null),
      at: r.created_at,
    })),
  };
}

function departmentId(data: FormData): number | null {
  const n = Number(text(data, "department", 6));
  return Number.isInteger(n) && n > 0 && n < 32768 ? n : null;
}

/** D-R3: at most four moderators per department, enforced by the database. */
export async function assignDepartmentAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const v = await adminViewer();
  if (!v) return NOT_ALLOWED;
  const user = text(data, "user", 40);
  const dept = departmentId(data);
  const reason = text(data, "reason");
  if (!isUuid(user)) return { error: "Choose a moderator." };
  if (dept === null) return { error: "Choose a department." };
  const bad = reasonError(reason);
  if (bad) return { error: bad };
  const { error } = await v.db.rpc("admin_assign_moderator_department", {
    p_user: user,
    p_department: dept,
    p_reason: reason,
  });
  if (error) return { error: adminErrorMessage(error.message, "department") };
  revalidatePath("/admin", "layout");
  revalidatePath("/moderation");
  return { ok: "Department assigned." };
}

export async function unassignDepartmentAction(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const v = await adminViewer();
  if (!v) return NOT_ALLOWED;
  const user = text(data, "user", 40);
  const dept = departmentId(data);
  const reason = text(data, "reason");
  if (!isUuid(user) || dept === null) return { error: "Invalid request." };
  const bad = reasonError(reason);
  if (bad) return { error: bad };
  const { error } = await v.db.rpc("admin_unassign_moderator_department", {
    p_user: user,
    p_department: dept,
    p_reason: reason,
  });
  if (error) return { error: adminErrorMessage(error.message, "department") };
  revalidatePath("/admin", "layout");
  revalidatePath("/moderation");
  return { ok: "Removed from the department." };
}
