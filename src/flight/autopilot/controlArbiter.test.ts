import { describe, expect, it } from "vitest";
import type { ControlSurfaceState } from "../input/flightInputManager";
import { STICK_DEADBAND } from "../input/autoTrim";
import {
  createControlArbiterState,
  setArbiterEngaged,
  stepControlArbiter,
  type ControlArbiterFlight,
  type ControlArbiterInput,
} from "./controlArbiter";
import { DEFAULT_AUTOPILOT_SETTINGS, patchAutopilotSettings } from "./autopilotSettings";
import { DISCONNECTED_ARDUPILOT_STATUS, type ArduPilotStatus } from "./ardupilotStatus";

const PILOT: ControlSurfaceState = {
  elevator: 0, aileron: 0, rudder: 0, throttle: 0.55,
  pitchTrim: 0.1, rollTrim: -0.05, flaps: 0.25, brake: 0.2,
};

const FLIGHT: ControlArbiterFlight = {
  dt: 1 / 120,
  onGround: false,
  rollRad: 0,
  rollRateRad: 0,
  pitchRad: 0,
  pitchRateRad: 0,
  headingRad: 0,
  yawRateRad: 0,
  airspeedKts: 95,
};

function input(partial: Partial<ControlArbiterInput> = {}): ControlArbiterInput {
  return {
    settings: { ...DEFAULT_AUTOPILOT_SETTINGS, axes: { ...DEFAULT_AUTOPILOT_SETTINGS.axes } },
    ardupilot: DISCONNECTED_ARDUPILOT_STATUS,
    pilot: { ...PILOT },
    gearDownNorm: 1,
    flight: { ...FLIGHT },
    ...partial,
    pilot: { ...PILOT, ...partial.pilot },
    flight: { ...FLIGHT, ...partial.flight },
  };
}

function engage() {
  return setArbiterEngaged(createControlArbiterState(1, PILOT.flaps, PILOT.throttle), true);
}

describe("control arbiter ownership", () => {
  it("leaves every axis with the pilot while the master is off", () => {
    const { result } = stepControlArbiter(createControlArbiterState(), input());
    expect(result.engaged).toBe(false);
    expect(Object.values(result.owners).every((owner) => owner === "pilot")).toBe(true);
    expect(result.controls).toEqual(PILOT);
    expect(result.gearDownNorm).toBe(1);
  });

  it("hands the configured package to our AP when engaged in the air with a quiet stick", () => {
    const primed = stepControlArbiter(engage(), input());
    const { result } = stepControlArbiter(primed.state, input({
      flight: { ...FLIGHT, rollRad: 0.2 },
    }));
    expect(result.engaged).toBe(true);
    expect(result.owners).toEqual({
      roll: "our-ap", pitch: "our-ap", yaw: "our-ap",
      throttle: "our-ap", gear: "our-ap", flaps: "our-ap",
    });
    expect(result.controls.aileron).toBeLessThan(0);
    expect(result.controls.brake).toBe(PILOT.brake);
    expect(result.controls.flaps).toBe(PILOT.flaps);
    expect(result.gearDownNorm).toBe(1);
  });

  it("keeps unchecked axes with the pilot during a master engage", () => {
    const settings = patchAutopilotSettings(DEFAULT_AUTOPILOT_SETTINGS, {
      axes: { roll: true, pitch: false, yaw: false, throttle: false, gear: false, flaps: false },
    });
    const primed = stepControlArbiter(engage(), input({ settings, pilot: { ...PILOT, aileron: 0, elevator: 0.4 } }));
    const { result } = stepControlArbiter(primed.state, input({
      settings,
      pilot: { ...PILOT, elevator: 0.4 },
      flight: { ...FLIGHT, rollRad: 0.2 },
    }));
    expect(result.owners.roll).toBe("our-ap");
    expect(result.owners.pitch).toBe("pilot");
    expect(result.owners.throttle).toBe("pilot");
    expect(result.controls.elevator).toBe(0.4);
    expect(result.controls.throttle).toBe(PILOT.throttle);
    expect(result.controls.aileron).toBeLessThan(0);
  });

  it("returns an axis to the pilot while that stick is deflected, then recaptures", () => {
    const primed = stepControlArbiter(engage(), input());
    const yielded = stepControlArbiter(primed.state, input({
      pilot: { ...PILOT, aileron: STICK_DEADBAND + 0.2 },
      flight: { ...FLIGHT, rollRad: 0.3 },
    }));
    expect(yielded.result.owners.roll).toBe("pilot");
    expect(yielded.result.controls.aileron).toBeCloseTo(STICK_DEADBAND + 0.2);
    const recaptured = stepControlArbiter(yielded.state, input({
      flight: { ...FLIGHT, rollRad: 0.3 },
    }));
    expect(recaptured.result.owners.roll).toBe("our-ap");
    expect(recaptured.result.controls.aileron).toBe(0);
  });

  it("does not let ArduPilot own axes when it is not connected", () => {
    const settings = patchAutopilotSettings(DEFAULT_AUTOPILOT_SETTINGS, { backend: "ardupilot" });
    const { result } = stepControlArbiter(engage(), input({ settings }));
    expect(result.engaged).toBe(false);
    expect(result.blockedReason).toMatch(/not connected/i);
    expect(Object.values(result.owners).every((owner) => owner === "pilot")).toBe(true);
    expect(result.controls.aileron).toBe(0);
    expect(result.controls.throttle).toBe(PILOT.throttle);
  });

  it("still refuses ArduPilot that is connected but has no actuator stream", () => {
    const settings = patchAutopilotSettings(DEFAULT_AUTOPILOT_SETTINGS, { backend: "ardupilot" });
    const ardupilot: ArduPilotStatus = {
      ...DISCONNECTED_ARDUPILOT_STATUS,
      link: "connected",
      identity: "ArduPlane",
      mode: "FBWA",
      ready: true,
      hasActuators: false,
      detail: "Connected, waiting for servo output.",
    };
    const { result } = stepControlArbiter(engage(), input({ settings, ardupilot }));
    expect(result.engaged).toBe(false);
    expect(result.owners.roll).toBe("pilot");
  });

  it("yields throttle when the lever moves, and yields flaps the same way", () => {
    const primed = stepControlArbiter(engage(), input());
    const held = stepControlArbiter(primed.state, input());
    expect(held.result.owners.flaps).toBe("our-ap");
    const moved = stepControlArbiter(held.state, input({
      pilot: { ...PILOT, throttle: 0.9, flaps: 1 },
    }));
    expect(moved.result.owners.throttle).toBe("pilot");
    expect(moved.result.controls.throttle).toBe(0.9);
    expect(moved.result.owners.flaps).toBe("pilot");
    expect(moved.result.controls.flaps).toBe(1);
  });
});
