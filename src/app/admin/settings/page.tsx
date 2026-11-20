import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { Container } from "@/components/layout/Container";
import { ActionForm, ReasonField } from "@/components/ui/ActionForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { StateMessage } from "@/components/ui/StateMessage";
import { requireAdmin } from "@/lib/auth/staff";
import { setSettingAction } from "../actions";

export const metadata: Metadata = { title: "Settings · Admin", robots: { index: false } };

const SWITCHES = [
  {
    key: "signups_open",
    title: "New sign-ups",
    open: "New RNSIT accounts can be created.",
    closed: "Nobody new can join. Existing members still sign in. The owner can always sign up.",
    pause: "Pause new sign-ups",
  },
  {
    key: "posting_open",
    title: "New posts",
    open: "Members can submit experiences for review.",
    closed: "Members can save drafts but not submit them. Admins can still submit.",
    pause: "Pause new posts",
  },
  {
    key: "comments_open",
    title: "Comments",
    open: "Members can comment on published experiences.",
    closed: "Members cannot add comments. Moderators and admins still can.",
    pause: "Pause comments",
  },
] as const;

export default async function AdminSettingsPage() {
  const viewer = await requireAdmin("/admin/settings");
  const [settings, owner] = await Promise.all([
    viewer.db.rpc("admin_list_settings"),
    viewer.db.rpc("admin_owner_id"),
  ]);
  const values = new Map((settings.data ?? []).map((s) => [s.key, s.value]));
  const isOn = (key: string) => values.get(key) !== "false";
  const notice = values.get("site_notice") ?? "";
  const inviteDays = values.get("alumni_invite_days") ?? "14";
  const domain = values.get("allowed_email_domain") ?? "";
  const canChangeDomain = !owner.data || owner.data === viewer.user.id;

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Site settings"
        description="Switch parts of the site on or off and publish a notice. The database enforces every switch, and each change is recorded in the audit log."
      />
      <Container>
        <div className="section section--tight stack stack--lg">
          <AdminNav current="/admin/settings" />

          {settings.error ? (
            <StateMessage kind="error" title="Settings could not be loaded">
              <p>Please reload the page.</p>
            </StateMessage>
          ) : (
            <>
              <section aria-labelledby="switches-title" className="stack">
                <h2 id="switches-title">Switches</h2>
                <ul className="my-list list-reset" aria-label="Switches">
                  {SWITCHES.map((s) => {
                    const on = isOn(s.key);
                    return (
                      <li key={s.key} className="my-item">
                        <div>
                          <p className="my-item__title">
                            {s.title}{" "}
                            <span
                              className={`status ${on ? "status--approved" : "status--rejected"}`}
                            >
                              {on ? "Open" : "Paused"}
                            </span>
                          </p>
                          <p className="my-item__meta">
                            <span>{on ? s.open : s.closed}</span>
                          </p>
                        </div>
                        <details className="admin-details">
                          <summary>{on ? s.pause : "Reopen"}</summary>
                          <ActionForm
                            action={setSettingAction}
                            submitLabel={on ? s.pause : "Reopen"}
                            label={`${on ? s.pause : "Reopen"}: ${s.title}`}
                            danger={on}
                          >
                            <input type="hidden" name="key" value={s.key} />
                            <input type="hidden" name="value" value={on ? "false" : "true"} />
                            <ReasonField id={`reason-${s.key}`} />
                          </ActionForm>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section aria-labelledby="notice-title" className="panel">
                <h2 id="notice-title" className="panel__title">
                  Banner notice
                </h2>
                <p>
                  {notice ? (
                    <>
                      Showing now: <q>{notice}</q>
                    </>
                  ) : (
                    "No notice is showing."
                  )}
                </p>
                <ActionForm
                  action={setSettingAction}
                  submitLabel="Save notice"
                  label="Banner notice"
                >
                  <input type="hidden" name="key" value="site_notice" />
                  <div className="field">
                    <label htmlFor="notice-value">Notice text</label>
                    <input
                      id="notice-value"
                      name="value"
                      type="text"
                      maxLength={280}
                      defaultValue={notice}
                      aria-describedby="notice-hint"
                    />
                    <p id="notice-hint" className="field__hint">
                      One line, up to 280 characters, shown to every visitor. Leave empty to remove
                      it. No names or contact details.
                    </p>
                  </div>
                  <ReasonField id="notice-reason" />
                </ActionForm>
              </section>

              <section aria-labelledby="invite-days-title" className="panel">
                <h2 id="invite-days-title" className="panel__title">
                  Alumni invite length
                </h2>
                <p>
                  New invites stay open for {inviteDays} days. Existing invites keep their date.
                </p>
                <ActionForm
                  action={setSettingAction}
                  submitLabel="Save"
                  label="Alumni invite length"
                >
                  <input type="hidden" name="key" value="alumni_invite_days" />
                  <div className="field">
                    <label htmlFor="invite-days">Days (1 to 365)</label>
                    <input
                      id="invite-days"
                      name="value"
                      type="number"
                      required
                      min={1}
                      max={365}
                      defaultValue={inviteDays}
                    />
                  </div>
                  <ReasonField id="invite-days-reason" />
                </ActionForm>
              </section>

              <section aria-labelledby="domain-title" className="panel">
                <h2 id="domain-title" className="panel__title">
                  College email domain
                </h2>
                <p>
                  New accounts need an <strong>@{domain || "(not set)"}</strong> Google address.
                  Existing members are not affected.
                </p>
                {canChangeDomain ? (
                  <details className="admin-details">
                    <summary>Change domain</summary>
                    <ActionForm
                      action={setSettingAction}
                      submitLabel="Change domain"
                      label="Change college email domain"
                      danger
                    >
                      <input type="hidden" name="key" value="allowed_email_domain" />
                      <div className="field">
                        <label htmlFor="domain-value">Domain</label>
                        <input
                          id="domain-value"
                          name="value"
                          type="text"
                          required
                          maxLength={253}
                          defaultValue={domain}
                          spellCheck={false}
                        />
                      </div>
                      <div className="check">
                        <input
                          id="confirm-domain"
                          name="confirm_domain"
                          type="checkbox"
                          value="yes"
                        />
                        <label htmlFor="confirm-domain">
                          I confirm. A wrong domain stops every new student from joining.
                        </label>
                      </div>
                      <ReasonField id="domain-reason" />
                    </ActionForm>
                  </details>
                ) : (
                  <p className="muted">Only the owner can change the domain.</p>
                )}
              </section>
            </>
          )}
        </div>
      </Container>
    </>
  );
}
