"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/ui/ActionForm";
import { getViewer } from "@/lib/auth/session";

/**
 * D-R4: a moderator steps down and returns to their previous role. The database checks the role
 * again (admins and students are refused), requires the reason, records the role history and the
 * audit entry, and clears the moderator's departments.
 */
export async function stepDownAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  const v = await getViewer();
  const p = v?.profile;
  if (!v || !p || p.role !== "moderator" || !p.onboarded || p.deletionRequested) {
    return { error: "Only moderators can step down." };
  }
  if (data.get("confirm") !== "yes") {
    return { error: "Tick the box to confirm you want to stop moderating." };
  }
  const reason = String(data.get("reason") ?? "")
    .trim()
    .slice(0, 1000);
  if (reason.length < 10) {
    return { error: "Write a reason of at least 10 characters. It is kept in the audit log." };
  }
  const { data: role, error } = await v.db.rpc("moderator_step_down", { p_reason: reason });
  if (error || !role) return { error: "That could not be saved. Please reload and try again." };
  revalidatePath("/", "layout"); // header Staff menu and every staff page change with the role
  redirect("/account?stepped_down=1");
}
