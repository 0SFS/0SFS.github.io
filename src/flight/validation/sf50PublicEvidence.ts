/**
 * SF50 source ingestion, not an aircraft flight model or a certification claim.
 * Unknown provenance/conditions must not become a passing fidelity test.
 */
export function parseEvidenceCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false, closedQuote = false;
  const finishField = () => { row.push(field); field = ""; closedQuote = false; };
  const finishRow = () => {
    finishField();
    if (row.some(value => value.trim() !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closedQuote = true; }
      else field += char;
    } else if (char === ",") finishField();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      finishRow();
    } else if (closedQuote) throw new Error("Unexpected character after CSV quote.");
    else if (char === '"') {
      if (field !== "") throw new Error("Quote inside unquoted CSV field.");
      quoted = true;
    } else field += char;
  }
  if (quoted) throw new Error("Unterminated CSV quote.");
  if (field !== "" || row.length || closedQuote) finishRow();
  return rows;
}

function finiteNumber(value: string, name: string): number {
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) {
    throw new Error("Missing or nonnumeric " + name);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("Nonfinite " + name);
  return number;
}

export const CEN21_RECORDER_COLUMNS = [
  "Time", "N1 Fan Spd", "N2 Core Spd", "GroundSpeed", "Airspeed True",
  "Pitch-1", "Roll-1", "Airspeed Ind", "Parking Brake", "Flaps Cmd 0",
  "Flaps Cmd 100", "Flaps Cmd 50", "Heading Corr", "Heading_YawRate_AHRS1_",
  "Throttle Lever Angle",
] as const;

export interface Sf50RecorderSample {
  sourceRecord: number;
  clockText: string;
  clockSecondsEdt: number;
  elapsedSec: number;
  n1Percent: number;
  n2Percent: number;
  groundSpeedKts: number;
  trueAirspeedKts: number;
  indicatedAirspeedKts: number;
  pitchDeg: number;
  rollDeg: number;
  headingDeg: number;
  yawRateDegSec: number;
  throttleLeverAngleDeg: number;
  parkingBrake: boolean;
  flapCommandNorm: number;
}

function clockSeconds(value: string): number {
  const match = /^(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(value);
  if (!match) throw new Error("Invalid recorder clock: " + value);
  const hour = Number(match[1]), minute = Number(match[2]), second = Number(match[3]);
  if (hour > 23 || minute > 59 || second >= 60) throw new Error("Invalid recorder clock.");
  return hour * 3600 + minute * 60 + second;
}

export function parseCen21RecorderCsv(text: string) {
  const rows = parseEvidenceCsv(text.replace(/^\uFEFF/, ""));
  const headerIndex = rows.findIndex(row => row[0] === "Time" && row[1] === "N1 Fan Spd");
  if (headerIndex < 0 || JSON.stringify(rows[headerIndex]) !== JSON.stringify(CEN21_RECORDER_COLUMNS)) {
    throw new Error("Unsupported CEN21 recorder schema; do not guess channel mappings.");
  }
  const units = rows[headerIndex + 1];
  if (units?.[0] !== "(EDT)" || units[1] !== "(%)" || units[2] !== "(%)" ||
      units[3] !== "(kt)" || units[14] !== "(Deg)") {
    throw new Error("Recorder units or time basis changed.");
  }
  if (rows[headerIndex + 2]?.[1] !== "NUMBER") throw new Error("Missing recorder format row.");
  const samples: Sf50RecorderSample[] = [];
  const gaps: { afterRecord: number; dtSec: number }[] = [];
  let duplicateRows = 0, sourceRows = 0, priorSignature = "";
  for (let i = headerIndex + 3; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.length !== CEN21_RECORDER_COLUMNS.length) throw new Error("Wrong recorder row width.");
    sourceRows++;
    const time = clockSeconds(row[0]!);
    const prior = samples.at(-1);
    const signature = JSON.stringify(row);
    if (prior && time < prior.clockSecondsEdt) throw new Error("Recorder clock moved backwards.");
    if (prior && time === prior.clockSecondsEdt) {
      if (signature !== priorSignature) throw new Error("Conflicting duplicate recorder timestamp.");
      duplicateRows++;
      continue;
    }
    const n = (column: number) => finiteNumber(row[column]!, CEN21_RECORDER_COLUMNS[column]!);
    if (!["Off", "On"].includes(row[8]!)) throw new Error("Unknown parking brake discrete.");
    const flapLabels = ["Flaps 0%", "Flaps 100%", "Flaps 50%"];
    const commands = row.slice(9, 12).map((value, index) => {
      if (value === flapLabels[index]) return true;
      if (value === "Not " + flapLabels[index]) return false;
      throw new Error("Unknown flap command discrete.");
    });
    if (commands.filter(Boolean).length !== 1) throw new Error("Ambiguous flap command.");
    const sample: Sf50RecorderSample = {
      sourceRecord: i + 1, clockText: row[0]!, clockSecondsEdt: time,
      elapsedSec: Math.round((time - (samples[0]?.clockSecondsEdt ?? time)) * 100) / 100,
      n1Percent: n(1), n2Percent: n(2), groundSpeedKts: n(3), trueAirspeedKts: n(4),
      pitchDeg: n(5), rollDeg: n(6), indicatedAirspeedKts: n(7), parkingBrake: row[8] === "On",
      flapCommandNorm: [0, 1, 0.5][commands.indexOf(true)]!,
      headingDeg: n(12), yawRateDegSec: n(13), throttleLeverAngleDeg: n(14),
    };
    if (prior) {
      const dt = Math.round((time - prior.clockSecondsEdt) * 100) / 100;
      if (dt > 0.25) gaps.push({ afterRecord: prior.sourceRecord, dtSec: dt });
    }
    samples.push(sample);
    priorSignature = signature;
  }
  if (!samples.length) throw new Error("Empty recorder dataset.");
  return {
    samples, sourceRows, duplicateRows, uniqueTimes: samples.length, gaps,
    nominalRecordingHz: 5,
    timeBasis: "EDT from CSV; narrative/heading timezone discrepancy unresolved",
    limitations: [
      "Identical timestamp duplicates removed explicitly; original source remains archived.",
      "Recording cadence is not a guarantee of per-channel sensor update cadence.",
      "Flap commands and parking-brake state are not measured flap travel or pedal braking.",
      "Accident-flight segments require normal-operation and conditions review before model comparison.",
      "No normalized JSBSim throttle mapping is inferred from recorded lever degrees.",
    ],
    aircraftValidated: false,
  };
}

export interface NumericEvidenceTable {
  dimensions: string[];
  rows: Record<string, number>[];
}

export function parseNumericEvidenceTable(text: string): NumericEvidenceTable {
  const csv = parseEvidenceCsv(text.replace(/^\uFEFF/, ""));
  const header = csv[0];
  if (!header || header.at(-1) !== "value" || header.length < 2 ||
      new Set(header).size !== header.length) throw new Error("Unsupported numeric table header.");
  const dimensions = header.slice(0, -1);
  const seen = new Set<string>();
  const rows = csv.slice(1).map(row => {
    if (row.length !== header.length) throw new Error("Wrong numeric table row width.");
    const values = Object.fromEntries(header.map((name, i) => [name, finiteNumber(row[i]!, name)]));
    const key = JSON.stringify(dimensions.map(name => values[name]));
    if (seen.has(key)) throw new Error("Duplicate numeric table coordinates.");
    seen.add(key);
    return values;
  });
  if (!rows.length) throw new Error("Empty numeric table.");
  return { dimensions, rows };
}

/** Piecewise multilinear lookup only. Never extrapolate or infer source units. */
export function lookupNumericEvidenceTable(table: NumericEvidenceTable, point: Record<string, number>): number {
  if (table.dimensions.some(dimension => !Number.isFinite(point[dimension]))) {
    throw new Error("Missing table coordinate.");
  }
  function visit(rows: Record<string, number>[], depth: number): number {
    if (depth === table.dimensions.length) {
      if (rows.length !== 1) throw new Error("Ambiguous table point.");
      return rows[0]!.value!;
    }
    const dimension = table.dimensions[depth]!, requested = point[dimension]!;
    const axis = [...new Set(rows.map(row => row[dimension]!))].sort((a, b) => a - b);
    const low = axis.filter(value => value <= requested).at(-1);
    const high = axis.find(value => value >= requested);
    if (low === undefined || high === undefined) throw new RangeError("Outside source table coverage.");
    const a = visit(rows.filter(row => row[dimension] === low), depth + 1);
    if (low === high) return a;
    const b = visit(rows.filter(row => row[dimension] === high), depth + 1);
    return a + (b - a) * (requested - low) / (high - low);
  }
  return visit(table.rows, 0);
}

export interface Sf50EvidenceReview {
  sourceKind: "recording" | "afm-table" | "geometry" | "observation";
  provenanceVerified?: boolean;
  applicableVariant?: boolean;
  unitsVerified?: boolean;
  conditionsMatched?: boolean;
  timebaseReviewed?: boolean;
  normalOperationReviewed?: boolean;
  independentOfCalibration?: boolean;
}

export function evaluateSf50EvidenceReview(review: Sf50EvidenceReview, purpose: "calibration" | "validation" = "validation") {
  const blockers: string[] = [];
  if (!["recording", "afm-table", "geometry", "observation"].includes(review.sourceKind)) blockers.push("supportedSourceKind");
  if (!["calibration", "validation"].includes(purpose)) blockers.push("supportedPurpose");
  for (const key of ["provenanceVerified", "applicableVariant", "unitsVerified", "conditionsMatched"] as const) {
    if (review[key] !== true) blockers.push(key);
  }
  if (review.sourceKind === "recording" || review.sourceKind === "observation") {
    if (review.timebaseReviewed !== true) blockers.push("timebaseReviewed");
    if (review.normalOperationReviewed !== true) blockers.push("normalOperationReviewed");
  }
  if (purpose === "validation" && review.independentOfCalibration !== true) blockers.push("independentOfCalibration");
  return { eligibleForComparison: blockers.length === 0, aircraftValidated: false, blockers };
}

/** AMM Figure 6-00-2, 2018-07-09, reproduced in WPR20FA051 PDF page 13. */
export const SF50_PUBLIC_STATIONS = Object.freeze({
  noseFsIn: 36.7,
  wingLemacFsIn: 177.2,
  wingMacIn: 62.2,
  tailLemacFsIn: 353.3,
  tailMacIn: 44.1,
  noseGearFsIn: Object.freeze([89.05, 89.91]),
  mainGearFsIn: Object.freeze([208.95, 211.74]),
  mainGearAbsBlIn: Object.freeze([67.5, 67.9]),
});

/** Body x is forward-positive; FS is aft-positive. A reviewed anchor is required. */
export function sf50FsToBodyXFt(stationFsIn: number, anchor: { stationFsIn: number; bodyXFt: number }): number {
  if (![stationFsIn, anchor.stationFsIn, anchor.bodyXFt].every(Number.isFinite)) {
    throw new RangeError("A finite, explicitly supplied datum anchor is required.");
  }
  return anchor.bodyXFt + (anchor.stationFsIn - stationFsIn) / 12;
}
