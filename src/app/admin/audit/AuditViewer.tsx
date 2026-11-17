"use client";

import { startTransition, useActionState } from "react";
import { viewAuditAction, type AuditState } from "../actions";

function stamp(ts: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

/** The log is loaded only on request, because each viewing is itself recorded with a reason. */
export function AuditViewer() {
  const [state, run, pending] = useActionState<AuditState, FormData>(viewAuditAction, {});

  return (
    <div className="stack stack--lg">
      <form
        className="panel stack--sm action-form"
        aria-label="Open the audit log"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => run(data));
        }}
      >
        <div className="field">
          <label htmlFor="audit-reason">Why are you opening the audit log?</label>
          <input
            id="audit-reason"
            name="reason"
            type="text"
            required
            minLength={10}
            maxLength={1000}
            autoComplete="off"
            aria-describedby="audit-reason-hint"
          />
          <p id="audit-reason-hint" className="field__hint">
            Opening the log is recorded with this reason. Shows the latest 100 entries.
          </p>
        </div>
        {state.error ? (
          <p className="form__error" role="alert">
            {state.error}
          </p>
        ) : null}
        <div>
          <button type="submit" className="btn btn--primary btn--small" disabled={pending}>
            {pending ? "Loading…" : state.rows ? "Reload log" : "Open log"}
          </button>
        </div>
      </form>

      {state.rows ? (
        state.rows.length === 0 ? (
          <p>No entries.</p>
        ) : (
          <ol className="my-list list-reset" aria-label="Audit entries, newest first">
            {state.rows.map((r) => (
              <li key={r.id} className="my-item">
                <div>
                  <p className="my-item__title">
                    {r.action}
                    {r.target ? <span className="muted"> · {r.target}</span> : null}
                  </p>
                  <p className="my-item__meta">
                    <span>By {r.actor}</span>
                    <span>{stamp(r.at)}</span>
                    {r.ref ? <span>Ref {r.ref}</span> : null}
                  </p>
                  <p className="my-item__note">{r.reason}</p>
                </div>
              </li>
            ))}
          </ol>
        )
      ) : null}
    </div>
  );
}
