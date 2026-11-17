/**
 * Theme preference: "system" follows the OS, "light"/"dark" force a theme through
 * data-theme on <html>. Stored only in this browser's localStorage (no account data, no cookie).
 */
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = "feed-theme";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/**
 * Runs inline in <head> before first paint so a forced theme never flashes the OS theme.
 * Kept tiny and dependency-free. If a Content-Security-Policy is added later, this script
 * needs a nonce or a hash.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}})();`;
