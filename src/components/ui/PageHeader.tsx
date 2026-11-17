import type { ReactNode } from "react";
import { Container } from "@/components/layout/Container";

export function PageHeader({
  eyebrow,
  title,
  description,
  badge,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <header className="page-header">
      <Container>
        <div className="stack">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1>{title}</h1>
          {description ? <p className="lead">{description}</p> : null}
          {badge ? <div className="cluster">{badge}</div> : null}
        </div>
      </Container>
    </header>
  );
}
