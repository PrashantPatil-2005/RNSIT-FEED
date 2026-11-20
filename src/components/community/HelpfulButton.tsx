"use client";

import { startTransition, useActionState } from "react";
import { helpfulAction, type HelpfulState } from "@/app/experiences/[id]/actions";

function countText(n: number): string {
  return n === 0 ? "No helpful votes yet." : `${n} member${n === 1 ? "" : "s"} found this helpful.`;
}

/**
 * Toggle for the member's own helpful vote. Who voted is never shown, only the count.
 * `justSignedIn`: the member came back from sign-in after clicking "Mark as helpful" as a visitor.
 * The button is focused and asks them to confirm; it never votes by itself.
 */
export function HelpfulButton({
  id,
  count,
  voted,
  justSignedIn = false,
}: {
  id: string;
  count: number;
  voted: boolean;
  justSignedIn?: boolean;
}) {
  const [state, run, pending] = useActionState<HelpfulState, FormData>(helpfulAction, {
    count,
    voted,
  });

  return (
    <form
      className="stack--sm"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData();
        data.set("id", id);
        data.set("helpful", state.voted ? "0" : "1");
        startTransition(() => run(data));
      }}
    >
      <p aria-live="polite">
        {/* Keyed so the count re-mounts and replays its small pop when it changes. */}
        <span key={state.count} className="helpful-count">
          {countText(state.count)}
        </span>
      </p>
      <button
        type="submit"
        className={`btn btn--small btn--block ${state.voted ? "btn--primary" : "btn--secondary"}`}
        aria-pressed={state.voted}
        disabled={pending}
        autoFocus={justSignedIn && !voted}
      >
        {state.voted ? "Marked as helpful" : "Mark as helpful"}
      </button>
      {state.error ? (
        <p className="form__error" role="alert">
          {state.error}
        </p>
      ) : (
        <p className="field__hint">
          {state.voted
            ? "Select again to undo."
            : justSignedIn
              ? "You are signed in. Select to confirm your vote."
              : "Anonymous: only the count is shown."}
        </p>
      )}
    </form>
  );
}
