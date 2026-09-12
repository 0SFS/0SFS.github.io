import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getSf50PilotProfile } from "../src/flight/validation/sf50PilotProfiles.ts";

const args = process.argv.slice(2);
if (args.some(arg => !["--sdk-root=", "--out=", "--profiles="].some(prefix => arg.startsWith(prefix)))) {
  throw new Error("Usage: node scripts/calibrate-sf50-pilot.mjs --sdk-root=PATH [--out=NEW_DIRECTORY] [--profiles=development-v6,baseline-v5]");
}
const value = prefix => args.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
const sdkArg = value("--sdk-root=");
if (!sdkArg) throw new Error("An explicit --sdk-root is required to pin the WASM artifact.");
const sdkRoot = resolve(sdkArg);
const ids = (value("--profiles=") ?? "baseline-v5,development-v6,landing-full-brake,landing-gentle,landing-firm").split(",");
if (!ids.length || new Set(ids).size !== ids.length) throw new Error("Select unique named pilot profiles.");
const profiles = ids.map(getSf50PilotProfile);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const wasmSha256 = hash(readFileSync(join(sdkRoot, "dist/wasm/jsbsim_wasm.wasm")));
const sdkEntrySha256 = hash(readFileSync(join(sdkRoot, "dist/index.js")));
const outputArg = value("--out=");
const output = outputArg ? resolve(outputArg) : mkdtempSync(join(tmpdir(), "sf50-pilot-calibration-"));
if (outputArg) mkdirSync(output);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modelHashes = new Map();
const comparisons = [];
for (const profile of profiles) {
  const child = spawnSync(process.execPath, [
    join(root, "scripts/validate-sf50.mjs"), "--sdk-root=" + sdkRoot, "--report-only",
  ], {
    cwd: root, env: { ...process.env, SF50_PILOT_PROFILE: profile.id, SF50_AFM_CASES: "calibration" },
    encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 60000,
  });
  writeFileSync(join(output, profile.id + ".stderr"), child.stderr ?? "", { flag: "wx" });
  writeFileSync(join(output, profile.id + ".json"), child.stdout ?? "", { flag: "wx" });
  if (child.status !== 0) throw new Error("Pilot profile failed: " + profile.id + "\n" + (child.error ?? child.stderr));
  const report = JSON.parse(child.stdout);
  if (report.results.length !== 2 || report.results.some(row => row.role !== "calibration")) {
    throw new Error("Calibration runner refuses an unexpected case selection.");
  }
  const landing = report.results.find(row => row.phase === "landing");
  const initialN1 = landing?.initialObservation?.diagnostics?.n1Percent;
  const firstStepN1 = landing?.trace?.[1]?.observation?.diagnostics?.n1Percent;
  if (!Number.isFinite(initialN1) || !Number.isFinite(firstStepN1) || Math.abs(initialN1 - firstStepN1) > 1e-6) {
    throw new Error("Zero-time turbine prerequisite failed; use the rebuilt SDK rather than hiding stale N1.");
  }
  for (const row of report.results) {
    const previous = modelHashes.get(row.caseId);
    if (previous && previous !== row.loading.scenarioModelSha256) throw new Error("Scenario model/loading changed between pilot profiles.");
    modelHashes.set(row.caseId, row.loading.scenarioModelSha256);
    comparisons.push({
      profileId: profile.id, caseId: row.caseId, status: row.status, metrics: row.metrics,
      pilotEvidence: row.pilotEvidence, blockers: row.blockers, bounces: row.bounces,
    });
  }
  process.stdout.write(profile.id + ": " + report.results.map(row => row.caseId + "=" + row.status).join(", ") + "\n");
}
writeFileSync(join(output, "comparison.json"), JSON.stringify({
  generatedAt: new Date().toISOString(), node: process.version, sdkRoot, wasmSha256, sdkEntrySha256,
  caseSelection: "calibration", profiles, comparisons, aircraftCalibrated: false,
  note: "Report-only pilot-demand experiment. Closed-loop braking does not independently validate tire friction; holdouts are not consumed.",
}, null, 2) + "\n", { flag: "wx" });
process.stdout.write("Pilot comparison saved to " + output + "\n");
