import { describe, expect, it } from "vitest";
import { SF50_AFM_LOADING } from "./sf50AfmData";
import { makeSf50SyntheticLoading } from "./sf50SyntheticLoading";

describe("explicitly synthetic SF50 loading candidates", () => {
  it.each([5500, 5550, 6000])("accounts for each component at %s lb without changing the evidence fields", weightLb => {
    const loading = makeSf50SyntheticLoading(weightLb);
    expect(loading.weightLb).toBe(weightLb);
    expect(loading.payloadWeightLb).toBe(weightLb - 3550 - 1500);
    expect(loading.zeroFuelWeightLb).toBeLessThanOrEqual(4900);
    expect(loading.withinSelectedCgEnvelope).toBe(true);
    expect(loading.assumptions.status).toBe("proposed-not-applied-to-native-model");
    expect(loading.assumptions.physicalDatumEstablished).toBe(false);
    expect(SF50_AFM_LOADING.asDeliveredEmptyCgFsIn).toBeNull();
    expect(SF50_AFM_LOADING.asDeliveredEmptyWeightLb).toBeNull();
  });

  it("counts removable seat hardware separately and exposes empty-CG sensitivity", () => {
    const loading = makeSf50SyntheticLoading(6000);
    expect(loading.components.filter(component => component.label.startsWith("Estimated middle") &&
      component.label.includes("seat"))).toHaveLength(3);
    expect(loading.cgFsIn).toBeCloseTo(1157553.5 / 6000);
    expect(loading.emptyCgSensitivity[2]!.loadedCgFsIn - loading.emptyCgSensitivity[0]!.loadedCgFsIn)
      .toBeCloseTo(4 * 3550 / 6000);
  });

  it("declines unsupported weights instead of inserting ballast to force the target", () => {
    expect(() => makeSf50SyntheticLoading(5800)).toThrow(/three extracted/);
  });
});
