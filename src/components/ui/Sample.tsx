import type { ReactNode } from "react";
import { site } from "@/config/site";
import { Notice } from "./Notice";

/** Small label for a card, header or statistic when the site runs on synthetic sample data. */
export function SampleBadge() {
  if (!site.sampleContent) return null;
  return (
    <span
      className="badge badge--sample"
      title="Synthetic sample data, not a real student submission"
    >
      Sample data
    </span>
  );
}

/** Page-level explanation shown above sample content. Renders nothing in production. */
export function SampleNotice({ children }: { children?: ReactNode }) {
  if (!site.sampleContent) return null;
  return (
    <Notice title="Sample data for preview">
      <p>
        {children ??
          "Everything listed here is synthetic content created for testing the site. It is not a real student submission and does not describe a real recruitment process."}
      </p>
    </Notice>
  );
}
