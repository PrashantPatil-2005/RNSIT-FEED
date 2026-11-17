import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { SampleBadge } from "@/components/ui/Sample";
import { campusLabels, formatDate, opportunityLabels, resultLabels } from "@/lib/data/labels";
import type { ExperienceSummary } from "@/lib/data/queries";
import { ResultBadge } from "./ResultBadge";

/**
 * The whole card is clickable: the title link is stretched over the card (one tab stop, one
 * accessible name), and the company link sits above it as a separate, larger target.
 */
export function ExperienceCard({
  exp,
  showCompany = true,
}: {
  exp: ExperienceSummary;
  showCompany?: boolean;
}) {
  return (
    <article className="exp-card">
      <div className="exp-card__top">
        {showCompany ? (
          <Link className="exp-card__company" href={`/companies/${exp.companySlug}`}>
            {exp.companyName}
          </Link>
        ) : (
          <span />
        )}
        <ResultBadge result={exp.result} />
      </div>
      <h3 className="exp-card__title">
        <Link href={`/experiences/${exp.id}`} className="exp-card__link">
          {exp.roleTitle}
          <span className="visually-hidden">
            {showCompany ? ` at ${exp.companyName}` : ""}, result: {resultLabels[exp.result]}
          </span>
        </Link>
      </h3>
      <p className="exp-card__meta">
        {exp.departmentCode} · Batch {exp.batchYear} · Recruited {exp.recruitmentYear}
      </p>
      <div className="cluster cluster--tight">
        <Badge>{opportunityLabels[exp.opportunityType]}</Badge>
        <Badge>{campusLabels[exp.campusType]}</Badge>
        <SampleBadge />
      </div>
      <p className="exp-card__byline">
        <span>{exp.authorName ?? "Anonymous"}</span>
        {exp.helpfulCount ? <span>{exp.helpfulCount} found helpful</span> : null}
        {exp.publishedOn ? (
          <time dateTime={exp.publishedOn}>{formatDate(exp.publishedOn)}</time>
        ) : null}
      </p>
    </article>
  );
}
