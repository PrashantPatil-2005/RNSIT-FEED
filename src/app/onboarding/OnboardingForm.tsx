"use client";

import { useActionState } from "react";
import { completeOnboarding, type OnboardingState } from "./actions";

interface Option {
  id: number;
  label: string;
}

/** Works without JavaScript (plain form POST to a Server Action); with JS, errors show inline. */
export function OnboardingForm({
  departments,
  batches,
  next,
}: {
  departments: Option[];
  batches: Option[];
  next: string;
}) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(
    completeOnboarding,
    {},
  );
  const err = (f: OnboardingState["field"]) => (state.field === f ? "form-error" : undefined);

  return (
    <form action={action} className="form stack" noValidate key={state.attempt ?? 0}>
      <input type="hidden" name="next" value={next} />
      {state.error ? (
        <p id="form-error" className="form__error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="field">
        <label htmlFor="department">Department</label>
        <select
          id="department"
          name="department"
          required
          defaultValue={state.values?.department ?? ""}
          aria-invalid={state.field === "department" || undefined}
          aria-describedby={err("department")}
        >
          <option value="" disabled>
            Choose your department
          </option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="batch">Graduation batch</label>
        <select
          id="batch"
          name="batch"
          required
          defaultValue={state.values?.batch ?? ""}
          aria-invalid={state.field === "batch" || undefined}
          aria-describedby={err("batch")}
        >
          <option value="" disabled>
            Choose your graduation year
          </option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="usn">USN</label>
        <input
          id="usn"
          name="usn"
          type="text"
          required
          defaultValue={state.values?.usn ?? ""}
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={14}
          placeholder="1RN23CS001"
          pattern="\s*1[Rr][Nn][0-9]{2}[A-Za-z]{2}[0-9]{3}\s*"
          aria-invalid={state.field === "usn" || undefined}
          aria-describedby={["usn-hint", err("usn")].filter(Boolean).join(" ")}
        />
        <p id="usn-hint" className="field__hint">
          Kept private: never shown on your profile, posts, search or anywhere public. It is used
          only to keep one account per student. It cannot be changed later without an admin review.
        </p>
      </div>

      <div className="check">
        <input
          id="consent"
          name="consent"
          type="checkbox"
          required
          defaultChecked={state.values?.consent ?? false}
          aria-invalid={state.field === "consent" || undefined}
          aria-describedby={err("consent")}
        />
        <label htmlFor="consent">
          This is my own USN, and I understand it is stored privately to prevent duplicate accounts.
        </label>
      </div>

      <button type="submit" className="btn btn--primary" disabled={pending} aria-busy={pending}>
        {pending ? "Saving…" : "Finish setting up"}
      </button>
    </form>
  );
}
