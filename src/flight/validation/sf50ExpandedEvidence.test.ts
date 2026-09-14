import { describe, expect, it } from "vitest";
import { SF50_AFM_SOURCE } from "./sf50AfmData";
import {
  compareSf50ProcessedTarget, normalizeSf50Dashboard, processSf50AfmCandidates,
  type Sf50ProcessedTarget,
} from "./sf50ExpandedEvidence";
import type { Sf50EvidenceReview } from "./sf50PublicEvidence";

// Synthetic rows exercise allocation and gating only; they are not AFM targets
// or a qualification of the production corpus's unresolved configuration.
const candidates = () => ({
  schemaVersion: 1,
  source: { document: "Synthetic gate fixture", sha256: SF50_AFM_SOURCE.sha256 },
  cruise: [0, 10].map(deltaIsaC => ({
    pdfPage: 433, printedPage: "synthetic-cruise", pressureAltitudeFt: 5000,
    deltaIsaC, oatC: 5 + deltaIsaC, weightLb: 6000, power: "MCT", n1Pct: 90,
    fuelFlowUsGph: 100, tasKt: 250, specificRangeNmPer10UsGal: 25,
  })),
  integratedClimb: [0, 10].map(deltaIsaC => ({
    pdfPage: 421, printedPage: "synthetic-climb", pressureAltitudeFt: 5000,
    deltaIsaC, oatC: 5 + deltaIsaC, initialWeightLb: 6000, iasKt: 150,
    cumulativeTimeMin: 3, cumulativeFuelUsGal: 7, cumulativeFuelLb: 48,
    cumulativeDistanceNm: 10,
  })),
});
const reviewed: Sf50EvidenceReview = {
  sourceKind: "afm-table", provenanceVerified: true, applicableVariant: true,
  unitsVerified: true, conditionsMatched: true, independentOfCalibration: true,
};
const targetWithKnownConditions = (deltaIsaC = 0): Sf50ProcessedTarget => {
  const target = processSf50AfmCandidates(candidates()).find(row =>
    row.kind === "cruise" && row.conditions.deltaIsaC === deltaIsaC)!;
  return { ...target, conditions: { ...target.conditions, bleed: "synthetic-config", gear: "UP", flapsNorm: 0, antiIce: "OFF" } };
};
const measurementFor = (target: Sf50ProcessedTarget) => ({
  variant: target.variant, conditions: { ...target.conditions }, metrics: { ...target.expected },
});

describe("SF50 processed AFM evidence gates", () => {
  it("reserves complete ISA+10 cruise and climb conditions and preserves separately printed climb units", () => {
    const targets = processSf50AfmCandidates(candidates());
    expect(targets.map(target => [target.kind, target.conditions.deltaIsaC, target.allocation])).toEqual([
      ["cruise", 0, "calibration-candidate"], ["cruise", 10, "within-source-check"],
      ["integrated-climb", 0, "calibration-candidate"], ["integrated-climb", 10, "within-source-check"],
    ]);
    expect(targets[2]?.expected).toEqual({
      cumulativeTimeMin: 3, cumulativeFuelUsGal: 7, cumulativeFuelLb: 48, cumulativeDistanceNm: 10,
    });
    expect(targets.every(target => target.review.independentOfCalibration === false && !target.aircraftValidated)).toBe(true);
  });

  it("keeps unresolved source configuration blocked even with a favorable review and exact numeric residuals", () => {
    const target = processSf50AfmCandidates(candidates())[0]!;
    const result = compareSf50ProcessedTarget(target, measurementFor(target), reviewed, "calibration");
    expect(result.eligibleForComparison).toBe(false);
    expect(result.conditionMismatches).toEqual(["bleed", "gear", "flapsNorm", "antiIce"]);
    expect(result.blockers).toContain("conditionsMatched");
    expect(result.metrics.tasKt?.difference).toBe(0);
    expect(result.comparisonClaim).toBe("diagnostic-only");
  });

  it("allows reviewed calibration candidates but prevents fitting a reserved check or relabeling its allocation", () => {
    const calibration = targetWithKnownConditions();
    expect(compareSf50ProcessedTarget(calibration, measurementFor(calibration), reviewed, "calibration"))
      .toMatchObject({ eligibleForComparison: true, comparisonClaim: "calibration-comparison", aircraftValidated: false });
    const check = targetWithKnownConditions(10);
    const held = compareSf50ProcessedTarget(check, measurementFor(check), reviewed, "calibration");
    expect(held.eligibleForComparison).toBe(false);
    expect(held.blockers).toContain("calibrationAllocation");
    const relabeled = { ...check, allocation: "calibration-candidate" as const };
    const result = compareSf50ProcessedTarget(relabeled, measurementFor(relabeled), reviewed, "calibration");
    expect(result.eligibleForComparison).toBe(false);
    expect(result.blockers).toContain("sourceAllocation");
  });

  it("provides explicit same-source checking without turning eligibility or printed resolution into a pass", () => {
    const target = targetWithKnownConditions(10), measurement = measurementFor(target);
    measurement.metrics.tasKt = target.expected.tasKt! + 50;
    const result = compareSf50ProcessedTarget(target, measurement, reviewed, "within-source-check");
    expect(result).toMatchObject({
      eligibleForComparison: true, comparisonClaim: "within-source-check", purpose: "within-source-check",
      independentOfCalibration: false, aircraftValidated: false,
    });
    expect(result.metrics.tasKt?.difference).toBe(50);
    expect(result).not.toHaveProperty("passed");
    const calibration = targetWithKnownConditions();
    const wrongAllocation = compareSf50ProcessedTarget(calibration, measurementFor(calibration), reviewed, "within-source-check");
    expect(wrongAllocation.eligibleForComparison).toBe(false);
    expect(wrongAllocation.blockers).toContain("withinSourceCheckAllocation");
  });

  it.each([0, 10])("cannot promote ISA+%s same-source rows to independent validation through a review override", deltaIsaC => {
    const target = targetWithKnownConditions(deltaIsaC);
    const result = compareSf50ProcessedTarget(target, measurementFor(target), reviewed);
    expect(result).toMatchObject({
      eligibleForComparison: false, comparisonClaim: "diagnostic-only", purpose: "validation",
      independentOfCalibration: false, aircraftValidated: false,
    });
    expect(result.blockers).toContain("independentOfCalibration");
    expect(result.metrics.tasKt?.difference).toBe(0);
  });

  it.each(["provenanceVerified", "applicableVariant", "unitsVerified", "conditionsMatched"] as const)("still requires the %s review for same-source checks", key => {
      const target = targetWithKnownConditions(10);
      const result = compareSf50ProcessedTarget(target, measurementFor(target), { ...reviewed, [key]: false }, "within-source-check");
      expect(result.eligibleForComparison).toBe(false);
      expect(result.blockers).toContain(key);
    });

  it("rejects a different source identity or variant despite a favorable review", () => {
    const target = targetWithKnownConditions(), measurement = measurementFor(target);
    const changedSource = { ...target, source: { ...target.source, sha256: "unreviewed-revision" } };
    expect(compareSf50ProcessedTarget(changedSource, measurement, reviewed, "calibration").blockers).toContain("provenanceVerified");
    expect(compareSf50ProcessedTarget(target, { ...measurement, variant: "g2+" }, reviewed, "calibration").blockers)
      .toContain("applicableVariant");
    const relabeledVariant = { ...target, variant: "g3" as const };
    expect(compareSf50ProcessedTarget(relabeledVariant, measurementFor(relabeledVariant), reviewed, "calibration").blockers)
      .toContain("applicableVariant");
  });

  it.each([null, undefined, NaN, Infinity, -Infinity, "", "  "])("rejects unknown or invalid target conditions even if the measurement repeats %s", value => {
      const target = targetWithKnownConditions();
      // Exercise JSON/caller boundary failures beyond the static target type.
      target.conditions.bleed = value as Sf50ProcessedTarget["conditions"][string];
      const result = compareSf50ProcessedTarget(target, measurementFor(target), reviewed, "calibration");
      expect(result.eligibleForComparison).toBe(false);
      expect(result.conditionMismatches).toContain("bleed");
    });

  it("rejects missing or mismatched measurement conditions and reports missing metrics without inventing residuals", () => {
    const target = targetWithKnownConditions(), measurement = measurementFor(target);
    delete measurement.conditions.weightLb;
    measurement.conditions.pressureAltitudeFt = 6000;
    delete measurement.metrics.fuelFlowUsGph;
    const result = compareSf50ProcessedTarget(target, measurement, reviewed, "calibration");
    expect(result.eligibleForComparison).toBe(false);
    expect(result.conditionMismatches).toEqual(["pressureAltitudeFt", "weightLb"]);
    expect(result.missingMetrics).toEqual(["fuelFlowUsGph"]);
    expect(result.metrics.fuelFlowUsGph).toEqual({ expected: 100, measured: null, difference: null });
    expect(result.metrics.tasKt?.difference).toBe(0);
  });

  it("does not admit empty target conditions or non-finite target metrics", () => {
    const target = targetWithKnownConditions();
    expect(compareSf50ProcessedTarget({ ...target, conditions: {} }, measurementFor(target), reviewed, "calibration")
      .eligibleForComparison).toBe(false);
    target.expected.tasKt = Infinity;
    const result = compareSf50ProcessedTarget(target, measurementFor(target), reviewed, "calibration");
    expect(result.eligibleForComparison).toBe(false);
    expect(result.invalidExpectedMetrics).toEqual(["tasKt"]);
    expect(result.metrics.tasKt?.difference).toBeNull();
  });

  it("does not qualify a target by deleting its unresolved source condition", () => {
    const target = targetWithKnownConditions();
    delete target.conditions.bleed;
    const result = compareSf50ProcessedTarget(target, measurementFor(target), reviewed, "calibration");
    expect(result.eligibleForComparison).toBe(false);
    expect(result.conditionMismatches).toContain("bleed");
  });
});

const dashboardFixture = () => {
  const channels: Record<string, (number | string | null)[]> = {
    data_time_unix: [1000000000, 1000000006], data_palt: [20000, 20010],
    data_tas: [250, 251], data_n1_1: [90, 90], data_n2_1: [95, 95],
    data_ff_1: [85, null], data_pitch: [2, 2], data_roll: [0, 0],
    data_GPSfix: ["3D", "3D"], data_ApOn: [5, "off"], data_oat: [-20],
  };
  return {
    source: "https://www.flightdata.com/flight/2754779",
    snapshotSha256: "e828d6ece046ffc1092356ce7f586ceca7cc0a34bf53cb1873438e0a34549249",
    series: Object.fromEntries(Object.entries(channels).map(([name, values]) =>
      [name, values.map((value, index) => [1000000000000 + index * 6000, value])])),
  };
};

describe("SF50 dashboard channel qualification", () => {
  it("retains the Celsius observation, unresolved gallon convention and raw automation status", () => {
    const result = normalizeSf50Dashboard(dashboardFixture());
    expect(result.samples[0]).toMatchObject({
      timeSec: 0, fuelFlowUsGph: null,
      extra: { oatC: -20, oatRaw: -20, fuelFlowGalPerHourRaw: 85, apRaw: "5" },
    });
    expect(result.samples[1]).toMatchObject({
      timeSec: 6, fuelFlowUsGph: null,
      extra: { oatC: null, oatRaw: null, fuelFlowGalPerHourRaw: null, apRaw: "off" },
    });
    expect(result.channelUnitReview).toMatchObject({
      oatC: { sourceCaption: "Temp (C)" },
      fuelFlowGalPerHourRaw: { sourceCaption: "Engine 1 gal/Hr", gallonConvention: null },
    });
    expect(result.normalOperationReviewed).toBe(false);
    expect(result.aircraftValidated).toBe(false);
  });

  it("does not transfer snapshot-specific unit conclusions to a different source or revision", () => {
    const input = dashboardFixture();
    expect(() => normalizeSf50Dashboard({ ...input, snapshotSha256: "unreviewed-snapshot" }))
      .toThrow(/Unrecognized public dashboard snapshot/);
    expect(() => normalizeSf50Dashboard({ ...input, source: "https://www.flightdata.com/flight/9999999" }))
      .toThrow(/Unrecognized public dashboard snapshot/);
  });
});
