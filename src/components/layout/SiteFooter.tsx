import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { footerNav, site } from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <Container className="site-footer__grid">
        <div className="stack">
          <strong>{site.name}</strong>
          <p>
            An independent student initiative. Not an official RNSIT platform and not affiliated
            with the institute. Experiences are shared by students and may be incomplete or out of
            date.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="site-footer__links">
            {footerNav.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </footer>
  );
}
