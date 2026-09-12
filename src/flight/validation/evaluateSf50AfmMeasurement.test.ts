import { describe, expect, it } from "vitest";
import { SF50_AFM_REFERENCE_CASES } from "./sf50AfmReferenceCases";
import { evaluateSf50AfmMeasurement } from "./evaluateSf50AfmMeasurement";

describe("AFM measured-condition evaluator", () => {
  const reference = SF50_AFM_REFERENCE_CASES[0]!;
  const measurement = {
    caseId: reference.id, conditions: { ...reference.conditions },
    ...reference.targets, completed: true, unmatchedConditions: [],
  };
  it("retains altitude and weight holdouts", () => {
    expect(SF50_AFM_REFERENCE_CASES).toHaveLength(12);
    const holdouts = SF50_AFM_REFERENCE_CASES.filter(item => item.role === "holdout");
    expect(holdouts).toHaveLength(10);
    expect(holdouts.some(item => item.conditions.weightLb === 5500)).toBe(true);
    expect(holdouts.some(item => item.conditions.pressureAltitudeFt === 5000)).toBe(true);
  });
  it("does not manufacture a pass when observed conditions are missing", () => {
    const result = evaluateSf50AfmMeasurement(reference, { ...measurement, conditions: {} });
    expect(result.status).toBe("blocked");
    expect(result.blockers).toContain("Missing observed condition: bleed");
  });
  it("allows numerical setup noise but blocks real weight mismatches", () => {
    expect(evaluateSf50AfmMeasurement(reference, {
      ...measurement, conditions: { ...reference.conditions, weightLb: reference.conditions.weightLb + 0.5 },
    }).status).toBe("pass");
    expect(evaluateSf50AfmMeasurement(reference, {
      ...measurement, conditions: { ...reference.conditions, weightLb: reference.conditions.weightLb + 10 },
    }).status).toBe("blocked");
  });
  it("does not loosen the performance tolerance or pass incomplete runs", () => {
    expect(evaluateSf50AfmMeasurement(reference, {
      ...measurement, groundRollFt: reference.targets.groundRollFt * 1.3,
    }).status).toBe("fail");
    expect(evaluateSf50AfmMeasurement(reference, { ...measurement, completed: false }).status).toBe("incomplete");
  });
  it("catches airborne-distance errors hidden by close ground and total metrics", () => {
    const result = evaluateSf50AfmMeasurement(reference, {
      ...measurement, groundRollFt: measurement.groundRollFt * 1.1,
    });
    expect(result.metrics.find(metric => metric.name === "groundRollFt")!.passed).toBe(true);
    expect(result.metrics.find(metric => metric.name === "totalDistanceFt")!.passed).toBe(true);
    expect(result.metrics.find(metric => metric.name === "airborneDistanceFt")!.passed).toBe(false);
    expect(result.status).toBe("fail");
  });
  it("rejects a negative inferred airborne distance as incomplete measurement", () => {
    expect(evaluateSf50AfmMeasurement(reference, {
      ...measurement, groundRollFt: measurement.totalDistanceFt + 1,
    }).status).toBe("incomplete");
  });
});
