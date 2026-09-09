import "./loadingScreen.css";

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

/** Lives beside #root so mounting the renderer cannot erase the loading screen. */
export function createFlightLoadingScreen(): FlightLoadingScreen {
  const overlay = document.getElementById("app-loading") ?? document.createElement("div");
  overlay.id = "app-loading";
  overlay.className = "app-loading";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "app-loading-title");
  overlay.setAttribute("aria-describedby", "app-loading-detail");
  overlay.tabIndex = -1;
  overlay.innerHTML = `
    <div class="app-loading__card">
      <p class="app-loading__brand">OSFS</p>
      <h1 id="app-loading-title">Preparing your flight</h1>
      <p id="app-loading-detail" class="app-loading__detail" role="status">Loading the world and flight systems. You will enter the aircraft when the terrain is ready.</p>
      <ol class="app-loading__phases">
        ${Object.entries(PHASE_LABELS).map(([id, label]) => `
          <li data-phase="${id}">
            <div class="app-loading__phase-heading"><span>${label}</span><span data-state>Waiting</span></div>
            <div class="app-loading__track" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-state="waiting"></div>
            <p class="app-loading__phase-detail" data-detail hidden></p>
          </li>`).join("")}
      </ol>
      <div class="app-loading__error" id="app-loading-error" hidden>
        <p data-error-message role="alert"></p>
        <button type="button" data-retry>Reload and try again</button>
      </div>
      <p class="app-loading__note">Flight stays paused while your surroundings load.</p>
    </div>`;
  if (!overlay.isConnected) document.body.append(overlay);

  const get = <T extends HTMLElement>(selector: string) => overlay.querySelector<T>(selector)!;
  const title = get("#app-loading-title");
  const detail = get("#app-loading-detail");
  const errorPanel = get("#app-loading-error");
  const retry = get<HTMLButtonElement>("[data-retry]");
  const root = document.getElementById("root");
  let previousFocus: HTMLElement | null = null;
  let previousInert = false;
  let previousBusy: string | null = null;
  let visible = false;
  let destroyed = false;

  const setPhase = (phase: FlightLoadingPhase, update: FlightLoadingPhaseUpdate) => {
    if (destroyed) return;
    const row = get(`[data-phase="${phase}"]`);
    const bar = row.querySelector<HTMLElement>("[role=progressbar]")!;
    const state = row.querySelector<HTMLElement>("[data-state]")!;
    const phaseDetail = row.querySelector<HTMLElement>("[data-detail]")!;
    const progress = update.state === "ready" ? 1 : update.state === "waiting" ? 0
      : typeof update.progress === "number" && Number.isFinite(update.progress)
        ? Math.max(0, Math.min(1, update.progress)) : null;
    bar.dataset.state = update.state;
    bar.style.setProperty("--loading-progress", `${(progress ?? 0) * 100}%`);
    if (progress === null) bar.removeAttribute("aria-valuenow");
    else bar.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
    const stateLabel = update.state === "ready" ? "Ready" : update.state === "waiting" ? "Waiting"
      : progress === null ? "Loading" : `${Math.round(progress * 100)}%`;
    state.textContent = stateLabel;
    bar.setAttribute("aria-valuetext", update.detail ? `${stateLabel}. ${update.detail}` : stateLabel);
    phaseDetail.textContent = update.detail ?? "";
    phaseDetail.hidden = !update.detail;
  };

  const hide = () => {
    overlay.hidden = true;
    if (!visible) return;
    visible = false;
    if (root) {
      root.toggleAttribute("inert", previousInert);
      if (previousBusy === null) root.removeAttribute("aria-busy");
      else root.setAttribute("aria-busy", previousBusy);
    }
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  };

  const show: FlightLoadingScreen["show"] = (options = {}) => {
    if (destroyed) return;
    title.textContent = options.title ?? "Preparing your flight";
    detail.textContent = options.detail ?? "Loading the world and flight systems. You will enter the aircraft when the terrain is ready.";
    errorPanel.hidden = true;
    overlay.removeAttribute("data-error");
    retry.onclick = null;
    retry.disabled = false;
    if (options.reset) {
      for (const phase of Object.keys(PHASE_LABELS) as FlightLoadingPhase[]) setPhase(phase, { state: "waiting" });
    }
    if (!visible) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      previousInert = root?.hasAttribute("inert") ?? false;
      previousBusy = root?.getAttribute("aria-busy") ?? null;
      root?.setAttribute("inert", "");
      root?.setAttribute("aria-busy", "true");
      visible = true;
    }
    overlay.hidden = false;
    overlay.focus({ preventScroll: true });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    if (!errorPanel.hidden) retry.focus();
  };
  overlay.addEventListener("keydown", onKeyDown);

  show();
  return {
    show,
    setPhase,
    hide,
    fail(message, onRetry) {
      if (destroyed) return;
      if (!visible) show();
      overlay.dataset.error = "true";
      title.textContent = "Your flight is still paused";
      detail.textContent = "We could not finish preparing your flight.";
      get("[data-error-message]").textContent = message;
      errorPanel.hidden = false;
      retry.disabled = false;
      retry.textContent = onRetry ? "Try again" : "Reload and try again";
      retry.onclick = () => {
        retry.disabled = true;
        if (onRetry) onRetry();
        else window.location.reload();
      };
      retry.focus({ preventScroll: true });
    },
    destroy() {
      hide();
      destroyed = true;
      retry.onclick = null;
      overlay.removeEventListener("keydown", onKeyDown);
      overlay.remove();
    },
  };
}
