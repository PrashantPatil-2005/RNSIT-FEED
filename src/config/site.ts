/**
 * Central site configuration.
 *
 * The product name is kept in one place because the right to use the name "RNSIT" has not been
 * confirmed in writing yet (open dependency U4). If permission is refused, change `name` here.
 */
export const site = {
  name: "RNSIT FEED",
  description:
    "A free, structured archive of placement experiences shared by RNSIT students and alumni. Planning stage: not live yet.",
} as const;

export interface NavItem {
  readonly href: string;
  readonly label: string;
}

export const primaryNav: readonly NavItem[] = [
  { href: "/experiences", label: "Experiences" },
  { href: "/companies", label: "Companies" },
  { href: "/search", label: "Search" },
  { href: "/share", label: "Share" },
];

export const footerNav: readonly NavItem[] = [
  { href: "/guidelines", label: "Content guidelines" },
  { href: "/disclaimer", label: "Disclaimer" },
  { href: "/privacy", label: "Privacy" },
];
