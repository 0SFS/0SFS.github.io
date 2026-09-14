import {
  DEFAULT_BINDING_TRANSFORM,
  createDefaultProfile,
  type ActionDescriptor,
  type ActionIntentFrame,
  type BindingProfile,
  type BindingSource,
  type BindingSpec,
  type HostInputAdapter,
} from "@felipegalind0/gamepad-tools/core";
import type { FlightInputManager } from "./flightInputManager";

const PROFILE_STICK_DEADZONE = 0.08;

export const FLIGHT_GAMEPAD_ACTIONS: readonly ActionDescriptor[] = [
  { id: "flight.elevator", label: "Pitch", category: "Flight controls", kind: "axis", range: [-1, 1], contexts: ["flight"], available: true },
  { id: "flight.aileron", label: "Roll", category: "Flight controls", kind: "axis", range: [-1, 1], contexts: ["flight"], available: true },
  { id: "flight.rudder", label: "Rudder", category: "Flight controls", kind: "axis", range: [-1, 1], contexts: ["flight"], available: true },
  { id: "flight.throttle", label: "Absolute throttle", category: "Flight controls", kind: "value", range: [0, 1], contexts: ["flight"], available: true },
  { id: "flight.throttleRate", label: "Throttle increase / decrease", category: "Flight controls", kind: "rate", range: [-1, 1], contexts: ["flight"], available: true },
  { id: "flight.cameraYaw", label: "Camera left / right", category: "Camera", kind: "axis", range: [-1, 1], contexts: ["flight"], available: true },
  { id: "flight.cameraPitch", label: "Camera up / down", category: "Camera", kind: "axis", range: [-1, 1], contexts: ["flight"], available: true },
  { id: "flight.pitchTrimRate", label: "Pitch trim", category: "Trim", kind: "rate", range: [-1, 1], contexts: ["flight"], available: true },
  { id: "flight.rollTrimRate", label: "Roll trim", category: "Trim", kind: "rate", range: [-1, 1], contexts: ["flight"], available: true },
  { id: "flight.flaps", label: "Absolute flaps", category: "Configuration", kind: "value", range: [0, 1], contexts: ["flight"], available: true },
  { id: "flight.flapsRate", label: "Flaps increase / decrease", category: "Configuration", kind: "rate", range: [-1, 1], contexts: ["flight"], available: true },
  { id: "flight.brake", label: "Brake", category: "Configuration", kind: "value", range: [0, 1], contexts: ["flight"], available: true },
  { id: "flight.gearToggle", label: "Toggle landing gear", category: "Commands", kind: "command", contexts: ["flight"], available: true },
  { id: "flight.pause", label: "Pause simulation", category: "Commands", kind: "command", contexts: ["flight"], available: true },
  { id: "flight.view", label: "Toggle camera view", category: "Commands", kind: "command", contexts: ["flight"], available: true },
];

export interface FlightGamepadAdapterOptions {
  onViewToggle?(): void;
  onCameraOrbit?(yaw: number, pitch: number, dt: number): void;
  onCameraOrbitActive?(active: boolean): void;
}

export function createFlightGamepadAdapter(
  input: FlightInputManager,
  options: FlightGamepadAdapterOptions = {},
): HostInputAdapter {
  return {
    namespace: "0sfs",
    actions: FLIGHT_GAMEPAD_ACTIONS,
    getContext: () => "flight",
    applyIntents(frame: ActionIntentFrame): void {
      const viewPressed = frame.intents.some((intent) => intent.actionId === "flight.view"
        && intent.kind === "command" && intent.edge === "press");
    const cameraOrbit = frame.intents.reduce(
      (value, intent) => {
        if (intent.kind !== "axis") return value;
        if (intent.actionId === "flight.cameraYaw") value.yaw += intent.value;
        if (intent.actionId === "flight.cameraPitch") value.pitch += intent.value;
        return value;
      },
      { yaw: 0, pitch: 0 },
    );
    const cameraOrbitActive = !input.isBindingCaptureActive() && (cameraOrbit.yaw !== 0 || cameraOrbit.pitch !== 0);
    options.onCameraOrbitActive?.(cameraOrbitActive);
    input.applyGamepadBindingIntents({
      ...frame,
      intents: frame.intents.filter((intent) => (
        intent.actionId !== "flight.view"
        && intent.actionId !== "flight.cameraYaw"
          && intent.actionId !== "flight.cameraPitch"
        )),
      });
    if (viewPressed && !input.isBindingCaptureActive()) {
      options.onViewToggle?.();
    }
    const cameraYaw = cameraOrbit.yaw;
    const cameraPitch = cameraOrbit.pitch;
    if (cameraOrbitActive) {
      options.onCameraOrbit?.(cameraYaw, cameraPitch, frame.dt);
    }
  },
    setBindingCapture(active: boolean): void {
      input.setBindingCapture(active);
    },
  };
}

function axisSource(slot: number, axisIndex: number): BindingSource {
  return { selector: { kind: "gamepad-axis", gamepadSlot: slot, axisIndex } };
}

function buttonSource(slot: number, buttonIndex: number, direction?: -1 | 1): BindingSource {
  return { selector: { kind: "gamepad-button", gamepadSlot: slot, buttonIndex }, direction };
}

function keySource(code: string): BindingSource {
  return { selector: { kind: "keyboard", code } };
}

function single(
  id: string,
  actionId: string,
  semantics: BindingSpec["semantics"],
  source: BindingSource,
  outputRange: readonly [number, number],
  override: Partial<BindingSpec["transform"]> = {},
): BindingSpec {
  return {
    id,
    actionId,
    kind: "single",
    semantics,
    contexts: ["flight"],
    enabled: true,
    precedence: 0,
    transform: {
      ...DEFAULT_BINDING_TRANSFORM,
      deadzone: source.selector.kind === "gamepad-axis" && semantics === "axis"
        ? PROFILE_STICK_DEADZONE
        : DEFAULT_BINDING_TRANSFORM.deadzone,
      outputRange,
      inputRange: source.selector.kind === "gamepad-axis" ? [-1, 1] : [0, 1],
      ...override,
    },
    source,
  };
}

function paired(
  id: string,
  actionId: string,
  semantics: BindingSpec["semantics"],
  positiveSource: BindingSource,
  negativeSource: BindingSource,
): BindingSpec {
  return {
    id,
    actionId,
    kind: "paired",
    semantics,
    contexts: ["flight"],
    enabled: true,
    precedence: 0,
    transform: {
      ...DEFAULT_BINDING_TRANSFORM,
      inputRange: [0, 1],
      outputRange: [-1, 1],
    },
    positiveSource,
    negativeSource,
  };
}

function keyboardDefaults(): BindingSpec[] {
  return [
    paired("key-elevator", "flight.elevator", "axis", keySource("KeyW"), keySource("KeyS")),
    paired("key-aileron", "flight.aileron", "axis", keySource("KeyD"), keySource("KeyA")),
    paired("key-rudder", "flight.rudder", "axis", keySource("KeyE"), keySource("KeyQ")),
    paired("key-throttle", "flight.throttleRate", "rate", keySource("ShiftLeft"), keySource("ControlLeft")),
    paired("key-throttle-right", "flight.throttleRate", "rate", keySource("ShiftRight"), keySource("ControlRight")),
    paired("key-flaps", "flight.flapsRate", "rate", keySource("KeyF"), keySource("KeyR")),
    single("key-brake", "flight.brake", "value", keySource("KeyB"), [0, 1]),
    single("key-gear", "flight.gearToggle", "command", keySource("KeyG"), [0, 1]),
    single("key-pause", "flight.pause", "command", keySource("KeyP"), [0, 1]),
    single("key-view", "flight.view", "command", keySource("KeyV"), [0, 1]),
  ];
}

function profile(name: string, id: string, bindings: BindingSpec[]): BindingProfile {
  return {
    ...createDefaultProfile("0sfs"),
    profileId: id,
    name,
    contexts: ["flight"],
    bindings,
  };
}

/**
 * The historical 0sfs mapping is offered explicitly rather than silently
 * replacing existing users' controller behavior.
 */
export function createLegacyFlightProfile(slot = 0): BindingProfile {
  return profile("Classic", "0sfs-legacy-compatible", [
    ...keyboardDefaults(),
    single("legacy-aileron", "flight.aileron", "axis", axisSource(slot, 0), [-1, 1]),
    single("legacy-elevator", "flight.elevator", "axis", axisSource(slot, 1), [-1, 1], { invert: true }),
    single("legacy-rudder", "flight.rudder", "axis", axisSource(slot, 2), [-1, 1]),
    single("legacy-throttle", "flight.throttle", "value", axisSource(slot, 3), [0, 1], { invert: true }),
    single("legacy-brake", "flight.brake", "value", buttonSource(slot, 0), [0, 1]),
  ]);
}

/** A deliberate standard-controller preset that avoids a resting-stick throttle. */
export function createStandardFlightProfile(slot = 0): BindingProfile {
  return profile("Xbox", "0sfs-standard-flight", [
    ...keyboardDefaults(),
    single("standard-aileron", "flight.aileron", "axis", axisSource(slot, 0), [-1, 1]),
    single("standard-elevator", "flight.elevator", "axis", axisSource(slot, 1), [-1, 1], { invert: true }),
    paired("standard-rudder", "flight.rudder", "axis", buttonSource(slot, 7), buttonSource(slot, 6)),
    paired("standard-throttle", "flight.throttleRate", "rate", buttonSource(slot, 3), buttonSource(slot, 1)),
    // Xbox/PlayStation-style right-stick X is commonly interpreted as
    // "look right = higher heading offset", but this varies by browser
    // implementation. Start from an opinionated baseline and keep a UI
    // override for pilot preference.
    single("standard-camera-yaw", "flight.cameraYaw", "axis", axisSource(slot, 2), [-1, 1], { invert: true }),
    single("standard-camera-pitch", "flight.cameraPitch", "axis", axisSource(slot, 3), [-1, 1], { invert: true }),
    single("standard-brake", "flight.brake", "value", buttonSource(slot, 0), [0, 1]),
    single("standard-gear", "flight.gearToggle", "command", buttonSource(slot, 2), [0, 1]),
    single("standard-pause", "flight.pause", "command", buttonSource(slot, 9), [0, 1]),
    single("standard-view", "flight.view", "command", buttonSource(slot, 8), [0, 1]),
  ]);
}
