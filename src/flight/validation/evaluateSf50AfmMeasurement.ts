import type { Sf50AfmReferenceCase } from "./sf50AfmReferenceCases.ts";

type ExpectedConditions = Sf50AfmReferenceCase["conditions"];
export type Sf50MeasuredConditions = {
  [Key in keyof ExpectedConditions]?: ExpectedConditions[Key] extends number ? number : ExpectedConditions[Key];
};
export interface Sf50AfmMeasurement {
  caseId: string;
  conditions: Sf50MeasuredConditions;
  groundRollFt: number | null;
  totalDistanceFt: number | null;
  completed: boolean;
  unmatchedConditions: readonly string[];
}
/** Numerical setup allowances chosen by this project, not AFM tolerances. */
export const SF50_CONDITION_TOLERANCES = {
  weightLb: 1, pressureAltitudeFt: 5, temperatureC: 0.25,
  flapsNorm: 0.005, windKts: 0.1, runwaySlopePercent: 0.01,
  referenceSpeedKias: 0.5,
} as const;

export function evaluateSf50AfmMeasurement(reference: Sf50AfmReferenceCase, measurement: Sf50AfmMeasurement) {
  if (reference.id !== measurement.caseId) throw new Error("Measurement case ID does not match the reference.");
  const blockers = [...measurement.unmatchedConditions];
  for (const key of Object.keys(reference.conditions) as (keyof ExpectedConditions)[]) {
    const expected = reference.conditions[key];
    // Unspecified source conditions are not fabricated requirements.
    if (expected === null || expected === "not-specified") continue;
    const actual = measurement.conditions[key];
    if (actual === undefined || actual === null) {
      blockers.push("Missing observed condition: " + key);
      continue;
    }
    if (typeof expected === "number") {
      const tolerance = SF50_CONDITION_TOLERANCES[key as keyof typeof SF50_CONDITION_TOLERANCES] ?? 0;
      if (typeof actual !== "number" || !Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
        blockers.push("Observed condition differs from reference: " + key);
      }
    } else if (actual !== expected) blockers.push("Observed condition differs from reference: " + key);
  }
  const metrics = (["groundRollFt", "totalDistanceFt", "airborneDistanceFt"] as const).map(name => {
    const actual = name === "airborneDistanceFt" ?
      measurement.totalDistanceFt !== null && measurement.groundRollFt !== null ?
        measurement.totalDistanceFt - measurement.groundRollFt : null : measurement[name];
    const expected = name === "airborneDistanceFt" ?
      reference.targets.totalDistanceFt - reference.targets.groundRollFt : reference.targets[name];
    const valid = actual !== null && Number.isFinite(actual) && actual >= 0;
    const relativeError = valid ? (actual! - expected) / expected : null;
    return { name, expected, actual, relativeError,
      basis: name === "airborneDistanceFt" ? "Derived as total minus ground roll for both AFM and measurement" : "AFM table distance",
      passed: relativeError !== null && Math.abs(relativeError) <= reference.relativeTolerance };
  });
  const status = !measurement.completed || metrics.some(metric => metric.relativeError === null) ? "incomplete" :
    blockers.length ? "blocked" : metrics.every(metric => metric.passed) ? "pass" : "fail";
  return { caseId: reference.id, phase: reference.phase, role: reference.role, status,
    blockers, metrics, conditionTolerances: SF50_CONDITION_TOLERANCES,
    relativeTolerance: reference.relativeTolerance };
}
