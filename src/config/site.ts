/**
 * Central site configuration.
 *
 * The product name is kept in one place because the right to use the name "RNSIT" has not been
 * confirmed in writing yet (open dependency U4). If permission is refused, change `name` here.
 */
export const site = {
  name: "RNSIT FEED",
  description:
    "A free, structured archive of placement experiences shared by RNSIT students and alumni.",
  /**
   * True only where the database holds synthetic sample content (local development and previews).
   * Every page then labels its content as sample data, so nothing is mistaken for a real student
   * submission. Never set this in production.
   */
  sampleContent: process.env.NEXT_PUBLIC_SAMPLE_CONTENT === "true",
  /**
   * College Google domain, confirmed by the owner (U1). Display text only: the database setting
   * private.settings.allowed_email_domain is what actually decides who can sign up.
   */
  collegeDomain: "rnsit.ac.in",
} as const;

export interface NavItem {
  readonly href: string;
  readonly label: string;
}

export const primaryNav: readonly NavItem[] = [
  { href: "/experiences", label: "Experiences" },
  { href: "/companies", label: "Companies" },
  { href: "/share", label: "Share" },
];

export const footerNav: readonly NavItem[] = [
  { href: "/guidelines", label: "Content guidelines" },
  { href: "/disclaimer", label: "Disclaimer" },
  { href: "/privacy", label: "Privacy" },
];
