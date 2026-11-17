import { cn } from "@/lib/cn";
import { resultLabels, type ResultType } from "@/lib/data/labels";

/** Result shown as text first; colour is a secondary cue only. */
export function ResultBadge({ result }: { result: ResultType }) {
  return (
    <span className={cn("result", `result--${result}`)} aria-hidden="true">
      {resultLabels[result]}
    </span>
  );
}
