import type { ReactNode } from "react";

export function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="notice">
      <p className="notice__title">{title}</p>
      {children}
    </aside>
  );
}
