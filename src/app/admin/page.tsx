import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { ROLES, rolePlurals } from "@/lib/admin/labels";
import { requireAdmin } from "@/lib/auth/staff";
import { getSiteStatus } from "@/lib/site/status";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default async function AdminOverviewPage() {
  const viewer = await requireAdmin("/admin");
  const db = viewer.db;
  const head = { count: "exact", head: true } as const;

  // Counts only, no personal data. Admins read profiles through RLS profiles_read_admin and the
  // queues through the staff moderation views.
  const [
    roleCounts,
    invites,
    companies,
    topics,
    pending,
    published,
    postReports,
    commentReports,
    coverage,
    status,
  ] = await Promise.all([
    Promise.all(
      ROLES.map((r) =>
        db.from("profiles").select("id", head).eq("role", r).is("deletion_requested_at", null),
      ),
    ),
    db.rpc("admin_list_alumni_invites"),
    db.from("companies").select("id", head),
    db.from("topics").select("id", head),
    db.from("moderation_experiences").select("id", head).eq("status", "pending"),
    db.from("moderation_experiences").select("id", head).eq("status", "approved"),
    db.from("moderation_reports").select("id", head).eq("status", "open"),
    db.from("moderation_comment_reports").select("id", head).eq("status", "open"),
    db.rpc("admin_moderator_coverage"),
    getSiteStatus(),
  ]);
  const openInvites = (invites.data ?? []).filter((i) => i.status === "open").length;
  const moderators = roleCounts[ROLES.indexOf("moderator")]?.count ?? 0;
  const pendingCount = pending.count ?? 0;
  const openReports = (postReports.count ?? 0) + (commentReports.count ?? 0);
  const coveredDepartments = (coverage.data ?? []).filter((d) => d.moderator_count > 0).length;
  const topicCount = topics.count ?? 0;
  const companyCount = companies.count ?? 0;

  const paused = [
    status.signupsOpen ? null : "new sign-ups",
    status.postingOpen ? null : "new posts",
    status.commentsOpen ? null : "comments",
  ].filter(Boolean);

  const attention = [
    pendingCount > 0 && {
      href: "/moderation",
      text: `${pendingCount} ${pendingCount === 1 ? "post is" : "posts are"} waiting for review.`,
    },
    openReports > 0 && {
      href: "/moderation/reports",
      text: `${openReports} open ${openReports === 1 ? "report" : "reports"}.`,
    },
    moderators === 0 && {
      href: "/admin/users?role=student",
      text: "No moderators yet. Your own posts need another reviewer, so appoint at least one.",
    },
    companyCount === 0 && { href: "/admin/companies", text: "The company list is empty." },
    topicCount === 0 && {
      href: "/admin/topics",
      text: "No topics yet, so the topic picker is hidden in the post form.",
    },
    paused.length > 0 && { href: "/admin/settings", text: `Paused: ${paused.join(", ")}.` },
  ].filter((x): x is { href: string; text: string } => Boolean(x));

  const cards = [
    {
      href: "/moderation",
      title: "Moderation queue",
      text: `Approve, return or reject posts. ${pendingCount} pending.`,
    },
    {
      href: "/moderation/reports",
      title: "Reports",
      text: `Reported posts and comments. ${openReports} open.`,
    },
    {
      href: "/admin/users",
      title: "Users and roles",
      text: "Find members, appoint moderators and admins, mark alumni, correct names.",
    },
    {
      href: "/admin/team",
      title: "Moderator team",
      text: `Who covers which department. ${coveredDepartments} departments covered.`,
    },
    {
      href: "/admin/invites",
      title: "Alumni invites",
      text: `Let an alumnus without a college account join. ${openInvites} open.`,
    },
    {
      href: "/admin/companies",
      title: "Companies",
      text: `The list members choose from when posting. ${companyCount} companies.`,
    },
    {
      href: "/admin/topics",
      title: "Topics",
      text: `Tags for interview rounds and questions. ${topicCount} topics.`,
    },
    {
      href: "/admin/settings",
      title: "Site settings",
      text: "Pause sign-ups, posting or comments, publish a banner notice, set the email domain.",
    },
    {
      href: "/admin/audit",
      title: "Audit log",
      text: "Every admin action, with who did it and why. Viewing it is recorded too.",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Administration"
        description="Everything the site team manages, in one place. Every change is recorded in the audit log."
      />
      <Container>
        <div className="section section--tight stack stack--lg">
          <AdminNav current="/admin" />

          <section aria-labelledby="attention-title" className="panel">
            <h2 id="attention-title" className="panel__title">
              Needs attention
            </h2>
            {attention.length === 0 ? (
              <p>Nothing right now.</p>
            ) : (
              <ul className="stack">
                {attention.map((a) => (
                  <li key={a.text}>
                    <Link href={a.href}>{a.text}</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="people-title" className="panel">
            <h2 id="people-title" className="panel__title">
              At a glance
            </h2>
            <dl className="stats">
              {ROLES.map((r, i) => (
                <div key={r}>
                  <dt>{rolePlurals[r]}</dt>
                  <dd>{roleCounts[i]?.count ?? 0}</dd>
                </div>
              ))}
              <div>
                <dt>Published posts</dt>
                <dd>{published.count ?? 0}</dd>
              </div>
              <div>
                <dt>Pending reviews</dt>
                <dd>{pendingCount}</dd>
              </div>
              <div>
                <dt>Open reports</dt>
                <dd>{openReports}</dd>
              </div>
            </dl>
          </section>

          <ul className="admin-cards list-reset">
            {cards.map((c) => (
              <li key={c.href} className="card">
                <h2 className="panel__title">
                  <Link href={c.href} className="card__link">
                    {c.title}
                  </Link>
                </h2>
                <p>{c.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </>
  );
}
