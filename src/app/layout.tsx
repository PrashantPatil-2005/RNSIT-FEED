import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SkipLink } from "@/components/layout/SkipLink";
import { StatusBanner } from "@/components/layout/StatusBanner";
import { site } from "@/config/site";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${site.name} – placement experiences from RNSIT seniors`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  // Placeholder site: ask crawlers not to index until launch. This is a pre-launch default only.
  // Whether the live site should be indexed is an open owner decision.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SkipLink />
        <StatusBanner />
        <SiteHeader />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
