import { REPORT_DETAILS_MAX, REPORT_REASONS, reportReasonLabels } from "@/lib/community/labels";

/** Reason and optional details for reporting a post or a comment. */
export function ReportFields({ idPrefix }: { idPrefix: string }) {
  return (
    <>
      <div className="field">
        <label htmlFor={`${idPrefix}-reason`}>Reason</label>
        <select id={`${idPrefix}-reason`} name="reason" required defaultValue="">
          <option value="" disabled>
            Choose a reason…
          </option>
          {REPORT_REASONS.map((r) => (
            <option key={r} value={r}>
              {reportReasonLabels[r]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-details`}>Details (optional)</label>
        <textarea
          id={`${idPrefix}-details`}
          name="details"
          rows={3}
          maxLength={REPORT_DETAILS_MAX}
          aria-describedby={`${idPrefix}-details-hint`}
        />
        <p id={`${idPrefix}-details-hint`} className="field__hint">
          Moderators see this, but not who reported. Do not include anyone&apos;s personal details.
        </p>
      </div>
    </>
  );
}
