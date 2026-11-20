"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";

type Props = { base: "/sign-in" | "/onboarding"; className?: string; children: ReactNode };

/** Pages that must never be a post-sign-in destination (they are part of the flow itself). */
const NO_RETURN = ["/sign-in", "/onboarding", "/auth"];

function WithReturn({ base, className, children }: Props) {
  const path = usePathname();
  const query = useSearchParams().toString();
  const stay = path !== "/" && !NO_RETURN.some((p) => path === p || path.startsWith(`${p}/`));
  // The server validates `next` again (safeNextPath), so this is only a convenience.
  const href = stay
    ? `${base}?next=${encodeURIComponent(query ? `${path}?${query}` : path)}`
    : base;
  return (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}

/**
 * Link to sign-in or onboarding that brings the person back to the page they are on, including
 * its filters. Before hydration (or without JavaScript) it is the plain link.
 */
export function ReturnLink(props: Props) {
  return (
    <Suspense
      fallback={
        <Link className={props.className} href={props.base}>
          {props.children}
        </Link>
      }
    >
      <WithReturn {...props} />
    </Suspense>
  );
}
