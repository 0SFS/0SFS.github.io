import { describe, expect, it } from "vitest";
import { evaluateSf50Performance, type Sf50PerformanceMeasurement } from "./evaluateSf50Performance";
import { SF50_REFERENCE_CASES } from "./sf50ReferenceData";

const reference = SF50_REFERENCE_CASES[0]!;
function measured(overrides: Partial<Sf50PerformanceMeasurement> = {}): Sf50PerformanceMeasurement {
  return { caseId: reference.id, conditions: { ...reference.conditions }, ...reference.targets,
    completed: true, unmatchedConditions: [], ...overrides };
}

describe("source-backed SF50 performance acceptance", () => {
  it("accepts matching measurements, not just correct control signs", () => {
    expect(evaluateSf50Performance(reference, measured()).status).toBe("pass");
    expect(evaluateSf50Performance(reference, measured({ groundRollFt: reference.targets.groundRollFt * 1.3 })).status).toBe("fail");
  });
  it("cannot pass when the scenario did not reach its endpoint", () => {
    expect(evaluateSf50Performance(reference, measured({ completed: false })).status).toBe("incomplete");
    expect(evaluateSf50Performance(reference, measured({ totalDistanceFt: null })).status).toBe("incomplete");
    expect(evaluateSf50Performance(reference, measured({ groundRollFt: Number.NaN })).status).toBe("incomplete");
  });
  it("rejects a weight or atmosphere mismatch even with perfect distances", () => {
    expect(evaluateSf50Performance(reference, measured({
      conditions: { ...reference.conditions, weightLb: 4550 },
    })).status).toBe("blocked");
    expect(evaluateSf50Performance(reference, measured({
      conditions: { ...reference.conditions, temperatureC: 30 },
    })).status).toBe("blocked");
  });
  it("does not certify an approximate procedure by numerical coincidence", () => {
    const result = evaluateSf50Performance(reference, measured({ unmatchedConditions: ["Bleed extraction not calibrated"] }));
    expect(result.status).toBe("blocked");
    expect(result.metrics.every(metric => metric.withinTolerance)).toBe(true);
  });
  it("keeps independent holdout cases and rejects crossed case identities", () => {
    expect(SF50_REFERENCE_CASES.filter(item => item.role === "holdout")).toHaveLength(2);
    expect(() => evaluateSf50Performance(reference, measured({ caseId: "different" }))).toThrow(/IDs/);
  });
});
