import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        eyebrow="Trust"
        title="Privacy"
        description="What personal data RNSIT FEED keeps, who can see it, and how to delete it."
        badge={<Badge tone="accent">Draft · pending review by the project owner</Badge>}
      />
      <Container>
        <div className="section prose">
          <Notice title="Draft wording">
            <p>
              The final text has not been approved yet and may change before launch. A contact for
              privacy and grievance requests will be added before launch.
            </p>
          </Notice>
          <section aria-labelledby="p-collect">
            <h2 id="p-collect">What we collect</h2>
            <p>
              Only what is needed to keep posts trustworthy, in line with India&apos;s Digital
              Personal Data Protection Act, 2023:
            </p>
            <ul>
              <li>your name and college email address, from your Google sign-in;</li>
              <li>your USN, department and graduation batch, which you enter once at setup;</li>
              <li>the experiences, comments, helpful votes and reports you submit.</li>
            </ul>
            <p>
              Reading the site needs no account, and we collect nothing from visitors. The site uses
              a sign-in cookie for members and remembers your light or dark theme choice in your
              browser. There is no advertising or tracking.
            </p>
          </section>
          <section aria-labelledby="p-see">
            <h2 id="p-see">Who can see what</h2>
            <ul>
              <li>
                <strong>Your USN is never public.</strong> Only you can see it. An admin can look it
                up only to settle a dispute, and every look-up is recorded.
              </li>
              <li>
                Published posts show your name, department and batch, unless you post anonymously.
              </li>
              <li>
                On an anonymous post, your name is hidden from everyone, including moderators. The
                post stays linked to your account so the rules can be enforced; only an admin can
                see the link, and every such look-up is recorded.
              </li>
              <li>Moderators see pending posts and reports so they can review them.</li>
            </ul>
          </section>
          <section aria-labelledby="p-keep">
            <h2 id="p-keep">How long we keep it</h2>
            <ul>
              <li>Drafts you leave untouched are deleted after 90 days.</li>
              <li>Rejected or returned posts are deleted 90 days after the decision.</li>
              <li>Backups are kept for at most 30 days.</li>
              <li>
                A record of moderation and admin actions is kept for accountability. When you delete
                your account, your identity is removed from it.
              </li>
            </ul>
          </section>
          <section aria-labelledby="p-delete">
            <h2 id="p-delete">Deleting your account</h2>
            <p>
              Signed-in members can delete their account from the{" "}
              <Link href="/account">account page</Link>. Your account is locked straight away, and
              within about a day your posts, comments, votes, USN, profile and login are deleted. If
              a backup is ever restored, deleted accounts are removed again.
            </p>
          </section>
          <section aria-labelledby="p-where">
            <h2 id="p-where">Where it is stored</h2>
            <p>
              Data is stored with Supabase (database and sign-in) and the site is served by Vercel,
              both on their free plans. We do not sell or share your data with anyone else.
            </p>
          </section>
        </div>
      </Container>
    </>
  );
}
