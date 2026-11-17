import type { ReactNode } from "react";
import { Container } from "@/components/layout/Container";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";

/**
 * Standard page for a feature that is planned but not open yet. It says plainly what does not
 * work today, so nothing can be mistaken for real functionality, without sounding broken.
 */
export function PlannedFeature({
  eyebrow,
  title,
  summary,
  willDo,
  noticeTitle = "Not open yet",
  notice = "This feature is not available yet. Nothing entered on this page is submitted or saved.",
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: ReactNode;
  willDo: readonly string[];
  noticeTitle?: string;
  notice?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={summary}
        badge={<Badge tone="accent">Coming soon</Badge>}
      />
      <Container>
        <div className="section section--tight stack stack--lg planned">
          <Notice title={noticeTitle}>
            <p>{notice}</p>
          </Notice>
          <section className="stack" aria-labelledby="will-do">
            <h2 id="will-do" className="h-small">
              What you will be able to do
            </h2>
            <ul className="checklist">
              {willDo.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          {actions ? <div className="cluster">{actions}</div> : null}
          {children}
        </div>
      </Container>
    </>
  );
}
