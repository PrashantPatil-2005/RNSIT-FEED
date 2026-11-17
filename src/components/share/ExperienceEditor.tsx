"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  saveDraftAction,
  submitExperienceAction,
  type SaveErrorCode,
  type SubmitErrorCode,
} from "@/app/share/actions";
import {
  CAMPUS,
  emptyRound,
  LIMITS,
  OPPORTUNITY,
  RESULT,
  validateForSubmit,
  type DraftForm,
  type RoundForm,
} from "@/lib/experience/draft";
import { campusLabels, opportunityLabels, resultLabels } from "@/lib/data/labels";
import { ResourcesEditor } from "./ResourcesEditor";
import { RoundEditor } from "./RoundEditor";

type Status = "idle" | "unsaved" | "saving" | "saved" | "error" | "conflict";

const AUTOSAVE_MS = 1500;

const saveMessages: Record<SaveErrorCode, string> = {
  signed_out: "You were signed out. Sign in again to keep saving.",
  not_onboarded: "Finish setting up your account first.",
  conflict: "This draft was changed in another tab or device.",
  not_editable: "This experience has been submitted and can no longer be edited here.",
  not_found: "This draft no longer exists.",
  draft_limit: "You already have 10 drafts. Delete one to start another.",
  invalid: "Some details could not be saved. Check the highlighted fields.",
  failed: "Saving failed. Check your connection; we will retry when you edit again.",
};

const submitMessages: Record<SubmitErrorCode, string> = {
  ...saveMessages,
  incomplete: "Some required details are missing.",
  duplicate:
    "You already have a pending or published experience for this company, role and year. Withdraw it first if you want to replace it.",
  pending_limit: "You have 5 experiences waiting for review. Please wait for moderators first.",
  already_submitted: "This experience was already submitted.",
};

export interface EditorProps {
  initialId: string | null;
  initialVersion: number | null;
  initialForm: DraftForm;
  status: "draft" | "returned";
  moderationNote: string | null;
  companies: { id: string; name: string }[];
  departments: { id: number; code: string; name: string }[];
  topics: { id: number; name: string }[];
  postingAs: string;
}

export function ExperienceEditor(props: EditorProps) {
  const [form, setForm] = useState<DraftForm>(props.initialForm);
  const [status, setStatus] = useState<Status>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [notSaved, setNotSaved] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const idRef = useRef(props.initialId);
  const versionRef = useRef(props.initialVersion);
  const formRef = useRef(form);
  const inflight = useRef<Promise<void> | null>(null);
  const queued = useRef(false);
  const blocked = useRef(false); // conflict or permanent error: stop autosaving
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);
  const summaryRef = useRef<HTMLDivElement>(null);

  // Keep the latest form for saves started by timers and handlers (synced after each render).
  useLayoutEffect(() => {
    formRef.current = form;
  }, [form]);

  const save = useCallback(async (): Promise<void> => {
    if (blocked.current) return;
    if (inflight.current) {
      // A save is running: ask it to run once more with the latest form when it finishes.
      queued.current = true;
      return inflight.current;
    }
    const run = (async () => {
      do {
        queued.current = false;
        setStatus("saving");
        const res = await saveDraftAction({
          id: idRef.current,
          version: versionRef.current,
          form: formRef.current,
        });
        if (res.ok) {
          const created = idRef.current === null;
          idRef.current = res.id;
          versionRef.current = res.version;
          setNotSaved(res.notSaved);
          setSaveError(null);
          setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
          setStatus("saved");
          // Keep the URL resumable (reload, another device) without a navigation.
          if (created) window.history.replaceState(null, "", `/share/${res.id}`);
        } else {
          setSaveError(saveMessages[res.code]);
          if (["conflict", "not_editable", "not_found", "signed_out"].includes(res.code)) {
            blocked.current = true;
            setStatus(res.code === "conflict" ? "conflict" : "error");
          } else {
            setStatus("error");
          }
        }
      } while (queued.current && !blocked.current);
    })();
    inflight.current = run;
    try {
      await run;
    } finally {
      inflight.current = null;
    }
  }, []);

  // Debounced autosave after every edit (skips the initial render).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (blocked.current) return;
    setStatus("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [form, save]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (status === "unsaved" || status === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [status]);

  const update = (patch: Partial<DraftForm>) => setForm((f) => ({ ...f, ...patch }));
  const setRound = (i: number, r: RoundForm) =>
    setForm((f) => ({ ...f, rounds: f.rounds.map((x, j) => (j === i ? r : x)) }));
  const moveRound = (i: number, dir: -1 | 1) =>
    setForm((f) => {
      const rounds = [...f.rounds];
      const j = i + dir;
      if (j < 0 || j >= rounds.length) return f;
      [rounds[i], rounds[j]] = [rounds[j]!, rounds[i]!];
      return { ...f, rounds };
    });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || blocked.current) return;
    const local = validateForSubmit(formRef.current);
    if (local.length) {
      setIssues(local.map((i) => i.message));
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setSubmitting(true);
    setIssues([]);
    if (timer.current) clearTimeout(timer.current);
    if (inflight.current) await inflight.current;
    try {
      // On success the server redirects to the list; this only returns on failure.
      const res = await submitExperienceAction({
        id: idRef.current,
        version: versionRef.current,
        form: formRef.current,
      });
      setIssues([submitMessages[res.code], ...(res.issues ?? [])]);
      if (res.code === "conflict") {
        blocked.current = true;
        setStatus("conflict");
      }
      requestAnimationFrame(() => summaryRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  }

  const invalid = issues.length > 0;
  const f = form;

  return (
    <form className="editor stack stack--lg" onSubmit={onSubmit} noValidate>
      <div className="editor__bar" role="status" aria-live="polite">
        <span className={`save-state save-state--${status}`}>
          {status === "saving"
            ? "Saving…"
            : status === "unsaved"
              ? "Unsaved changes"
              : status === "saved"
                ? `Draft saved${savedAt ? ` at ${savedAt}` : ""}`
                : status === "conflict"
                  ? "Not saved: changed elsewhere"
                  : status === "error"
                    ? "Not saved"
                    : props.initialId
                      ? "Draft loaded"
                      : "Nothing saved yet"}
        </span>
        <span className="muted">Posting as {props.postingAs}</span>
      </div>

      {saveError ? (
        <div className="form__error" role="alert">
          <p>{saveError}</p>
          {status === "conflict" ? (
            <button
              type="button"
              className="btn btn--secondary btn--small"
              onClick={() => window.location.reload()}
            >
              Load the latest version
            </button>
          ) : null}
        </div>
      ) : null}

      {props.status === "returned" ? (
        <div className="notice">
          <p className="notice__title">A moderator asked for changes</p>
          <p>
            {props.moderationNote ??
              "A moderator asked for changes. Edit and submit again for another review."}
          </p>
        </div>
      ) : null}

      {issues.length ? (
        <div className="form__error" role="alert" tabIndex={-1} ref={summaryRef}>
          <p>
            <strong>Before submitting:</strong>
          </p>
          <ul>
            {issues.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {notSaved.length ? (
        <div className="notice notice--warn">
          <p className="notice__title">Not saved yet</p>
          <ul>
            {notSaved.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <fieldset className="editor__section">
        <legend>The role</legend>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="companyId">Company</label>
            <select
              id="companyId"
              value={f.companyId}
              onChange={(e) => update({ companyId: e.target.value })}
              aria-invalid={invalid && !f.companyId ? true : undefined}
            >
              <option value="">Choose a company…</option>
              {props.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="field__hint">
              Not listed? Companies are added by the admins; mention it to the site team.
            </p>
          </div>
          <div className="field">
            <label htmlFor="roleTitle">Role title</label>
            <input
              id="roleTitle"
              type="text"
              maxLength={LIMITS.roleMax}
              placeholder="e.g. Software Engineer Intern"
              value={f.roleTitle}
              onChange={(e) => update({ roleTitle: e.target.value })}
              aria-invalid={
                invalid && f.roleTitle.trim().length < LIMITS.roleMin ? true : undefined
              }
            />
          </div>
          <div className="field">
            <label htmlFor="recruitmentYear">Recruitment year</label>
            <input
              id="recruitmentYear"
              type="number"
              inputMode="numeric"
              min={LIMITS.yearMin}
              max={LIMITS.yearMax}
              placeholder={String(new Date().getFullYear())}
              value={f.recruitmentYear}
              onChange={(e) => update({ recruitmentYear: e.target.value.slice(0, 4) })}
              aria-invalid={invalid && !f.recruitmentYear ? true : undefined}
            />
          </div>
        </div>
        <Choice
          name="opportunityType"
          legend="Opportunity type"
          value={f.opportunityType}
          options={OPPORTUNITY.map((v) => [v, opportunityLabels[v]])}
          onChange={(v) => update({ opportunityType: v })}
          invalid={invalid && !f.opportunityType}
        />
        <Choice
          name="campusType"
          legend="Drive"
          value={f.campusType}
          options={CAMPUS.map((v) => [v, campusLabels[v]])}
          onChange={(v) => update({ campusType: v })}
          invalid={invalid && !f.campusType}
        />
      </fieldset>

      <fieldset className="editor__section">
        <legend>Eligibility (optional)</legend>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="minCgpa">Minimum CGPA</label>
            <input
              id="minCgpa"
              type="number"
              inputMode="decimal"
              min={0}
              max={10}
              step={0.1}
              value={f.minCgpa}
              onChange={(e) => update({ minCgpa: e.target.value.slice(0, 4) })}
            />
          </div>
          <div className="field">
            <label htmlFor="backlogsAllowed">Backlogs allowed</label>
            <input
              id="backlogsAllowed"
              type="number"
              inputMode="numeric"
              min={0}
              max={LIMITS.backlogsMax}
              value={f.backlogsAllowed}
              onChange={(e) => update({ backlogsAllowed: e.target.value.slice(0, 2) })}
            />
          </div>
        </div>
        <fieldset className="topic-picker">
          <legend>Branches allowed to apply</legend>
          <div className="cluster cluster--tight">
            {props.departments.map((d) => (
              <label key={d.id} className="toggle-chip">
                <input
                  type="checkbox"
                  checked={f.eligibleDepartmentIds.includes(d.id)}
                  onChange={() =>
                    update({
                      eligibleDepartmentIds: f.eligibleDepartmentIds.includes(d.id)
                        ? f.eligibleDepartmentIds.filter((x) => x !== d.id)
                        : [...f.eligibleDepartmentIds, d.id],
                    })
                  }
                />
                <span>{d.code}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </fieldset>

      <section className="editor__section stack" aria-labelledby="rounds-legend">
        <h2 id="rounds-legend" className="editor__heading">
          Interview rounds
        </h2>
        {f.rounds.map((r, i) => (
          <RoundEditor
            key={r.key}
            index={i}
            round={r}
            topics={props.topics}
            invalid={invalid}
            onChange={(next) => setRound(i, next)}
            onRemove={() => setForm((x) => ({ ...x, rounds: x.rounds.filter((_, j) => j !== i) }))}
            onMove={(dir) => moveRound(i, dir)}
            canMoveUp={i > 0}
            canMoveDown={i < f.rounds.length - 1}
          />
        ))}
        {f.rounds.length < LIMITS.rounds ? (
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => update({ rounds: [...f.rounds, emptyRound()] })}
          >
            + Add round
          </button>
        ) : null}
      </section>

      <fieldset className="editor__section">
        <legend>Outcome and advice</legend>
        <Choice
          name="result"
          legend="Final result"
          value={f.result}
          options={RESULT.map((v) => [v, resultLabels[v]])}
          onChange={(v) => update({ result: v })}
          invalid={invalid && !f.result}
        />
        <div className="field field--wide">
          <label htmlFor="prepTips">Preparation tips (optional)</label>
          <textarea
            id="prepTips"
            rows={5}
            maxLength={LIMITS.tipsMax}
            value={f.prepTips}
            placeholder="What helped, what you would do differently"
            onChange={(e) => update({ prepTips: e.target.value })}
          />
          <p className="field__hint">
            {f.prepTips.length}/{LIMITS.tipsMax}
          </p>
        </div>
        <div className="stack--sm">
          <p className="editor__label">Resources (optional)</p>
          <ResourcesEditor
            resources={f.resources}
            onChange={(resources) => update({ resources })}
          />
        </div>
      </fieldset>

      <fieldset className="editor__section">
        <legend>How to publish</legend>
        <Choice
          name="anonymity"
          legend="Show my name on this experience?"
          value={f.anonymity}
          options={[
            ["no", `Post under my name (${props.postingAs})`],
            ["yes", "Post anonymously"],
          ]}
          onChange={(v) => update({ anonymity: v as DraftForm["anonymity"] })}
          invalid={invalid && !f.anonymity}
          hint="Anonymous posts never show your name, publicly or to moderators. Only an admin can look up the author, with a written reason that is audited. Small batches and timing can still hint at who wrote a post."
        />
      </fieldset>

      <div className="editor__submit">
        <p className="field__hint">
          Submitted experiences are reviewed by a moderator before anyone can see them. You cannot
          edit after submitting, but you can pull it back to a draft until it is reviewed. Read the{" "}
          <Link href="/guidelines">content guidelines</Link>.
        </p>
        <div className="cluster">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={submitting || status === "conflict"}
            aria-busy={submitting}
          >
            {submitting ? "Submitting…" : "Submit for review"}
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => void save()}
            disabled={status === "saving" || status === "conflict" || submitting}
          >
            Save draft now
          </button>
          <Link className="btn-link" href="/my/experiences">
            My experiences
          </Link>
        </div>
      </div>
    </form>
  );
}

function Choice({
  name,
  legend,
  value,
  options,
  onChange,
  invalid,
  hint,
}: {
  name: string;
  legend: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
  invalid?: boolean;
  hint?: string;
}) {
  return (
    <fieldset className="choice" aria-invalid={invalid || undefined} id={name}>
      <legend>{legend}</legend>
      <div className="choice__options">
        {options.map(([v, label]) => (
          <label key={v} className="choice__option">
            <input
              type="radio"
              name={name}
              value={v}
              checked={value === v}
              onChange={() => onChange(v)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {hint ? <p className="field__hint">{hint}</p> : null}
    </fieldset>
  );
}
