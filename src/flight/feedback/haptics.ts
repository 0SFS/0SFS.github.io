import type { WheelCue, WheelCueSink } from "./wheelCueBus";

/** One device envelope; magnitudes are 0..1. Presentation only. */
export interface HapticEnvelope {
  durationMs: number;
  /** Low-frequency motor: touchdown load. */
  strong: number;
  /** High-frequency motor: spin-up slip. */
  weak: number;
}

export const HAPTIC_INTERVAL_MS = 50;
export const HAPTIC_MAX_DURATION_MS = 60;
const TOUCHDOWN_WINDOW_S = 0.06;
/** Only spin-up slip pulses; a sustained skid is not a touchdown cue and must not buzz continuously. */
const SPIN_UP_WINDOW_S = 0.4;
const MIN_MAGNITUDE = 0.03;
/**
 * Authored scales, not measured tire data: ~0.3 kN·s is the estimated main-gear
 * strut impulse in the first 60 ms of a firm C172 touchdown; 1.2 kJ is roughly
 * one 50 ms window of the modeled gentle-touchdown spin-up slip work.
 */
const REFERENCE_TOUCHDOWN_IMPULSE_NS = 300;
const REFERENCE_SLIP_J = 1_200;

export interface HapticOutput {
  /** Latest value replaces any running effect; implementations never queue. */
  play(envelope: HapticEnvelope): void;
  cancel(): void;
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Aggregates three wheels into one envelope per 50 ms tick. There is no event
 * list: a window is summarized and cleared, so stale impacts cannot replay.
 */
export function createHapticAggregator(wheelCount = 3) {
  const sinceContact = new Array<number>(wheelCount).fill(Infinity);
  let touchdownImpulseNs = 0;
  let slipJ = 0;
  const reset = () => {
    sinceContact.fill(Infinity);
    touchdownImpulseNs = slipJ = 0;
  };
  return {
    accept(cues: readonly WheelCue[]) {
      for (let index = 0; index < cues.length && index < wheelCount; index++) {
        const cue = cues[index];
        if (!cue.onGround) { sinceContact[index] = Infinity; continue; }
        if (cue.contactEntered) sinceContact[index] = 0;
        if (sinceContact[index] < TOUCHDOWN_WINDOW_S) touchdownImpulseNs += cue.normalImpulseNs;
        if (sinceContact[index] < SPIN_UP_WINDOW_S) slipJ += cue.slipDissipatedJ;
        sinceContact[index] += cue.stepSeconds;
      }
    },
    reset,
    /** Summarizes and clears the current window. */
    take(strength: number): HapticEnvelope | null {
      const scale = Number.isFinite(strength) ? Math.min(1, Math.max(0, strength)) : 0;
      const impact = Math.min(1, touchdownImpulseNs / REFERENCE_TOUCHDOWN_IMPULSE_NS);
      const strong = touchdownImpulseNs > 0 ? round(scale * (0.25 + 0.75 * impact)) : 0;
      const weak = round(scale * Math.min(1, Math.sqrt(slipJ / REFERENCE_SLIP_J)));
      touchdownImpulseNs = slipJ = 0;
      if (strong < MIN_MAGNITUDE && weak < MIN_MAGNITUDE) return null;
      return { durationMs: strong >= MIN_MAGNITUDE ? HAPTIC_MAX_DURATION_MS : 40,
        strong: strong >= MIN_MAGNITUDE ? strong : 0, weak: weak >= MIN_MAGNITUDE ? weak : 0 };
    },
  };
}

export interface HapticsController extends WheelCueSink {
  setEnabled(enabled: boolean): void;
  setStrength(strength: number): void;
  /** Call from the render/sim tick. Emits at most once per 50 ms, only when playable. */
  tick(nowMs: number, playable: boolean): void;
  /** Zero all outputs now (pause, hidden page, reset, disconnect, disable). */
  cancel(): void;
  dispose(): void;
}

export function createHapticsController(outputs: readonly HapticOutput[]): HapticsController {
  const aggregator = createHapticAggregator();
  let enabled = false;
  let disposed = false;
  let strength = 0.6;
  let lastEmitMs = -Infinity;
  let outputActive = false;
  const cancel = () => {
    aggregator.reset();
    lastEmitMs = -Infinity;
    if (!outputActive) return;
    outputActive = false;
    for (const output of outputs) {
      try { output.cancel(); } catch { /* Outputs contain their own failures. */ }
    }
  };
  return {
    accept(cues) { if (enabled && !disposed) aggregator.accept(cues); },
    reset() { cancel(); },
    setEnabled(value) {
      if (disposed || value === enabled) return;
      enabled = value;
      if (!enabled) cancel();
    },
    setStrength(value) { strength = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0; },
    tick(nowMs, playable) {
      if (!enabled || disposed) return;
      if (!playable) { cancel(); return; }
      if (nowMs - lastEmitMs < HAPTIC_INTERVAL_MS) return;
      lastEmitMs = nowMs;
      const envelope = aggregator.take(strength);
      if (!envelope) return;
      outputActive = true;
      for (const output of outputs) {
        try { output.play(envelope); } catch { /* A failing output must not stop the others. */ }
      }
    },
    cancel,
    dispose() {
      if (disposed) return;
      cancel();
      disposed = true;
    },
  };
}

/* ---------------------------------------------------------------- Gamepad */

interface DualRumbleParams { startDelay: number; duration: number; strongMagnitude: number; weakMagnitude: number }
export interface GamepadActuatorLike {
  effects?: readonly string[];
  playEffect?(type: "dual-rumble", params: DualRumbleParams): Promise<unknown>;
  reset?(): Promise<unknown>;
}
export interface GamepadLike { index: number; connected?: boolean; vibrationActuator?: GamepadActuatorLike | null }

export type GamepadHapticStatus = "unsupported" | "no-controller" | "ready" | "failed";

export interface GamepadHapticOutput extends HapticOutput {
  status(): GamepadHapticStatus;
  describe(): string;
  dispose(): void;
}

/**
 * Uses the same pad slot as flight input (index 0). A rejected effect disables
 * haptics for this session instead of retrying; unsupported devices report
 * "Unavailable on this device".
 */
export function createGamepadHapticOutput(options: {
  getGamepads?: (() => ArrayLike<GamepadLike | null>) | null;
  events?: EventTarget | null;
  onChange?: () => void;
} = {}): GamepadHapticOutput {
  const navigatorLike = typeof navigator === "undefined" ? undefined
    : navigator as Navigator & { getGamepads?: () => ArrayLike<GamepadLike | null> };
  const getGamepads = options.getGamepads !== undefined ? options.getGamepads
    : navigatorLike?.getGamepads ? () => navigatorLike.getGamepads!() : null;
  const events = options.events !== undefined ? options.events : typeof window === "undefined" ? null : window;
  let failed = false;
  let playing: GamepadActuatorLike | null = null;

  const pad = (): GamepadLike | null => {
    if (!getGamepads) return null;
    try {
      const candidate = getGamepads()[0] ?? null;
      return candidate && candidate.connected !== false ? candidate : null;
    } catch { return null; }
  };
  const actuator = (): GamepadActuatorLike | null => {
    const candidate = pad()?.vibrationActuator ?? null;
    if (!candidate || typeof candidate.playEffect !== "function") return null;
    if (Array.isArray(candidate.effects) && !candidate.effects.includes("dual-rumble")) return null;
    return candidate;
  };
  const fail = () => {
    if (failed) return;
    failed = true;
    playing = null;
    options.onChange?.();
  };
  const status = (): GamepadHapticStatus => {
    if (failed) return "failed";
    if (!getGamepads) return "unsupported";
    const current = pad();
    if (!current) return "no-controller";
    return actuator() ? "ready" : "unsupported";
  };
  const cancel = () => {
    const current = playing;
    playing = null;
    if (!current?.reset) return;
    try { void current.reset().catch(() => { /* Nothing further to stop. */ }); } catch { /* Disconnected. */ }
  };
  const onConnection = () => { cancel(); options.onChange?.(); };
  events?.addEventListener("gamepaddisconnected", onConnection);
  events?.addEventListener("gamepadconnected", onConnection);

  return {
    play(envelope) {
      if (failed) return;
      const current = actuator();
      if (!current) return;
      try {
        playing = current;
        const result = current.playEffect!("dual-rumble", {
          startDelay: 0,
          duration: Math.min(HAPTIC_MAX_DURATION_MS, Math.max(0, Math.round(envelope.durationMs))),
          strongMagnitude: Math.min(1, Math.max(0, envelope.strong)),
          weakMagnitude: Math.min(1, Math.max(0, envelope.weak)),
        });
        // "preempted" resolves normally when a newer envelope replaces this one.
        void result?.catch?.(fail);
      } catch { fail(); }
    },
    cancel,
    status,
    describe() {
      switch (status()) {
        case "ready": return "Ready";
        case "no-controller": return "No controller connected";
        case "failed": return "Stopped after a device error (this session)";
        default: return "Unavailable on this device";
      }
    },
    dispose() {
      cancel();
      events?.removeEventListener("gamepaddisconnected", onConnection);
      events?.removeEventListener("gamepadconnected", onConnection);
    },
  };
}
