import { roundLabels, type RoundType } from "@/lib/data/labels";
import { Difficulty } from "./Difficulty";

export interface RoundView {
  id: string;
  position: number;
  roundType: RoundType;
  durationMin: number | null;
  platform: string | null;
  difficulty: number | null;
  notes: string | null;
  topics: string[];
  questions: { id: string; body: string }[];
}

/** Round-by-round presentation shared by the public detail page and the moderation review. */
export function RoundsList({ rounds }: { rounds: RoundView[] }) {
  return (
    <ol className="rounds list-reset">
      {rounds.map((round) => (
        <li key={round.id} className="round">
          <div className="round__head">
            <h3>
              <span className="round__num">Round {round.position}</span>
              {roundLabels[round.roundType]}
            </h3>
            <Difficulty value={round.difficulty} />
          </div>
          {round.durationMin !== null || round.platform || round.topics.length ? (
            <dl className="round__facts">
              {round.durationMin !== null ? (
                <div>
                  <dt>Duration</dt>
                  <dd>{round.durationMin} min</dd>
                </div>
              ) : null}
              {round.platform ? (
                <div>
                  <dt>Platform</dt>
                  <dd>{round.platform}</dd>
                </div>
              ) : null}
              {round.topics.length ? (
                <div>
                  <dt>Topics</dt>
                  <dd className="cluster cluster--tight">
                    {round.topics.map((t) => (
                      <span key={t} className="tag">
                        {t.toUpperCase()}
                      </span>
                    ))}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          {round.notes ? <p className="round__notes">{round.notes}</p> : null}
          {round.questions.length ? (
            <div className="round__questions">
              <h4 className="round__subhead">Questions asked</h4>
              <ol className="questions">
                {round.questions.map((q) => (
                  <li key={q.id}>{q.body}</li>
                ))}
              </ol>
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
