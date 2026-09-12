import { SF50_AFM_SOURCE } from "../src/flight/validation/sf50AfmData.ts";
import { makeSf50SyntheticLoading } from "../src/flight/validation/sf50SyntheticLoading.ts";
import { selectSf50AfmReferenceCases } from "../src/flight/validation/sf50AfmReferenceCases.ts";
import { runSf50AfmProcedure, sf50AfmPilotAssumptions } from "../src/flight/validation/sf50AfmBenchmark.ts";
import { getSf50PilotProfile } from "../src/flight/validation/sf50PilotProfiles.ts";
import { evaluateSf50AfmMeasurement } from "../src/flight/validation/evaluateSf50AfmMeasurement.ts";
import { readFile as readAfmFile } from "node:fs/promises";
import { createHash as createAfmHash } from "node:crypto";

// Refuse silently changed reference evidence when this benchmark is executed.
const SF50_SELECTED_PILOT_PROFILE = getSf50PilotProfile(process.env.SF50_PILOT_PROFILE);
const SF50_CASE_SELECTION = process.env.SF50_AFM_CASES ?? "all";
const SF50_AFM_REFERENCE_CASES = selectSf50AfmReferenceCases(SF50_CASE_SELECTION);
const afmBytes = await readAfmFile(new URL("../" + SF50_AFM_SOURCE.localPath, import.meta.url));
const afmHash = createAfmHash("sha256").update(afmBytes).digest("hex");
if (afmHash !== SF50_AFM_SOURCE.sha256) {
  throw new Error("Archived SF50 AFM hash does not match the extracted reference dataset.");
}

/**
 * Node 26 headless baseline runner. No browser, network, or production XML writes.
 * Requires the local SDK's lifetime/diagnostics changes to have been built.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { FlightModelDriver } from "../src/flight/model/flightModelDriver.ts";
import { SF50_RATED_THRUST } from "../src/flight/validation/sf50ReferenceData.ts";
import { evaluateSf50Performance } from "../src/flight/validation/evaluateSf50Performance.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const sdkArg = args.find(value => value.startsWith("--sdk-root="))?.slice("--sdk-root=".length);
const sdkRoot = sdkArg ? path.resolve(sdkArg) : null;
const sdkModule = await import(sdkRoot ? pathToFileURL(path.join(sdkRoot, "dist/index.js")).href : "@0x62/jsbsim-wasm");
const wasm = await import(sdkRoot ? pathToFileURL(path.join(sdkRoot, "dist/wasm.js")).href : "@0x62/jsbsim-wasm/wasm");
if (typeof sdkModule.JSBSimSdk.prototype.loadModelOrThrow !== "function") {
  throw new Error("Build the upstream SDK changes with npm run build:sdk, then pass --sdk-root=/path/to/jsbsim-wasm. The installed SDK lacks diagnostic model loading.");
}

const dataRoot = path.join(root, "public/jsbsim-data");
const manifest = JSON.parse(await readFile(path.join(dataRoot, "manifest.json"), "utf8"));
const matching = Object.entries(manifest.aircraft ?? {}).filter(([, files]) =>
  Array.isArray(files) && files.includes("aircraft/sf50/sf50.xml"));
if (matching.length !== 1) throw new Error("Expected one explicit SF50 package in the production manifest.");
const [aircraftId, names] = matching[0];
const files = {};
const packageHashes = {};
for (const name of new Set(names)) {
  if (typeof name !== "string" || path.isAbsolute(name) || name.split(/[\\/]/).includes("..")) throw new Error("Unsafe aircraft package path.");
  const content = await readFile(path.join(dataRoot, name), "utf8");
  files[name] = content;
  packageHashes[name] = createHash("sha256").update(content).digest("hex");
}
const modelPath = "aircraft/sf50/sf50.xml";

/** Scenario-only payload overlay: retain production coefficients, log the new hash. */
function loadedPackage(weightLb) {
  let xml = files[modelPath];
  const mass = xml.match(/<mass_balance\b[^>]*>[\s\S]*?<\/mass_balance>/)?.[0];
  if (!mass) throw new Error("Missing model mass balance.");
  const cg = mass.match(/<location\b[^>]*name=["']CG["'][^>]*>[\s\S]*?<\/location>/)?.[0];
  const emptyWeight = Number(mass.match(/<emptywt\b[^>]*unit=["']LBS["'][^>]*>\s*([\d.]+)/)?.[1]);
  if (!cg || !Number.isFinite(emptyWeight)) throw new Error("Scenario loading requires an explicit CG and empty weight in LBS.");
  const pointMasses = [...mass.matchAll(/<pointmass\b[^>]*>[\s\S]*?<\/pointmass>/g)];
  const existingPayload = pointMasses.reduce((sum, [point]) => {
    const weight = Number(point.match(/<weight\b[^>]*unit=["']LBS["'][^>]*>\s*([\d.]+)/)?.[1]);
    if (!Number.isFinite(weight)) throw new Error("Unsupported existing pointmass units.");
    return sum + weight;
  }, 0);
  const tanks = [...xml.matchAll(/<tank\b[^>]*>[\s\S]*?<\/tank>/g)].map(([text]) => {
    const capacity = Number(text.match(/<capacity\b[^>]*unit=["']LBS["'][^>]*>\s*([\d.]+)/)?.[1]);
    if (!Number.isFinite(capacity) || capacity <= 0) throw new Error("Scenario requires fuel tank capacities in LBS.");
    return { text, capacity };
  });
  const capacity = tanks.reduce((sum, tank) => sum + tank.capacity, 0);
  const fuelTotal = 1500;
  if (capacity < fuelTotal) throw new Error("The model cannot hold the scenario fuel load.");
  const payload = weightLb - emptyWeight - existingPayload - fuelTotal;
  if (payload < 0 || weightLb - fuelTotal > 4900) throw new Error("Scenario loading violates mass or zero-fuel constraints.");
  const fuelLb = tanks.map(tank => fuelTotal * tank.capacity / capacity);
  tanks.forEach((tank, index) => {
    if (!/<contents\b[^>]*unit=["']LBS["'][^>]*>[\s\S]*?<\/contents>/.test(tank.text)) throw new Error("Unsupported tank contents units.");
    xml = xml.replace(tank.text, tank.text.replace(/(<contents\b[^>]*unit=["']LBS["'][^>]*>)[\s\S]*?(<\/contents>)/,
      (_match, open, close) => open + fuelLb[index] + close));
  });
  xml = xml.replace("</mass_balance>", '<pointmass name="validation-payload"><weight unit="LBS">' + payload +
    "</weight>" + cg.replace(/\sname=["']CG["']/, "") + "</pointmass></mass_balance>");
  return { files: { ...files, [modelPath]: xml }, fuelLb, payloadLb: payload,
    scenarioModelSha256: createHash("sha256").update(xml).digest("hex") };
}

async function createDriver(reference) {
  const loading = loadedPackage(reference.conditions.weightLb);
  const sdk = await sdkModule.JSBSimSdk.create({
    moduleUrl: wasm.wasmModuleUrl, wasmUrl: wasm.wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false },
  });
  const driver = FlightModelDriver.create(sdk, {
    modelName: "sf50", fixedDtSec: 1 / 120, rudderSign: 1,
    flapPosition: { property: "fcs/flap-pos-norm", fullTravel: 1 },
  }, loading.files);
  return { driver, loading };
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const neutral = { elevatorNorm: 0, aileronNorm: 0, rudderNorm: 0, throttleNorm: 0,
  flapsNorm: 0, gearDown: true, leftBrakeNorm: 0, rightBrakeNorm: 0 };
function initialState(reference, fuelLb) {
  const landing = reference.phase === "landing";
  return {
    latitudeDeg: 34, longitudeDeg: -118,
    altitudeMslFt: reference.conditions.pressureAltitudeFt + (landing ? 50 : 4),
    terrainElevationFt: reference.conditions.pressureAltitudeFt,
    calibratedAirspeedKts: landing ? reference.conditions.referenceSpeedKias : 0,
    headingDeg: 0, pitchDeg: landing ? 3 : 0, flightPathAngleDeg: landing ? -3 : 0,
    controls: { ...neutral, throttleNorm: landing ? 0 : 1, flapsNorm: reference.conditions.flapsNorm },
    fuelLb,
  };
}





async function runCase(reference) {
  const { driver, loading } = await createDriver(reference);
  try {
    const outcome = runSf50AfmProcedure(driver, reference, loading.fuelLb, SF50_SELECTED_PILOT_PROFILE);
    return {
      ...evaluateSf50AfmMeasurement(reference, outcome.measurement),
      ...outcome,
      loading: { fuelLb: loading.fuelLb, payloadLb: loading.payloadLb,
        scenarioModelSha256: loading.scenarioModelSha256 },
      proposedSyntheticLoading: makeSf50SyntheticLoading(reference.conditions.weightLb),
    };
  } finally {
    driver.dispose();
  }
}

async function staticThrust() {
  const reference = SF50_AFM_REFERENCE_CASES[0];
  const { driver, loading } = await createDriver(reference);
  try {
    driver.initialize(initialState(reference, loading.fuelLb));
    driver.setHoldDown(true);
    let sample;
    for (let step = 0; step < 2400; step++) sample = driver.step();
    const actualLb = sample.thrustLb;
    return { reference: SF50_RATED_THRUST, actualLb,
      relativeError: actualLb === null ? null : (actualLb - SF50_RATED_THRUST.thrustLb) / SF50_RATED_THRUST.thrustLb,
      status: "diagnostic-only", note: "Rated-thrust comparison; not an installed bleed-ON performance validation." };
  } finally { driver.dispose(); }
}

const results = [];
for (const reference of SF50_AFM_REFERENCE_CASES) {
  try { results.push(await runCase(reference)); }
  catch (error) {
    results.push({ caseId: reference.id, status: "error", message: error.message, cause: String(error.cause ?? "") });
  }
}
let thrust;
try { thrust = await staticThrust(); }
catch (error) { thrust = { status: "error", message: error.message }; }
const report = {
  afmSource: SF50_AFM_SOURCE,
  benchmarkAssumptions: sf50AfmPilotAssumptions(SF50_SELECTED_PILOT_PROFILE),
  caseSelection: SF50_CASE_SELECTION,

  schemaVersion: 1, aircraftId, generatedAt: new Date().toISOString(),
  runtime: { node: process.version, platform: process.platform, arch: process.arch,
    sdk: sdkRoot ?? "@0x62/jsbsim-wasm", fixedDtSec: 1 / 120 },
  packageHashes, procedureVersion: "development-pilot-v6-response",
  calibrated: false, results, staticThrust: thrust,
};
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
if (!args.includes("--report-only") && results.some(result => result.status !== "pass")) process.exitCode = 1;
