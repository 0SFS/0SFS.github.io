import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
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

export interface FlightInputManager {
  attach(target: Window): () => void;
  poll(dt: number): ControlSurfaceState;
  apply(sdk: JSBSimSdk, controls: ControlSurfaceState): void;
  setThrottle(value: number): void;
  setPitchTrim(value: number): void;
  setPaused(paused: boolean): void;
  isPaused(): boolean;
}

export function createFlightInputManager(options: { onPausedChange?: (paused: boolean) => void } = {}): FlightInputManager {
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

  const pollGamepad = (target: ControlSurfaceState): void => {
    const pads = navigator.getGamepads();
    const pad = pads[0];
    if (!pad) return;

    const deadzone = (value: number): number => (
      Math.abs(value) < 0.08 ? 0 : value
    );

    target.elevator = deadzone(-pad.axes[1]);
    target.aileron = deadzone(pad.axes[0]);
    target.rudder = deadzone(pad.axes[2] ?? (pad.buttons[6]?.value ?? 0) - (pad.buttons[7]?.value ?? 0));

    const throttleAxis = pad.axes[3];
    if (throttleAxis !== undefined) {
      target.throttle = Math.min(1, Math.max(0, (1 - throttleAxis) * 0.5));
    }
    if (pad.buttons[0]?.pressed) target.brake = 1;
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
          keysDown.add(event.code);
          event.preventDefault();
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
      const keyboardTarget = targetFromKeyboard(dt);
      pollGamepad(keyboardTarget);

      smoothed = {
        elevator: smoothToward(smoothed.elevator, keyboardTarget.elevator, dt),
        aileron: smoothToward(smoothed.aileron, keyboardTarget.aileron, dt),
        rudder: smoothToward(smoothed.rudder, keyboardTarget.rudder, dt),
        throttle: smoothToward(smoothed.throttle, keyboardTarget.throttle, dt),
        pitchTrim: keyboardTarget.pitchTrim,
        flaps: keyboardTarget.flaps,
        brake: keyboardTarget.brake,
      };

      return smoothed;
    },
    apply(sdk: JSBSimSdk, controls: ControlSurfaceState): void {
      if (paused) return;
      sdk.setPropertyValue("fcs/elevator-cmd-norm", controls.elevator);
      sdk.setPropertyValue("fcs/aileron-cmd-norm", controls.aileron);
      sdk.setPropertyValue("fcs/rudder-cmd-norm", controls.rudder);
      sdk.setPropertyValue("fcs/throttle-cmd-norm", controls.throttle);
      sdk.setPropertyValue("fcs/pitch-trim-cmd-norm", controls.pitchTrim);
      sdk.setPropertyValue("fcs/flap-cmd-norm", controls.flaps);
      sdk.setPropertyValue("fcs/brake-cmd-norm", controls.brake);
    },
    setThrottle(value: number): void {
      throttleTarget = Math.min(1, Math.max(0, value));
      smoothed.throttle = throttleTarget;
    },
    setPitchTrim(value: number): void {
      smoothed.pitchTrim = Math.min(1, Math.max(-1, value));
    },
    setPaused,
    isPaused(): boolean {
      return paused;
    },
  };
}
