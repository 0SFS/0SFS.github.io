import { SF50_AFM_SOURCE, SF50_AFM_PAGES, SF50_ISA_DISTANCE_ROWS } from "./sf50AfmData.ts";

export interface Sf50AfmReferenceCase {
  id: string;
  phase: "takeoff" | "landing";
  role: "calibration" | "holdout";
  source: { document: string; revision: string; page: string; url: string; conditionsUrl: string; sha256: string };
  conditions: {
    weightLb: number; pressureAltitudeFt: number; temperatureC: number;
    flapsNorm: number; gearDown: true; windKts: 0; runwaySlopePercent: 0;
    runwaySurface: "dry-paved"; thrust: "takeoff" | "idle";
    bleed: "on" | "not-specified"; referenceSpeedKias: number | null;
  };
  targets: { groundRollFt: number; totalDistanceFt: number };
  relativeTolerance: number;
}
const manualPage = (page: number) =>
  SF50_AFM_SOURCE.localPath + "#page=" + page;

export const SF50_AFM_REFERENCE_CASES: readonly Sf50AfmReferenceCase[] = SF50_ISA_DISTANCE_ROWS.map(row => {
  const page = SF50_AFM_PAGES[row.source];
  return {
    id: row.phase + "-" + row.weightLb + "lb-" + row.pressureAltitudeFt + "ft-isa",
    phase: row.phase,
    role: row.pressureAltitudeFt === 0 && row.weightLb !== 5500 ? "calibration" : "holdout",
    source: {
      document: SF50_AFM_SOURCE.document, revision: page.revision,
      page: page.printedPage, url: manualPage(page.pdfPage),
      conditionsUrl: manualPage(page.conditionsPdfPage), sha256: SF50_AFM_SOURCE.sha256,
    },
    conditions: {
      weightLb: row.weightLb, pressureAltitudeFt: row.pressureAltitudeFt,
      temperatureC: 15 - 0.0019812 * row.pressureAltitudeFt,
      flapsNorm: row.phase === "landing" ? 1 : 0.5,
      gearDown: true, windKts: 0, runwaySlopePercent: 0, runwaySurface: "dry-paved",
      thrust: row.phase === "landing" ? "idle" : "takeoff",
      bleed: row.phase === "landing" ? "not-specified" : "on",
      referenceSpeedKias: row.phase === "landing" ? 85 : null,
    },
    targets: { groundRollFt: row.groundRollFt, totalDistanceFt: row.totalDistanceFt },
    // Engineering acceptance allowance, not uncertainty published by Cirrus.
    relativeTolerance: 0.15,
  };
});


/** Explicit selection prevents pilot tuning from silently consuming holdouts. */
export function selectSf50AfmReferenceCases(selection: string = "all") {
  if (selection === "all") return SF50_AFM_REFERENCE_CASES;
  if (selection === "calibration" || selection === "holdout") {
    return SF50_AFM_REFERENCE_CASES.filter(row => row.role === selection);
  }
  throw new Error("Unknown SF50 AFM case selection: " + selection);
}
