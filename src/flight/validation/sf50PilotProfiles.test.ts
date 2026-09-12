import { describe, expect, it } from "vitest";
import { getSf50PilotProfile } from "./sf50PilotProfiles";
import { SF50_PITCH_CONTROLLER, Sf50PitchController } from "./sf50PilotController";
import { selectSf50AfmReferenceCases } from "./sf50AfmReferenceCases";

describe("SF50 pilot profiles and calibration selection", () => {
  it("separates takeoff and landing response gains without relaxing tracking gates", () => {
    const profile = getSf50PilotProfile();
    expect(new Sf50PitchController(profile.takeoffPitch).step(5, 0, 0, 1 / 120).commandedPitchRateDegSec).toBe(4);
    expect(new Sf50PitchController(profile.landingPitch).step(5, 0, 0, 1 / 120).commandedPitchRateDegSec).toBe(3);
    expect(SF50_PITCH_CONTROLLER.takeoffTrackingToleranceDeg).toBe(1);
    expect(SF50_PITCH_CONTROLLER.takeoffSettlingAllowanceSec).toBe(5);
    expect(Object.isFrozen(profile.landing)).toBe(true);
  });
  it("retains baseline and open-loop friction diagnostics", () => {
    expect(getSf50PilotProfile("baseline-v5").landing.brakeMode).toBe("instant");
    expect(getSf50PilotProfile("landing-full-brake").landing.brakeMode).toBe("ramp");
    expect(getSf50PilotProfile("landing-gentle").landing.decelerationG).toBe(0.14);
    expect(getSf50PilotProfile("landing-firm").landing.decelerationG).toBe(0.22);
  });
  it("fails closed on unknown profiles or invalid gains", () => {
    expect(() => getSf50PilotProfile("typo")).toThrow(/Unknown/);
    expect(() => new Sf50PitchController({ pitchRateIntegralGain: -1 })).toThrow();
  });
  it("selects calibration cases without silently consuming holdouts", () => {
    const calibration = selectSf50AfmReferenceCases("calibration");
    expect(calibration).toHaveLength(2);
    expect(calibration.every(row => row.role === "calibration" && row.conditions.pressureAltitudeFt === 0)).toBe(true);
    expect(selectSf50AfmReferenceCases("holdout")).toHaveLength(10);
    expect(selectSf50AfmReferenceCases("all")).toHaveLength(12);
    expect(() => selectSf50AfmReferenceCases("calbration")).toThrow(/Unknown/);
  });
});
