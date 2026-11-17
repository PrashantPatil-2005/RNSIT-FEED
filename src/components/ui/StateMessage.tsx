import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Empty or error state. Errors use role="alert" so assistive technology announces them. */
export function StateMessage({
  kind = "empty",
  title,
  children,
  action,
}: {
  kind?: "empty" | "error";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn("state", kind === "error" && "state--error")}
      role={kind === "error" ? "alert" : undefined}
    >
      <h2 className="state__title">{title}</h2>
      {children}
      {action}
    </div>
  );
}
