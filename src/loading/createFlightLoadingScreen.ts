import { createGameLog, type GameLog, type GameLogEntry, type GameLogLine } from "../log/createGameLog";
import type { TerrainPreparationProgress } from "foss-earth/runtime";

export type FlightLoadingPhase = "app" | "world" | "flight" | "assets" | "terrain";

export interface FlightLoadingPhaseUpdate {
  state: "waiting" | "loading" | "ready";
  detail?: string;
  /** Measured completion from 0 to 1. Omit when the total is unknown. */
  progress?: number | null;
  terrain?: TerrainPreparationProgress;
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
  terrain: "Terrain",
};

const DEFAULT_TITLE = "Preparing your flight";

interface PhaseLine {
  line: GameLogLine;
  startedAt: number;
  ready: boolean;
}

declare global {
  interface Window {
    /** Always available while this loading screen exists; no debug URL flag. */
    osfsLoadingDiagnostics?: () => unknown;
  }
}

function describeTerrain(progress: TerrainPreparationProgress | undefined): string {
  const diagnostic = progress?.diagnostics;
  if (!progress || !diagnostic) return "";
  const seconds = Math.floor(diagnostic.elapsedMs / 1000);
  const lines = [
    `${diagnostic.provider} | ${seconds}s elapsed`,
    diagnostic.activeElevationRequests === null
      ? `Map tiles visible: ${diagnostic.visibleTiles}`
      : `Elevation loads: ${diagnostic.activeElevationRequests} active, ${diagnostic.queuedElevationRequests ?? 0} queued`,
    `Ground checks ready: ${progress.readySamples} of ${progress.totalSamples}`,
  ];
  if (diagnostic.pendingTiles !== null) {
    lines.push(`Map tiles: ${diagnostic.visibleTiles} visible, ${diagnostic.pendingTiles} still loading`);
  }
  if (diagnostic.status === "stalled") {
    const remaining = Math.max(0, Math.ceil((diagnostic.timeoutMs - diagnostic.elapsedMs) / 1000));
    lines.push(`No usable terrain improvement for ${Math.floor(diagnostic.stalledForMs / 1000)}s. Startup timeout in ${remaining}s.`);
  }
  if (diagnostic.lastError) lines.push(`Latest error: ${diagnostic.lastError}`);
  return "\n" + lines.join("\n");
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
  let sessionStartedAt = performance.now();
  let stoppedAt: number | null = null;
  let failureMessage: string | null = null;
  const observations = new Map<FlightLoadingPhase, { update: FlightLoadingPhaseUpdate; recordedAt: number }>();
  const history: Array<{ elapsedMs: number; phase: FlightLoadingPhase; update: FlightLoadingPhaseUpdate }> = [];
  const getReport = () => ({
    version: 1,
    capturedAt: new Date().toISOString(),
    outcome: failureMessage ? "failed" : visible ? "loading" : "ready",
    elapsedMs: (stoppedAt ?? performance.now()) - sessionStartedAt,
    failure: failureMessage,
    phases: Object.fromEntries(Object.keys(PHASE_LABELS).map(key => {
      const phase = key as FlightLoadingPhase;
      return [phase, observations.get(phase)?.update ?? { state: "waiting" }];
    })),
    history: history.slice(),
  });
  const previousReport = window.osfsLoadingDiagnostics;
  window.osfsLoadingDiagnostics = getReport;
  const copyReport = async (): Promise<void> => {
    const text = JSON.stringify(getReport(), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      log.print({ text: "Loading report copied.", tone: "success" });
    } catch {
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "osfs-loading-report.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      log.print({ text: "Clipboard unavailable. Loading report downloaded." });
    }
  };
  const reportAction = { label: "Copy loading report", onClick: () => { void copyReport(); } };

  const holdRoot = (): void => {
    if (visible) return;
    previousInert = root?.hasAttribute("inert") ?? false;
    previousBusy = root?.getAttribute("aria-busy") ?? null;
    root?.setAttribute("inert", "");
    root?.setAttribute("aria-busy", "true");
    visible = true;
    log.element.setAttribute("data-loading-details", "");
    log.setBusy(true);
  };

  const setPhase = (phase: FlightLoadingPhase, update: FlightLoadingPhaseUpdate): void => {
    if (destroyed || update.state === "waiting") return;
    const now = performance.now();
    const previous = observations.get(phase);
    const record = !previous || previous.update.state !== update.state
      || previous.update.detail !== update.detail || now - previous.recordedAt >= 5000;
    observations.set(phase, { update: { ...update }, recordedAt: record ? now : previous.recordedAt });
    if (record) {
      history.push({ elapsedMs: now - sessionStartedAt, phase, update: { ...update } });
      if (history.length > 120) history.shift();
    }
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
      text: (update.detail ? `${label}: ${update.detail}` : label) + describeTerrain(update.terrain),
      tone: update.terrain?.diagnostics?.status === "failed" ? "error" : "progress",
      // Terrain coverage is not a download total. Show actual work and the
      // blocking condition instead of presenting a heuristic as a percentage.
      progress: phase === "terrain" ? undefined : typeof update.progress === "number" ? update.progress : null,
    };
    if (current && !current.ready) current.line.update(entry);
    else phases.set(phase, { line: log.print(entry), startedAt: performance.now(), ready: false });
  };

  const hide = (): void => {
    if (!visible) return;
    visible = false;
    stoppedAt ??= performance.now();
    log.element.removeAttribute("data-loading-details");
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
    failureMessage = null;
    stoppedAt = null;
    if (options.reset) {
      phases.clear();
      observations.clear();
      history.length = 0;
      sessionStartedAt = performance.now();
    }
    if (!visible || options.title !== undefined) {
      const title = options.title ?? DEFAULT_TITLE;
      log.print({ text: options.detail ? `${title}: ${options.detail}` : title, actions: [reportAction] });
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
      failureMessage = message;
      stoppedAt = performance.now();
      holdRoot();
      // Preserve the last measured state, but do not leave a stale loading
      // indicator suggesting that a failed or cancelled request is running.
      for (const [phase, current] of phases) {
        if (current.ready) continue;
        const update = observations.get(phase)?.update;
        current.line.update({
          text: `${PHASE_LABELS[phase]}: stopped.` + (update?.detail ? `\n${update.detail}` : "") + describeTerrain(update?.terrain),
          tone: "error",
        });
      }
      const label = onRetry ? "Try again" : "Reload and try again";
      const retry = (): void => {
        if (failure) failure.line.update({ ...failure.entry, actions: [{ label, onClick: retry, disabled: true }] });
        if (onRetry) onRetry();
        else window.location.reload();
      };
      const entry: GameLogEntry = { text: `Flight paused. ${message}`, tone: "error", actions: [{ label, onClick: retry }, reportAction] };
      failure = { line: log.print(entry), entry };
      failure.line.focusAction();
    },
    destroy() {
      hide();
      destroyed = true;
      if (window.osfsLoadingDiagnostics === getReport) {
        if (previousReport) window.osfsLoadingDiagnostics = previousReport;
        else delete window.osfsLoadingDiagnostics;
      }
      if (!sharedLog) log.destroy();
    },
  };
}
