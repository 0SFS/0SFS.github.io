/**
 * Published reference targets, NOT model outputs or certified simulator tolerances.
 * Cirrus-authored AFM material is hosted by ManualsLib; page revisions, rather
 * than the mixed-revision cover, identify the source of each table.
 */
export interface Sf50ReferenceCase {
  id: string;
  phase: "takeoff" | "landing";
  role: "calibration" | "holdout";
  source: { document: string; revision: string; page: string; url: string; conditionsUrl: string };
  conditions: {
    weightLb: number;
    pressureAltitudeFt: number;
    temperatureC: number;
    flapsNorm: number;
    gearDown: true;
    windKts: 0;
    runwaySlopePercent: 0;
    runwaySurface: "dry-paved";
    thrust: "takeoff" | "idle";
    bleed: "on" | "not-specified";
    referenceSpeedKias: number | null;
  };
  targets: { groundRollFt: number; totalDistanceFt: number };
  relativeTolerance: number;
}

const takeoffSource = {
  document: "Cirrus SF50 AFM P/N 31452-001",
  revision: "4",
  page: "5-25",
  url: "https://www.manualslib.com/manual/3777690/Cirrus-Vision-Sf50.html?page=383",
  conditionsUrl: "https://www.manualslib.com/manual/3777690/Cirrus-Vision-Sf50.html?page=382",
};
const landingSource = {
  document: "Cirrus SF50 AFM P/N 31452-001",
  revision: "4",
  page: "5-129",
  url: "https://www.manualslib.com/manual/3777690/Cirrus-Vision-Sf50.html?page=487",
  conditionsUrl: "https://www.manualslib.com/manual/3777690/Cirrus-Vision-Sf50.html?page=486",
};

export const SF50_REFERENCE_CASES: readonly Sf50ReferenceCase[] = [
  { id: "takeoff-6000-sl-isa", phase: "takeoff", role: "calibration", source: takeoffSource,
    conditions: { weightLb: 6000, pressureAltitudeFt: 0, temperatureC: 15, flapsNorm: 0.5, gearDown: true,
      windKts: 0, runwaySlopePercent: 0, runwaySurface: "dry-paved", thrust: "takeoff", bleed: "on", referenceSpeedKias: null },
    targets: { groundRollFt: 2036, totalDistanceFt: 3192 }, relativeTolerance: 0.15 },
  { id: "takeoff-6000-1000-isa", phase: "takeoff", role: "holdout", source: takeoffSource,
    conditions: { weightLb: 6000, pressureAltitudeFt: 1000, temperatureC: 13.0188, flapsNorm: 0.5, gearDown: true,
      windKts: 0, runwaySlopePercent: 0, runwaySurface: "dry-paved", thrust: "takeoff", bleed: "on", referenceSpeedKias: null },
    targets: { groundRollFt: 2106, totalDistanceFt: 3302 }, relativeTolerance: 0.15 },
  { id: "landing-5550-sl-isa", phase: "landing", role: "calibration", source: landingSource,
    conditions: { weightLb: 5550, pressureAltitudeFt: 0, temperatureC: 15, flapsNorm: 1, gearDown: true,
      windKts: 0, runwaySlopePercent: 0, runwaySurface: "dry-paved", thrust: "idle", bleed: "not-specified", referenceSpeedKias: 85 },
    targets: { groundRollFt: 1628, totalDistanceFt: 3011 }, relativeTolerance: 0.15 },
  { id: "landing-5550-1000-isa", phase: "landing", role: "holdout", source: landingSource,
    conditions: { weightLb: 5550, pressureAltitudeFt: 1000, temperatureC: 13.0188, flapsNorm: 1, gearDown: true,
      windKts: 0, runwaySlopePercent: 0, runwaySurface: "dry-paved", thrust: "idle", bleed: "not-specified", referenceSpeedKias: 85 },
    targets: { groundRollFt: 1677, totalDistanceFt: 3082 }, relativeTolerance: 0.15 },
];

export const SF50_RATED_THRUST = {
  thrustLb: 1846,
  relativeTolerance: 0.05,
  source: {
    document: "EASA.IM.A.615", issue: "6", date: "2026-06-01", page: 8,
    url: "https://www.easa.europa.eu/en/downloads/24242/en",
  },
} as const;
