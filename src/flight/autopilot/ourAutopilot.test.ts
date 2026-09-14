import { describe, expect, it } from "vitest";
import { STICK_DEADBAND } from "../input/autoTrim";
import { createOurAutopilotState, stepOurAutopilot, type OurAutopilotInput } from "./ourAutopilot";

const AIRBORNE: OurAutopilotInput = {
  dt: 1 / 120,
  onGround: false,
  rollRad: 0,
  rollRateRad: 0,
  pitchRad: 0,
  pitchRateRad: 0,
  headingRad: 0,
  yawRateRad: 0,
  airspeedKts: 90,
  throttle: 0.6,
  aileron: 0,
  elevator: 0,
  rudder: 0,
  active: { roll: true, pitch: true, yaw: true, throttle: true },
  throttleMode: "airspeed",
};

function step(state = createOurAutopilotState(), input: Partial<OurAutopilotInput> = {}) {
  return stepOurAutopilot(state, { ...AIRBORNE, ...input });
}

describe("our autopilot roll / yaw / pitch", () => {
  it("captures the current bank, then rolls left when the right wing drops", () => {
    const held = step(createOurAutopilotState(), { rollRad: 0.1 });
    expect(held.commands.aileron).toBe(0);
    const next = step(held.state, { rollRad: 0.25 });
    expect(next.commands.aileron).not.toBeNull();
    expect(next.commands.aileron!).toBeLessThan(0);
  });

  it("pitches nose-down (positive elevator) when the nose is above the target", () => {
    const held = step(createOurAutopilotState(), { pitchRad: 0.08 });
    const next = step(held.state, { pitchRad: 0.2 });
    expect(next.commands.elevator!).toBeGreaterThan(0);
  });

  it("adds left rudder when heading is right of the captured target", () => {
    const held = step(createOurAutopilotState(), { headingRad: 0.2 });
    const next = step(held.state, { headingRad: 0.45 });
    expect(next.commands.rudder!).toBeLessThan(0);
  });

  it("does not command an axis while that stick is flying it", () => {
    const held = step();
    const next = step(held.state, {
      aileron: STICK_DEADBAND + 0.02,
      elevator: STICK_DEADBAND + 0.02,
      rudder: STICK_DEADBAND + 0.02,
      rollRad: 0.4,
      pitchRad: 0.3,
      headingRad: 1,
    });
    expect(next.commands.aileron).toBeNull();
    expect(next.commands.elevator).toBeNull();
    expect(next.commands.rudder).toBeNull();
  });

  it("does not fly attitude on the ground", () => {
    const held = step();
    const next = step(held.state, { onGround: true, rollRad: 0.4, pitchRad: 0.3, headingRad: 1 });
    expect(next.commands.aileron).toBeNull();
    expect(next.commands.elevator).toBeNull();
    expect(next.commands.rudder).toBeNull();
    expect(next.commands.throttle).toBeNull();
  });
});

describe("our autopilot auto-throttle", () => {
  it("adds throttle when airspeed falls below the captured target", () => {
    const held = step(createOurAutopilotState(), { airspeedKts: 100, throttle: 0.5 });
    expect(held.commands.throttle).toBe(0.5);
    let result = held;
    for (let i = 0; i < 60; i += 1) {
      result = step(result.state, { airspeedKts: 80, throttle: 0.5 });
    }
    expect(result.commands.throttle!).toBeGreaterThan(0.5);
  });

  it("holds the captured lever when mode is hold", () => {
    const held = step(createOurAutopilotState(), { throttleMode: "hold", throttle: 0.42, airspeedKts: 70 });
    const next = step(held.state, { throttleMode: "hold", throttle: 0.9, airspeedKts: 40 });
    expect(next.commands.throttle).toBe(0.42);
  });

  it("leaves inactive axes to the pilot", () => {
    const next = step(createOurAutopilotState(), {
      active: { roll: false, pitch: false, yaw: false, throttle: false },
      rollRad: 0.3,
    });
    expect(next.commands).toEqual({
      aileron: null, elevator: null, rudder: null, throttle: null,
    });
  });
});
