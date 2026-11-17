import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { StateMessage } from "@/components/ui/StateMessage";
import { requireStaff } from "@/lib/auth/staff";
import { opportunityLabels } from "@/lib/data/labels";
import {
  isQueueFilter,
  QUEUE_FILTERS,
  queueLabels,
  type QueueFilter,
} from "@/lib/moderation/labels";

export const metadata: Metadata = { title: "Moderation", robots: { index: false } };

const doneMessages: Record<string, string> = {
  approve: "Approved. It is now public.",
  return: "Sent back to the author for changes.",
  reject: "Rejected. The author can see your note.",
};

function when(ts: string | null): string {
  if (!ts) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

export default async function ModerationQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireStaff("/moderation");
  const sp = await searchParams;
  const raw = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const filter: QueueFilter = isQueueFilter(raw) ? raw : "pending";
  const done = typeof sp.done === "string" ? doneMessages[sp.done] : undefined;

  // The view returns rows only for staff (private.is_staff()); counts use the same view.
  const [list, ...counts] = await Promise.all([
    viewer.db
      .from("moderation_experiences")
      .select(
        "id, status, company_name, role_title, opportunity_type, department_code, batch_year, recruitment_year, is_anonymous, author_name, submitted_at, decided_at",
      )
      .eq("status", filter)
      .order(filter === "pending" ? "submitted_at" : "decided_at", {
        ascending: filter === "pending",
      })
      .limit(100),
    ...QUEUE_FILTERS.map((s) =>
      viewer.db
        .from("moderation_experiences")
        .select("id", { count: "exact", head: true })
        .eq("status", s),
    ),
  ]);
  const count = (s: QueueFilter) => counts[QUEUE_FILTERS.indexOf(s)]?.count ?? 0;
  const [openPostReports, openCommentReports] = await Promise.all([
    viewer.db
      .from("moderation_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    viewer.db
      .from("moderation_comment_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
  ]);
  const openReports = (openPostReports.count ?? 0) + (openCommentReports.count ?? 0);
  const rows = list.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Staff"
        title="Moderation"
        description="Review submitted experiences before they appear publicly. Oldest pending first."
      />
      <Container>
        <div className="section section--tight stack stack--lg">
          {done ? (
            <Notice title="Decision saved">
              <p>{done}</p>
            </Notice>
          ) : null}

          <nav aria-label="Moderation sections" className="queue-tabs">
            <Link href="/moderation" className="queue-tab" aria-current="page">
              Experience queue
            </Link>
            <Link href="/moderation/reports" className="queue-tab">
              Reports <span className="queue-tab__count">{openReports}</span>
            </Link>
          </nav>

          <nav aria-label="Filter by status" className="queue-tabs">
            {QUEUE_FILTERS.map((s) => (
              <Link
                key={s}
                href={s === "pending" ? "/moderation" : `/moderation?status=${s}`}
                className="queue-tab"
                aria-current={s === filter ? "page" : undefined}
              >
                {queueLabels[s]} <span className="queue-tab__count">{count(s)}</span>
              </Link>
            ))}
          </nav>

          {list.error ? (
            <StateMessage kind="error" title="The queue could not be loaded">
              <p>Please reload the page.</p>
            </StateMessage>
          ) : rows.length === 0 ? (
            <StateMessage
              title={filter === "pending" ? "Nothing waiting for review" : "Nothing here"}
            >
              <p>
                {filter === "pending"
                  ? "New submissions will appear here."
                  : "Experiences with this status will be listed here."}
              </p>
            </StateMessage>
          ) : (
            <ul className="queue list-reset" aria-label={`${queueLabels[filter]} experiences`}>
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/moderation/${r.id}`} className="queue-row">
                    <span className="queue-row__title">
                      {r.role_title} <span className="muted">· {r.company_name}</span>
                    </span>
                    <span className="queue-row__meta">
                      <span>{r.opportunity_type ? opportunityLabels[r.opportunity_type] : ""}</span>
                      <span>
                        {r.department_code} · Batch {r.batch_year} · {r.recruitment_year}
                      </span>
                      <span>{r.is_anonymous ? "Anonymous" : (r.author_name ?? "")}</span>
                      <span>
                        {filter === "pending"
                          ? `Submitted ${when(r.submitted_at)}`
                          : `Decided ${when(r.decided_at)}`}
                      </span>
                    </span>
                    <span className="company-row__arrow" aria-hidden="true">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Container>
    </>
  );
}
