"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/redirect";
import { getViewer } from "@/lib/auth/session";

export interface OnboardingState {
  error?: string;
  field?: "department" | "batch" | "usn" | "consent";
  /** What the user submitted, so the form can be shown again with their input (React 19 resets
   *  forms after an action). The USN is echoed only to its own author, over this response. */
  values?: { department: string; batch: string; usn: string; consent: boolean };
  /** Increments on every attempt so the form re-mounts with the returned values. */
  attempt?: number;
}

type Result = Pick<OnboardingState, "error" | "field">;

const USN = /^1RN[0-9]{2}[A-Z]{2}[0-9]{3}$/;

/**
 * Validates on the server, then calls complete_onboarding, which validates again, normalises the
 * USN, enforces uniqueness and rate limits attempts. The response never reveals who holds a USN.
 * Role, name and verification status cannot be set here: the function does not accept them.
 */
export async function completeOnboarding(
  prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const result = await submit(formData);
  return {
    ...result,
    values: {
      department: String(formData.get("department") ?? "").slice(0, 6),
      batch: String(formData.get("batch") ?? "").slice(0, 6),
      usn: String(formData.get("usn") ?? "").slice(0, 14),
      consent: formData.get("consent") === "on",
    },
    attempt: (prev.attempt ?? 0) + 1,
  };
}

async function submit(formData: FormData): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/onboarding");
  if (viewer.profile?.onboarded) redirect("/account");

  const department = Number(formData.get("department"));
  const batch = Number(formData.get("batch"));
  const usn = String(formData.get("usn") ?? "")
    .replace(/\s/g, "")
    .toUpperCase();
  const next = safeNextPath(formData.get("next"));

  if (!Number.isInteger(department) || department < 1 || department > 32767) {
    return { error: "Choose your department.", field: "department" };
  }
  if (!Number.isInteger(batch) || batch < 1 || batch > 32767) {
    return { error: "Choose your graduation batch.", field: "batch" };
  }
  if (!USN.test(usn)) {
    return {
      error: "Enter your USN in the format 1RN23CS001 (1RN, year, department code, number).",
      field: "usn",
    };
  }
  if (formData.get("consent") !== "on") {
    return { error: "Please confirm that this USN is yours.", field: "consent" };
  }

  const { data, error } = await viewer.db.rpc("complete_onboarding", {
    p_department_id: department,
    p_batch_id: batch,
    p_usn: usn,
  });

  if (error) {
    const m = error.message;
    if (m.includes("already_onboarded")) redirect("/account");
    if (m.includes("rate_limited")) {
      return { error: "Too many attempts. Please wait an hour and try again.", field: "usn" };
    }
    if (m.includes("invalid_usn"))
      return { error: "That USN is not in a valid format.", field: "usn" };
    if (m.includes("invalid_input")) {
      return { error: "That department or batch is not available. Please choose again." };
    }
    if (m.includes("forbidden") || m.includes("not_authenticated")) {
      return { error: "Your account is not allowed to complete this step." };
    }
    return { error: "Something went wrong. Please try again." };
  }
  if (data === "usn_unavailable") {
    return {
      error:
        "This USN is already linked to another account. If it is yours, contact the site team; for privacy we cannot say which account holds it.",
      field: "usn",
    };
  }
  revalidatePath("/", "layout"); // refresh the header ("Finish setup" becomes the account link)
  redirect(next === "/onboarding" ? "/account" : next);
}
