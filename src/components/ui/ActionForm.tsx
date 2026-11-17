"use client";

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";

export interface ActionState {
  ok?: string;
  error?: string;
}

/**
 * A form for one admin server action. Submitting through a transition (not the form `action`
 * prop) means React does not clear the fields, so a refused submit keeps what the admin typed;
 * the form is cleared only after a success.
 */
export function ActionForm({
  action,
  submitLabel,
  children,
  danger = false,
  className,
  label,
}: {
  action: (prev: ActionState, data: FormData) => Promise<ActionState>;
  submitLabel: string;
  children: ReactNode;
  danger?: boolean;
  className?: string;
  label?: string;
}) {
  const [state, run, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form
      ref={ref}
      aria-label={label}
      className={["stack--sm action-form", className].filter(Boolean).join(" ")}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => run(data));
      }}
    >
      {children}
      {state.error ? (
        <p className="form__error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="form__ok" role="status">
          {state.ok}
        </p>
      ) : null}
      <div>
        <button
          type="submit"
          className={danger ? "btn btn--danger btn--small" : "btn btn--primary btn--small"}
          disabled={pending}
        >
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

/** Reason field shared by every audited admin action. */
export function ReasonField({ id, hint }: { id: string; hint?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>Reason</label>
      <input
        id={id}
        name="reason"
        type="text"
        required
        minLength={10}
        maxLength={1000}
        autoComplete="off"
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="field__hint">
        {hint ?? "Kept in the audit log. No names, USNs or email addresses."}
      </p>
    </div>
  );
}
