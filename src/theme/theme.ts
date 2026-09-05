/**
 * Shared theme state. The active theme is reflected on `document.documentElement`
 * via both `data-theme="light|dark"` (for foss-earth's own CSS) and the
 * `.dark` / `.light` classes (so Tailwind-driven consumers like the
 * Moir-Park-Capital frontend automatically follow).
 *
 * Persisted in localStorage under `foss-earth.theme`. Cross-tab and intra-tab
 * subscribers are notified via the `foss-earth:theme-change` custom event and
 * the standard `storage` event.
 */
export type GlobeTheme = "light" | "dark";

const STORAGE_KEY = "foss-earth.theme";
const EVENT_NAME = "foss-earth:theme-change";
const DEFAULT_THEME: GlobeTheme = "dark";

function readStoredTheme(): GlobeTheme {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark") return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME;
}

function applyTheme(theme: GlobeTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
}

let currentTheme: GlobeTheme = readStoredTheme();
applyTheme(currentTheme);

export function getTheme(): GlobeTheme {
  return currentTheme;
}

export function setTheme(theme: GlobeTheme): void {
  if (theme !== "light" && theme !== "dark") return;
  if (theme === currentTheme) return;
  currentTheme = theme;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme);
  try {
    window.dispatchEvent(new CustomEvent<GlobeTheme>(EVENT_NAME, { detail: theme }));
  } catch {
    /* ignore */
  }
}

export function toggleTheme(): GlobeTheme {
  const next: GlobeTheme = currentTheme === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

export function onThemeChange(cb: (theme: GlobeTheme) => void): () => void {
  const onCustom = (e: Event): void => {
    const detail = (e as CustomEvent<GlobeTheme>).detail;
    if (detail === "light" || detail === "dark") cb(detail);
  };
  const onStorage = (e: StorageEvent): void => {
    if (e.key !== STORAGE_KEY) return;
    const next = e.newValue === "light" || e.newValue === "dark" ? e.newValue : DEFAULT_THEME;
    if (next === currentTheme) return;
    currentTheme = next;
    applyTheme(next);
    cb(next);
  };
  window.addEventListener(EVENT_NAME, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT_NAME, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}
