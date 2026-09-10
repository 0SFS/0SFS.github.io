// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { createFlightInputManager } from "./flightInputManager";
import type { ControlSurfaceState, FlightInputManager } from "./flightInputManager";

describe("flightInputManager keyboard roll", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: vi.fn(() => []),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["KeyA", -1],
    ["KeyD", 1],
  ])("maps %s to the expected JSBSim aileron sign", (code, expectedSign) => {
    const input = createFlightInputManager();
    const detach = input.attach(window);

    window.dispatchEvent(new KeyboardEvent("keydown", { code }));
    const controls = input.poll(1);

    expect(Math.sign(controls.aileron)).toBe(expectedSign);
    detach();
  });

  it.each([
    [[0, 0, -1], [], 1],
    [[0, 0, 1], [], -1],
    [[0, 0], [1, 0], 1],
    [[0, 0], [0, 1], -1],
  ])("converts gamepad yaw to the C172 rudder convention", (axes, triggers, expectedRudder) => {
    const buttons = Array.from({ length: 8 }, (_, index) => ({ value: triggers[index - 6] ?? 0, pressed: false }));
    vi.mocked(navigator.getGamepads).mockReturnValue([{ axes, buttons } as unknown as Gamepad]);
    const input = createFlightInputManager();
    const setPropertyValue = vi.fn();
    input.apply({ setPropertyValue } as unknown as JSBSimSdk, input.poll(1));
    expect(setPropertyValue).toHaveBeenCalledWith("fcs/rudder-cmd-norm", expectedRudder);
  });

  it.each(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"])("ignores %s", (code) => {
    const input = createFlightInputManager();
    const detach = input.attach(window);

    window.dispatchEvent(new KeyboardEvent("keydown", { code }));
    const controls = input.poll(1);

    expect(controls.elevator).toBe(0);
    expect(controls.aileron).toBe(0);
    detach();
  });

  it("starts at the C172 bootstrap throttle and writes it to JSBSim", () => {
    const input = createFlightInputManager();
    const setPropertyValue = vi.fn();
    const sdk = { setPropertyValue } as unknown as JSBSimSdk;

    const controls = input.poll(1 / 60);
    input.apply(sdk, controls);

    expect(controls.throttle).toBe(0.65);
    expect(setPropertyValue).toHaveBeenCalledWith("fcs/throttle-cmd-norm", 0.65);
  });

  it.each([
    [-0.5, 0],
    [0.72, 0.72],
    [1.5, 1],
  ])("clamps slider throttle %s to %s", (requested, expected) => {
    const input = createFlightInputManager();

    input.setThrottle(requested);

    expect(input.poll(1 / 60).throttle).toBe(expected);
  });

  it("notifies pause changes immediately from keyboard and UI, including when rendering is idle", () => {
    const onPausedChange = vi.fn();
    const input = createFlightInputManager({ onPausedChange });
    const detach = input.attach(window);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP" }));
    expect(onPausedChange).toHaveBeenLastCalledWith(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP", repeat: true }));
    expect(onPausedChange).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP" }));
    expect(onPausedChange).toHaveBeenLastCalledWith(false);
    input.setPaused(true);
    input.setPaused(true);
    expect(onPausedChange).toHaveBeenCalledTimes(3);
    detach();
  });

  it("raises throttle while Shift is held", () => {
    const input = createFlightInputManager();
    const detach = input.attach(window);

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ShiftLeft" }));
    const controls = input.poll(0.5);

    expect(controls.throttle).toBeCloseTo(0.9);
    detach();
  });

  it("releases held controls and allows typing in the Location panel without flying or pausing", () => {
    const input = createFlightInputManager();
    const detach = input.attach(window);
    const search = document.createElement("input");
    document.body.append(search);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    expect(input.poll(1).elevator).toBe(1);
    search.focus();
    expect(input.poll(1).elevator).toBe(0);
    for (const code of ["KeyW", "KeyA", "KeyP"]) {
      const event = new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true });
      search.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(input.poll(1).aileron).toBe(0);
    expect(input.poll(1).elevator).toBe(0);
    expect(input.isPaused()).toBe(false);
    detach();
    search.remove();
  });
});

describe("flightInputManager phone handoff", () => {
  const transferred: ControlSurfaceState = {
    elevator: -0.6, aileron: 0.7, rudder: 0.5,
    throttle: 0.83, pitchTrim: -0.2, flaps: 0.33, brake: 1,
  };
  const centered: ControlSurfaceState = { ...transferred, elevator: 0, aileron: 0, rudder: 0, brake: 0 };
  const cleanups: (() => void)[] = [];

  function connectPad(axes = [0, 0, 0, 0.6]) {
    const pad = {
      id: "test flight controls", index: 0, axes,
      buttons: Array.from({ length: 8 }, () => ({ value: 0, pressed: false })),
    };
    vi.mocked(navigator.getGamepads).mockReturnValue([pad as unknown as Gamepad]);
    return pad;
  }

  function withSynchronousTakeover() {
    const onLocalInput = vi.fn(() => {
      input.adoptControls(transferred);
      input.setRemoteOwned(false);
    });
    const input: FlightInputManager = createFlightInputManager({ onLocalInput });
    cleanups.push(input.attach(window));
    input.setRemoteOwned(true);
    return { input, onLocalInput };
  }

  beforeEach(() => {
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: vi.fn(() => []) });
  });

  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    vi.restoreAllMocks();
  });

  it("adopts persistent settings, neutralizes old held keys, and ignores their remaining repeats", () => {
    const onLocalInput = vi.fn();
    const input = createFlightInputManager({ onLocalInput });
    cleanups.push(input.attach(window));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ShiftLeft" }));
    expect(input.hasActiveFlightInput()).toBe(true);
    input.poll(0.5);
    onLocalInput.mockClear();

    input.adoptControls(transferred);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", repeat: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ShiftLeft", repeat: true }));

    expect(onLocalInput).not.toHaveBeenCalled();
    expect(input.poll(1)).toEqual(centered);
    expect(input.hasActiveFlightInput()).toBe(false);
  });

  it("revokes before applying a fresh keyboard command and preserves its first press", () => {
    connectPad();
    const { input, onLocalInput } = withSynchronousTakeover();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" }));
    expect(onLocalInput).toHaveBeenCalledTimes(1);
    expect(input.poll(1)).toEqual({ ...centered, aileron: 1 });
  });

  it("transfers throttle before integrating the initiating throttle key", () => {
    connectPad();
    const { input } = withSynchronousTakeover();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ControlLeft" }));
    expect(input.poll(0.2)).toEqual({ ...centered, throttle: 0.73 });
  });

  it.each([
    ["setThrottle", 0.41, { throttle: 0.41 }],
    ["setPitchTrim", 0.12, { pitchTrim: 0.12 }],
  ] as const)("revokes before applying %s", (method, value, expected) => {
    connectPad();
    const { input, onLocalInput } = withSynchronousTakeover();
    input[method](value);
    expect(onLocalInput).toHaveBeenCalledTimes(1);
    expect(input.poll(1)).toEqual({ ...centered, ...expected });
  });

  it("applies HUD stick input and clears it on release", () => {
    const input = createFlightInputManager();
    input.setStick(0.6, -0.4);
    expect(input.poll(1)).toMatchObject({ aileron: 0.6, elevator: -0.4 });
    expect(input.hasActiveFlightInput()).toBe(true);
    input.setStick(0, 0);
    expect(input.poll(1)).toMatchObject({ aileron: 0, elevator: 0 });
    expect(input.hasActiveFlightInput()).toBe(false);
  });

  it("revokes before applying setStick", () => {
    connectPad();
    const { input, onLocalInput } = withSynchronousTakeover();
    input.setStick(0.5, 0.25);
    expect(onLocalInput).toHaveBeenCalledTimes(1);
    expect(input.poll(1)).toEqual({ ...centered, aileron: 0.5, elevator: 0.25 });
  });

  it("does not mistake typing, pause, camera keys, reset, or state adoption for takeover", () => {
    const { input, onLocalInput } = withSynchronousTakeover();
    const search = document.createElement("input");
    document.body.append(search);
    cleanups.push(() => search.remove());
    search.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", bubbles: true }));
    for (const code of ["KeyP", "ArrowUp", "ArrowLeft", "Escape"]) {
      window.dispatchEvent(new KeyboardEvent("keydown", { code }));
    }
    input.resetControls(0.4);
    input.adoptControls(transferred);
    expect(input.isPaused()).toBe(true);
    expect(onLocalInput).not.toHaveBeenCalled();
  });

  it("suppresses local state polling while phone-owned and returns defensive copies", () => {
    const pad = connectPad();
    const input = createFlightInputManager();
    input.adoptControls(transferred);
    input.setRemoteOwned(true);
    pad.axes = [0.8, -0.8, 0.3, -1];
    pad.buttons[0] = { value: 1, pressed: true };
    expect(input.poll(1)).toEqual(centered);
    input.getControls().throttle = 0;
    input.poll(1).flaps = 0;
    expect(input.getControls()).toEqual(centered);
  });

  it("keeps an idle gamepad from changing transferred throttle until its own axis moves", () => {
    const pad = connectPad();
    const { input, onLocalInput } = withSynchronousTakeover();
    input.adoptControls(transferred);
    for (let frame = 0; frame < 60; frame += 1) input.poll(1 / 60);
    expect(onLocalInput).not.toHaveBeenCalled();
    expect(input.getControls()).toEqual(centered);

    pad.axes[0] = 0.6;
    expect(input.poll(1)).toEqual({ ...centered, aileron: 0.6 });
    expect(onLocalInput).toHaveBeenCalledTimes(1);
    // Normal gamepad sampling continues after takeover, but its throttle must
    // remain untouched until that particular physical axis moves deliberately.
    pad.axes[3] = 0.65;
    expect(input.poll(1).throttle).toBe(0.83);
    pad.axes[3] = 0.4;
    expect(input.poll(1).throttle).toBeCloseTo(0.3);
  });

  it("ignores resting noise but detects accumulated deliberate axis movement", () => {
    const pad = connectPad();
    const { input, onLocalInput } = withSynchronousTakeover();
    for (const value of [0.02, -0.04, 0.06, 0.09, 0.11]) {
      pad.axes[1] = value;
      input.poll(1);
    }
    expect(onLocalInput).not.toHaveBeenCalled();
    pad.axes[1] = 0.15;
    expect(input.poll(1).elevator).toBe(-0.15);
    expect(onLocalInput).toHaveBeenCalledTimes(1);
  });

  it("takes over on a fresh button press, but not a held button or its release", () => {
    const pad = connectPad();
    pad.buttons[0] = { value: 1, pressed: true };
    const { input, onLocalInput } = withSynchronousTakeover();
    input.poll(1);
    pad.buttons[0] = { value: 0, pressed: false };
    input.poll(1);
    expect(onLocalInput).not.toHaveBeenCalled();
    pad.buttons[0] = { value: 1, pressed: true };
    expect(input.poll(1)).toEqual({ ...centered, brake: 1 });
    expect(onLocalInput).toHaveBeenCalledTimes(1);
  });

  it("does not let plugging in a resting gamepad claim phone authority", () => {
    const { input, onLocalInput } = withSynchronousTakeover();
    const pad = connectPad([0.3, 0.2, 0, -0.6]);
    input.poll(1);
    expect(onLocalInput).not.toHaveBeenCalled();
    pad.axes[0] = 0.5;
    expect(input.poll(1).aileron).toBe(0.5);
    expect(onLocalInput).toHaveBeenCalledTimes(1);
  });

  it("checks handoff readiness without advancing smoothing or throttle", () => {
    const pad = connectPad();
    const input = createFlightInputManager();
    expect(input.hasActiveFlightInput()).toBe(false);
    pad.axes[0] = 0.5;
    expect(input.hasActiveFlightInput()).toBe(true);
    expect(input.getControls().aileron).toBe(0);
    expect(input.getControls().throttle).toBe(0.65);
    pad.axes[0] = 0;
    cleanups.push(input.attach(window));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ShiftLeft" }));
    expect(input.hasActiveFlightInput()).toBe(true);
    expect(input.getControls().throttle).toBe(0.65);
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ShiftLeft" }));
    expect(input.hasActiveFlightInput()).toBe(false);
  });

  it("keeps the local apply paused guard after extracting the common writer", () => {
    const input = createFlightInputManager();
    const setPropertyValue = vi.fn();
    input.setPaused(true);
    input.apply({ setPropertyValue } as unknown as JSBSimSdk, transferred);
    expect(setPropertyValue).not.toHaveBeenCalled();
  });

  it("resets adopted state without reapplying a previously activated resting gamepad throttle", () => {
    const pad = connectPad();
    const input = createFlightInputManager();
    input.adoptControls(transferred);
    pad.axes[3] = -0.8;
    expect(input.poll(1).throttle).toBeCloseTo(0.9);
    input.resetControls(0);
    expect(input.poll(1)).toEqual({ elevator: 0, aileron: 0, rudder: 0, throttle: 0, pitchTrim: 0, flaps: 0, brake: 0 });
  });
});
