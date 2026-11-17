"use client";

import { LIMITS, newKey, type ResourceForm } from "@/lib/experience/draft";

const URL_RE = /^https?:\/\/[^\s]+$/i;

export function ResourcesEditor({
  resources,
  onChange,
}: {
  resources: ResourceForm[];
  onChange: (next: ResourceForm[]) => void;
}) {
  return (
    <div className="stack--sm">
      {resources.map((r, i) => {
        const bad = r.url.trim() !== "" && !URL_RE.test(r.url.trim());
        return (
          <div key={r.key} className="resource-row">
            <div className="field">
              <label htmlFor={`res-url-${i}`}>Link {i + 1}</label>
              <input
                id={`res-url-${i}`}
                type="url"
                inputMode="url"
                maxLength={LIMITS.urlMax}
                placeholder="https://"
                value={r.url}
                aria-invalid={bad || undefined}
                aria-describedby={bad ? `res-url-${i}-hint` : undefined}
                onChange={(e) =>
                  onChange(
                    resources.map((x) => (x.key === r.key ? { ...x, url: e.target.value } : x)),
                  )
                }
              />
              {bad ? (
                <p id={`res-url-${i}-hint`} className="field__hint field__hint--warn">
                  Must start with http:// or https://. Not saved yet.
                </p>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor={`res-label-${i}`}>Label (optional)</label>
              <input
                id={`res-label-${i}`}
                type="text"
                maxLength={LIMITS.labelMax}
                value={r.label}
                onChange={(e) =>
                  onChange(
                    resources.map((x) => (x.key === r.key ? { ...x, label: e.target.value } : x)),
                  )
                }
              />
            </div>
            <button
              type="button"
              className="btn-link btn-link--danger"
              onClick={() => onChange(resources.filter((x) => x.key !== r.key))}
              aria-label={`Remove link ${i + 1}`}
            >
              Remove
            </button>
          </div>
        );
      })}
      {resources.length < LIMITS.resources ? (
        <button
          type="button"
          className="btn btn--secondary btn--small"
          onClick={() => onChange([...resources, { key: newKey(), url: "", label: "" }])}
        >
          + Add link
        </button>
      ) : null}
    </div>
  );
}
