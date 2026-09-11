import { createGameLog, type GameLog, type GameLogEntry, type GameLogLine } from "../log/createGameLog";

export type FlightLoadingPhase = "app" | "world" | "flight" | "assets" | "terrain";

export interface FlightLoadingPhaseUpdate {
  state: "waiting" | "loading" | "ready";
  detail?: string;
  /** Measured completion from 0 to 1. Omit when the total is unknown. */
  progress?: number | null;
}

export interface FlightLoadingScreen {
  show(options?: { title?: string; detail?: string; reset?: boolean }): void;
  setPhase(phase: FlightLoadingPhase, update: FlightLoadingPhaseUpdate): void;
  hide(): void;
  fail(message: string, onRetry?: () => void): void;
  destroy(): void;
}

const PHASE_LABELS: Record<FlightLoadingPhase, string> = {
  app: "Application",
  world: "World renderer",
  flight: "Flight simulation",
  assets: "Aircraft",
  terrain: "Safe terrain",
};

const DEFAULT_TITLE = "Preparing your flight";

interface PhaseLine {
  line: GameLogLine;
  startedAt: number;
  ready: boolean;
}

/**
 * Loading progress as game-log lines over a visible world. Only the renderer
 * root is made inert, so flight input still waits for safe terrain.
 */
export function createFlightLoadingScreen(sharedLog?: GameLog): FlightLoadingScreen {
  const log = sharedLog ?? createGameLog();
  const root = document.getElementById("root");
  const phases = new Map<FlightLoadingPhase, PhaseLine>();
  let failure: { line: GameLogLine; entry: GameLogEntry } | null = null;
  let previousInert = false;
  let previousBusy: string | null = null;
  let visible = false;
  let destroyed = false;

  const holdRoot = (): void => {
    if (visible) return;
    previousInert = root?.hasAttribute("inert") ?? false;
    previousBusy = root?.getAttribute("aria-busy") ?? null;
    root?.setAttribute("inert", "");
    root?.setAttribute("aria-busy", "true");
    visible = true;
    log.setBusy(true);
  };

  const setPhase = (phase: FlightLoadingPhase, update: FlightLoadingPhaseUpdate): void => {
    if (destroyed || update.state === "waiting") return;
    const label = PHASE_LABELS[phase];
    const current = phases.get(phase);
    if (update.state === "ready") {
      // A phase never seen loading (a teleport keeps the aircraft and physics)
      // has nothing worth announcing unless it carries a note.
      if (current?.ready || (!current && !update.detail)) return;
      const seconds = current ? ` · ${((performance.now() - current.startedAt) / 1000).toFixed(1)} s` : "";
      const entry: GameLogEntry = { text: `${update.detail ? `${label}: ${update.detail}` : `${label} ready`}${seconds}`, tone: "success" };
      if (current) {
        current.line.update(entry);
        current.ready = true;
      } else {
        phases.set(phase, { line: log.print(entry), startedAt: performance.now(), ready: true });
      }
      return;
    }
    const entry: GameLogEntry = {
      text: update.detail ? `${label}: ${update.detail}` : label,
      tone: "progress",
      progress: typeof update.progress === "number" ? update.progress : null,
    };
    if (current && !current.ready) current.line.update(entry);
    else phases.set(phase, { line: log.print(entry), startedAt: performance.now(), ready: false });
  };

  const hide = (): void => {
    if (!visible) return;
    visible = false;
    if (root) {
      root.toggleAttribute("inert", previousInert);
      if (previousBusy === null) root.removeAttribute("aria-busy");
      else root.setAttribute("aria-busy", previousBusy);
    }
    log.setBusy(false);
  };

  const show: FlightLoadingScreen["show"] = (options = {}) => {
    if (destroyed) return;
    // Keep a failure in the history, without its now-stale button.
    failure?.line.update({ ...failure.entry, actions: [] });
    failure = null;
    if (options.reset) phases.clear();
    if (!visible || options.title !== undefined) {
      const title = options.title ?? DEFAULT_TITLE;
      log.print({ text: options.detail ? `${title}: ${options.detail}` : title });
    }
    holdRoot();
  };

  show();
  return {
    show,
    setPhase,
    hide,
    fail(message, onRetry) {
      if (destroyed) return;
      holdRoot();
      const label = onRetry ? "Try again" : "Reload and try again";
      const retry = (): void => {
        if (failure) failure.line.update({ ...failure.entry, actions: [{ label, onClick: retry, disabled: true }] });
        if (onRetry) onRetry();
        else window.location.reload();
      };
      const entry: GameLogEntry = { text: `Flight paused. ${message}`, tone: "error", actions: [{ label, onClick: retry }] };
      failure = { line: log.print(entry), entry };
      failure.line.focusAction();
    },
    destroy() {
      hide();
      destroyed = true;
      if (!sharedLog) log.destroy();
    },
  };
}
