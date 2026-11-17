"use client";

import { useActionState, useState } from "react";
import { REASON_CODES, reasonLabels } from "@/lib/moderation/labels";
import { decideAction, type DecisionState } from "./actions";

/**
 * Decision controls for one pending experience. Each choice is its own POST form carrying the
 * reviewed row_version, so a decision can never apply to content the moderator did not see.
 */
export function DecisionPanel({ id, version }: { id: string; version: number }) {
  const [state, action, pending] = useActionState<DecisionState, FormData>(decideAction, {});
  const [mode, setMode] = useState<"return" | "reject" | null>(null);
  const echoed = state.values && state.values.action === mode ? state.values : undefined;

  return (
    <div className="panel decision" aria-labelledby="decision-title">
      <h2 id="decision-title" className="panel__title">
        Decision
      </h2>
      {state.error ? (
        <div className="form__error" role="alert">
          <p>{state.error}</p>
          {state.stale ? (
            <button
              type="button"
              className="btn btn--secondary btn--small"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          ) : null}
        </div>
      ) : null}

      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="version" value={version} />
        <input type="hidden" name="action" value="approve" />
        <button
          type="submit"
          className="btn btn--primary btn--block"
          disabled={pending || state.stale}
        >
          Approve and publish
        </button>
      </form>

      <div className="decision__alt" role="group" aria-label="Other decisions">
        <button
          type="button"
          className="btn btn--secondary btn--small"
          aria-expanded={mode === "return"}
          aria-controls="decision-form"
          onClick={() => setMode(mode === "return" ? null : "return")}
        >
          Request changes
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--small"
          aria-expanded={mode === "reject"}
          aria-controls="decision-form"
          onClick={() => setMode(mode === "reject" ? null : "reject")}
        >
          Reject
        </button>
      </div>

      {mode ? (
        <form
          action={action}
          id="decision-form"
          className="stack--sm decision__form"
          key={`${mode}-${state.attempt ?? 0}`}
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="version" value={version} />
          <input type="hidden" name="action" value={mode} />
          <p className="field__hint">
            {mode === "return"
              ? "The author can edit and resubmit. Explain what to change."
              : "Final: the author cannot resubmit this post. Explain why."}
          </p>
          <div className="field">
            <label htmlFor="reason">Reason</label>
            <select id="reason" name="reason" required defaultValue={echoed?.reason ?? ""}>
              <option value="" disabled>
                Choose a reason…
              </option>
              {REASON_CODES.map((r) => (
                <option key={r} value={r}>
                  {reasonLabels[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="note">Note to the author</label>
            <textarea
              id="note"
              name="note"
              rows={4}
              required
              minLength={10}
              maxLength={1000}
              defaultValue={echoed?.note ?? ""}
              aria-describedby="note-hint"
            />
            <p id="note-hint" className="field__hint">
              Shown to the author. Do not include anyone&apos;s personal details.
            </p>
          </div>
          <button
            type="submit"
            className={mode === "reject" ? "btn btn--danger" : "btn btn--secondary"}
            disabled={pending || state.stale}
          >
            {mode === "return" ? "Send back for changes" : "Reject permanently"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
