import { describe, expect, it } from "vitest";
import { automaticFlapCommand } from "./autoFlaps";
import { FDM_PROFILES, getFdmProfile } from "../jsbsim/fdmProfiles";

const approach = { airspeedKts: 70, throttleNorm: 0.3, gearDown: true, onGround: false, currentCommand: 0 };
function assist(id: "cessna-172" | "cirrus-vision-jet") {
  const result = getFdmProfile(id).automaticFlaps;
  if (result.kind !== "assist") throw new Error("Expected pilot-assist schedule");
  return result;
}

describe("automatic flap pilot assist", () => {
  it("keeps each aircraft's approach commands below its declared flap speed limits", () => {
    const c172 = assist("cessna-172");
    const sf50 = assist("cirrus-vision-jet");
    for (let speed = 0; speed <= 220; speed += 0.5) {
      const c = automaticFlapCommand(c172, { ...approach, airspeedKts: speed });
      const s = automaticFlapCommand(sf50, { ...approach, airspeedKts: speed });
      if (speed >= 85) expect(c).toBeLessThanOrEqual(1 / 3);
      if (speed >= 110) expect(c).toBe(0);
      if (speed >= 150) expect(s).toBeLessThanOrEqual(0.5);
      if (speed >= 190) expect(s).toBe(0);
    }
  });

  it("uses takeoff flap at takeoff power, retracts during climb, and retains landing flap on rollout", () => {
    const sf50 = assist("cirrus-vision-jet");
    expect(automaticFlapCommand(sf50, { ...approach, onGround: true, throttleNorm: 1 })).toBe(0.5);
    expect(automaticFlapCommand(sf50, { ...approach, airspeedKts: 115, throttleNorm: 1 })).toBe(0);
    expect(automaticFlapCommand(sf50, { ...approach, onGround: true, currentCommand: 1 })).toBe(1);
    expect(automaticFlapCommand(assist("cessna-172"), { ...approach, throttleNorm: 1 })).toBe(0);
    expect(automaticFlapCommand(sf50, { ...approach, gearDown: false })).toBe(0.5);
  });

  it("holds command on an unknown airspeed instead of interpreting it as a slow approach", () => {
    expect(automaticFlapCommand(assist("cirrus-vision-jet"), { ...approach, airspeedKts: NaN, currentCommand: 0.3 })).toBe(0.3);
  });

  it("declares automation for every aircraft while preserving the F35 native scheduler", () => {
    for (const profile of Object.values(FDM_PROFILES)) expect(profile.automaticFlaps).toBeDefined();
    expect(getFdmProfile("f-35b").automaticFlaps).toEqual({ kind: "native", commandProperty: "fcs/flaps-auto-enabled" });
  });
});
