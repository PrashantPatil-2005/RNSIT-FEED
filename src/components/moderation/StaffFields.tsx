import { REASON_CODES, reasonLabels } from "@/lib/moderation/labels";

/** Moderation reason code. Required for removals; the database refuses a removal without one. */
export function StaffReasonField({ id, required = false }: { id: string; required?: boolean }) {
  return (
    <div className="field">
      <label htmlFor={id}>Reason{required ? "" : " (needed to remove)"}</label>
      <select id={id} name="reason" required={required} defaultValue="">
        <option value="">{required ? "Choose a reason…" : "No reason"}</option>
        {REASON_CODES.map((r) => (
          <option key={r} value={r}>
            {reasonLabels[r]}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Outcome choice for a report. */
export function OutcomeField({ name, removeLabel }: { name: string; removeLabel: string }) {
  const options: [string, string][] = [
    ["dismiss", "Dismiss: nothing wrong"],
    ["action", "Acted on: keep it visible"],
    ["remove", removeLabel],
  ];
  return (
    <fieldset className="field outcome">
      <legend>Outcome</legend>
      {options.map(([value, label]) => (
        <label key={value} className="outcome__option">
          <input type="radio" name="outcome" value={value} required id={`${name}-${value}`} />
          {label}
        </label>
      ))}
    </fieldset>
  );
}
