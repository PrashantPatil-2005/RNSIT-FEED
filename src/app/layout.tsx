import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import { ViewTransition, type ReactNode } from "react";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SkipLink } from "@/components/layout/SkipLink";
import { StatusBanner } from "@/components/layout/StatusBanner";
import { site } from "@/config/site";
import { themeInitScript } from "@/lib/theme/theme";
import "./globals.css";

// Self-hosted at build time by next/font: no request to Google at runtime, no layout shift.
// Plex Sans for UI and reading, Source Serif for page titles only, Plex Mono for figures and codes.
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-plex-sans",
});
const serif = Source_Serif_4({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-source-serif",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-plex-mono",
});

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

// Mobile browser chrome colour, matched to --color-bg for each OS theme.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfb" },
    { media: "(prefers-color-scheme: dark)", color: "#100e0b" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the inline script may set data-theme before React hydrates.
    <html
      lang="en"
      className={`${sans.variable} ${serif.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <SkipLink />
        <StatusBanner />
        <SiteHeader />
        <main id="main" tabIndex={-1}>
          {/* Route changes crossfade (CSS in motion.css); unsupported browsers just swap. */}
          <ViewTransition default="page">{children}</ViewTransition>
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
