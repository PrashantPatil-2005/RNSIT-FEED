import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { MobileNav } from "@/components/layout/MobileNav";
import { NavLinks } from "@/components/layout/NavLinks";
import { primaryNav, site } from "@/config/site";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Container className="site-header__inner">
        <Link href="/" className="brand" aria-label={`${site.name}, home`}>
          <span className="brand__mark" aria-hidden="true" />
          <span>
            RNSIT <span className="brand__sub">FEED</span>
          </span>
        </Link>

        <div className="nav-desktop">
          <NavLinks items={primaryNav} label="Primary" />
        </div>

        <div className="header-actions">
          <Link className="btn btn--secondary btn--small" href="/sign-in">
            Sign in (soon)
          </Link>
        </div>

        <MobileNav items={primaryNav} />
      </Container>
    </header>
  );
}
