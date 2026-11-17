import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { campusLabels, formatDate, opportunityLabels, resultLabels } from "@/lib/data/labels";
import type { ExperienceSummary } from "@/lib/data/queries";
import { ResultBadge } from "./ResultBadge";

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
        ) : null}
        <ResultBadge result={exp.result} />
      </div>
      <h3 className="exp-card__title">
        <Link href={`/experiences/${exp.id}`} className="exp-card__link">
          {exp.roleTitle}
        </Link>
      </h3>
      <div className="cluster cluster--tight">
        <Badge>{opportunityLabels[exp.opportunityType]}</Badge>
        <Badge>{campusLabels[exp.campusType]}</Badge>
      </div>
      <p className="exp-card__meta">
        {exp.departmentCode} · Batch {exp.batchYear} · Recruited {exp.recruitmentYear}
      </p>
      <p className="exp-card__byline">
        <span>{exp.authorName ?? "Anonymous"}</span>
        {exp.publishedOn ? (
          <time dateTime={exp.publishedOn} aria-label={`Published ${formatDate(exp.publishedOn)}`}>
            {formatDate(exp.publishedOn)}
          </time>
        ) : null}
      </p>
      <span className="visually-hidden">Result: {resultLabels[exp.result]}</span>
    </article>
  );
}
