import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth/session";
import { isUuid } from "@/lib/data/filters";
import { fromExperienceJson } from "@/lib/experience/draft";
import { EditorPage } from "../EditorPage";

export const metadata: Metadata = { title: "Edit experience", robots: { index: false } };

export default async function EditDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer(`/share/${encodeURIComponent(id)}`);
  if (!viewer.profile?.onboarded) redirect("/onboarding");
  if (!isUuid(id)) notFound();

  // Author-only: get_my_experience returns not_found for anyone else's post (no existence leak).
  const { data, error } = await viewer.db.rpc("get_my_experience", { p_id: id });
  if (error || !data) notFound();
  const json = data as { status?: string; row_version?: number; moderation_note?: string | null };
  // Editable: drafts and posts a moderator returned for changes. Rejected posts are final (SC-2).
  if (json.status !== "draft" && json.status !== "returned") redirect("/my/experiences");

  return (
    <EditorPage
      viewer={viewer}
      draft={{
        id,
        version: typeof json.row_version === "number" ? json.row_version : null,
        form: fromExperienceJson(data),
        status: json.status,
        moderationNote: json.moderation_note ?? null,
      }}
    />
  );
}
