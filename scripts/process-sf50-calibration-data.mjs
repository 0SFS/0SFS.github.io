import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import {
  processSf50AfmCandidates, inferSf50CruiseLiftCoefficient, normalizeEra22Recorder,
  normalizeSf50Dashboard, findSf50SteadyWindows,
} from "../src/flight/validation/sf50ExpandedEvidence.ts";
import { parseEvidenceCsv, parseNumericEvidenceTable, parseCen21RecorderCsv } from "../src/flight/validation/sf50PublicEvidence.ts";
import { SF50_AFM_SOURCE, SF50_AFM_PAGES, SF50_ISA_DISTANCE_ROWS } from "../src/flight/validation/sf50AfmData.ts";
import { SF50_VARIANTS, SF50_PUBLIC_MODEL_INPUTS, SF50_G3_PUBLISHED_PERFORMANCE } from "../src/flight/aircraft/sf50Variants.ts";

const args = process.argv.slice(2);
const value = prefix => args.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
if (!value("--out=") || args.some(arg => !["--out=", "--summary="].some(prefix => arg.startsWith(prefix))) ||
    new Set(args.map(arg => arg.split("=")[0])).size !== args.length) {
  throw new Error("Usage: node scripts/process-sf50-calibration-data.mjs --out=NEW_DIRECTORY [--summary=NEW_JSON]");
}
const repo = fileURLToPath(new URL("../", import.meta.url));
const root = join(repo, "planes/Cirrus_Vision_Jet/tests/public-evidence");
const output = resolve(value("--out="));
const summaryPath = value("--summary=") ? resolve(value("--summary=")) : null;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const json = file => JSON.parse(readFileSync(file, "utf8"));
const csv = new Map(), provenance = [], knownFiles = new Set();
for (const name of ["manifest.json", "public-audit-manifest.json", "variant-manifest.json"]) {
  const manifest = json(join(root, name));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.sources)) throw new Error("Unknown manifest " + name);
  for (const source of manifest.sources) {
    if (typeof source.file !== "string" || basename(source.file) !== source.file || knownFiles.has(source.file)) {
      throw new Error("Unsafe or duplicate raw source file.");
    }
    knownFiles.add(source.file);
    const bytes = readFileSync(join(root, "raw", source.file));
    if (sha256(bytes) !== source.sha256 || bytes.length !== source.bytes) throw new Error("Source changed: " + source.file);
    provenance.push({ id: source.id, file: source.file, sha256: source.sha256, bytes: source.bytes,
      variant: source.variant ?? (source.file.startsWith("told-g1-") ? "g1" : null), manifest: name });
    if (source.file.endsWith(".csv")) csv.set(source.file, bytes);
  }
}
const inputs = new Map();
for (const source of json(join(root, "calibration-input-manifest.json")).sources) {
  const path = resolve(root, source.file), rel = relative(root, path);
  if (rel === ".." || rel.startsWith("../") || isAbsolute(rel)) throw new Error("Unsafe derived input path.");
  const bytes = readFileSync(path);
  if (sha256(bytes) !== source.sha256 || bytes.length !== source.bytes) throw new Error("Derived input changed: " + source.id);
  inputs.set(source.id, JSON.parse(bytes.toString("utf8")));
}
const afmBytes = readFileSync(join(repo, SF50_AFM_SOURCE.localPath));
if (sha256(afmBytes) !== SF50_AFM_SOURCE.sha256) throw new Error("Primary AFM changed.");
const decode = file => {
  const bytes = csv.get(file);
  if (!bytes) throw new Error("Missing CSV: " + file);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return new TextDecoder("windows-1252", { fatal: true }).decode(bytes); }
};
mkdirSync(output);
const save = (name, data) => writeFileSync(join(output, name), JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
const stages = [];
function stage(id, operation) {
  try { const result = operation(); stages.push({ id, status: "processed", ...result }); }
  catch (error) { stages.push({ id, status: "blocked", reason: String(error) }); }
}
stage("primary-g1-afm", () => {
  const targets = processSf50AfmCandidates(inputs.get("primary-afm-candidates"));
  save("g1-afm-targets.json", { schemaVersion: 1, targets, aircraftValidated: false,
    note: "ISA+10 is reserved as a whole condition plane for same-source checks, not independent validation." });
  const liftInferences = targets.filter(target => target.kind === "cruise").map(target => ({
    id: target.id, impliedEquilibriumCl: inferSf50CruiseLiftCoefficient(target),
    assumption: "Steady wings-level flight, L=W, standard pressure at pressure altitude, tabulated OAT.",
    measuredCoefficient: false, installedInModel: false,
  }));
  save("g1-cruise-lift-inferences.json", liftInferences);
  save("g1-runway-anchors.json", { source: SF50_AFM_SOURCE,
    rows: SF50_ISA_DISTANCE_ROWS.map(row => ({ ...row, variant: "g1", page: SF50_AFM_PAGES[row.source] })),
    note: "Existing G1 runway runner retains its own matching conditions and gates. These explicit ISA anchors are not overwritten by TOLD interpolation." });
  return { cruiseRows: targets.filter(target => target.kind === "cruise").length,
    integratedClimbRows: targets.filter(target => target.kind === "integrated-climb").length,
    runwayAnchors: SF50_ISA_DISTANCE_ROWS.length,
    calibrationCandidates: targets.filter(target => target.allocation === "calibration-candidate").length,
    sameSourceCheckRows: targets.filter(target => target.allocation === "within-source-check").length,
    eligibleIndependentValidationRows: 0 };
});
stage("told-generation-tables", () => {
  const tables = [], blocked = [];
  for (const source of provenance.filter(entry => entry.file.startsWith("told-") && entry.file.endsWith(".csv"))) {
    try {
      const table = parseNumericEvidenceTable(decode(source.file));
      tables.push({ source, ...table, unitsAndConditionsReviewed: false, primaryRevisionReconciled: false,
        eligibleForCalibration: false, eligibleForIndependentValidation: false });
    } catch (error) { blocked.push({ source, reason: String(error) }); }
  }
  save("told-generation-tables.json", { tables, blocked, aircraftValidated: false,
    note: "G2+ remains a separate evidence configuration. No table is relabeled G3. Landing source conflicts remain unresolved." });
  return { status: blocked.length ? "partially-processed" : "processed", tableCount: tables.length,
    rowCount: tables.reduce((n, table) => n + table.rows.length, 0), blockedTables: blocked.length,
    byVariant: Object.fromEntries(["g1", "g2", "g2+"].map(variant => [variant, {
      tables: tables.filter(table => table.source.variant === variant).length,
      rows: tables.filter(table => table.source.variant === variant).reduce((n, table) => n + table.rows.length, 0),
    }])) };
});
stage("era22-g1-recorder", () => {
  const normalized = normalizeEra22Recorder(decode("era22-recorder.csv"));
  const windows = findSf50SteadyWindows(normalized.samples, 1.5);
  save("era22-normalized.json", normalized);
  save("era22-steady-candidates.json", { windows, normalOperationReviewed: false, eligibleForCalibration: false });
  return { samples: normalized.samples.length, duplicates: normalized.duplicateRows,
    gaps: normalized.gaps.length, steadyReviewCandidates: windows.length };
});
stage("public-g1-dashboard", () => {
  const normalized = normalizeSf50Dashboard(inputs.get("public-flight-chart-candidates"));
  const windows = findSf50SteadyWindows(normalized.samples, 8);
  save("public-flight-normalized.json", normalized);
  save("public-flight-steady-candidates.json", { windows, normalOperationReviewed: false, eligibleForCalibration: false });
  return { samples: normalized.samples.length, gaps: normalized.gaps.length, steadyReviewCandidates: windows.length };
});
stage("cen21-engineering-recorder", () => {
  const normalized = parseCen21RecorderCsv(decode("ntsb-cen21-tabular.csv"));
  save("cen21-normalized.json", normalized);
  return { sourceRows: normalized.sourceRows, uniqueTimes: normalized.uniqueTimes, duplicateRows: normalized.duplicateRows,
    applicableToG1: false, aircraftSerial: "0202" };
});
stage("wide-recorder-quarantine", () => {
  const inventory = ["cen21-raw.csv", "ntsb-rdm-1hz.csv"].map(file => {
    const rows = parseEvidenceCsv(decode(file));
    return { file, recordsIncludingHeaders: rows.length, widths: [...new Set(rows.map(row => row.length))],
      firstThreeRows: rows.slice(0, 3), status: "quarantined",
      blockers: file === "cen21-raw.csv"
        ? ["UTC column formatting omits hour; year-0001 bootstrap records.", "SSM/channel validity and GPX alignment unapproved.", "Serial 0202 is not a historical G1 donor."]
        : ["Year-0001 clocks and status-word meanings unreviewed.", "CAPS/automation segmentation unapproved.", "CAS N1 must not replace numeric fan speed."] };
  });
  save("wide-recorder-quarantine.json", inventory);
  return { inventoried: inventory.length, normalizedForCalibration: 0 };
});
stage("wpr20-fuel-subset", () => {
  const rows = parseEvidenceCsv(decode("wpr20-recorder.csv"));
  const h = rows.findIndex(row => row[0] === "Time PST");
  if (h < 0) throw new Error("Missing WPR Time PST header.");
  const header = rows[h], units = rows[h + 1];
  const flowIndex = header.indexOf("Eng1 Fuel Flow"), oilIndex = header.indexOf("Eng1 Oil Press");
  const unit = index => units[index]?.replace(/[()]/g, "").trim().toLowerCase();
  if (flowIndex < 0 || oilIndex < 0 || unit(flowIndex) !== "gph" || unit(oilIndex) !== "psi") {
    throw new Error("Changed WPR fuel/oil units.");
  }
  const numeric = text => {
    const value = text.trim();
    if (["", "*", "-99999", "-9999.9"].includes(value)) return null;
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) throw new Error("Unknown WPR numeric value.");
    return Number(value);
  };
  // Locate timed rows rather than assuming the same metadata count as ERA22.
  const samples = rows.slice(h + 2).filter(row => /^\d\d:\d\d:\d\d$/.test(row[0])).map(row => {
    if (row.length !== header.length) throw new Error("Wrong WPR row width.");
    return { timePst: row[0], fuelFlowUsGph: numeric(row[flowIndex]), oilPressurePsi: numeric(row[oilIndex]) };
  });
  save("wpr20-fuel-subset.json", { variant: "g1", serial: "0010", samples, originalUnits: units,
    timebaseReviewed: false, normalOperationReviewed: false, aircraftValidated: false,
    note: "Fuel/oil subset only. Missing sentinels retained as null. No N1, pitch or braking evidence is supplied." });
  return { samples: samples.length, eligibleForCalibration: false };
});
save("generation-coverage.json", { variants: SF50_VARIANTS, g3PublishedContext: SF50_G3_PUBLISHED_PERFORMANCE,
  g2PlusIsSeparateEvidenceConfiguration: true, crossGenerationFallbackAllowed: false,
  modelInputsApplied: SF50_PUBLIC_MODEL_INPUTS,
  unresolved: [
    "G2/G3 packages share the development airframe and estimated installed-thrust schedule, not calibrated variant performance.",
    "G2+ updated-thrust data cannot establish a G3 schedule without configuration evidence.",
    "G3 public runway/max-cruise figures lack a complete matched AFM condition matrix.",
    "N1/TLA/bleed matching, drag/thrust separation, loading/CG, inertia and friction remain unresolved.",
    "Do not fit CL-alpha, damping, thrust or braking directly from a smooth trace lacking the relevant measured inputs.",
    "Rounded cumulative climb tables are not instantaneous climb-rate or spool-response measurements.",
  ],
});
const report = {
  schemaVersion: 1, generatedAt: new Date().toISOString(),
  rawArtifactsVerified: provenance.length, rawBytesVerified: provenance.reduce((n, source) => n + source.bytes, 0),
  primaryAfmSha256: SF50_AFM_SOURCE.sha256, pinnedDerivedInputs: [...inputs.keys()],
  stages, provenance, modelInputsApplied: SF50_PUBLIC_MODEL_INPUTS,
  aircraftValidated: false, simulationExecuted: false, testSuiteExecuted: false,
  important: "Hash/schema processing success is not aircraft-fidelity validation. Review candidates are not automatically calibration-eligible.",
};
save("report.json", report);
if (summaryPath) writeFileSync(summaryPath, JSON.stringify({ ...report, provenance: undefined }, null, 2) + "\n", { flag: "wx" });
process.stdout.write(JSON.stringify({ output, rawArtifactsVerified: report.rawArtifactsVerified, stages,
  aircraftValidated: false, simulationExecuted: false, testSuiteExecuted: false }, null, 2) + "\n");
if (stages.some(entry => entry.status !== "processed")) process.exitCode = 1;
