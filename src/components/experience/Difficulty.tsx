const words = ["", "Easy", "Fairly easy", "Moderate", "Hard", "Very hard"] as const;

/** Colour band for the filled dots; the n/5 text stays the primary cue. */
function level(value: number): "easy" | "moderate" | "hard" {
  if (value <= 2) return "easy";
  return value === 3 ? "moderate" : "hard";
}

/**
 * Five-step difficulty meter. A visible "Difficulty" label and the n/5 value make it readable
 * without colour; the accessible name and tooltip spell out the scale.
 */
export function Difficulty({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="difficulty difficulty--none">Difficulty not rated</span>;
  }
  const description = `Difficulty ${value} out of 5 (${words[value] ?? ""}). Scale: 1 easy, 5 very hard. Rated by the author.`;
  return (
    <span
      className={`difficulty difficulty--${level(value)}`}
      role="img"
      aria-label={description}
      title={description}
    >
      <span className="difficulty__label" aria-hidden="true">
        Difficulty
      </span>
      <span className="difficulty__dots" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={i <= value ? "difficulty__dot difficulty__dot--on" : "difficulty__dot"}
          />
        ))}
      </span>
      <span className="difficulty__num" aria-hidden="true">
        {value}/5
      </span>
    </span>
  );
}
