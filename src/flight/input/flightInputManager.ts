import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { applyFlightControls } from "./applyFlightControls";
export interface ControlSurfaceState {
  elevator: number;
  aileron: number;
  rudder: number;
  throttle: number;
  pitchTrim: number;
  flaps: number;
  brake: number;
}

const KEY_BINDINGS: Record<string, Partial<ControlSurfaceState>> = {
  KeyW: { elevator: 1 },
  KeyS: { elevator: -1 },
  KeyA: { aileron: -1 },
  KeyD: { aileron: 1 },
  KeyQ: { rudder: -1 },
  KeyE: { rudder: 1 },
  ShiftLeft: { throttle: 1 },
  ShiftRight: { throttle: 1 },
  ControlLeft: { throttle: -1 },
  ControlRight: { throttle: -1 },
  KeyF: { flaps: 1 },
  KeyG: { flaps: -1 },
  KeyB: { brake: 1 },
};

const SMOOTHING_RATE = 8;
const INITIAL_THROTTLE = 0.65;
const THROTTLE_CHANGE_RATE = 0.5;
const TAKEOVER_DEADBAND = 0.12;

interface GamepadSnapshot {
  id: string;
  index: number;
  axes: number[];
  buttons: { value: number; pressed: boolean }[];
}

function readGamepad(): GamepadSnapshot | null {
  const pad = navigator.getGamepads?.()[0];
  if (!pad) return null;
  return {
    id: pad.id,
    index: pad.index,
    axes: Array.from(pad.axes),
    buttons: Array.from(pad.buttons, ({ value, pressed }) => ({ value, pressed })),
  };
}

function sameGamepad(a: GamepadSnapshot | null, b: GamepadSnapshot | null): boolean {
  return a !== null && b !== null && a.id === b.id && a.index === b.index;
}

export interface FlightInputManager {
  attach(target: Window): () => void;
  poll(dt: number): ControlSurfaceState;
  apply(sdk: JSBSimSdk, controls: ControlSurfaceState): void;
  /** Adopt persistent settings, clear held keys, and center transient controls. */
  adoptControls(controls: ControlSurfaceState): void;
  setRemoteOwned(value: boolean): void;
  hasActiveFlightInput(): boolean;
  getControls(): ControlSurfaceState;
  resetControls(throttle: number): void;
  setThrottle(value: number): void;
  setPitchTrim(value: number): void;
  setPaused(paused: boolean): void;
  isPaused(): boolean;
}

export function createFlightInputManager(options: {
  onPausedChange?: (paused: boolean) => void;
  /** Runs before local input is applied, allowing synchronous authority revocation. */
  onLocalInput?: () => void;
} = {}): FlightInputManager {
  const keysDown = new Set<string>();
  let smoothed: ControlSurfaceState = {
    elevator: 0,
    aileron: 0,
    rudder: 0,
    throttle: INITIAL_THROTTLE,
    pitchTrim: 0,
    flaps: 0,
    brake: 0,
  };
  let throttleTarget = INITIAL_THROTTLE;
  let paused = false;
  let remoteOwned = false;
  let protectGamepad = false;
  let gamepadBaseline: GamepadSnapshot | null = null;
  let previousGamepad: GamepadSnapshot | null = null;
  const enabledAxes = new Set<number>();
  const enabledButtons = new Set<number>();

  const captureGamepadBaseline = (pad = readGamepad()): void => {
    gamepadBaseline = pad;
    previousGamepad = pad;
    enabledAxes.clear();
    enabledButtons.clear();
  };

  const gamepadActivity = (pad: GamepadSnapshot): { axes: number[]; buttons: number[] } => {
    if (!sameGamepad(pad, gamepadBaseline)) return { axes: [], buttons: [] };
    return {
      axes: pad.axes.flatMap((value, index) => (
        Math.abs(value - (gamepadBaseline?.axes[index] ?? value)) > TAKEOVER_DEADBAND ? [index] : []
      )),
      buttons: pad.buttons.flatMap((button, index) => (
        (button.pressed && !previousGamepad?.buttons[index]?.pressed)
        || ((index === 6 || index === 7)
          && button.value - (gamepadBaseline?.buttons[index]?.value ?? button.value) > TAKEOVER_DEADBAND)
          ? [index] : []
      )),
    };
  };

  const sampleGamepadActivity = (pad: GamepadSnapshot | null): void => {
    if (!pad || !sameGamepad(pad, gamepadBaseline)) {
      // A newly connected pad starts from its current resting position. Moving
      // it or pressing a button then provides deliberate takeover input.
      captureGamepadBaseline(pad);
      return;
    }
    const activity = gamepadActivity(pad);
    previousGamepad = pad;
    if (activity.axes.length === 0 && activity.buttons.length === 0) return;
    gamepadBaseline = {
      ...pad,
      axes: pad.axes.map((value, index) => activity.axes.includes(index)
        ? value : gamepadBaseline?.axes[index] ?? value),
      buttons: pad.buttons.map((button, index) => activity.buttons.includes(index)
        ? button : gamepadBaseline?.buttons[index] ?? button),
    };
    options.onLocalInput?.();
    // The callback may adopt phone settings and clear these sets. Enable the
    // input that initiated takeover afterwards, so its first movement survives.
    if (!remoteOwned) {
      activity.axes.forEach((index) => enabledAxes.add(index));
      activity.buttons.forEach((index) => enabledButtons.add(index));
    }
  };
  const setPaused = (value: boolean): void => {
    if (paused === value) return;
    paused = value;
    options.onPausedChange?.(paused);
  };

  const targetFromKeyboard = (dt: number): ControlSurfaceState => {
    const target: ControlSurfaceState = {
      elevator: 0,
      aileron: 0,
      rudder: 0,
      throttle: throttleTarget,
      pitchTrim: smoothed.pitchTrim,
      flaps: smoothed.flaps,
      brake: 0,
    };

    for (const key of keysDown) {
      const binding = KEY_BINDINGS[key];
      if (!binding) continue;
      if (binding.elevator !== undefined) target.elevator = binding.elevator;
      if (binding.aileron !== undefined) target.aileron = binding.aileron;
      if (binding.rudder !== undefined) target.rudder = binding.rudder;
      if (binding.throttle !== undefined) {
        throttleTarget = Math.min(1, Math.max(0, throttleTarget + binding.throttle * THROTTLE_CHANGE_RATE * dt));
        target.throttle = throttleTarget;
      }
      if (binding.flaps !== undefined) {
        target.flaps = Math.min(1, Math.max(0, target.flaps + binding.flaps * dt * 0.5));
      }
      if (binding.brake !== undefined) target.brake = binding.brake;
    }

    return target;
  };

  const pollGamepad = (target: ControlSurfaceState, pad: GamepadSnapshot | null): void => {
    if (!pad) return;

    const deadzone = (value: number): number => (
      Math.abs(value) < 0.08 ? 0 : value
    );

    if (!protectGamepad || enabledAxes.has(1)) target.elevator = deadzone(-(pad.axes[1] ?? 0));
    if (!protectGamepad || enabledAxes.has(0)) target.aileron = deadzone(pad.axes[0] ?? 0);
    if (!protectGamepad || enabledAxes.has(2) || enabledButtons.has(6) || enabledButtons.has(7)) {
      target.rudder = deadzone(pad.axes[2] ?? (pad.buttons[7]?.value ?? 0) - (pad.buttons[6]?.value ?? 0));
    }

    const throttleAxis = pad.axes[3];
    if (throttleAxis !== undefined && (!protectGamepad || enabledAxes.has(3))) {
      target.throttle = Math.min(1, Math.max(0, (1 - throttleAxis) * 0.5));
      if (protectGamepad) throttleTarget = target.throttle;
    }
    if (pad.buttons[0]?.pressed && (!protectGamepad || enabledButtons.has(0))) target.brake = 1;
  };

  const smoothToward = (current: number, goal: number, dt: number): number => (
    current + (goal - current) * Math.min(1, SMOOTHING_RATE * dt)
  );

  return {
    attach(target: Window): () => void {
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) {
          keysDown.clear();
          return;
        }
        if (event.code === "KeyP") {
          if (event.repeat) return;
          setPaused(!paused);
          event.preventDefault();
          return;
        }
        if (event.code in KEY_BINDINGS) {
          // Clearing held keys during adoption must also discard repeats from
          // that old keypress; a fresh press still takes over immediately.
          if (event.repeat && !keysDown.has(event.code)) return;
          if (!event.repeat) options.onLocalInput?.();
          event.preventDefault();
          if (remoteOwned) return;
          keysDown.add(event.code);
        }
      };
      const onKeyUp = (event: KeyboardEvent): void => {
        keysDown.delete(event.code);
      };
      const onBlur = (): void => {
        keysDown.clear();
      };

      target.addEventListener("keydown", onKeyDown);
      target.addEventListener("keyup", onKeyUp);
      target.addEventListener("blur", onBlur);
      target.addEventListener("focusin", onBlur);

      return () => {
        target.removeEventListener("keydown", onKeyDown);
        target.removeEventListener("keyup", onKeyUp);
        target.removeEventListener("blur", onBlur);
        target.removeEventListener("focusin", onBlur);
        keysDown.clear();
      };
    },
    poll(dt: number): ControlSurfaceState {
      const gamepad = readGamepad();
      sampleGamepadActivity(gamepad);
      if (remoteOwned) return { ...smoothed };
      const keyboardTarget = targetFromKeyboard(dt);
      pollGamepad(keyboardTarget, gamepad);

      smoothed = {
        elevator: smoothToward(smoothed.elevator, keyboardTarget.elevator, dt),
        aileron: smoothToward(smoothed.aileron, keyboardTarget.aileron, dt),
        rudder: smoothToward(smoothed.rudder, keyboardTarget.rudder, dt),
        throttle: smoothToward(smoothed.throttle, keyboardTarget.throttle, dt),
        pitchTrim: keyboardTarget.pitchTrim,
        flaps: keyboardTarget.flaps,
        brake: keyboardTarget.brake,
      };

      return { ...smoothed };
    },
    apply(sdk: JSBSimSdk, controls: ControlSurfaceState): void {
      if (paused) return;
      applyFlightControls(sdk, controls);
    },
    adoptControls(controls: ControlSurfaceState): void {
      keysDown.clear();
      throttleTarget = controls.throttle;
      smoothed = { ...controls, elevator: 0, aileron: 0, rudder: 0, brake: 0 };
      protectGamepad = true;
      captureGamepadBaseline();
    },
    setRemoteOwned(value: boolean): void {
      if (remoteOwned === value) return;
      remoteOwned = value;
      protectGamepad = true;
      captureGamepadBaseline();
    },
    hasActiveFlightInput(): boolean {
      if (keysDown.size > 0 || [smoothed.elevator, smoothed.aileron, smoothed.rudder, smoothed.brake]
        .some((value) => Math.abs(value) > TAKEOVER_DEADBAND)) return true;
      const pad = readGamepad();
      if (!pad) return false;
      if (protectGamepad) {
        const activity = gamepadActivity(pad);
        return activity.axes.length > 0 || activity.buttons.length > 0;
      }
      return [pad.axes[0] ?? 0, pad.axes[1] ?? 0,
        pad.axes[2] ?? (pad.buttons[7]?.value ?? 0) - (pad.buttons[6]?.value ?? 0)]
        .some((value) => Math.abs(value) > TAKEOVER_DEADBAND) || Boolean(pad.buttons[0]?.pressed);
    },
    getControls(): ControlSurfaceState {
      return { ...smoothed };
    },
    resetControls(throttle: number): void {
      keysDown.clear();
      throttleTarget = Math.min(1, Math.max(0, throttle));
      smoothed = { elevator: 0, aileron: 0, rudder: 0, throttle: throttleTarget, pitchTrim: 0, flaps: 0, brake: 0 };
      if (protectGamepad) captureGamepadBaseline();
    },
    setThrottle(value: number): void {
      options.onLocalInput?.();
      if (remoteOwned) return;
      throttleTarget = Math.min(1, Math.max(0, value));
      smoothed.throttle = throttleTarget;
    },
    setPitchTrim(value: number): void {
      options.onLocalInput?.();
      if (remoteOwned) return;
      smoothed.pitchTrim = Math.min(1, Math.max(-1, value));
    },
    setPaused,
    isPaused(): boolean {
      return paused;
    },
  };
}
