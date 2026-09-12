import { describe, expect, it } from "vitest";
import { SF50_LANDING_PILOT_DEFAULTS, Sf50LandingPilot } from "./sf50LandingPilot";
import { Sf50PitchController } from "./sf50PilotController";

const state = (simTimeSec = 0, groundSpeedFps = 100) => ({
  simTimeSec, groundSpeedFps, northVelocityFps: groundSpeedFps, eastVelocityFps: 0,
  pitchDeg: 3, flightPathAngleDeg: -3, downVelocityFps: 3,
  calibratedAirspeedKts: 70, weightOnWheels: false,
});

describe("SF50 landing pilot", () => {
  it("holds a declared approach path and smoothly shallows the flare target", () => {
    const pilot = new Sf50LandingPilot();
    const approach = pilot.step(state(), 50, false, false, 0.1);
    expect(approach.flightPathTargetDeg).toBeCloseTo(-3);
    expect(approach.targetPitchDeg).toBeCloseTo(3);
    expect(approach.brakeNorm).toBe(0);
    const flare = pilot.step(state(0.1), 1, false, false, 0.1);
    expect(flare.descentTargetFps).toBe(2.5);
    expect(flare.targetPitchDeg).toBeGreaterThan(3);
    expect(flare.targetPitchDeg).toBeLessThanOrEqual(8);
    expect(flare.phase).toBe("flare");
  });

  it("waits for main-wheel contact and the declared delay before building brake demand", () => {
    const pilot = new Sf50LandingPilot();
    for (let tick = 0; tick <= 3; tick++) {
      expect(pilot.step(state(tick / 10), 0, true, true, 0.1).brakeNorm).toBe(0);
    }
    const command = pilot.step(state(0.4), 0, true, true, 0.1);
    expect(command.brakeNorm).toBeGreaterThan(0);
    expect(command.brakeNorm).toBeLessThan(1);
    expect(pilot.step(state(0.5), 0, false, true, 0.1).brakeNorm).toBe(0);
  });

  it("retains a holding demand below the stop threshold", () => {
    const pilot = new Sf50LandingPilot();
    pilot.step(state(), 0, true, true, 0.1);
    const command = pilot.step(state(0.5), 0, true, true, 0.1);
    expect(pilot.step(state(0.6, 0.5), 0, true, true, 0.1).brakeNorm).toBe(command.brakeNorm);
  });

  it("preserves fixed-pitch and immediate full-brake behavior for the v5 baseline", () => {
    const pilot = new Sf50LandingPilot({
      ...SF50_LANDING_PILOT_DEFAULTS, pathMode: "fixed-pitch",
      flareHeightFt: 20, brakeMode: "instant", brakeDelaySec: 0,
    });
    expect(pilot.step(state(), 10, false, false, 0.1).targetPitchDeg).toBe(5);
    const ground = pilot.step(state(0.1), 0, true, true, 0.1);
    expect(ground.targetPitchDeg).toBe(0);
    expect(ground.brakeNorm).toBe(1);
  });

  it("blocks hard touchdowns rather than judging only distance", () => {
    const pilot = new Sf50LandingPilot();
    pilot.step(state(), 5, false, false, 0.1);
    const pitch = new Sf50PitchController().step(5, 3, 0, 0.1);
    pilot.observeResult({ ...state(0.1), weightOnWheels: true, downVelocityFps: 8 }, pitch);
    expect(pilot.snapshot(true, 0).status).toBe("blocked");
    expect(pilot.snapshot(true, 0).blockers.join(" ")).toMatch(/sink rate/);
  });

  it("keeps matched touchdown gates separate from physical friction validation", () => {
    const pilot = new Sf50LandingPilot();
    pilot.step(state(), 5, false, false, 0.1);
    pilot.observeResult({ ...state(0.1), weightOnWheels: true },
      new Sf50PitchController().step(5, 3, 0, 0.1));
    expect(pilot.snapshot(true, 0).status).toBe("touchdown-gates-met");
    expect(pilot.snapshot(true, 0).frictionIdentifiability).toMatch(/cannot identify/);
    expect(pilot.snapshot(true, 1).status).toBe("blocked");
    expect(new Sf50LandingPilot().snapshot(false, 0).status).toBe("blocked");
  });

  it("rejects invalid settings, state and nonadvancing control updates", () => {
    expect(() => new Sf50LandingPilot({ ...SF50_LANDING_PILOT_DEFAULTS, decelerationG: NaN })).toThrow();
    const pilot = new Sf50LandingPilot();
    expect(() => pilot.step(state(), 50, false, false, 0)).toThrow();
    pilot.step(state(), 50, false, false, 0.1);
    expect(() => pilot.step(state(), 50, false, false, 0.1)).toThrow(/advancing/);
  });
});
