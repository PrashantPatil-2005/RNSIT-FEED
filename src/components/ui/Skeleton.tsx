import { cn } from "@/lib/cn";

export function Skeleton({ variant }: { variant?: "title" | "short" }) {
  return (
    <span
      className={cn(
        "skeleton",
        variant === "title" && "skeleton--title",
        variant === "short" && "skeleton--short",
      )}
      aria-hidden="true"
    />
  );
}

/** Wrap skeletons so screen readers hear one polite "Loading" message instead of silence. */
export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="stack" role="status" aria-live="polite">
      <span className="visually-hidden">{label}…</span>
      <Skeleton variant="title" />
      <Skeleton />
      <Skeleton />
      <Skeleton variant="short" />
    </div>
  );
}
