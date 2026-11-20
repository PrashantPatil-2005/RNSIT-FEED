import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { Container } from "@/components/layout/Container";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { StateMessage } from "@/components/ui/StateMessage";
import { requireAdmin } from "@/lib/auth/staff";

export const metadata: Metadata = { title: "Posts · Admin", robots: { index: false } };

const LIMIT = 100;
const STATUSES = {
  approved: "Published",
  pending: "Pending review",
  returned: "Changes requested",
  rejected: "Rejected",
  removed: "Removed",
} as const;
type Status = keyof typeof STATUSES;
const isStatus = (v: string): v is Status => Object.hasOwn(STATUSES, v);

export default async function AdminPostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireAdmin("/admin/posts");
  const sp = await searchParams;
  const raw = typeof sp.status === "string" ? sp.status : "approved";
  const status: Status = isStatus(raw) ? raw : "approved";
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 80);
  const deleted = sp.deleted === "1";

  // Staff view: anonymous authors are masked by the database. Drafts are never listed.
  let query = viewer.db
    .from("moderation_experiences")
    .select(
      "id, status, company_name, role_title, department_code, batch_year, author_name, submitted_at",
    )
    .eq("status", status)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(LIMIT);
  if (q) {
    const like = `%${q.replace(/[\\%_,()]/g, (c) => `\\${c}`)}%`;
    query = query.or(`company_name.ilike.${like},role_title.ilike.${like}`);
  }
  const { data: posts, error } = await query;

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Posts"
        description="Every submitted experience. Open one to fix its text (typos, NDA wording, personal details) or delete it permanently. Approving and removing stay in the moderation queue."
      />
      <Container>
        <div className="section section--tight stack stack--lg">
          <AdminNav current="/admin/posts" />
          {deleted ? (
            <Notice title="Post deleted">
              <p>
                The post, its comments, votes and reports are gone. The audit log keeps the record.
              </p>
            </Notice>
          ) : null}

          <form method="get" className="admin-search" role="search" aria-label="Find posts">
            <div className="field">
              <label htmlFor="post-q">Company or role</label>
              <input id="post-q" name="q" type="search" defaultValue={q} maxLength={80} />
            </div>
            <div className="field">
              <label htmlFor="post-status">Status</label>
              <select id="post-status" name="status" defaultValue={status}>
                {Object.entries(STATUSES).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn--small">
              Show
            </button>
          </form>

          {error ? (
            <StateMessage kind="error" title="Posts could not be loaded">
              <p>Please reload the page.</p>
            </StateMessage>
          ) : !posts || posts.length === 0 ? (
            <StateMessage title="No posts here">
              <p>Try another status or search.</p>
            </StateMessage>
          ) : (
            <ul className="my-list list-reset" aria-label="Posts">
              {posts.map((e) => (
                <li key={e.id} className="my-item">
                  <div>
                    <p className="my-item__title">
                      <Link href={`/admin/posts/${e.id}`}>
                        {e.company_name} · {e.role_title ?? "Untitled"}
                      </Link>
                    </p>
                    <p className="my-item__meta">
                      <span>
                        {e.department_code} · Batch {e.batch_year}
                      </span>
                      <span>{e.author_name ?? "Anonymous"}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Container>
    </>
  );
}
