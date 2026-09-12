/**
 * Project-selected baseline surface. These are scenario settings, not measured
 * tire/runway coefficients and not a native material classifier.
 */
export const SF50_DRY_PAVED_SURFACE = {
  solid: true,
  bumpiness: 0,
  staticFrictionFactor: 1,
  rollingFrictionFactor: 1,
  maximumForceLb: Number.MAX_VALUE,
} as const;

export interface RunwayProbeObservation {
  simTimeSec: number;
  latitudeDeg: number;
  longitudeDeg: number;
  altitudeAglFt: number;
  temperatureC: number;
  diagnostics: Readonly<Record<string, number | null>>;
}
interface ProbePosition {
  latitudeDeg: number;
  longitudeDeg: number;
  altitudeMslFt: number;
  terrainElevationFt: number;
}
interface RunwayOrigin {
  latitudeDeg: number;
  longitudeDeg: number;
  terrainElevationFt: number;
  headingDeg: number;
}
export interface Sf50RunwayProbe {
  nominalAlongRunwayFt: number;
  latitudeDeg: number;
  longitudeDeg: number;
  aircraftAglFt: number;
  terrainElevationFt: number | null;
  nativePressureAltitudeFt: number | null;
  temperatureC: number;
}
export interface Sf50RunwaySurvey {
  probes: readonly Sf50RunwayProbe[];
  conditions: { pressureAltitudeFt?: number; temperatureC?: number; runwaySlopePercent?: number };
  blockers: readonly string[];
  coverageFt: number;
  pressureDatum: string;
  slopeBasis: string;
}

const optionalFinite = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * Initial-condition evaluations only, never integrated flight steps.
 * Pressure is sampled within two feet of the runway, not at the airborne
 * 50-foot screen. Keep the measured probe height visible in the evidence.
 */
export function surveySf50Runway(
  initialize: (position: ProbePosition) => RunwayProbeObservation,
  origin: RunwayOrigin,
): Sf50RunwaySurvey {
  const radians = Math.PI / 180;
  const latitude = origin.latitudeDeg * radians;
  const heading = origin.headingDeg * radians;
  // Same WGS84 axes as native FGInertial. Local placement is approximate;
  // offsets are labelled nominal, and only a level-runway fixture is accepted.
  const a = 20925646.32546, b = 20855486.5951;
  const eccentricitySquared = 1 - b * b / (a * a);
  const denominator = 1 - eccentricitySquared * Math.sin(latitude) ** 2;
  const meridionalRadius = a * (1 - eccentricitySquared) / denominator ** 1.5;
  const primeVerticalRadius = a / Math.sqrt(denominator);
  if (Math.abs(Math.cos(latitude)) < 0.01) throw new Error("Runway survey does not support polar placement.");
  const probes: Sf50RunwayProbe[] = [];
  const blockers: string[] = [];
  for (const offset of [0, 2000, 4000, 6000, 8000]) {
    let position: ProbePosition = {
      latitudeDeg: origin.latitudeDeg + offset * Math.cos(heading) / meridionalRadius / radians,
      longitudeDeg: origin.longitudeDeg + offset * Math.sin(heading) / (primeVerticalRadius * Math.cos(latitude)) / radians,
      altitudeMslFt: origin.terrainElevationFt + 1,
      terrainElevationFt: origin.terrainElevationFt,
    };
    let observed = initialize(position);
    if (Math.abs(observed.simTimeSec) > 1e-8 || !Number.isFinite(observed.simTimeSec)) {
      throw new Error("Runway probes must use zero-time initialization.");
    }
    if (Number.isFinite(observed.altitudeAglFt) && Math.abs(observed.altitudeAglFt - 1) > 0.005) {
      position = { ...position, altitudeMslFt: position.altitudeMslFt + 1 - observed.altitudeAglFt };
      observed = initialize(position);
      if (Math.abs(observed.simTimeSec) > 1e-8 || !Number.isFinite(observed.simTimeSec)) {
        throw new Error("Runway probes must use zero-time initialization.");
      }
    }
    const validHeight = Number.isFinite(observed.altitudeAglFt) && observed.altitudeAglFt >= 0 && observed.altitudeAglFt <= 2;
    if (!validHeight) blockers.push("Runway atmospheric probe was not within two feet of the surface at offset " + offset + ".");
    probes.push({
      nominalAlongRunwayFt: offset, latitudeDeg: observed.latitudeDeg, longitudeDeg: observed.longitudeDeg,
      aircraftAglFt: observed.altitudeAglFt,
      terrainElevationFt: optionalFinite(observed.diagnostics.terrainElevationFt),
      nativePressureAltitudeFt: validHeight ? optionalFinite(observed.diagnostics.nativePressureAltitudeFt) : null,
      temperatureC: observed.temperatureC,
    });
  }
  const first = probes[0]!;
  const conditions: Sf50RunwaySurvey["conditions"] = {};
  if (first.nativePressureAltitudeFt !== null) conditions.pressureAltitudeFt = first.nativePressureAltitudeFt;
  else blockers.push("Runway probe is missing usable native pressure altitude; requested altitude is not substituted.");
  if (Number.isFinite(first.temperatureC) && first.nativePressureAltitudeFt !== null) conditions.temperatureC = first.temperatureC;
  if (probes.every(probe => probe.terrainElevationFt !== null)) {
    const slopes = probes.slice(1).map((probe, index) =>
      100 * (probe.terrainElevationFt! - probes[index]!.terrainElevationFt!) /
      (probe.nominalAlongRunwayFt - probes[index]!.nominalAlongRunwayFt));
    // Do not let an uphill/downhill profile cancel into a falsely level mean.
    conditions.runwaySlopePercent = slopes.reduce((worst, slope) => Math.abs(slope) > Math.abs(worst) ? slope : worst, 0);
  } else blockers.push("Native terrain elevations are missing from the runway survey.");
  return {
    probes, conditions, blockers, coverageFt: 8000,
    pressureDatum: "Native atmosphere/pressure-altitude at a zero-time probe 0-2 ft AGL; no airborne-height subtraction or custom ISA inversion",
    slopeBasis: "Largest absolute signed segment grade from native terrain elevations at five nominal runway offsets; local WGS84 placement, level fixture only",
  };
}

const surfaceProperties = {
  solid: "groundSolid",
  bumpiness: "groundBumpiness",
  staticFrictionFactor: "groundStaticFrictionFactor",
  rollingFrictionFactor: "groundRollingFrictionFactor",
  maximumForceLb: "groundMaximumForceLb",
} as const;

export function auditSf50Surface(diagnostics: Readonly<Record<string, number | null>>) {
  const observed: Record<string, number | null> = {};
  const blockers: string[] = [];
  for (const [setting, property] of Object.entries(surfaceProperties)) {
    const actual = optionalFinite(diagnostics[property]);
    observed[setting] = actual;
    const configured = SF50_DRY_PAVED_SURFACE[setting as keyof typeof SF50_DRY_PAVED_SURFACE];
    const expected = typeof configured === "boolean" ? Number(configured) : configured;
    if (actual === null || actual !== expected) {
      blockers.push("Native surface setting does not match the declared dry-paved fixture: " + setting + ".");
    }
  }
  return {
    state: blockers.length ? "unconfirmed" as const : "configured" as const,
    conditions: blockers.length ? {} : { runwaySurface: "dry-paved" as const },
    observed, blockers,
    basis: "Explicit project dry-paved fixture with native readbacks, not an inferred material or validated friction coefficients",
    frictionCalibration: "unvalidated" as const,
  };
}

/** Checks actual environment readbacks throughout the measured trajectory. */
export class Sf50RunwayConditionMonitor {
  #survey: Sf50RunwaySurvey;
  #blockers = new Set<string>();
  #samples = 0;
  constructor(survey: Sf50RunwaySurvey) { this.#survey = survey; }

  observe(diagnostics: Readonly<Record<string, number | null>>, alongRunwayFt: number): void {
    this.#samples++;
    for (const blocker of auditSf50Surface(diagnostics).blockers) this.#blockers.add(blocker);
    const terrain = optionalFinite(diagnostics.terrainElevationFt);
    const baseline = this.#survey.probes[0]?.terrainElevationFt;
    if (terrain === null || baseline == null) this.#blockers.add("Runway terrain readback was unavailable during measurement.");
    else if (Math.abs(terrain - baseline) > 0.1) this.#blockers.add("Measured terrain departed from the level-runway fixture by more than 0.1 ft.");
    if (!Number.isFinite(alongRunwayFt) || alongRunwayFt < -5 || alongRunwayFt > this.#survey.coverageFt + 5) {
      this.#blockers.add("Trajectory exceeded surveyed runway coverage.");
    }
  }

  snapshot() {
    return { observedSamples: this.#samples, blockers: [...this.#blockers] };
  }
}
