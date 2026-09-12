import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  evaluateSf50EvidenceReview, lookupNumericEvidenceTable, parseCen21RecorderCsv,
  parseEvidenceCsv, parseNumericEvidenceTable, SF50_PUBLIC_STATIONS,
} from "../src/flight/validation/sf50PublicEvidence.ts";
import { SF50_AFM_SOURCE, SF50_ISA_DISTANCE_ROWS } from "../src/flight/validation/sf50AfmData.ts";

const args = process.argv.slice(2);
const value = prefix => args.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
if (args.length !== 2 || !value("--raw-root=") || !value("--out=")) {
  throw new Error("Usage: node scripts/analyze-sf50-public-evidence.mjs --raw-root=PATH --out=NEW_DIRECTORY");
}
const rawRoot = resolve(value("--raw-root=")), output = resolve(value("--out="));
const manifest = JSON.parse(readFileSync(new URL("../planes/Cirrus_Vision_Jet/tests/public-evidence/manifest.json", import.meta.url), "utf8"));
const csvFiles = new Map(), provenance = [];
for (const source of manifest.sources) {
  if (basename(source.file) !== source.file) throw new Error("Unsafe source filename.");
  const bytes = readFileSync(join(rawRoot, source.file));
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== source.sha256 || bytes.length !== source.bytes) throw new Error("Evidence changed: " + source.id);
  provenance.push({ id: source.id, sha256: hash, bytes: bytes.length });
  if (source.file.endsWith(".csv")) csvFiles.set(source.file, bytes);
}
const decoded = file => {
  const bytes = csvFiles.get(file);
  if (!bytes) throw new Error("Missing CSV: " + file);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return new TextDecoder("windows-1252", { fatal: true }).decode(bytes); }
};
const recording = parseCen21RecorderCsv(decoded("ntsb-cen21-tabular.csv"));
const tables = new Map();
for (const [file] of csvFiles) {
  if (file.startsWith("told-g1-")) tables.set(file, parseNumericEvidenceTable(decoded(file)));
}
const sourceComparisons = [];
for (const reference of SF50_ISA_DISTANCE_ROWS) {
  for (const [sourceMetric, referenceMetric] of [["ground run", "groundRollFt"], ["total distance", "totalDistanceFt"]]) {
    const file = "told-g1-" + (reference.phase === "takeoff" ? "takeoff" : "landing-100") + "-" + sourceMetric + ".csv";
    const point = { weight: reference.weightLb, altitude: reference.pressureAltitudeFt,
      temperature: 15 - 0.0019812 * reference.pressureAltitudeFt };
    try {
      const actual = lookupNumericEvidenceTable(tables.get(file), point);
      sourceComparisons.push({ phase: reference.phase, point, metric: referenceMetric,
        pinnedAfmValueFt: reference[referenceMetric], toldInterpolatedValueFt: actual,
        differenceFt: actual - reference[referenceMetric],
        relativeDifference: (actual - reference[referenceMetric]) / reference[referenceMetric],
        status: "source-reconciliation-required" });
    } catch (error) {
      sourceComparisons.push({ phase: reference.phase, point, metric: referenceMetric,
        status: "source-coverage-or-schema-blocked", reason: String(error) });
    }
  }
}
const cen23 = parseEvidenceCsv(decoded("ntsb-rdm-1hz.csv"));
const broadRecorderInventory = {
  recordsIncludingHeaders: cen23.length,
  columnWidths: [...new Set(cen23.map(row => row.length))],
  labelHeader: cen23[0], unitHeader: cen23[1], descriptiveHeader: cen23[2],
  status: "quarantined",
  blockers: [
    "Do not substitute CAS message N1 for the N1 Fan Speed numeric channel.",
    "Bootstrap year-0001 clocks, SSM meanings, channel units and CAPS/automation segments need review.",
    "Filename identifies a 1 Hz export, not a 5 Hz independent sample stream.",
  ],
};
const eligibility = evaluateSf50EvidenceReview({ sourceKind: "recording", provenanceVerified: true });
mkdirSync(output);
const save = (name, data) => writeFileSync(join(output, name), JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
save("cen21-normalized.json", recording);
save("cen23-inventory.json", broadRecorderInventory);
save("table-inventory.json", [...tables].map(([id, table]) => ({ id, dimensions: table.dimensions,
  rowCount: table.rows.length, unitsAndApplicabilityReviewed: false })));
save("source-comparison.json", { afmSource: SF50_AFM_SOURCE, sourceComparisons,
  note: "Compares differently revised table sources using OAT interpolation; not an aircraft run or a definitive transcription-error diagnosis." });
save("report.json", { generatedAt: new Date().toISOString(), provenance,
  tableCount: tables.size, tableRows: [...tables.values()].reduce((sum, table) => sum + table.rows.length, 0),
  recorderRows: recording.sourceRows, recorderUniqueTimes: recording.uniqueTimes,
  recorderDuplicateRows: recording.duplicateRows, stations: SF50_PUBLIC_STATIONS,
  eligibility, aircraftValidated: false, simulationExecuted: false });
process.stdout.write("Evidence reports written to " + output + "; aircraft comparison remains blocked.\n");
