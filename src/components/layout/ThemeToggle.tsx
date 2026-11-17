"use client";

import { useRef, useSyncExternalStore, type KeyboardEvent, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/cn";
import { getServerTheme, getTheme, setTheme, subscribeTheme } from "@/lib/theme/store";
import { THEMES, type Theme } from "@/lib/theme/theme";

const LABELS: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };

function Icon({ theme }: { theme: Theme }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };
  if (theme === "light") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    );
  }
  if (theme === "dark") {
    return (
      <svg {...common}>
        <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

/**
 * Apply the theme, revealing it as a circle growing from the click point where the browser
 * supports View Transitions. Reduced-motion users and other browsers get an instant switch.
 */
function applyWithReveal(next: Theme, origin: { x: number; y: number } | null) {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { ready: Promise<void> };
  };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduce || !origin) {
    setTheme(next);
    return;
  }
  const root = document.documentElement;
  root.classList.add("theme-transition");
  const transition = doc.startViewTransition(() => flushSync(() => setTheme(next)));
  const radius = Math.hypot(
    Math.max(origin.x, window.innerWidth - origin.x),
    Math.max(origin.y, window.innerHeight - origin.y),
  );
  transition.ready
    .then(
      () =>
        root.animate(
          {
            clipPath: [
              `circle(0px at ${origin.x}px ${origin.y}px)`,
              `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
            ],
          },
          {
            duration: 420,
            easing: "cubic-bezier(0.2, 0, 0, 1)",
            pseudoElement: "::view-transition-new(root)",
          },
        ).finished,
    )
    .catch(() => undefined)
    .finally(() => root.classList.remove("theme-transition"));
}

/**
 * Three-way theme control (System / Light / Dark) as an ARIA radio group: one tab stop,
 * arrow keys move and select. `compact` shows icons only (header); `full` adds text (menu).
 */
export function ThemeToggle({ variant = "compact" }: { variant?: "compact" | "full" }) {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function choose(next: Theme, event?: MouseEvent<HTMLButtonElement>) {
    if (next === theme) return;
    const origin =
      event && event.clientX + event.clientY > 0
        ? { x: event.clientX, y: event.clientY }
        : (() => {
            const r = refs.current[THEMES.indexOf(next)]?.getBoundingClientRect();
            return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
          })();
    applyWithReveal(next, origin);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const index = (THEMES.indexOf(theme) + step + THEMES.length) % THEMES.length;
    const next = THEMES[index] ?? "system";
    refs.current[index]?.focus();
    choose(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn("theme-toggle", variant === "full" && "theme-toggle--full")}
      onKeyDown={onKeyDown}
    >
      {THEMES.map((t, i) => {
        const checked = t === theme;
        return (
          <button
            key={t}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className="theme-toggle__option"
            title={variant === "compact" ? `${LABELS[t]} theme` : undefined}
            onClick={(e) => choose(t, e)}
          >
            <Icon theme={t} />
            {variant === "full" ? (
              <span>{LABELS[t]}</span>
            ) : (
              <span className="visually-hidden">{LABELS[t]} theme</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
