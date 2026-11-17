"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { NavLinks } from "@/components/layout/NavLinks";
import type { NavItem } from "@/config/site";

/**
 * Small-screen menu built on a native <details> element, so it opens and closes without
 * JavaScript. The effects below only add: close after navigating, and close on Escape.
 */
export function MobileNav({ items }: { items: readonly NavItem[] }) {
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
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <details className="mobile-nav" ref={ref}>
      <summary>Menu</summary>
      <div className="mobile-nav__panel">
        <NavLinks items={items} label="Mobile" />
        <hr />
        <Link className="nav-link" href="/sign-in">
          Sign in (not available yet)
        </Link>
      </div>
    </details>
  );
}
