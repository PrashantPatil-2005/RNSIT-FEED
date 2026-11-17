import type { Metadata } from "next";
import { ActionForm, ReasonField } from "@/components/ui/ActionForm";
import { AdminNav } from "@/components/admin/AdminNav";
import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { StateMessage } from "@/components/ui/StateMessage";
import { requireAdmin } from "@/lib/auth/staff";
import { inviteAction, revokeInviteAction } from "../actions";

export const metadata: Metadata = { title: "Alumni invites · Admin", robots: { index: false } };

const statusLabels: Record<string, string> = {
  open: "Open",
  used: "Used",
  revoked: "Revoked",
  expired: "Expired",
};

function day(ts: string | null): string {
  if (!ts) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(ts));
}

export default async function AdminInvitesPage() {
  const viewer = await requireAdmin("/admin/invites");
  const { data: invites, error } = await viewer.db.rpc("admin_list_alumni_invites");

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Alumni invites"
        description="Alumni without a college Google account can join only through an invite for their exact Google address."
      />
      <Container>
        <div className="section section--tight stack stack--lg">
          <AdminNav current="/admin/invites" />

          <section aria-labelledby="new-invite" className="panel">
            <h2 id="new-invite" className="panel__title">
              Invite an alumnus
            </h2>
            <p>
              Invite only people you know are RNSIT alumni. The invite works once, expires after 14
              days, and still needs a verified Google sign-in. The account is created as Alumni.
              College addresses do not need an invite.
            </p>
            <ActionForm action={inviteAction} submitLabel="Create invite" label="Invite an alumnus">
              <div className="field">
                <label htmlFor="invite-email">Their Google email address</label>
                <input
                  id="invite-email"
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <ReasonField
                id="invite-reason"
                hint="For example how you know they are an alumnus. Kept in the audit log; do not repeat the email address."
              />
            </ActionForm>
          </section>

          <section aria-labelledby="invite-list" className="stack">
            <h2 id="invite-list">Invites</h2>
            {error ? (
              <StateMessage kind="error" title="Invites could not be loaded">
                <p>Please reload the page.</p>
              </StateMessage>
            ) : !invites || invites.length === 0 ? (
              <StateMessage title="No invites yet">
                <p>Invites you create will be listed here.</p>
              </StateMessage>
            ) : (
              <ul className="my-list list-reset" aria-label="Alumni invites">
                {invites.map((i) => (
                  <li key={i.id} className="my-item">
                    <div>
                      <p className="my-item__title">
                        {i.email_masked ?? <span className="muted">Address removed</span>}
                      </p>
                      <p className="my-item__meta">
                        <span className={`status status--invite-${i.status}`}>
                          {statusLabels[i.status] ?? i.status}
                        </span>
                        <span>Created {day(i.created_at)}</span>
                        {i.status === "open" ? <span>Expires {day(i.expires_at)}</span> : null}
                        {i.used_at ? <span>Used {day(i.used_at)}</span> : null}
                        {i.revoked_at ? <span>Revoked {day(i.revoked_at)}</span> : null}
                      </p>
                    </div>
                    {i.status === "open" ? (
                      <details className="admin-details">
                        <summary>Revoke</summary>
                        <ActionForm
                          action={revokeInviteAction}
                          submitLabel="Revoke invite"
                          danger
                          label="Revoke invite"
                        >
                          <input type="hidden" name="id" value={i.id} />
                          <ReasonField id={`revoke-reason-${i.id}`} />
                        </ActionForm>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <p className="field__hint">
              Addresses are shown masked. They are deleted when an invite is used or revoked, and
              from expired invites by the scheduled cleanup.
            </p>
          </section>
        </div>
      </Container>
    </>
  );
}
