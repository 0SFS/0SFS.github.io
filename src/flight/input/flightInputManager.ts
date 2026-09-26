import type { JSBSimSdk } from "@felipegalind0/jsbsim";
import type { ActionIntentFrame } from "@felipegalind0/gamepad-tools/core";
import { applyFlightControls } from "./applyFlightControls";
import type { GamepadResponseController } from "@felipegalind0/gamepad-tools/core";
import { flightParameterDefaults, type FlightParameterStore } from "../settings/flightParameters";
import { createGamepadResponseSetting } from "./gamepadResponseSetting";
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

interface GamepadSnapshot {
  id: string;
  index: number;
  axes: number[];
  buttons: { value: number; pressed: boolean }[];
}

interface BindingIntentValue {
  actionId: string;
  value: number;
  inputKind: "keyboard" | "gamepad";
}

type BindingAxis = "aileron" | "elevator" | "rudder";

interface GamepadBindingControls {
  elevator: number;
  aileron: number;
  rudder: number;
  throttle: number | null;
  throttleRate: number;
  pitchTrim: number | null;
  pitchTrimRate: number;
  rollTrim: number | null;
  rollTrimRate: number;
  flaps: number | null;
  flapsRate: number;
  brake: number;
}

const emptyGamepadBindingControls = (): GamepadBindingControls => ({
  elevator: 0,
  aileron: 0,
  rudder: 0,
  throttle: null,
  throttleRate: 0,
  pitchTrim: null,
  pitchTrimRate: 0,
  rollTrim: null,
  rollTrimRate: 0,
  flaps: null,
  flapsRate: 0,
  brake: 0,
});

function readGamepad(slot = 0): GamepadSnapshot | null {
  const pad = navigator.getGamepads?.()[slot];
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
  getGamepadResponseController(): GamepadResponseController;
  /** Stops following the parameters. */
  dispose(): void;
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
  /** Enables the profile-driven input path and suppresses legacy mappings. */
  setGamepadToolsActive(value: boolean): void;
  isGamepadToolsActive(): boolean;
  /** Receives evaluated profile intents from the shared gamepad runtime. */
  applyGamepadBindingIntents(frame: ActionIntentFrame): void;
  /** Keeps binding capture from leaking controls into the active simulation. */
  setBindingCapture(value: boolean): void;
  isBindingCaptureActive(): boolean;
  setSelectedGamepadSlot(slot: number): void;
  getSelectedGamepadSlot(): number;
}

export function createFlightInputManager(options: {
  /**
   * The osfs.input.* parameters, and the gamepad response kept in them. The
   * catalogue's defaults, in memory, when absent.
   */
  parameters?: FlightParameterStore;
  initialThrottle?: number;
  initialGearDown?: boolean;
  rudderSign?: 1 | -1;
  onPausedChange?: (paused: boolean) => void;
  /** Fires on the G key so the HUD's gear button can follow it. */
  onGearChange?: (down: boolean) => void;
  /** Runs before local input is applied, allowing synchronous authority revocation. */
  onLocalInput?: () => void;
  /** Body rates for flight-assist keyboard mode. */
  getBodyRates?: () => BodyRatesRad | null;
  keyboardStickSettings?: KeyboardStickSettings;
} = {}): FlightInputManager {
  const parameters = options.parameters ?? flightParameterDefaults();
  const takeoverDeadband = (): number => parameters.get("osfs.input.takeoverDeadband");
  const keysDown = new Set<string>();
  const initialThrottle = Math.min(1, Math.max(0, options.initialThrottle ?? parameters.get("osfs.start.throttle")));
  let smoothed: ControlSurfaceState = {
    elevator: 0,
    aileron: 0,
    rudder: 0,
    throttle: initialThrottle,
    pitchTrim: 0,
    rollTrim: 0,
    flaps: 0,
    brake: 0,
  };
  let throttleTarget = initialThrottle;
  let paused = false;
  let gearDown = options.initialGearDown ?? true;
  let remoteOwned = false;
  let gamepadToolsActive = false;
  let bindingCaptureActive = false;
  let selectedGamepadSlot = 0;
  let protectGamepad = false;
  let stickOverride: Pick<ControlSurfaceState, "aileron" | "elevator"> | null = null;
  let rudderOverride: number | null = null;
  let gamepadBaseline: GamepadSnapshot | null = null;
  let previousGamepad: GamepadSnapshot | null = null;
  let gamepadBindingControls = emptyGamepadBindingControls();
  const bindingBaselines = new Map<string, number>();
  const armedBindingSources = new Set<string>();
  const bindingIntentValues = new Map<string, BindingIntentValue>();
  const keyboardBindingAxes = new Set<BindingAxis>();
  const gamepadBindingAxes = new Set<BindingAxis>();
  const gamepadResponse = createGamepadResponseSetting(parameters);
  let primeBindingCommands = true;
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

  const captureGamepadBaseline = (pad = readGamepad(selectedGamepadSlot)): void => {
    gamepadBaseline = pad;
    previousGamepad = pad;
    enabledAxes.clear();
    enabledButtons.clear();
  };

  const gamepadActivity = (pad: GamepadSnapshot): { axes: number[]; buttons: number[] } => {
    if (!sameGamepad(pad, gamepadBaseline)) return { axes: [], buttons: [] };
    return {
      axes: pad.axes.flatMap((value, index) => (
        Math.abs(value - (gamepadBaseline?.axes[index] ?? value)) > takeoverDeadband() ? [index] : []
      )),
      buttons: pad.buttons.flatMap((button, index) => (
        (button.pressed && !previousGamepad?.buttons[index]?.pressed)
        || ((index === 6 || index === 7)
          && button.value - (gamepadBaseline?.buttons[index]?.value ?? button.value) > takeoverDeadband())
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

  const clamp = (value: number, minimum = -1, maximum = 1): number => (
    Math.min(maximum, Math.max(minimum, value))
  );

  const resetGamepadBindingInputs = (): void => {
    gamepadBindingControls = emptyGamepadBindingControls();
    keyboardBindingAxes.clear();
    gamepadBindingAxes.clear();
    resetKeyboardAxes();
    bindingBaselines.clear();
    armedBindingSources.clear();
    bindingIntentValues.clear();
    // Prime held commands once without imposing a timed lockout.
    primeBindingCommands = true;
  };

  const aggregateBindingValue = (
    actionId: string,
    minimum = -1,
    maximum = 1,
    inputKind?: BindingIntentValue["inputKind"],
  ): number | null => {
    let found = false;
    let total = 0;
    for (const entry of bindingIntentValues.values()) {
      if (entry.actionId !== actionId) continue;
      if (inputKind !== undefined && entry.inputKind !== inputKind) continue;
      found = true;
      total += entry.value;
    }
    return found ? clamp(total, minimum, maximum) : null;
  };

  const refreshGamepadBindingControls = (): void => {
    gamepadBindingControls = {
      elevator: aggregateBindingValue("flight.elevator") ?? 0,
      aileron: aggregateBindingValue("flight.aileron") ?? 0,
      rudder: aggregateBindingValue("flight.rudder") ?? 0,
      throttle: aggregateBindingValue("flight.throttle", 0, 1),
      throttleRate: aggregateBindingValue("flight.throttleRate") ?? 0,
      pitchTrim: aggregateBindingValue("flight.pitchTrim"),
      pitchTrimRate: aggregateBindingValue("flight.pitchTrimRate") ?? 0,
      rollTrim: aggregateBindingValue("flight.rollTrim"),
      rollTrimRate: aggregateBindingValue("flight.rollTrimRate") ?? 0,
      flaps: aggregateBindingValue("flight.flaps", 0, 1),
      flapsRate: aggregateBindingValue("flight.flapsRate") ?? 0,
      brake: aggregateBindingValue("flight.brake", 0, 1) ?? 0,
    };
  };

  const applyGamepadBindingIntents = (frame: ActionIntentFrame): void => {
    if (!gamepadToolsActive || bindingCaptureActive) return;

    const suppressCommands = primeBindingCommands;
    primeBindingCommands = false;
    const nextValues = new Map<string, BindingIntentValue>();
    let hasLocalContinuousInput = false;
    for (const intent of frame.intents) {
      if (intent.kind === "command") {
        if (intent.edge !== "press" || suppressCommands) continue;
        if (intent.actionId === "flight.pause") setPaused(!paused);
        if (intent.actionId === "flight.gearToggle") setGearDown(!gearDown);
        continue;
      }
      if (
        (intent.kind !== "axis" && intent.kind !== "value" && intent.kind !== "rate")
        || typeof intent.value !== "number"
      ) continue;

      const bindingId = intent.source.bindingId;
      const value = intent.value;
      if (!Number.isFinite(value)) continue;
      const persistentValue = intent.kind === "value" && intent.actionId !== "flight.brake";
      const baseline = bindingBaselines.get(bindingId);
      if (baseline === undefined) {
        bindingBaselines.set(bindingId, value);
        if (!persistentValue && value === 0) armedBindingSources.add(bindingId);
        continue;
      }
      if (!armedBindingSources.has(bindingId)) {
        if (!persistentValue && value === 0) {
          armedBindingSources.add(bindingId);
        } else if (Math.abs(value - baseline) > takeoverDeadband()) {
          armedBindingSources.add(bindingId);
        } else {
          continue;
        }
      }
      nextValues.set(bindingId, {
        actionId: intent.actionId,
        value,
        inputKind: intent.source.inputKind,
      });
      hasLocalContinuousInput ||= Math.abs(value) > 0.001
        && Math.abs(value - (bindingIntentValues.get(bindingId)?.value ?? 0)) > 0.001;
    }

    if (hasLocalContinuousInput) options.onLocalInput?.();
    if (remoteOwned) return;
    // A synchronous phone handoff can clear the maps above. Restore this
    // frame's initiating input afterwards, and drop any disconnected sources.
    bindingIntentValues.clear();
    for (const [id, entry] of nextValues) {
      bindingIntentValues.set(id, entry);
      bindingBaselines.set(id, entry.value);
      armedBindingSources.add(id);
    }
    refreshGamepadBindingControls();
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
        throttleTarget = Math.min(1, Math.max(0, throttleTarget + binding.throttle * parameters.get("osfs.input.throttleRate") * dt));
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
    const stickDeadzone = parameters.get("osfs.input.stickDeadzone");
    const deadzone = (value: number): number => (Math.abs(value) < stickDeadzone ? 0 : value);
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
    current + (goal - current) * Math.min(1, parameters.get("osfs.input.gamepadSmoothing") * dt)
  );

  const outputAxis = (state: KeyboardAxisState): number => (
    applyStickExpo(state.position, keyboardSettings.expo)
  );

  const pollBindingAxis = (
    axis: BindingAxis,
    dt: number,
    rates: BodyRatesRad | null,
    override: number | null,
  ): number => {
    const actionId = `flight.${axis}`;
    const keyboard = aggregateBindingValue(actionId, -1, 1, "keyboard");
    const gamepad = aggregateBindingValue(actionId, -1, 1, "gamepad");
    let state = axis === "aileron" ? aileronAxis : axis === "elevator" ? elevatorAxis : rudderAxis;
    let output = override ?? gamepad ?? 0;

    // Virtual controls remain direct. Keyboard and gamepad axes have separate
    // response policies; neither inherits the other's ramp or assist history.
    if (override !== null) {
      keyboardBindingAxes.delete(axis);
      gamepadBindingAxes.delete(axis);
      state = createKeyboardAxisState();
    } else if (
      gamepad !== null
      && (gamepad !== 0 || keyboard === null || (keyboard === 0 && !keyboardBindingAxes.has(axis)))
    ) {
      const previous = gamepadBindingAxes.has(axis) ? state.position : 0;
      const response = gamepadResponse.getSettings();
      output = response.mode === "smooth"
        ? previous + (gamepad - previous) * Math.min(1, 3 / response.responseTimeSec * Math.max(0, dt))
        : gamepad;
      state = createKeyboardAxisState(output);
      keyboardBindingAxes.delete(axis);
      gamepadBindingAxes.add(axis);
    } else if (
      keyboard !== null
      && (keyboard !== 0 || gamepad === null || keyboardBindingAxes.has(axis))
    ) {
      // An idle connected pad must not suppress keyboard input or its return
      // ramp. Assist retains ownership after key release, until analog takeover.
      if (gamepadBindingAxes.delete(axis)) state = createKeyboardAxisState();
      if (keyboard !== 0) keyboardBindingAxes.add(axis);
      state = stepKeyboardAxis(axis, state, keyboard, dt, keyboardSettings, rates);
      output = outputAxis(state);
    } else {
      keyboardBindingAxes.delete(axis);
      gamepadBindingAxes.delete(axis);
      state = createKeyboardAxisState();
    }

    if (axis === "aileron") aileronAxis = state;
    else if (axis === "elevator") elevatorAxis = state;
    else rudderAxis = state;
    return output;
  };

  const pollGamepadToolBindings = (dt: number): ControlSurfaceState => {
    const binding = gamepadBindingControls;
    if (binding.throttle !== null) {
      throttleTarget = clamp(binding.throttle, 0, 1);
    } else {
      throttleTarget = clamp(
        throttleTarget + binding.throttleRate * parameters.get("osfs.input.throttleRate") * dt,
        0,
        1,
      );
    }

    const rates = keyboardSettings.mode === "assist" ? (options.getBodyRates?.() ?? null) : null;
    const aileron = pollBindingAxis("aileron", dt, rates, stickOverride?.aileron ?? null);
    const elevator = pollBindingAxis("elevator", dt, rates, stickOverride?.elevator ?? null);
    const rudder = pollBindingAxis("rudder", dt, rates, rudderOverride);
    const pitchTrim = binding.pitchTrim ?? clamp(
      smoothed.pitchTrim + binding.pitchTrimRate * 0.5 * dt,
    );
    const rollTrim = binding.rollTrim ?? clamp(
      smoothed.rollTrim + binding.rollTrimRate * 0.5 * dt,
    );
    const flaps = binding.flaps ?? clamp(
      smoothed.flaps + binding.flapsRate * 0.5 * dt,
      0,
      1,
    );

    smoothed = {
      elevator,
      aileron,
      rudder,
      throttle: throttleTarget,
      pitchTrim,
      rollTrim,
      flaps,
      brake: binding.brake,
    };
    return { ...smoothed };
  };

  return {
    attach(target: Window): () => void {
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) {
          keysDown.clear();
          return;
        }
        if (bindingCaptureActive || gamepadToolsActive) {
          if (event.code in KEY_BINDINGS || event.code === "KeyP" || event.code === "KeyG") {
            event.preventDefault();
          }
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
      const gamepad = readGamepad(selectedGamepadSlot);
      if (bindingCaptureActive) {
        captureGamepadBaseline(gamepad);
        return { ...smoothed };
      }
      if (gamepadToolsActive) {
        if (remoteOwned) return { ...smoothed };
        return pollGamepadToolBindings(dt);
      }
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
      applyFlightControls(sdk, controls, gearDown ? 1 : 0, options.rudderSign);
    },
    adoptControls(controls: ControlSurfaceState): void {
      keysDown.clear();
      stickOverride = null;
      rudderOverride = null;
      throttleTarget = controls.throttle;
      smoothed = { ...controls, elevator: 0, aileron: 0, rudder: 0, brake: 0 };
      resetKeyboardAxes();
      resetGamepadBindingInputs();
      protectGamepad = true;
      captureGamepadBaseline();
    },
    setRemoteOwned(value: boolean): void {
      if (remoteOwned === value) return;
      remoteOwned = value;
      resetGamepadBindingInputs();
      protectGamepad = true;
      captureGamepadBaseline();
    },
    hasActiveFlightInput(): boolean {
      if (bindingCaptureActive) return false;
      if (gamepadToolsActive) {
        return stickOverride !== null
          || rudderOverride !== null
          || [
            gamepadBindingControls.elevator,
            gamepadBindingControls.aileron,
            gamepadBindingControls.rudder,
            gamepadBindingControls.throttleRate,
            gamepadBindingControls.pitchTrimRate,
            gamepadBindingControls.rollTrimRate,
            gamepadBindingControls.flapsRate,
            gamepadBindingControls.brake,
          ].some((value) => Math.abs(value) > takeoverDeadband());
      }
      if (stickOverride !== null || rudderOverride !== null || keysDown.size > 0 || [smoothed.elevator, smoothed.aileron, smoothed.rudder, smoothed.brake]
        .some((value) => Math.abs(value) > takeoverDeadband())) return true;
      const pad = readGamepad(selectedGamepadSlot);
      if (!pad) return false;
      if (protectGamepad) {
        const activity = gamepadActivity(pad);
        return activity.axes.length > 0 || activity.buttons.length > 0;
      }
      return [pad.axes[0] ?? 0, pad.axes[1] ?? 0,
        pad.axes[2] ?? (pad.buttons[7]?.value ?? 0) - (pad.buttons[6]?.value ?? 0)]
        .some((value) => Math.abs(value) > takeoverDeadband()) || Boolean(pad.buttons[0]?.pressed);
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
      resetGamepadBindingInputs();
      if (protectGamepad) captureGamepadBaseline();
    },
    setGamepadToolsActive(value: boolean): void {
      if (gamepadToolsActive === value) return;
      gamepadToolsActive = value;
      keysDown.clear();
      stickOverride = null;
      rudderOverride = null;
      resetKeyboardAxes();
      resetGamepadBindingInputs();
      smoothed = { ...smoothed, elevator: 0, aileron: 0, rudder: 0, brake: 0 };
      protectGamepad = true;
      captureGamepadBaseline();
    },
    isGamepadToolsActive(): boolean {
      return gamepadToolsActive;
    },
    applyGamepadBindingIntents,
    setBindingCapture(value: boolean): void {
      if (bindingCaptureActive === value) return;
      bindingCaptureActive = value;
      keysDown.clear();
      stickOverride = null;
      rudderOverride = null;
      resetKeyboardAxes();
      resetGamepadBindingInputs();
      smoothed = { ...smoothed, elevator: 0, aileron: 0, rudder: 0, brake: 0 };
      captureGamepadBaseline();
    },
    isBindingCaptureActive(): boolean {
      return bindingCaptureActive;
    },
    setSelectedGamepadSlot(slot: number): void {
      const nextSlot = Math.max(0, Math.floor(slot));
      if (nextSlot === selectedGamepadSlot) return;
      selectedGamepadSlot = nextSlot;
      resetGamepadBindingInputs();
      captureGamepadBaseline();
    },
    getSelectedGamepadSlot(): number {
      return selectedGamepadSlot;
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
    getGamepadResponseController: () => gamepadResponse,
    dispose: () => gamepadResponse.dispose(),
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
