import "server-only";
import { Container } from "@/components/layout/Container";
import { ExperienceEditor } from "@/components/share/ExperienceEditor";
import { PageHeader } from "@/components/ui/PageHeader";
import type { Viewer } from "@/lib/auth/session";
import { getReferenceData } from "@/lib/data/queries";
import type { DraftForm } from "@/lib/experience/draft";

/** Shared server wrapper for the new-draft and edit-draft pages. */
export async function EditorPage({
  viewer,
  draft,
}: {
  viewer: Viewer;
  draft: {
    id: string | null;
    version: number | null;
    form: DraftForm;
    status: "draft" | "returned";
    moderationNote: string | null;
  };
}) {
  const ref = await getReferenceData(viewer.db);
  const dept = ref.departments.find((d) => d.id === viewer.profile?.departmentId);
  const batch = ref.batches.find((b) => b.id === viewer.profile?.batchId);
  // Hidden topics are not offered, except ones this draft already uses (so they are not dropped).
  const usedTopics = new Set(draft.form.rounds.flatMap((r) => r.topicIds));
  const topics = ref.topics.filter((t) => t.active || usedTopics.has(t.id));
  return (
    <>
      <PageHeader
        eyebrow="Share"
        title={draft.id ? "Edit your experience" : "Share an experience"}
        description="Round by round, in your own words. Your draft saves automatically as you type."
      />
      <Container>
        <div className="section section--tight editor-wrap">
          <ExperienceEditor
            initialId={draft.id}
            initialVersion={draft.version}
            initialForm={draft.form}
            status={draft.status}
            moderationNote={draft.moderationNote}
            companies={ref.companies.map((c) => ({ id: c.id, name: c.name }))}
            departments={ref.departments}
            topics={topics.map((t) => ({ id: t.id, name: t.name }))}
            postingAs={`${viewer.profile?.fullName ?? "you"} · ${dept?.code ?? "?"} · Batch ${batch?.year ?? "?"}`}
          />
        </div>
      </Container>
    </>
  );
}
