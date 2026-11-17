import { isTheme, THEME_STORAGE_KEY, type Theme } from "./theme";

/**
 * Client-side theme store shared by every toggle on the page (header and mobile menu).
 * Storage access is wrapped: private windows and blocked site data must not break the page.
 */
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : "system";
  } catch {
    return "system";
  }
}

let current: Theme | null = null;

export function getTheme(): Theme {
  if (current === null) current = read();
  return current;
}

export function getServerTheme(): Theme {
  return "system";
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  function onStorage(event: StorageEvent) {
    if (event.key !== THEME_STORAGE_KEY) return;
    current = read();
    applyToDocument(current);
    listener();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function applyToDocument(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}

export function setTheme(theme: Theme) {
  current = theme;
  try {
    if (theme === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Not persisted; the choice still applies for this page view.
  }
  applyToDocument(theme);
  for (const listener of listeners) listener();
}
