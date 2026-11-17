"use client";

import { emptyQuestion, LIMITS, ROUND_TYPES, type RoundForm } from "@/lib/experience/draft";
import { roundLabels } from "@/lib/data/labels";

const difficultyWords = ["", "Easy", "Fairly easy", "Moderate", "Hard", "Very hard"];

export function RoundEditor({
  index,
  round,
  topics,
  invalid,
  onChange,
  onRemove,
  onMove,
  canMoveUp,
  canMoveDown,
}: {
  index: number;
  round: RoundForm;
  topics: { id: number; name: string }[];
  invalid: boolean;
  onChange: (next: RoundForm) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const id = `round-${index}`;
  const set = (patch: Partial<RoundForm>) => onChange({ ...round, ...patch });
  const toggleTopic = (t: number) =>
    set({
      topicIds: round.topicIds.includes(t)
        ? round.topicIds.filter((x) => x !== t)
        : [...round.topicIds, t],
    });

  return (
    <fieldset className="round-editor" id={id}>
      <legend className="round-editor__legend">
        Round {index + 1}
        {round.roundType ? ` · ${roundLabels[round.roundType as keyof typeof roundLabels]}` : ""}
      </legend>
      <div className="round-editor__tools">
        <button
          type="button"
          className="btn-link"
          onClick={() => onMove(-1)}
          disabled={!canMoveUp}
          aria-label={`Move round ${index + 1} up`}
        >
          ↑ Up
        </button>
        <button
          type="button"
          className="btn-link"
          onClick={() => onMove(1)}
          disabled={!canMoveDown}
          aria-label={`Move round ${index + 1} down`}
        >
          ↓ Down
        </button>
        <button
          type="button"
          className="btn-link btn-link--danger"
          onClick={onRemove}
          aria-label={`Remove round ${index + 1}`}
        >
          Remove
        </button>
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${id}-type`}>Round type</label>
          <select
            id={`${id}-type`}
            value={round.roundType}
            onChange={(e) => set({ roundType: e.target.value })}
            aria-invalid={invalid && !round.roundType ? true : undefined}
          >
            <option value="">Choose…</option>
            {ROUND_TYPES.map((t) => (
              <option key={t} value={t}>
                {roundLabels[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-duration`}>Duration (minutes)</label>
          <input
            id={`${id}-duration`}
            type="number"
            inputMode="numeric"
            min={1}
            max={LIMITS.durationMax}
            value={round.durationMin}
            onChange={(e) => set({ durationMin: e.target.value.slice(0, 3) })}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-platform`}>Platform</label>
          <input
            id={`${id}-platform`}
            type="text"
            maxLength={LIMITS.platformMax}
            placeholder="e.g. HackerRank, video call, in person"
            value={round.platform}
            onChange={(e) => set({ platform: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-difficulty`}>Difficulty</label>
          <select
            id={`${id}-difficulty`}
            value={round.difficulty}
            onChange={(e) => set({ difficulty: e.target.value })}
          >
            <option value="">Not rated</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={String(n)}>
                {n} · {difficultyWords[n]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {topics.length ? (
        <fieldset className="topic-picker">
          <legend>Topics covered</legend>
          <div className="cluster cluster--tight">
            {topics.map((t) => (
              <label key={t.id} className="toggle-chip">
                <input
                  type="checkbox"
                  checked={round.topicIds.includes(t.id)}
                  onChange={() => toggleTopic(t.id)}
                />
                <span>{t.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="questions-editor">
        <p className="questions-editor__title">Questions asked</p>
        <p className="field__hint">
          In your own words. Do not paste question papers, screenshots or confidential material.
        </p>
        {round.questions.map((q, qi) => {
          const qid = `${id}-q${qi}`;
          const short = q.body.trim().length > 0 && q.body.trim().length < LIMITS.questionMin;
          return (
            <div key={q.key} className="question-row">
              <label htmlFor={qid} className="visually-hidden">
                Round {index + 1}, question {qi + 1}
              </label>
              <textarea
                id={qid}
                rows={2}
                maxLength={LIMITS.questionMax}
                value={q.body}
                placeholder={`Question ${qi + 1}`}
                aria-invalid={short || undefined}
                aria-describedby={short ? `${qid}-hint` : undefined}
                onChange={(e) =>
                  set({
                    questions: round.questions.map((x) =>
                      x.key === q.key ? { ...x, body: e.target.value } : x,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="btn-link btn-link--danger"
                onClick={() =>
                  set({
                    questions:
                      round.questions.length > 1
                        ? round.questions.filter((x) => x.key !== q.key)
                        : [emptyQuestion()],
                  })
                }
                aria-label={`Remove question ${qi + 1} of round ${index + 1}`}
              >
                Remove
              </button>
              {short ? (
                <p id={`${qid}-hint`} className="field__hint field__hint--warn">
                  At least {LIMITS.questionMin} characters. Not saved yet.
                </p>
              ) : null}
            </div>
          );
        })}
        {round.questions.length < LIMITS.questionsPerRound ? (
          <button
            type="button"
            className="btn btn--secondary btn--small"
            onClick={() => set({ questions: [...round.questions, emptyQuestion()] })}
          >
            + Add question
          </button>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor={`${id}-notes`}>Notes on this round (optional)</label>
        <textarea
          id={`${id}-notes`}
          rows={2}
          maxLength={LIMITS.notesMax}
          value={round.notes}
          placeholder="Format, what the interviewer focused on, how it went"
          onChange={(e) => set({ notes: e.target.value })}
        />
      </div>
    </fieldset>
  );
}
