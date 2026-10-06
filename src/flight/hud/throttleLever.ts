import type { EngineRunState } from "../jsbsim/engineControl";

/**
 * The throttle lever, shared by the desktop HUD and the phone controller: the
 * same DOM, drawn by the same code, so the two cannot drift apart. Each host
 * gives it a box and says where its input goes; the HUD drives the aircraft
 * directly and the phone sends the same intents over its channel.
 *
 * It is a slider that also starts and stops the engine:
 *
 * - Engine off, it sits at idle and will not move. Press and hold it to start:
 *   the starter turns while it is held, the ring fills as the engine spools,
 *   and it may be dragged up meanwhile to choose the power it starts to. Let go
 *   before the engine runs and the start is abandoned; the lever drops back.
 * - Engine running, it is an ordinary throttle. Press and hold its handle at
 *   idle without moving and a ring fills around it; when it closes, the engine
 *   shuts down. Moving away first cancels the ring and drags the lever.
 *
 * Keyboard: the arrow, Page and Home/End keys move it, and holding Space or
 * Enter does what holding the pointer on the handle does.
 */

export interface ThrottleLeverEngine {
  state: EngineRunState;
  /** How far a start has got, 0 to 1. */
  startProgress: number;
  /** Why a start cannot finish now, such as an empty tank. */
  blocked?: string | null;
}

export interface ThrottleLeverView {
  /** The throttle the aircraft is given, 0 to 1. While the pilot drags, the lever shows the drag instead. */
  throttle: number;
  /** Null when the host cannot start or stop the engine: the lever is then a plain throttle. */
  engine: ThrottleLeverEngine | null;
  afterburner?: boolean | null;
  disabled?: boolean;
}

export interface ThrottleLeverOptions {
  onThrottleChange(value: number): void;
  /** Held to start: true when the press begins, false when it ends, whether or not the engine ran. */
  onStartHold?(held: boolean): void;
  /** The ring filled at idle. */
  onShutdown?(): void;
  /** How long the ring takes to fill at idle. */
  shutdownHoldMs?: number;
}

export interface ThrottleLeverHandle {
  update(view: ThrottleLeverView): void;
  /** Lets go of whatever the lever holds, as lifting the pointer would. */
  release(): void;
  destroy(): void;
}

/** Long enough not to happen by accident, short enough not to feel like waiting. */
export const SHUTDOWN_HOLD_MS = 1500;
/** A press on the handle that moves less than this is still a hold, not a drag. */
const HOLD_SLOP_PX = 6;
/** At or below this the lever is at idle. */
const IDLE = 0.005;
const KEY_STEPS: Readonly<Record<string, number>> = {
  ArrowUp: 0.01, ArrowRight: 0.01, ArrowDown: -0.01, ArrowLeft: -0.01, PageUp: 0.1, PageDown: -0.1,
};

type Gesture =
  | { kind: "start" | "drag"; pointerId: number | "key"; originY: number; originValue: number }
  | { kind: "shutdown"; pointerId: number | "key"; originY: number }
  | { kind: "done"; pointerId: number | "key" };

const clamp01 = (value: number): number => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

export function createThrottleLever(box: HTMLElement, options: ThrottleLeverOptions): ThrottleLeverHandle {
  const holdMs = options.shutdownHoldMs ?? SHUTDOWN_HOLD_MS;
  const label = document.createElement("span");
  label.textContent = "THR";
  const output = document.createElement("output");
  output.dataset.output = "throttle";
  const slider = document.createElement("div");
  slider.className = "flight-throttle";
  slider.dataset.control = "throttle";
  slider.setAttribute("role", "slider");
  slider.setAttribute("aria-label", "Throttle");
  slider.setAttribute("aria-orientation", "vertical");
  slider.setAttribute("aria-valuemin", "0");
  slider.setAttribute("aria-valuemax", "100");
  slider.tabIndex = 0;
  slider.innerHTML = `
    <span class="flight-throttle__track"><span class="flight-throttle__fill"></span></span>
    <span class="flight-throttle__handle">
      <svg class="flight-throttle__ring" viewBox="0 0 36 36" aria-hidden="true">
        <circle class="flight-throttle__ring-back" cx="18" cy="18" r="15.5" />
        <circle class="flight-throttle__ring-fill" cx="18" cy="18" r="15.5" pathLength="1" />
      </svg>
    </span>`;
  const handle = slider.querySelector<HTMLElement>(".flight-throttle__handle")!;
  box.replaceChildren(label, output, slider);
  box.style.setProperty("--throttle-hold-ms", `${holdMs}ms`);

  let view: ThrottleLeverView = { throttle: 0, engine: null };
  let gesture: Gesture | null = null;
  /** What the pilot's own input says while it drives the lever; null when the view does. */
  let local: number | null = null;
  /** A key's value until the host shows it, so quick presses add up. */
  let keyed: { value: number; at: number } | null = null;
  let shutdownTimer: ReturnType<typeof setTimeout> | undefined;
  let drawn = "";

  const controlsEngine = (): boolean => view.engine !== null && Boolean(options.onStartHold && options.onShutdown);
  const engineState = (): EngineRunState | null => (controlsEngine() ? view.engine!.state : null);
  const stuck = (): boolean => engineState() === "stopped" && gesture?.kind !== "start";
  const shown = (): number => clamp01(local ?? (stuck() ? 0 : view.throttle));

  const metrics = () => {
    const rect = slider.getBoundingClientRect();
    const size = handle.getBoundingClientRect().height || 14;
    return { bottom: rect.bottom - size / 2, travel: Math.max(1, rect.height - size), reach: size / 2 + 8 };
  };

  const render = (): void => {
    const value = shown();
    const percent = Math.round(value * 100);
    const state = engineState();
    // Once the engine runs, a hold that started it is just a drag: the ring goes.
    const hold = gesture?.kind === "shutdown" ? "shutdown"
      : gesture?.kind === "start" && state !== "running" ? "start" : null;
    // Held but not yet stepped (paused, say) counts as starting.
    const starting = state === "starting" || (state === "stopped" && hold === "start");
    const afterburner = view.afterburner === true;
    const progress = starting ? clamp01(view.engine!.startProgress) : 0;
    const blocked = state !== "running" ? view.engine?.blocked ?? null : null;
    let text: string;
    let title: string;
    if (state === "stopped" && !hold) {
      text = `Engine off. Press and hold to start.${blocked ? ` ${blocked}.` : ""}`;
      title = "Engine off. Press and hold the throttle to start the engine, and keep holding until it runs; drag up as you hold to choose the power it starts to.";
    } else if (starting) {
      text = `Starting, ${Math.round(progress * 100)}%. Keep holding.${blocked ? ` ${blocked}.` : ""}`;
      title = "Starting. Keep holding until the engine runs; letting go now abandons the start.";
    } else {
      text = `${percent}%${afterburner ? ", afterburner active" : ""}`;
      title = state === "running" && value <= IDLE
        ? "Idle. Press and hold the handle until the ring closes to shut the engine down."
        : "Throttle";
    }
    if (blocked) title = `${title} ${blocked}.`;
    const key = [value, state, hold, afterburner, progress, text, title, view.disabled === true].join("|");
    if (key === drawn) return;
    drawn = key;
    slider.style.setProperty("--throttle-value", String(value));
    box.style.setProperty("--throttle-ring", String(progress));
    output.value = state === "stopped" && !hold ? "OFF" : `${percent}${afterburner ? "🔥" : "%"}`;
    output.setAttribute("aria-label", text);
    slider.setAttribute("aria-valuenow", String(percent));
    slider.setAttribute("aria-valuetext", text);
    slider.setAttribute("aria-disabled", String(view.disabled === true));
    slider.tabIndex = view.disabled ? -1 : 0;
    box.title = title;
    box.dataset.afterburner = afterburner ? "active" : "inactive";
    if (state) box.dataset.engine = state;
    else delete box.dataset.engine;
    if (hold) box.dataset.hold = hold;
    else delete box.dataset.hold;
  };

  const send = (value: number): void => {
    const next = clamp01(value);
    if (local !== null) local = next;
    keyed = { value: next, at: performance.now() };
    options.onThrottleChange(next);
  };

  const cancelShutdown = (): void => {
    clearTimeout(shutdownTimer);
    shutdownTimer = undefined;
  };

  /** Begins what a press on the handle means now: a start, a shutdown ring, or nothing. */
  const beginHold = (pointerId: number | "key", originY: number): boolean => {
    const state = engineState();
    if (state === "stopped") {
      gesture = { kind: "start", pointerId, originY, originValue: 0 };
      local = 0;
      options.onStartHold?.(true);
      return true;
    }
    if (state === "running" && shown() <= IDLE) {
      gesture = { kind: "shutdown", pointerId, originY };
      shutdownTimer = setTimeout(() => {
        shutdownTimer = undefined;
        if (gesture?.kind !== "shutdown") return;
        gesture = { kind: "done", pointerId: gesture.pointerId };
        options.onShutdown?.();
        render();
      }, holdMs);
      return true;
    }
    return false;
  };

  const end = (): void => {
    if (!gesture) return;
    const started = gesture.kind === "start";
    cancelShutdown();
    gesture = null;
    local = null;
    if (started) options.onStartHold?.(false);
    render();
  };

  const capture = (pointerId: number): void => {
    try { slider.setPointerCapture?.(pointerId); } catch { /* A pointer that already ended cannot be captured. */ }
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (view.disabled || gesture || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    capture(event.pointerId);
    const { bottom, travel, reach } = metrics();
    const value = shown();
    const onHandle = Math.abs(event.clientY - (bottom - value * travel)) <= reach;
    // Engine off, a press anywhere on the lever starts it; running, only the handle at idle is a hold.
    const holding = (onHandle || engineState() === "stopped") && beginHold(event.pointerId, event.clientY);
    if (holding) {
      render();
      return;
    }
    if (onHandle) {
      gesture = { kind: "drag", pointerId: event.pointerId, originY: event.clientY, originValue: value };
      local = value;
    } else {
      const jump = clamp01((bottom - event.clientY) / travel);
      gesture = { kind: "drag", pointerId: event.pointerId, originY: event.clientY, originValue: jump };
      local = jump;
      send(jump);
    }
    render();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.kind === "done") return;
    event.preventDefault();
    const rise = gesture.originY - event.clientY;
    if (gesture.kind === "shutdown") {
      if (Math.abs(rise) <= HOLD_SLOP_PX) return;
      cancelShutdown();
      gesture = { kind: "drag", pointerId: gesture.pointerId, originY: gesture.originY, originValue: shown() };
      local = shown();
    }
    const next = clamp01(gesture.originValue + rise / metrics().travel);
    if (next !== local) send(next);
    render();
  };

  const onPointerEnd = (event: PointerEvent): void => {
    if (gesture?.pointerId === event.pointerId) end();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (view.disabled) return;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (!event.repeat && !gesture && beginHold("key", 0)) render();
      return;
    }
    const step = KEY_STEPS[event.key];
    const absolute = event.key === "Home" ? 0 : event.key === "End" ? 1 : null;
    if (step === undefined && absolute === null) return;
    event.preventDefault();
    // Engine off, the lever stays at idle unless it is held to start.
    if (stuck()) return;
    if (gesture?.kind === "shutdown") {
      cancelShutdown();
      gesture = null;
    }
    const base = keyed && performance.now() - keyed.at < 250 ? keyed.value : shown();
    send(absolute ?? base + step!);
    render();
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    if ((event.key === " " || event.key === "Enter") && gesture?.pointerId === "key") end();
  };

  const onVisibilityChange = (): void => { if (document.hidden) end(); };
  // A start is held for as long as the engine takes to spool: a long press must not open a menu.
  const onContextMenu = (event: Event): void => event.preventDefault();

  slider.addEventListener("pointerdown", onPointerDown);
  slider.addEventListener("pointermove", onPointerMove);
  slider.addEventListener("pointerup", onPointerEnd);
  slider.addEventListener("pointercancel", onPointerEnd);
  slider.addEventListener("lostpointercapture", onPointerEnd);
  slider.addEventListener("keydown", onKeyDown);
  slider.addEventListener("keyup", onKeyUp);
  slider.addEventListener("blur", end);
  slider.addEventListener("contextmenu", onContextMenu);
  window.addEventListener("blur", end);
  document.addEventListener("visibilitychange", onVisibilityChange);
  render();

  return {
    update(next) {
      view = next;
      if (keyed && Math.abs(clamp01(next.throttle) - keyed.value) < 0.005) keyed = null;
      // Nothing to hold once the engine is no longer where the hold began.
      if (gesture?.kind === "shutdown" && engineState() !== "running") end();
      if (view.disabled) end();
      render();
    },
    release: end,
    destroy() {
      end();
      slider.removeEventListener("pointerdown", onPointerDown);
      slider.removeEventListener("pointermove", onPointerMove);
      slider.removeEventListener("pointerup", onPointerEnd);
      slider.removeEventListener("pointercancel", onPointerEnd);
      slider.removeEventListener("lostpointercapture", onPointerEnd);
      slider.removeEventListener("keydown", onKeyDown);
      slider.removeEventListener("keyup", onKeyUp);
      slider.removeEventListener("blur", end);
      slider.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("blur", end);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      box.replaceChildren();
      box.removeAttribute("title");
      delete box.dataset.engine;
      delete box.dataset.hold;
    },
  };
}
