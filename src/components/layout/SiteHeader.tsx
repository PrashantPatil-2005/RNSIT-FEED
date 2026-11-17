import Link from "next/link";
import { AuthControls } from "@/components/layout/AuthControls";
import { Container } from "@/components/layout/Container";
import { MobileNav } from "@/components/layout/MobileNav";
import { NavLinks } from "@/components/layout/NavLinks";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { primaryNav, site } from "@/config/site";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Container className="site-header__inner">
        <Link href="/" className="brand" aria-label={`${site.name}, home`}>
          <span className="brand__mark" aria-hidden="true">
            F
          </span>
          <span>
            RNSIT <span className="brand__sub">FEED</span>
          </span>
        </Link>

        <div className="nav-desktop">
          <NavLinks items={primaryNav} label="Primary" />
        </div>

        <div className="header-actions">
          <ThemeToggle />
          <AuthControls />
        </div>

        <MobileNav items={primaryNav} account={<AuthControls variant="menu" />} />
      </Container>
    </header>
  );
}
