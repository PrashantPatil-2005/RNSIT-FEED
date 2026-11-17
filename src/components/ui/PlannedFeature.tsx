import type { ReactNode } from "react";
import { Container } from "@/components/layout/Container";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";

/**
 * Standard page for a feature that is planned but not built. It states plainly that nothing here
 * works yet, so no placeholder can be mistaken for real functionality.
 */
export function PlannedFeature({
  eyebrow,
  title,
  summary,
  willDo,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: ReactNode;
  willDo: readonly string[];
  children?: ReactNode;
}) {
  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={summary}
        badge={<Badge tone="accent">Planned · not available yet</Badge>}
      />
      <Container>
        <div className="section stack stack--lg">
          <Notice title="This page is a placeholder">
            <p>
              Nothing on this page works yet, and no real posts, companies or accounts exist. It
              only shows where this part of the product will live.
            </p>
          </Notice>
          <section className="stack" aria-labelledby="will-do">
            <h2 id="will-do">What it will do</h2>
            <ul className="checklist">
              {willDo.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          {children}
        </div>
      </Container>
    </>
  );
}
