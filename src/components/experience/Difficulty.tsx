/** Five-step difficulty meter with a text equivalent for assistive technology. */
export function Difficulty({ value }: { value: number | null }) {
  if (value === null) return <span className="muted">Not rated</span>;
  return (
    <span className="difficulty" role="img" aria-label={`Difficulty ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={i <= value ? "difficulty__dot difficulty__dot--on" : "difficulty__dot"}
        />
      ))}
      <span className="difficulty__num" aria-hidden="true">
        {value}/5
      </span>
    </span>
  );
}
