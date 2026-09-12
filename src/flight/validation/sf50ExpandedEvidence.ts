import type { Sf50VariantId } from "../aircraft/sf50Variants.ts";
import { SF50_PUBLIC_MODEL_INPUTS } from "../aircraft/sf50Variants.ts";
import { SF50_AFM_SOURCE } from "./sf50AfmData.ts";
import { evaluateSf50EvidenceReview, parseEvidenceCsv, type Sf50EvidenceReview } from "./sf50PublicEvidence.ts";

export type Sf50EvidenceVariant = Sf50VariantId | "g2+";
export interface Sf50ProcessedTarget {
  id: string;
  variant: Sf50EvidenceVariant;
  kind: "cruise" | "integrated-climb";
  source: { document: string; sha256: string; pdfPage: number; printedPage: string };
  conditions: Record<string, number | string | null>;
  expected: Record<string, number>;
  /** Printed increments, NOT measurement uncertainty or pass/fail tolerances. */
  printedResolution: Record<string, number>;
  allocation: "calibration-candidate" | "within-source-check";
  review: Sf50EvidenceReview;
  aircraftValidated: false;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid " + label);
  return value as Record<string, unknown>;
}
function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Non-finite " + label);
  return value;
}
function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("Missing " + label);
  return value;
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error("Invalid " + label);
  return value;
}
function numbers(row: Record<string, unknown>, keys: readonly string[]): Record<string, number> {
  return Object.fromEntries(keys.map(key => [key, number(row[key], key)]));
}

/**
 * Preserves source rows, including cumulative fuel in BOTH published units.
 * No interpolation, fuel-density reconciliation, thrust inference or automatic
 * promotion of unreviewed text extraction into golden aircraft tests.
 */
export function processSf50AfmCandidates(input: unknown): Sf50ProcessedTarget[] {
  const data = record(input, "AFM candidates"), source = record(data.source, "AFM source");
  if (data.schemaVersion !== 1 || source.sha256 !== SF50_AFM_SOURCE.sha256) {
    throw new Error("Unrecognized AFM candidate revision.");
  }
  const targets: Sf50ProcessedTarget[] = [], seen = new Set<string>();
  for (const kind of ["cruise", "integrated-climb"] as const) {
    const rows = array(data[kind === "cruise" ? "cruise" : "integratedClimb"], kind);
    for (const entry of rows) {
      const row = record(entry, kind);
      const pdfPage = number(row.pdfPage, "pdfPage");
      if (!Number.isInteger(pdfPage) || pdfPage < 1 || pdfPage > SF50_AFM_SOURCE.pdfPages) {
        throw new Error("Invalid AFM page.");
      }
      const altitude = number(row.pressureAltitudeFt, "pressureAltitudeFt");
      const deltaIsaC = number(row.deltaIsaC, "deltaIsaC");
      const oatC = number(row.oatC, "oatC");
      const weight = number(row[kind === "cruise" ? "weightLb" : "initialWeightLb"], "weight");
      if (weight <= 0 || altitude < 0 || altitude > 28000 || oatC <= -273.15) {
        throw new Error("Outside the historical G1 candidate envelope.");
      }
      const common = { pressureAltitudeFt: altitude, deltaIsaC, oatC };
      let conditions: Sf50ProcessedTarget["conditions"], expected: Record<string, number>;
      let printedResolution: Record<string, number>, suffix: string;
      if (kind === "cruise") {
        const power = string(row.power, "power");
        if (!["MCT", "max-range-no-wind", "tabulated-part-power"].includes(power)) throw new Error("Unknown cruise power.");
        const n1Pct = number(row.n1Pct, "n1Pct");
        conditions = { ...common, weightLb: weight, n1Pct, power, bleed: null, gear: null, flapsNorm: null };
        expected = numbers(row, ["fuelFlowUsGph", "tasKt", "specificRangeNmPer10UsGal"]);
        if (n1Pct <= 0 || n1Pct > 110 || Object.values(expected).some(value => value <= 0)) {
          throw new Error("Invalid cruise output.");
        }
        printedResolution = { n1Pct: 0.1, fuelFlowUsGph: 1, tasKt: 1, specificRangeNmPer10UsGal: 0.1 };
        suffix = power + "-" + n1Pct;
      } else {
        conditions = { ...common, initialWeightLb: weight, iasKt: number(row.iasKt, "iasKt"),
          thrust: "MCT", gear: "UP", flapsNorm: 0, antiIce: "OFF", bleed: null };
        expected = numbers(row, ["cumulativeTimeMin", "cumulativeFuelUsGal", "cumulativeFuelLb", "cumulativeDistanceNm"]);
        if (Object.values(expected).some(value => value < 0)) throw new Error("Negative integrated climb output.");
        printedResolution = { cumulativeTimeMin: 1, cumulativeFuelUsGal: 1, cumulativeFuelLb: 1, cumulativeDistanceNm: 1 };
        suffix = "MCT";
      }
      const id = ["g1", kind, weight, altitude, deltaIsaC, suffix].join("-");
      if (seen.has(id)) throw new Error("Duplicate AFM target: " + id);
      seen.add(id);
      targets.push({
        id, variant: "g1", kind,
        source: { document: string(source.document, "document"), sha256: SF50_AFM_SOURCE.sha256,
          pdfPage, printedPage: string(row.printedPage, "printedPage") },
        conditions, expected, printedResolution,
        // Hold out the complete ISA+10 condition plane, not random nearby rows.
        // It remains SAME-SOURCE checking, never independent validation.
        allocation: deltaIsaC === 10 ? "within-source-check" : "calibration-candidate",
        review: { sourceKind: "afm-table", provenanceVerified: true, applicableVariant: true,
          unitsVerified: false, conditionsMatched: false, independentOfCalibration: false },
        aircraftValidated: false,
      });
    }
  }
  return targets;
}

/** Equilibrium inference for fitting CL coverage, NOT measured CL or CL-alpha. */
export function inferSf50CruiseLiftCoefficient(target: Sf50ProcessedTarget): number | null {
  if (target.kind !== "cruise") return null;
  const altitudeM = number(target.conditions.pressureAltitudeFt, "altitude") * 0.3048;
  const kelvin = number(target.conditions.oatC, "OAT") + 273.15;
  const pressurePa = 101325 * Math.pow(1 - 0.0065 * altitudeM / 288.15, 5.2558797);
  const densityKgM3 = pressurePa / (287.05287 * kelvin);
  const speedMps = number(target.expected.tasKt, "TAS") * 1852 / 3600;
  const weightN = number(target.conditions.weightLb, "weight") * 4.4482216152605;
  const areaM2 = SF50_PUBLIC_MODEL_INPUTS.wingAreaSqFt * 0.09290304;
  return weightN / (0.5 * densityKgM3 * speedMps * speedMps * areaM2);
}

/**
 * Diagnostic differences are available even when eligibility is blocked.
 * Conditions must match exactly: a caller needing interpolation must construct
 * a separately reviewed target, not hide extrapolation or missing conditions.
 */
export function compareSf50ProcessedTarget(
  target: Sf50ProcessedTarget,
  measurement: { variant: Sf50EvidenceVariant; conditions: Record<string, unknown>; metrics: Record<string, number> },
  review: Sf50EvidenceReview = target.review,
  purpose: "calibration" | "validation" = "validation",
) {
  const conditionMismatches = Object.entries(target.conditions)
    .filter(([key, expected]) => expected === null || measurement.conditions[key] !== expected)
    .map(([key]) => key);
  const metrics = Object.fromEntries(Object.entries(target.expected).map(([key, expected]) => {
    const measured = measurement.metrics[key];
    return [key, { expected, measured: Number.isFinite(measured) ? measured : null,
      difference: Number.isFinite(measured) ? measured! - expected : null }];
  }));
  const missingMetrics = Object.keys(target.expected).filter(key => !Number.isFinite(measurement.metrics[key]));
  const eligibility = evaluateSf50EvidenceReview({
    ...review, sourceKind: "afm-table",
    applicableVariant: review.applicableVariant === true && target.variant === measurement.variant,
    conditionsMatched: review.conditionsMatched === true && conditionMismatches.length === 0 && missingMetrics.length === 0,
  }, purpose);
  return { targetId: target.id, metrics, conditionMismatches, missingMetrics, ...eligibility };
}

export interface Sf50RecorderSample {
  timeSec: number;
  timestampUtcMs: number;
  sourceRecord: number;
  n1Pct: number | null;
  requestedN1Pct: number | null;
  n2Pct: number | null;
  pressureAltitudeFt: number | null;
  airspeedKt: number | null;
  airspeedKind: "IAS" | "TAS";
  pitchDeg: number | null;
  rollDeg: number | null;
  fuelFlowUsGph: number | null;
  /** Screening only. False does NOT establish normal operation. */
  excludedFromSteadyScreen: boolean;
  extra: Record<string, string | number | null>;
}

const NUMERIC = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") throw new Error("Unsupported recorder value.");
  const text = value.trim();
  if (["", "*", "-99999", "-9999.9"].includes(text)) return null;
  if (!NUMERIC.test(text)) throw new Error("Unrecognized numeric recorder value: " + text);
  const result = Number(text);
  if (!Number.isFinite(result)) throw new Error("Non-finite recorder value.");
  return result;
}
function clockSeconds(text: string): number {
  const match = /^(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(text);
  if (!match) throw new Error("Unrecognized recorder clock: " + text);
  const h = Number(match[1]), m = Number(match[2]), s = Number(match[3]);
  if (h > 23 || m > 59 || s >= 60) throw new Error("Invalid recorder clock.");
  return h * 3600 + m * 60 + s;
}

/** Exact engineering-unit export, not positional parsing of a wide ARINC log. */
export function normalizeEra22Recorder(text: string) {
  const csv = parseEvidenceCsv(text);
  if (!csv.slice(0, 7).flat().some(value => value.includes("ERA22LA404")) ||
      !csv.slice(0, 7).flat().some(value => value.includes("09/09/22"))) {
    throw new Error("Wrong ERA22 source metadata.");
  }
  const headerIndex = csv.findIndex(row => row[0] === "Time");
  if (headerIndex < 0) throw new Error("Missing ERA22 header.");
  const header = csv[headerIndex]!, units = csv[headerIndex + 1]!;
  if (header.length !== 56 || new Set(header).size !== header.length) throw new Error("Changed ERA22 schema.");
  const expectedUnits: Record<string, string> = {
    Time: "(EDT)", "Eng N1": "(%)", "Eng N1 Request": "(%)", "Eng N2": "(%)",
    "Altitude Press-1": "(ft)", "Airspeed Ind-1": "(kt)", "Pitch Angle-1": "(deg)",
    "Roll Angle-1": "(deg)", "Eng TLA": "(deg)", "Eng Percent Thrust": "(%)",
    // The export contains ?C; the report's appendix establishes Celsius and T2.
    "Eng T2": "(?C)", "CAPS ACTIVATED": "()", "CAPS Handle Pull Initial": "()",
    "CAPS System Activated": "()", "AOA ESP Engaged_1": "()", "AOA ESP Engaged_2": "()",
    "High Pitch ESP Engaged_1": "()", "High Pitch ESP Engaged_2": "()",
  };
  for (const [name, unit] of Object.entries(expectedUnits)) {
    const index = header.indexOf(name);
    if (index < 0 || units[index] !== unit) throw new Error("Changed ERA22 channel/unit: " + name);
  }
  const safetyChannels = ["CAPS ACTIVATED", "CAPS Handle Pull Initial", "CAPS System Activated",
    "AOA ESP Engaged_1", "AOA ESP Engaged_2", "High Pitch ESP Engaged_1", "High Pitch ESP Engaged_2"];
  const samples: Sf50RecorderSample[] = [], gaps: { afterTimeSec: number; durationSec: number }[] = [];
  let previousClock = -1, previousRaw = "", duplicateRows = 0, startClock: number | null = null;
  for (let i = headerIndex + 3; i < csv.length; i++) {
    const row = csv[i]!;
    if (row.length !== header.length) throw new Error("Wrong ERA22 row width at record " + (i + 1));
    const raw = JSON.stringify(row), time = clockSeconds(row[0]!);
    if (time === previousClock && raw === previousRaw) { duplicateRows++; continue; }
    if (time <= previousClock) throw new Error("Conflicting duplicate or backward ERA22 clock.");
    if (startClock === null) startClock = time;
    if (previousClock >= 0 && time - previousClock > 1.5) gaps.push({
      afterTimeSec: previousClock - startClock, durationSec: time - previousClock,
    });
    previousClock = time; previousRaw = raw;
    const get = (name: string) => row[header.indexOf(name)]!;
    const n = (name: string) => optionalNumber(get(name));
    const lateral = get("Coupled Lateral Mode Code - GIA1"), vertical = get("Coupled Vertical  Mode Code - GIA1");
    samples.push({
      timeSec: time - startClock, timestampUtcMs: Date.parse("2022-09-09T00:00:00Z") + (time + 4 * 3600) * 1000,
      sourceRecord: i + 1, n1Pct: n("Eng N1"), requestedN1Pct: n("Eng N1 Request"), n2Pct: n("Eng N2"),
      pressureAltitudeFt: n("Altitude Press-1"), airspeedKt: n("Airspeed Ind-1"), airspeedKind: "IAS",
      pitchDeg: n("Pitch Angle-1"), rollDeg: n("Roll Angle-1"), fuelFlowUsGph: null,
      excludedFromSteadyScreen: safetyChannels.some(name => n(name) !== 0) ||
        ["CAPS", "USP", "USPD", "OVSPD"].includes(lateral) || ["CAPS", "USP", "USPD", "OVSPD"].includes(vertical),
      extra: { localTimeEdt: get("Time"), throttleLeverAngleDeg: n("Eng TLA"),
        engineT2C: n("Eng T2"), percentThrustChannel: n("Eng Percent Thrust"),
        lateralMode: lateral, verticalMode: vertical,
        apFdEngaged1: get("AFCS - AP/FD Engaged_1"), apFdEngaged2: get("AFCS - AP/FD Engaged_2"),
        ...Object.fromEntries(safetyChannels.map(name => [name, get(name)])),
      },
    });
  }
  return { variant: "g1" as const, serial: "0088", samples, gaps, duplicateRows,
    timeZone: "EDT, UTC-04:00; event 2022-09-09", normalOperationReviewed: false,
    aircraftValidated: false,
    limitations: ["T2 is total inlet temperature, not OAT.", "Requested N1 and percent thrust are not measured thrust.",
      "No loading/CG, surface-position or brake-force qualification.", "Pre-upset segments still need normal-operation review."] };
}

/** Joins chart series only at EXACT timestamps; never resamples or fills gaps. */
export function normalizeSf50Dashboard(input: unknown) {
  const data = record(input, "dashboard"), series = record(data.series, "series");
  if (data.source !== "https://www.flightdata.com/flight/2754779" ||
      data.snapshotSha256 !== "e828d6ece046ffc1092356ce7f586ceca7cc0a34bf53cb1873438e0a34549249") {
    throw new Error("Unrecognized public dashboard snapshot.");
  }
  const channelNames = ["data_time_unix", "data_palt", "data_tas", "data_n1_1", "data_n2_1",
    "data_ff_1", "data_pitch", "data_roll", "data_GPSfix", "data_ApOn", "data_oat"];
  const channels = new Map<string, Map<number, unknown>>();
  for (const name of channelNames) {
    const channel = new Map<number, unknown>();
    for (const entry of array(series[name], name)) {
      const pair = array(entry, name + " point");
      if (pair.length !== 2) throw new Error("Invalid chart pair.");
      const timestamp = number(pair[0], name + " timestamp");
      if (channel.has(timestamp)) throw new Error("Duplicate chart timestamp.");
      channel.set(timestamp, pair[1]);
    }
    channels.set(name, channel);
  }
  const times = [...channels.get("data_time_unix")!.keys()];
  if (times.some((value, i) => i > 0 && value <= times[i - 1]!)) throw new Error("Backward dashboard clock.");
  const gaps: { afterTimeSec: number; durationSec: number }[] = [];
  const samples: Sf50RecorderSample[] = times.map((timestamp, index) => {
    const get = (name: string) => channels.get(name)!.get(timestamp);
    const n = (name: string) => optionalNumber(get(name));
    const gps = get("data_GPSfix");
    const timeSec = (timestamp - times[0]!) / 1000;
    if (index > 0 && timestamp - times[index - 1]! > 8000) gaps.push({
      afterTimeSec: (times[index - 1]! - times[0]!) / 1000, durationSec: (timestamp - times[index - 1]!) / 1000,
    });
    return { timeSec, timestampUtcMs: timestamp, sourceRecord: index + 1,
      n1Pct: n("data_n1_1"), requestedN1Pct: null, n2Pct: n("data_n2_1"),
      pressureAltitudeFt: n("data_palt"), airspeedKt: n("data_tas"), airspeedKind: "TAS",
      pitchDeg: n("data_pitch"), rollDeg: n("data_roll"), fuelFlowUsGph: n("data_ff_1"),
      excludedFromSteadyScreen: gps !== "3D" && gps !== "3DDiff",
      extra: { gpsFix: typeof gps === "string" ? gps : null,
        apRaw: String(get("data_ApOn") ?? ""), oatRaw: n("data_oat") },
    };
  });
  return { variant: "g1" as const, serial: "0045", samples, gaps,
    source: data.source, sourceCadence: "approximately six-second dashboard samples; not a raw avionics log",
    normalOperationReviewed: false, aircraftValidated: false,
    limitations: ["Loading, configuration and reuse not approved.", "AP channel contains off, on and 5; not coerced to boolean.",
      "OAT retained as raw until its chart-unit convention is reviewed.", "No fast spool, damping or flare identification from these samples."] };
}

export interface Sf50SteadyWindow {
  firstRecord: number;
  lastRecord: number;
  startUtcMs: number;
  endUtcMs: number;
  durationSec: number;
  samples: number;
  airspeedKind: "IAS" | "TAS";
  means: Record<string, number | null>;
  normalOperationReviewed: false;
  eligibleForCalibration: false;
}

/**
 * Non-overlapping, >=60 s screening windows. These deliberately modest filters
 * find review candidates only; steadiness does not establish normal operation.
 */
export function findSf50SteadyWindows(samples: readonly Sf50RecorderSample[], maxGapSec: number): Sf50SteadyWindow[] {
  if (!Number.isFinite(maxGapSec) || maxGapSec <= 0) throw new Error("Invalid cadence limit.");
  const result: Sf50SteadyWindow[] = [];
  const keys = ["n1Pct", "pressureAltitudeFt", "airspeedKt", "pitchDeg", "rollDeg"] as const;
  for (let start = 0; start < samples.length;) {
    let end = start;
    while (end + 1 < samples.length && samples[end]!.timeSec - samples[start]!.timeSec < 60) {
      if (samples[end + 1]!.timeSec - samples[end]!.timeSec > maxGapSec) break;
      end++;
    }
    const window = samples.slice(start, end + 1), first = window[0]!, last = window.at(-1)!;
    start = end + 1;
    if (last.timeSec - first.timeSec < 60 || window.some(sample => sample.excludedFromSteadyScreen ||
        sample.airspeedKind !== first.airspeedKind || keys.some(key => sample[key] === null))) continue;
    const values = (key: typeof keys[number]) => window.map(sample => sample[key]!);
    const span = (key: typeof keys[number]) => Math.max(...values(key)) - Math.min(...values(key));
    if (Math.min(...values("airspeedKt")) < 100 || Math.min(...values("n1Pct")) <= 0 ||
        span("pressureAltitudeFt") > 100 || span("airspeedKt") > 5 || span("n1Pct") > 1 ||
        span("pitchDeg") > 1.5 || values("rollDeg").some(value => Math.abs(value) > 5)) continue;
    const mean = (key: typeof keys[number] | "fuelFlowUsGph") => {
      const list = window.map(sample => sample[key]);
      return list.some(value => value === null) ? null :
        list.reduce<number>((sum, value) => sum + value!, 0) / list.length;
    };
    result.push({ firstRecord: first.sourceRecord, lastRecord: last.sourceRecord,
      startUtcMs: first.timestampUtcMs, endUtcMs: last.timestampUtcMs, durationSec: last.timeSec - first.timeSec,
      samples: window.length, airspeedKind: first.airspeedKind,
      means: Object.fromEntries([...keys, "fuelFlowUsGph" as const].map(key => [key, mean(key)])),
      normalOperationReviewed: false, eligibleForCalibration: false });
  }
  return result;
}
