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

export async function createTopicAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  const v = await adminViewer();
  if (!v) return NOT_ALLOWED;
  const name = text(data, "name", 200);
  const slug = slugify(text(data, "slug", 200) || name).slice(0, 40);
  const reason = text(data, "reason");
  if (name.length < 2 || name.length > 80) return { error: "Enter a name of 2 to 80 characters." };
  if (!/^[a-z0-9-]{2,40}$/.test(slug))
    return { error: "Enter a short code using a–z, 0–9 and - (2 to 40 characters)." };
  const bad = reasonError(reason);
  if (bad) return { error: bad };
  const { error } = await v.db.rpc("admin_create_topic", {
    p_name: name,
    p_slug: slug,
    p_reason: reason,
  });
  if (error) return { error: adminErrorMessage(error.message) };
  revalidatePath("/admin", "layout");
  revalidatePath("/share");
  return { ok: `Added topic ${name}.` };
}

export async function renameTopicAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  const v = await adminViewer();
  if (!v) return NOT_ALLOWED;
  const topic = Number(text(data, "topic", 10));
  const name = text(data, "name", 200);
  const reason = text(data, "reason");
  if (!Number.isInteger(topic) || topic < 1 || topic > 32767) return { error: "Invalid request." };
  if (name.length < 2 || name.length > 80) return { error: "Enter a name of 2 to 80 characters." };
  const bad = reasonError(reason);
  if (bad) return { error: bad };
  const { error } = await v.db.rpc("admin_rename_topic", {
    p_topic: topic,
    p_name: name,
    p_reason: reason,
  });
  if (error) return { error: adminErrorMessage(error.message) };
  revalidatePath("/", "layout");
  return { ok: `Renamed to ${name}.` };
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

const SETTING_KEYS = [
  "signups_open",
  "posting_open",
  "comments_open",
  "site_notice",
  "alumni_invite_days",
  "allowed_email_domain",
] as const;
type SettingKey = (typeof SETTING_KEYS)[number];
const isSettingKey = (v: string): v is SettingKey =>
  (SETTING_KEYS as readonly string[]).includes(v);

const settingDone: Record<SettingKey, (value: string) => string> = {
  signups_open: (v) => (v === "true" ? "New sign-ups are open." : "New sign-ups are paused."),
  posting_open: (v) => (v === "true" ? "Posting is open." : "New posts are paused for members."),
  comments_open: (v) => (v === "true" ? "Comments are open." : "Comments are paused for members."),
  site_notice: (v) => (v ? "Notice published in the site banner." : "Notice removed."),
  alumni_invite_days: (v) => `New alumni invites stay open for ${v} days.`,
  allowed_email_domain: (v) => `New sign-ups now need an @${v} address.`,
};

/** Changes one site setting through the audited admin_set_setting function (migration 026). */
export async function setSettingAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  const v = await adminViewer();
  if (!v) return NOT_ALLOWED;
  const key = text(data, "key", 40);
  const value = text(data, "value", 400);
  const reason = text(data, "reason");
  if (!isSettingKey(key)) return { error: "Invalid request." };
  if (key === "site_notice" && value.length > 280)
    return { error: "Keep the notice to 280 characters." };
  if (key === "allowed_email_domain" && data.get("confirm_domain") !== "yes") {
    return { error: "Tick the box to confirm changing the college email domain." };
  }
  const bad = reasonError(reason);
  if (bad) return { error: bad };
  const { error } = await v.db.rpc("admin_set_setting", {
    p_key: key,
    p_value: value,
    p_reason: reason,
  });
  if (error) return { error: adminErrorMessage(error.message) };
  revalidatePath("/", "layout");
  return { ok: settingDone[key](key === "site_notice" ? value : value.toLowerCase()) };
}

// ---------- Reference data (migration 028): hide by default, delete only when unused ----------

function smallId(data: FormData, key: string): number | null {
  const n = Number(text(data, key, 10));
  return Number.isInteger(n) && n >= 1 && n <= 32767 ? n : null;
}

async function referenceCall(
  fn: () => PromiseLike<{ error: { message: string } | null }>,
  ok: string,
  paths: string[] = [],
): Promise<ActionState> {
  const { error } = await fn();
  if (error) return { error: adminErrorMessage(error.message) };
  revalidatePath("/admin", "layout");
  for (const p of paths) revalidatePath(p, "layout");
  return { ok };
}

export async function renameCompanyAction(_p: ActionState, data: FormData): Promise<ActionState> {
  const v = await adminViewer();
  if (!v) return NOT_ALLOWED;
  const company = text(data, "company", 40);
  const name = text(data, "name", 200);
  const reason = text(data, "reason");
  if (!isUuid(company)) return { error: "Invalid request." };
  if (name.length < 1 || name.length > 120)
    return { error: "Enter a name of 1 to 120 characters." };
  const bad = reasonError(reason);
  if (bad) return { error: bad };
  return referenceCall(
    () => v.db.rpc("admin_rename_company", { p_company: company, p_name: name, p_reason: reason }),
    `Renamed to ${name}. The old name still finds it in search.`,
    ["/"],
  );
}

export async function removeAliasAction(_p: ActionState, data: FormData): Promise<ActionState> {
  const v = await adminViewer();
  if (!v) return NOT_ALLOWED;
  const company = text(data, "company", 40);
  const alias = text(data, "alias", 200);
  const reason = text(data, "reason");
  if (!isUuid(company) || !alias) return { error: "Choose an alias." };
  const bad = reasonError(reason);
  if (bad) return { error: bad };
  return referenceCall(
    () =>
      v.db.rpc("admin_remove_company_alias", {
        p_company: company,
        p_alias: alias,
        p_reason: reason,
      }),
    `Alias "${alias}" removed.`,
  );
}

export async function mergeCompanyAction(_p: ActionState, data: FormData): Promise<ActionState> {
  const v = await adminViewer();
  if (!v) return NOT_ALLOWED;
  const from = text(data, "company", 40);
  const into = text(data, "into", 40);
  const reason = text(data, "reason");
  if (!isUuid(from) || !isUuid(into)) return { error: "Choose the company to merge into." };
  if (from === into) return { error: "Choose a different company." };
  if (data.get("confirm_merge") !== "yes")
    return { error: "Tick the box to confirm the merge. It cannot be undone." };
  const bad = reasonError(reason);
  if (bad) return { error: bad };
  const { data: moved, error } = await v.db.rpc("admin_merge_companies", {
    p_from: from,
    p_into: into,
    p_reason: reason,
  });
  if (error) return { error: adminErrorMessage(error.message) };
  revalidatePath("/", "layout");
  return { ok: `Merged. ${moved ?? 0} ${moved === 1 ? "post" : "posts"} moved.` };
}

export async function deleteCompanyAction(_p: ActionState, data: FormData): Promise<ActionState> {
  const v = await adminViewer();
  if (!v) return NOT_ALLOWED;
  const company = text(data, "company", 40);
  const reason = text(data, "reason");
  if (!isUuid(company)) return { error: "Invalid request." };
  const bad = reasonError(reason);
  if (bad) return { error: bad };
  return referenceCall(
    () => v.db.rpc("admin_delete_company", { p_company: company, p_reason: reason }),
    "Company deleted.",
    ["/"],
  );
}

export async function setTopicActiveAction(_p: ActionState, data: FormData): Promise<ActionState> {
  const v = await adminViewer();
  if (!v) return NOT_ALLOWED;
  const topic = smallId(data, "topic");
  const active = text(data, "active", 5) === "true";
  const reason = text(data, "reason");
  if (!topic) return { error: "Invalid request." };
  const bad = reasonError(reason);
  if (bad) return { error: bad };
  return referenceCall(
    () =>
      v.db.rpc("admin_set_topic_active", { p_topic: topic, p_active: active, p_reason: reason }),
    active ? "Topic shown in the post form again." : "Topic hidden from the post form.",
    ["/share"],
  );
}

export async function deleteTopicAction(_p: ActionState, data: FormData): Promise<ActionState> {
  const v = await adminViewer();
  if (!v) return NOT_ALLOWED;
  const topic = smallId(data, "topic");
  const reason = text(data, "reason");
  if (!topic) return { error: "Invalid request." };
  const bad = reasonError(reason);
  if (bad) return { error: bad };
  return referenceCall(
    () => v.db.rpc("admin_delete_topic", { p_topic: topic, p_reason: reason }),
    "Topic deleted.",
    ["/share"],
  );
}

export async function createDepartmentAction(
  _p: ActionState,
  data: FormData,
): Promise<ActionState> {
  const v = await adminViewer();
  if (!v) return NOT_ALLOWED;
  const code = text(data, "code", 10).toUpperCase();
  const name = text(data, "name", 200);
  const reason = text(data, "reason");
  if (!/^[A-Z]{2}$/.test(code)) return { error: "Enter a two-letter code, for example CS." };
  if (name.length < 2 || name.length > 120)
    return { error: "Enter a name of 2 to 120 characters." };
  const bad = reasonError(reason);
  if (bad) return { error: bad };
  return referenceCall(
    () => v.db.rpc("admin_create_department", { p_code: code, p_name: name, p_reason: reason }),
    `Added ${code}: ${name}.`,
    ["/"],
  );
}

export async function updateDepartmentAction(
  _p: ActionState,
  data: FormData,
): Promise<ActionState> {
  const v = await adminViewer();
  if (!v) return NOT_ALLOWED;
  const department = smallId(data, "department");
  const name = text(data, "name", 200);
  const active = data.get("active") === "yes";
  const reason = text(data, "reason");
  if (!department) return { error: "Invalid request." };
  if (name.length < 2 || name.length > 120)
    return { error: "Enter a name of 2 to 120 characters." };
  const bad = reasonError(reason);
  if (bad) return { error: bad };
  return referenceCall(
    () =>
      v.db.rpc("admin_update_department", {
        p_department: department,
        p_name: name,
        p_active: active,
        p_reason: reason,
      }),
    active ? "Department saved." : "Department saved and hidden from new choices.",
    ["/"],
  );
}

export async function createBatchAction(_p: ActionState, data: FormData): Promise<ActionState> {
  const v = await adminViewer();
  if (!v) return NOT_ALLOWED;
  const year = Number(text(data, "year", 6));
  const reason = text(data, "reason");
  if (!Number.isInteger(year) || year < 2000 || year > 2100)
    return { error: "Enter a year from 2000 to 2100." };
  const bad = reasonError(reason);
  if (bad) return { error: bad };
  return referenceCall(
    () => v.db.rpc("admin_create_batch", { p_year: year, p_reason: reason }),
    `Added batch ${year}.`,
    ["/"],
  );
}

export async function deleteBatchAction(_p: ActionState, data: FormData): Promise<ActionState> {
  const v = await adminViewer();
  if (!v) return NOT_ALLOWED;
  const batch = smallId(data, "batch");
  const reason = text(data, "reason");
  if (!batch) return { error: "Invalid request." };
  const bad = reasonError(reason);
  if (bad) return { error: bad };
  return referenceCall(
    () => v.db.rpc("admin_delete_batch", { p_batch: batch, p_reason: reason }),
    "Batch deleted.",
    ["/"],
  );
}
