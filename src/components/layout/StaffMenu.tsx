"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export interface StaffMenuLink {
  href: string;
  label: string;
}

/**
 * Header "Staff" dropdown for moderators and admins, built on a native <details> element so it
 * works without JavaScript. The effects only add: close after navigating, on Escape, and on a
 * click outside. The links come from staffLinksFor() in src/lib/auth/permissions.ts.
 */
export function StaffMenu({ links }: { links: readonly StaffMenuLink[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    ref.current?.removeAttribute("open");
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const details = ref.current;
      if (event.key === "Escape" && details?.open) {
        details.open = false;
        details.querySelector("summary")?.focus();
      }
    }
    function onPointerDown(event: PointerEvent) {
      const details = ref.current;
      if (details?.open && !details.contains(event.target as Node)) details.open = false;
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  const current = (href: string) =>
    pathname === href ||
    (href !== "/admin" && href !== "/moderation" && pathname.startsWith(`${href}/`));

  return (
    <details className="staff-menu" ref={ref}>
      <summary className="btn-link staff-menu__summary">Staff</summary>
      <ul className="staff-menu__list list-reset" aria-label="Staff pages">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              className="nav-link"
              href={l.href}
              aria-current={current(l.href) ? "page" : undefined}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
