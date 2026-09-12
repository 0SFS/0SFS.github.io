import { describe, expect, it } from "vitest";
import { SF50_AFM_LOADING } from "./sf50AfmData";
import { sumSf50Loading, sf50ModelCgToFs, sf50CgLimitsAtWeight } from "./sf50Loading";

describe("SF50 loading evidence", () => {
  it("pins arms without fabricating an empty-weight record", () => {
    expect(SF50_AFM_LOADING.stationsFsIn.usableFuel).toBe(203);
    expect(SF50_AFM_LOADING.stationsFsIn.frontOccupants).toBe(132.9);
    expect(SF50_AFM_LOADING.asDeliveredEmptyCgFsIn).toBeNull();
    expect(SF50_AFM_LOADING.asDeliveredEmptyWeightLb).toBeNull();
  });
  it("calculates moments from explicit components, not payload placed at empty CG", () => {
    // Synthetic arithmetic fixture, not a real aircraft loading record.
    const result = sumSf50Loading([
      { label: "Synthetic empty aircraft", weightLb: 3550, fsIn: 195 },
      { label: "Synthetic front occupant", weightLb: 200, fsIn: 132.9 },
      { label: "Fuel", weightLb: 1500, fsIn: 203 },
    ]);
    expect(result.weightLb).toBe(5250);
    expect(result.momentLbIn).toBe(1023330);
    expect(result.cgFsIn).toBeCloseTo(1023330 / 5250);
  });
  it("does not treat model structural X as the AFM fuselage station", () => {
    expect(sf50ModelCgToFs(159.5, null)).toBeNull();
    // A synthetic anchor, not a mapping for the production SF50.
    expect(sf50ModelCgToFs(154, {
      modelForwardCabinBulkheadXIn: 50, evidenceReference: "synthetic test geometry",
    })).toBe(193);
    expect(() => sf50ModelCgToFs(154, {
      modelForwardCabinBulkheadXIn: 50, evidenceReference: "",
    })).toThrow(/documented/);
  });
  it("uses exact source CG rows and declines unsupported weights", () => {
    expect(sf50CgLimitsAtWeight(6000)).toEqual({ weightLb: 6000, forwardFsIn: 192.55, aftFsIn: 198.15 });
    expect(sf50CgLimitsAtWeight(5550)).toEqual({ weightLb: 5550, forwardFsIn: 191.47, aftFsIn: 198.15 });
    expect(sf50CgLimitsAtWeight(5500)).toEqual({ weightLb: 5500, forwardFsIn: 191.35, aftFsIn: 198.15 });
    expect(sf50CgLimitsAtWeight(5250)).toBeNull();
  });
  it("rejects unusable loading inputs", () => {
    expect(() => sumSf50Loading([])).toThrow(/positive/);
    expect(() => sumSf50Loading([{ label: "Invalid", weightLb: -1, fsIn: 190 }])).toThrow(/nonnegative/);
    expect(() => sumSf50Loading([{ label: "Invalid", weightLb: 1, fsIn: NaN }])).toThrow(/finite/);
  });
});
