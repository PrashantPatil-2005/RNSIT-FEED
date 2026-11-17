"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { NavLinks } from "@/components/layout/NavLinks";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import type { NavItem } from "@/config/site";

/**
 * Small-screen menu built on a native <details> element, so it opens and closes without
 * JavaScript. The effects below only add: close after navigating, and close on Escape.
 */
export function MobileNav({ items, account }: { items: readonly NavItem[]; account: ReactNode }) {
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
      <summary>
        <span className="mobile-nav__icon" aria-hidden="true" />
        Menu
      </summary>
      <div className="mobile-nav__panel">
        <NavLinks items={items} label="Mobile" />
        <hr />
        {account}
        <hr />
        <p className="mobile-nav__label">Theme</p>
        <ThemeToggle variant="full" />
      </div>
    </details>
  );
}
