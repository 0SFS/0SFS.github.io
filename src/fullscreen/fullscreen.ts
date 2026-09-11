import type { GameLog } from "../log/createGameLog";

const EVERY_VISIT_PREFERENCE_KEY = "osfs.fullscreen-every-visit";

type FullscreenDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?(): Promise<void> | void;
};
type FullscreenRoot = HTMLElement & { webkitRequestFullscreen?(): Promise<void> | void };

/** iPhone Safari has no page fullscreen; older iPad Safari only the prefixed API. */
export function canRequestFullscreen(): boolean {
  const doc = document as FullscreenDocument;
  return Boolean(doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled);
}

export function isFullscreen(): boolean {
  const doc = document as FullscreenDocument;
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

/** Already running without browser bars, e.g. launched from the Home Screen. */
export function isStandaloneDisplay(): boolean {
  if ((navigator as Navigator & { standalone?: boolean }).standalone) return true;
  return typeof window.matchMedia === "function"
    && window.matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches;
}

/** Browsers grant this only during a tap, click or key press. */
export async function enterFullscreen(): Promise<void> {
  const root = document.documentElement as FullscreenRoot;
  if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: "hide" });
  else await root.webkitRequestFullscreen?.();
}

export async function exitFullscreen(): Promise<void> {
  const doc = document as FullscreenDocument;
  if (doc.exitFullscreen) await doc.exitFullscreen();
  else await doc.webkitExitFullscreen?.();
}

export function toggleFullscreen(): Promise<void> {
  return isFullscreen() ? exitFullscreen() : enterFullscreen();
}

export function onFullscreenChange(listener: () => void): () => void {
  document.addEventListener("fullscreenchange", listener);
  document.addEventListener("webkitfullscreenchange", listener);
  return () => {
    document.removeEventListener("fullscreenchange", listener);
    document.removeEventListener("webkitfullscreenchange", listener);
  };
}

export function readFullscreenEveryVisit(): boolean {
  try { return window.localStorage.getItem(EVERY_VISIT_PREFERENCE_KEY) === "1"; } catch { return false; }
}

function writeFullscreenEveryVisit(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.setItem(EVERY_VISIT_PREFERENCE_KEY, "1");
    else window.localStorage.removeItem(EVERY_VISIT_PREFERENCE_KEY);
  } catch { /* Private browsing: the choice lasts for this visit only. */ }
}

/**
 * Offers to hide the browser bars in the log. Nothing happens without the
 * pilot's choice: "Every visit" enters fullscreen on their first tap or key
 * press, because browsers refuse fullscreen that is not started by one.
 */
export function offerFullscreen(log: GameLog): () => void {
  if (isStandaloneDisplay()) return () => {};
  if (!canRequestFullscreen()) {
    if (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches) {
      log.print({ text: "To hide the browser bars, add OSFS to your Home Screen (Share → Add to Home Screen)." });
    }
    return () => {};
  }

  let everyVisit = readFullscreenEveryVisit();
  let armed = false;
  const line = log.print({ text: "" });
  const enter = (): void => {
    void enterFullscreen().catch(() => {
      log.print({ text: "The browser declined fullscreen. Try ⛶ in the toolbar.", tone: "warning" });
    });
  };
  const onGesture = (event: Event): void => {
    if (event instanceof KeyboardEvent && event.key === "Escape") return;
    // The log's own buttons make their own choice.
    if (event.target instanceof Node && log.element.contains(event.target)) return;
    disarm();
    if (!isFullscreen()) enter();
    render();
  };
  const arm = (): void => {
    armed = true;
    window.addEventListener("pointerup", onGesture, true);
    window.addEventListener("keydown", onGesture, true);
  };
  const disarm = (): void => {
    armed = false;
    window.removeEventListener("pointerup", onGesture, true);
    window.removeEventListener("keydown", onGesture, true);
  };
  function render(): void {
    const everyVisitToggle = {
      label: "Every visit",
      pressed: everyVisit,
      onClick: () => {
        everyVisit = !everyVisit;
        writeFullscreenEveryVisit(everyVisit);
        if (!everyVisit) disarm();
        render();
      },
    };
    if (isFullscreen()) {
      line.update({ text: "Fullscreen. Use ⛶ in the toolbar or Esc to leave.", tone: "success", actions: [everyVisitToggle] });
    } else if (armed) {
      line.update({ text: "Fullscreen starts with your first tap or key press.", actions: [everyVisitToggle] });
    } else {
      line.update({ text: "Hide the browser bars for a bigger view.", actions: [{ label: "Fullscreen", onClick: enter }, everyVisitToggle] });
    }
  }

  if (everyVisit) arm();
  const detach = onFullscreenChange(render);
  render();
  return () => { disarm(); detach(); };
}
