import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { applyFlightControls } from "./applyFlightControls";
import {
  applyStickExpo,
  createKeyboardAxisState,
  stepKeyboardAxis,
  type BodyRatesRad,
  type KeyboardAxisState,
} from "./keyboardStickResponse";
import {
  DEFAULT_KEYBOARD_STICK_SETTINGS,
  normalizeKeyboardStickSettings,
  type KeyboardStickSettings,
} from "./keyboardStickSettings";

export interface ControlSurfaceState {
  elevator: number;
  aileron: number;
  rudder: number;
  throttle: number;
  pitchTrim: number;
  rollTrim: number;
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
  // R, not G: G is the landing gear, which is what every other simulator binds
  // it to and what the gear button in the HUD is labelled.
  KeyR: { flaps: -1 },
  KeyB: { brake: 1 },
};

const GAMEPAD_SMOOTHING_RATE = 8;
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
  setRollTrim(value: number): void;
  /**
   * Write a trim wheel without treating it as a local takeover. Auto-trim
   * uses this while a phone owns the stick.
   */
  replacePitchTrim(value: number): void;
  replaceRollTrim(value: number): void;
  setFlaps(value: number): void;
  setRudder(value: number): void;
  setStick(aileron: number, elevator: number): void;
  getKeyboardStickSettings(): KeyboardStickSettings;
  setKeyboardStickSettings(settings: KeyboardStickSettings): void;
  setPaused(paused: boolean): void;
  isPaused(): boolean;
  /** Landing gear lever, 1 down and 0 up. A fixed-gear airframe ignores it. */
  getGearDownNorm(): number;
  setGearDown(down: boolean): void;
}

export function createFlightInputManager(options: {
  onPausedChange?: (paused: boolean) => void;
  /** Fires on the G key so the HUD's gear button can follow it. */
  onGearChange?: (down: boolean) => void;
  /** Runs before local input is applied, allowing synchronous authority revocation. */
  onLocalInput?: () => void;
  /** Body rates for flight-assist keyboard mode. */
  getBodyRates?: () => BodyRatesRad | null;
  keyboardStickSettings?: KeyboardStickSettings;
} = {}): FlightInputManager {
  const keysDown = new Set<string>();
  let smoothed: ControlSurfaceState = {
    elevator: 0,
    aileron: 0,
    rudder: 0,
    throttle: INITIAL_THROTTLE,
    pitchTrim: 0,
    rollTrim: 0,
    flaps: 0,
    brake: 0,
  };
  let throttleTarget = INITIAL_THROTTLE;
  let paused = false;
  let gearDown = true;
  let remoteOwned = false;
  let protectGamepad = false;
  let stickOverride: Pick<ControlSurfaceState, "aileron" | "elevator"> | null = null;
  let rudderOverride: number | null = null;
  let gamepadBaseline: GamepadSnapshot | null = null;
  let previousGamepad: GamepadSnapshot | null = null;
  const enabledAxes = new Set<number>();
  const enabledButtons = new Set<number>();
  let keyboardSettings = normalizeKeyboardStickSettings(
    options.keyboardStickSettings ?? DEFAULT_KEYBOARD_STICK_SETTINGS,
  );
  let aileronAxis = createKeyboardAxisState();
  let elevatorAxis = createKeyboardAxisState();
  let rudderAxis = createKeyboardAxisState();

  const resetKeyboardAxes = (aileron = 0, elevator = 0, rudder = 0): void => {
    aileronAxis = createKeyboardAxisState(aileron);
    elevatorAxis = createKeyboardAxisState(elevator);
    rudderAxis = createKeyboardAxisState(rudder);
  };

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
  const setGearDown = (value: boolean): void => {
    if (value === gearDown) return;
    gearDown = value;
    options.onGearChange?.(gearDown);
  };

  const setPaused = (value: boolean): void => {
    if (paused === value) return;
    paused = value;
    options.onPausedChange?.(paused);
  };

  const readKeyDirections = (): { elevator: number; aileron: number; rudder: number } => {
    let elevator = 0;
    let aileron = 0;
    let rudder = 0;
    for (const key of keysDown) {
      const binding = KEY_BINDINGS[key];
      if (!binding) continue;
      if (binding.elevator !== undefined) elevator = binding.elevator;
      if (binding.aileron !== undefined) aileron = binding.aileron;
      if (binding.rudder !== undefined) rudder = binding.rudder;
    }
    return { elevator, aileron, rudder };
  };

  const integratePersistentControls = (dt: number): Pick<ControlSurfaceState, "throttle" | "pitchTrim" | "rollTrim" | "flaps" | "brake"> => {
    let flaps = smoothed.flaps;
    let brake = 0;
    for (const key of keysDown) {
      const binding = KEY_BINDINGS[key];
      if (!binding) continue;
      if (binding.throttle !== undefined) {
        throttleTarget = Math.min(1, Math.max(0, throttleTarget + binding.throttle * THROTTLE_CHANGE_RATE * dt));
      }
      if (binding.flaps !== undefined) {
        flaps = Math.min(1, Math.max(0, flaps + binding.flaps * dt * 0.5));
      }
      if (binding.brake !== undefined) brake = binding.brake;
    }
    return { throttle: throttleTarget, pitchTrim: smoothed.pitchTrim, rollTrim: smoothed.rollTrim, flaps, brake };
  };

  const gamepadAxisActive = (axisIndex: number): boolean => !protectGamepad || enabledAxes.has(axisIndex);
  const gamepadButtonActive = (...indexes: number[]): boolean => (
    !protectGamepad || indexes.some((index) => enabledButtons.has(index))
  );

  const pollGamepadAxes = (pad: GamepadSnapshot | null): {
    elevator: number | null;
    aileron: number | null;
    rudder: number | null;
    throttle: number | null;
    brake: number | null;
  } => {
    if (!pad) {
      return { elevator: null, aileron: null, rudder: null, throttle: null, brake: null };
    }
    const deadzone = (value: number): number => (Math.abs(value) < 0.08 ? 0 : value);
    return {
      elevator: gamepadAxisActive(1) ? deadzone(-(pad.axes[1] ?? 0)) : null,
      aileron: gamepadAxisActive(0) ? deadzone(pad.axes[0] ?? 0) : null,
      rudder: gamepadAxisActive(2) || gamepadButtonActive(6, 7)
        ? deadzone(pad.axes[2] ?? (pad.buttons[7]?.value ?? 0) - (pad.buttons[6]?.value ?? 0))
        : null,
      throttle: pad.axes[3] !== undefined && gamepadAxisActive(3)
        ? Math.min(1, Math.max(0, (1 - pad.axes[3]) * 0.5))
        : null,
      brake: pad.buttons[0]?.pressed && gamepadButtonActive(0) ? 1 : null,
    };
  };

  const smoothToward = (current: number, goal: number, dt: number): number => (
    current + (goal - current) * Math.min(1, GAMEPAD_SMOOTHING_RATE * dt)
  );

  const outputAxis = (state: KeyboardAxisState): number => (
    applyStickExpo(state.position, keyboardSettings.expo)
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
        // A latching switch, handled like the pause key rather than through
        // KEY_BINDINGS: it is not an axis, nothing smooths it, and it is not
        // part of the control record the phone controller owns - so a remote
        // pilot holding the stick does not stop the gear being raised here.
        if (event.code === "KeyG") {
          if (event.repeat) return;
          setGearDown(!gearDown);
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

      const persistent = integratePersistentControls(dt);
      const gamepadAxes = pollGamepadAxes(gamepad);
      if (gamepadAxes.throttle !== null) {
        persistent.throttle = gamepadAxes.throttle;
        if (protectGamepad) throttleTarget = gamepadAxes.throttle;
      }
      if (gamepadAxes.brake !== null) persistent.brake = gamepadAxes.brake;

      if (stickOverride) {
        aileronAxis = createKeyboardAxisState(stickOverride.aileron);
        elevatorAxis = createKeyboardAxisState(stickOverride.elevator);
      } else if (gamepadAxes.aileron !== null || gamepadAxes.elevator !== null) {
        if (gamepadAxes.aileron !== null) {
          aileronAxis = createKeyboardAxisState(
            smoothToward(aileronAxis.position, gamepadAxes.aileron, dt),
          );
        }
        if (gamepadAxes.elevator !== null) {
          elevatorAxis = createKeyboardAxisState(
            smoothToward(elevatorAxis.position, gamepadAxes.elevator, dt),
          );
        }
      } else {
        const dirs = readKeyDirections();
        const rates = keyboardSettings.mode === "assist"
          ? (options.getBodyRates?.() ?? null)
          : null;
        aileronAxis = stepKeyboardAxis("aileron", aileronAxis, dirs.aileron, dt, keyboardSettings, rates);
        elevatorAxis = stepKeyboardAxis("elevator", elevatorAxis, dirs.elevator, dt, keyboardSettings, rates);
      }

      if (gamepadAxes.rudder !== null) {
        rudderOverride = null;
        rudderAxis = createKeyboardAxisState(smoothToward(rudderAxis.position, gamepadAxes.rudder, dt));
      } else if (rudderOverride !== null) {
        rudderAxis = createKeyboardAxisState(rudderOverride);
      } else {
        const dirs = readKeyDirections();
        const rates = keyboardSettings.mode === "assist"
          ? (options.getBodyRates?.() ?? null)
          : null;
        rudderAxis = stepKeyboardAxis("rudder", rudderAxis, dirs.rudder, dt, keyboardSettings, rates);
      }

      const aileron = stickOverride
        ? stickOverride.aileron
        : gamepadAxes.aileron !== null
          ? aileronAxis.position
          : outputAxis(aileronAxis);
      const elevator = stickOverride
        ? stickOverride.elevator
        : gamepadAxes.elevator !== null
          ? elevatorAxis.position
          : outputAxis(elevatorAxis);
      const rudder = rudderOverride !== null
        ? rudderOverride
        : gamepadAxes.rudder !== null
          ? rudderAxis.position
          : outputAxis(rudderAxis);

      smoothed = {
        elevator,
        aileron,
        rudder,
        throttle: smoothToward(smoothed.throttle, persistent.throttle, dt),
        pitchTrim: persistent.pitchTrim,
        rollTrim: persistent.rollTrim,
        flaps: persistent.flaps,
        brake: persistent.brake,
      };

      return { ...smoothed };
    },
    apply(sdk: JSBSimSdk, controls: ControlSurfaceState): void {
      if (paused) return;
      applyFlightControls(sdk, controls, gearDown ? 1 : 0);
    },
    adoptControls(controls: ControlSurfaceState): void {
      keysDown.clear();
      stickOverride = null;
      rudderOverride = null;
      throttleTarget = controls.throttle;
      smoothed = { ...controls, elevator: 0, aileron: 0, rudder: 0, brake: 0 };
      resetKeyboardAxes();
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
      if (stickOverride !== null || rudderOverride !== null || keysDown.size > 0 || [smoothed.elevator, smoothed.aileron, smoothed.rudder, smoothed.brake]
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
      stickOverride = null;
      rudderOverride = null;
      throttleTarget = Math.min(1, Math.max(0, throttle));
      smoothed = { elevator: 0, aileron: 0, rudder: 0, throttle: throttleTarget, pitchTrim: 0, rollTrim: 0, flaps: 0, brake: 0 };
      resetKeyboardAxes();
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
    replacePitchTrim(value: number): void {
      smoothed.pitchTrim = Math.min(1, Math.max(-1, value));
    },
    setRollTrim(value: number): void {
      options.onLocalInput?.();
      if (remoteOwned) return;
      smoothed.rollTrim = Math.min(1, Math.max(-1, value));
    },
    replaceRollTrim(value: number): void {
      smoothed.rollTrim = Math.min(1, Math.max(-1, value));
    },
    setFlaps(value: number): void {
      options.onLocalInput?.();
      if (remoteOwned) return;
      smoothed.flaps = Math.min(1, Math.max(0, value));
    },
    setRudder(value: number): void {
      options.onLocalInput?.();
      if (remoteOwned) return;
      const clamped = Math.min(1, Math.max(-1, value));
      rudderOverride = Math.abs(clamped) < 0.001 ? null : clamped;
      if (rudderOverride !== null) {
        smoothed.rudder = rudderOverride;
        rudderAxis = createKeyboardAxisState(rudderOverride);
      } else {
        rudderAxis = createKeyboardAxisState(0);
        smoothed.rudder = 0;
      }
    },
    setStick(aileron: number, elevator: number): void {
      options.onLocalInput?.();
      if (remoteOwned) return;
      const clamped = {
        aileron: Math.min(1, Math.max(-1, aileron)),
        elevator: Math.min(1, Math.max(-1, elevator)),
      };
      stickOverride = clamped.aileron === 0 && clamped.elevator === 0 ? null : clamped;
      if (stickOverride) {
        smoothed.aileron = stickOverride.aileron;
        smoothed.elevator = stickOverride.elevator;
        aileronAxis = createKeyboardAxisState(stickOverride.aileron);
        elevatorAxis = createKeyboardAxisState(stickOverride.elevator);
      } else {
        resetKeyboardAxes(0, 0, rudderAxis.position);
      }
    },
    getKeyboardStickSettings(): KeyboardStickSettings {
      return { ...keyboardSettings };
    },
    setKeyboardStickSettings(settings: KeyboardStickSettings): void {
      const next = normalizeKeyboardStickSettings(settings);
      const modeChanged = next.mode !== keyboardSettings.mode;
      keyboardSettings = next;
      if (modeChanged) {
        resetKeyboardAxes(aileronAxis.position, elevatorAxis.position, rudderAxis.position);
      }
    },
    setPaused,
    isPaused(): boolean {
      return paused;
    },
    getGearDownNorm(): number {
      return gearDown ? 1 : 0;
    },
    setGearDown,
  };
}
