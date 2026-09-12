import { describe, expect, it } from "vitest";
import { SF50_AFM_SOURCE, SF50_AFM_PROCEDURES, SF50_ISA_DISTANCE_ROWS } from "./sf50AfmData";
import { sf50KiasToKcas, sf50KcasToKias } from "./sf50Airspeed";

describe("archived SF50 AFM extraction", () => {
  it("pins the historical source and table scope", () => {
    expect(SF50_AFM_SOURCE.sha256).toHaveLength(64);
    expect(SF50_AFM_SOURCE.pdfPages).toBe(624);
    expect(SF50_ISA_DISTANCE_ROWS).toHaveLength(12);
    expect(SF50_ISA_DISTANCE_ROWS.every(row => row.totalDistanceFt > row.groundRollFt)).toBe(true);
    expect(SF50_AFM_PROCEDURES.takeoff.pitchTargetDeg).toBe(5);
    expect(SF50_AFM_PROCEDURES.landing.exactBrakeCommand).toBeNull();
  });
  it("converts AFM indicated targets instead of treating CAS as IAS", () => {
    expect(sf50KiasToKcas(85, 1)).toBe(84);
    expect(sf50KcasToKias(84, 1)).toBe(85);
    expect(sf50KiasToKcas(90, 0.5)).toBe(91);
    expect(sf50KcasToKias(91, 0.5)).toBe(90);
  });
  it("does not extrapolate blank cells or invent intermediate-flap data", () => {
    expect(sf50KiasToKcas(60, 0)).toBeNull();
    expect(sf50KiasToKcas(160, 1)).toBeNull();
    expect(sf50KiasToKcas(85, 0.75)).toBeNull();
    expect(() => sf50KiasToKcas(Number.NaN, 1)).toThrow(/finite/);
  });
});
