// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BindingRuntime } from "@felipegalind0/gamepad-tools/core";
import { createBrowserInputSource } from "@felipegalind0/gamepad-tools/browser";
import { createFlightInputManager, type FlightInputManager } from "./flightInputManager";
import {
  createFlightGamepadAdapter,
  createLegacyFlightProfile,
  createStandardFlightProfile,
} from "./gamepadToolsAdapter";

const cleanups: (() => void)[] = [];
let pad: Gamepad;

beforeEach(() => {
  pad = {
    id: "Xbox", index: 0, connected: true, mapping: "standard", timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false })),
  } as unknown as Gamepad;
  Object.defineProperty(navigator, "getGamepads", {
    configurable: true, value: vi.fn(() => [pad]),
  });
});

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
});

function axis(index: number, value: number): void {
  (pad.axes as number[])[index] = value;
}

function button(index: number, value: number): void {
  Object.assign(pad.buttons[index], { value, pressed: value > 0.5 });
}

function harness(factory = createStandardFlightProfile, input = createFlightInputManager({ initialThrottle: 0.5 })) {
  const onCameraOrbit = vi.fn();
  const source = createBrowserInputSource({ target: window });
  const runtime = new BindingRuntime({
    profile: factory(), defaultAxisDeadzone: 0.08,
    adapter: createFlightGamepadAdapter(input, { onCameraOrbit }),
  });
  input.setGamepadToolsActive(true);
  const detach = source.subscribe((frame) => runtime.dispatch(frame));
  cleanups.push(() => { detach(); runtime.dispose(); source.dispose(); });
  const step = (dt = 1 / 60) => {
    source.tick();
    return input.poll(dt);
  };
  return { input, source, runtime, step, onCameraOrbit };
}

describe("flight profiles through browser sampling and evaluation", () => {
  it.each([createStandardFlightProfile, createLegacyFlightProfile])(
    "applies small stick motion on the very next flight step with one deadzone",
    (factory) => {
      const { step } = harness(factory);
      axis(0, 0.1);
      expect(step().aileron).toBeCloseTo((0.1 - 0.08) / 0.92);
      axis(0, 0.7);
      expect(step().aileron).toBeCloseTo((0.7 - 0.08) / 0.92);
      axis(0, 0.04);
      expect(step().aileron).toBe(0);
    },
  );

  it("filters old saved zero-deadzone profiles exactly once", () => {
    const { runtime, input, step } = harness();
    runtime.setProfile({
      ...createStandardFlightProfile(),
      bindings: createStandardFlightProfile().bindings.map((binding) => ({
        ...binding, transform: { ...binding.transform, deadzone: 0 },
      })),
    });
    input.setGamepadToolsActive(false);
    input.setGamepadToolsActive(true);
    step();
    axis(0, 0.1);
    expect(step().aileron).toBeCloseTo((0.1 - 0.08) / 0.92);
  });

  it("keeps trigger yaw proportional and cancels equal triggers", () => {
    const { step } = harness();
    button(7, 0.25);
    expect(step().rudder).toBeCloseTo(0.25);
    button(6, 0.25);
    expect(step().rudder).toBe(0);
    button(7, 0);
    expect(step().rudder).toBeCloseTo(-0.25);
  });

  it("changes throttle with Y/B in the next step without an extra smoothing delay", () => {
    const { step } = harness();
    button(3, 1);
    expect(step().throttle).toBeCloseTo(0.5 + 0.5 / 60);
    button(3, 0);
    expect(step().throttle).toBeCloseTo(0.5 + 0.5 / 60);
    button(1, 1);
    expect(step().throttle).toBeCloseTo(0.5);
  });

  it("uses the right stick only for the camera and stops at its deadzone", () => {
    const { step, onCameraOrbit } = harness();
    axis(2, 0.1);
    const controls = step();
    expect(controls.rudder).toBe(0);
    expect(onCameraOrbit).toHaveBeenCalledWith(expect.closeTo((0.1 - 0.08) / 0.92), 0, expect.any(Number));
    onCameraOrbit.mockClear();
    axis(2, 0.03);
    step();
    expect(onCameraOrbit).not.toHaveBeenCalled();
  });

  it("primes resting absolute throttle, then covers both Classic throttle endpoints", () => {
    const { step } = harness(createLegacyFlightProfile);
    expect(step().throttle).toBe(0.5);
    axis(3, -1);
    expect(step().throttle).toBe(1);
    axis(3, 1);
    expect(step().throttle).toBe(0);
  });

  it("does not retain flight deflection after a controller disconnects", () => {
    const { step } = harness();
    axis(0, 0.6);
    button(3, 1);
    const moving = step();
    vi.mocked(navigator.getGamepads).mockReturnValue([]);
    expect(step()).toMatchObject({ aileron: 0, rudder: 0, throttle: moving.throttle });
  });

  it("switches profiles repeatedly without delaying the first movement", () => {
    const { step, input, runtime } = harness();
    for (const factory of [createLegacyFlightProfile, createStandardFlightProfile, createLegacyFlightProfile]) {
      axis(0, 0);
      runtime.setProfile(factory());
      input.setGamepadToolsActive(false);
      input.setGamepadToolsActive(true);
      step();
      axis(0, 0.1);
      expect(step().aileron).toBeCloseTo((0.1 - 0.08) / 0.92);
    }
  });

  it("accepts a new command immediately after the neutral priming frame", () => {
    const { step, input } = harness();
    button(9, 1);
    step();
    expect(input.isPaused()).toBe(true);
  });

  it("preserves the input that initiates a synchronous phone handoff", () => {
    const onLocalInput = vi.fn(() => {
      input.adoptControls({ ...input.getControls(), throttle: 0.83 });
      input.setRemoteOwned(false);
    });
    const input: FlightInputManager = createFlightInputManager({ onLocalInput });
    const { step } = harness(createStandardFlightProfile, input);
    input.setRemoteOwned(true);
    step();
    axis(0, 0.2);
    expect(step()).toMatchObject({ throttle: 0.83, aileron: expect.closeTo((0.2 - 0.08) / 0.92) });
    expect(onLocalInput).toHaveBeenCalledTimes(1);
    step();
    expect(onLocalInput).toHaveBeenCalledTimes(1);
  });

  it("keeps capture input out of aircraft and camera controls", () => {
    const { step, runtime, onCameraOrbit } = harness();
    runtime.setBindingCapture(true);
    axis(0, 1);
    axis(2, 1);
    button(3, 1);
    expect(step()).toMatchObject({ aileron: 0, rudder: 0, throttle: 0.5 });
    expect(onCameraOrbit).not.toHaveBeenCalled();
  });
});
