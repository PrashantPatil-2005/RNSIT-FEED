import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { ROLES, rolePlurals } from "@/lib/admin/labels";
import { requireAdmin } from "@/lib/auth/staff";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default async function AdminOverviewPage() {
  const viewer = await requireAdmin("/admin");
  const db = viewer.db;

  // Admins can read every profile (RLS profiles_read_admin); counts only, no personal data.
  const [roleCounts, invites, companies, pending] = await Promise.all([
    Promise.all(
      ROLES.map((r) =>
        db
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", r)
          .is("deletion_requested_at", null),
      ),
    ),
    db.rpc("admin_list_alumni_invites"),
    db.from("companies").select("id", { count: "exact", head: true }),
    db
      .from("moderation_experiences")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);
  const openInvites = (invites.data ?? []).filter((i) => i.status === "open").length;
  const moderators = roleCounts[ROLES.indexOf("moderator")]?.count ?? 0;

  const cards = [
    {
      href: "/admin/users",
      title: "Users and roles",
      text: "Find members, appoint moderators and admins, mark alumni, correct names.",
    },
    {
      href: "/admin/invites",
      title: "Alumni invites",
      text: `Let an alumnus without a college account join. ${openInvites} open.`,
    },
    {
      href: "/admin/companies",
      title: "Companies",
      text: `The list members choose from when posting. ${companies.count ?? 0} companies.`,
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
        description="Manage people, invites and the companies list. Every change is recorded in the audit log."
      />
      <Container>
        <div className="section section--tight stack stack--lg">
          <AdminNav current="/admin" />

          <section aria-labelledby="people-title" className="panel">
            <h2 id="people-title" className="panel__title">
              People
            </h2>
            <dl className="stats">
              {ROLES.map((r, i) => (
                <div key={r}>
                  <dt>{rolePlurals[r]}</dt>
                  <dd>{roleCounts[i]?.count ?? 0}</dd>
                </div>
              ))}
              <div>
                <dt>Pending reviews</dt>
                <dd>{pending.count ?? 0}</dd>
              </div>
            </dl>
            {moderators === 0 ? (
              <p>
                No moderators yet. Appoint some in{" "}
                <Link href="/admin/users?role=student">Users and roles</Link>.
              </p>
            ) : null}
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
