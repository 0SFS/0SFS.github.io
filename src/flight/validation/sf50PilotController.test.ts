import { describe, expect, it } from "vitest";
import {
  SF50_PITCH_CONTROLLER, Sf50PitchController, Sf50TakeoffPitchAudit,
} from "./sf50PilotController";

describe("SF50 diagnostic pitch pilot", () => {
  it("commands nose-up elevator and bounds the requested rate", () => {
    const command = new Sf50PitchController().step(5, 0, 0, 1 / 120);
    expect(command.elevatorNorm).toBeLessThan(0);
    expect(command.commandedPitchRateDegSec).toBe(3);
    expect(new Sf50PitchController().step(5, 5, 0.1, 1 / 120).elevatorNorm).toBeGreaterThan(0);
  });

  it("removes steady pitch error in a synthetic plant with a nose-down bias", () => {
    // A controller regression only. This is not an SF50 aerodynamic model.
    const controller = new Sf50PitchController();
    const dt = 1 / 120;
    let pitchDeg = 0;
    let rateDegSec = 0;
    for (let tick = 0; tick < 20 * 120; tick++) {
      const command = controller.step(5, pitchDeg, rateDegSec * Math.PI / 180, dt);
      expect(Math.abs(command.commandedPitchRateDegSec)).toBeLessThanOrEqual(3);
      rateDegSec += (-9 * command.elevatorNorm - 3 - 1.5 * rateDegSec) * dt;
      pitchDeg += rateDegSec * dt;
    }
    expect(Math.abs(pitchDeg - 5)).toBeLessThan(0.2);
    expect(Math.abs(rateDegSec)).toBeLessThan(0.1);
  });

  it("prevents blocked-actuator windup and reverses without unwinding a large hidden bias", () => {
    const controller = new Sf50PitchController();
    let command = controller.step(5, 0, 0, 1 / 120);
    for (let tick = 0; tick < 20 * 120; tick++) command = controller.step(5, 0, 0, 1 / 120);
    expect(command.nearElevatorLimit).toBe(true);
    expect(command.integralNoseUpNorm).toBeLessThanOrEqual(0.26);
    expect(controller.step(-5, 0, 0, 1 / 120).elevatorNorm).toBeGreaterThan(0.4);
    controller.reset();
    expect(controller.step(5, 0, 0, 1 / 120)).toEqual(new Sf50PitchController().step(5, 0, 0, 1 / 120));
  });

  it.each([0, -1, NaN, Infinity])("rejects unusable timesteps: %s", dt => {
    expect(() => new Sf50PitchController().step(5, 0, 0, dt)).toThrow(/timestep/);
  });
});

describe("takeoff pitch tracking gate", () => {
  const command = new Sf50PitchController().step(5, 0, 0, 1 / 120);

  it("blocks the observed v4 failure independently of distance results", () => {
    const audit = new Sf50TakeoffPitchAudit(5);
    audit.startRotation(147.5);
    audit.observe({ simTimeSec: 156.3, pitchDeg: 0.56861, weightOnWheels: false }, command);
    audit.observe({ simTimeSec: 163.85, pitchDeg: 2.43966, weightOnWheels: false }, command);
    const result = audit.snapshot(true);
    expect(result.status).toBe("blocked");
    expect(result.blockers).toHaveLength(3);
    expect(result.firstAirborne?.errorDeg).toBeCloseTo(4.43139);
    expect(result.screen?.passed).toBe(false);
  });

  it("allows the rotation transient but requires the sampled liftoff and screen targets", () => {
    const audit = new Sf50TakeoffPitchAudit(5);
    audit.startRotation(10);
    audit.observe({ simTimeSec: 10.5, pitchDeg: 0.5, weightOnWheels: true }, command);
    audit.observe({ simTimeSec: 13, pitchDeg: 4.5, weightOnWheels: false }, command);
    audit.observe({ simTimeSec: 16, pitchDeg: 5, weightOnWheels: false }, command);
    expect(audit.snapshot(true).status).toBe("tracking-gates-met");
    expect(audit.snapshot(true).settledSamples).toBe(1);
    expect(audit.snapshot(false).status).toBe("blocked");
    expect(SF50_PITCH_CONTROLLER.takeoffTrackingToleranceDeg).toBe(1);
  });

  it("does not treat missing samples as successful tracking", () => {
    const result = new Sf50TakeoffPitchAudit(5).snapshot(true);
    expect(result.status).toBe("blocked");
    expect(result.settledRmsErrorDeg).toBeNull();
    expect(result.firstAirborne).toBeNull();
  });
});
