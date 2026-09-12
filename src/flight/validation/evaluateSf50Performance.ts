import type { Sf50ReferenceCase } from "./sf50ReferenceData";

export interface Sf50PerformanceMeasurement {
  caseId: string;
  conditions: Sf50ReferenceCase["conditions"];
  groundRollFt: number | null;
  totalDistanceFt: number | null;
  completed: boolean;
  /** Any unmatched source condition prevents a validation pass. */
  unmatchedConditions: readonly string[];
}

export function evaluateSf50Performance(reference: Sf50ReferenceCase, measurement: Sf50PerformanceMeasurement) {
  if (measurement.caseId !== reference.id) throw new Error("Reference and measurement case IDs differ.");
  const mismatches = Object.entries(reference.conditions).filter(([key, expected]) => {
    const actual = measurement.conditions[key as keyof Sf50ReferenceCase["conditions"]];
    return typeof expected === "number" && typeof actual === "number"
      ? !Number.isFinite(actual) || Math.abs(actual - expected) > 1e-6
      : actual !== expected;
  }).map(([key]) => "Condition differs: " + key);
  const metrics = (["groundRollFt", "totalDistanceFt"] as const).map(name => {
    const actual = measurement[name];
    const expected = reference.targets[name];
    const valid = actual !== null && Number.isFinite(actual) && actual >= 0;
    const relativeError = valid ? (actual - expected) / expected : null;
    return { name, expected, actual, relativeError,
      withinTolerance: relativeError !== null && Math.abs(relativeError) <= reference.relativeTolerance };
  });
  const blockers = [...mismatches, ...measurement.unmatchedConditions];
  const status = !measurement.completed || metrics.some(metric => metric.relativeError === null) ? "incomplete"
    : blockers.length ? "blocked"
    : metrics.every(metric => metric.withinTolerance) ? "pass" : "fail";
  return { caseId: reference.id, role: reference.role, status, source: reference.source,
    toleranceBasis: "Project development tolerance, not an AFM or certification allowance",
    relativeTolerance: reference.relativeTolerance, blockers, metrics };
}
