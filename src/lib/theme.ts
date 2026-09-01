/**
 * @doc App theme controller — light (white + pink) / dark / system.
 *
 * Single source of truth for which theme class sits on <html>.
 * Auth screens (`/auth`, `/login`, …) are always dark by design.
 * All color values themselves live in the token files:
 *   src/styles/tokens.css   — palette + semantic tokens for both themes
 *   src/styles/light-theme.css — light-mode remaps for legacy dark-first CSS
 */

export type ThemeMode = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "megsy_theme";

const AUTH_PATHS = [
  "/auth",
  "/login",
  "/signin",
  "/sign-in",
  "/signup",
  "/sign-up",
  "/register",
  "/reset-password",
];

export const isAuthPath = (pathname: string): boolean =>
  AUTH_PATHS.some((a) => pathname === a || pathname.startsWith(`${a}/`));

export const getStoredTheme = (): ThemeMode => {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "dark" || v === "light" || v === "system" ? v : "light";
  } catch {
    return "light";
  }
};

export const prefersDark = (): boolean => {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
};

/** Resolve the mode into the concrete theme that should be painted. */
export const resolveTheme = (mode: ThemeMode, pathname: string): "light" | "dark" => {
  if (isAuthPath(pathname)) return "dark";
  if (mode === "system") return prefersDark() ? "dark" : "light";
  return mode;
};

/** Paint the resolved theme onto <html>. Safe to call repeatedly. */
export const applyTheme = (mode: ThemeMode = getStoredTheme()): "light" | "dark" => {
  const html = document.documentElement;
  const theme = resolveTheme(mode, window.location.pathname);
  html.setAttribute("data-theme", theme);
  html.classList.toggle("dark", theme === "dark");
  html.classList.toggle("light", theme === "light");
  html.style.colorScheme = theme;
  return theme;
};

export const setTheme = (mode: ThemeMode): void => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* storage disabled — still apply for this session */
  }
  applyTheme(mode);
  window.dispatchEvent(new CustomEvent("megsy:theme", { detail: mode }));
};

/**
 * Paint a full dark theme for screens that are always dark (auth, reset).
 * Toggles the `dark`/`light` classes and `color-scheme` too — setting only
 * `data-theme` left Tailwind dark variants on the light palette, which showed
 * up as washed-out / mismatched colors on the auth screens.
 * Returns a cleanup that repaints the user's stored theme.
 */
export const forceDarkTheme = (): (() => void) => {
  const html = document.documentElement;
  html.setAttribute("data-theme", "dark");
  html.classList.add("dark");
  html.classList.remove("light");
  html.style.colorScheme = "dark";
  return () => {
    applyTheme(getStoredTheme());
  };
};
