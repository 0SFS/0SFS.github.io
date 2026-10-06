#!/usr/bin/env node
// 0sfs owns installed aircraft/SDK lifecycle qualification. No server, browser,
// performance benchmark, native physics substitute or calibrated F135 claim.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { rolldown } from "rolldown";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmModuleUrl, wasmBinaryUrl } from "@felipegalind0/jsbsim/wasm";
import { newOutputDirectory } from "../../outputDirectory.mjs";
import { verifyInstalledSdk } from "../../verify-jsbsim-artifact.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: node scripts/validation/aircraft/check-turbine-thermal.mjs [--out=build/new-directory] [--cases=dry-99-cycle,...]\nInstalled SDK, actual public F135 data, native thermal/control and app recovery/relocation checks. No browser, server or timing benchmark.");
  process.exit(0);
}
if (args.some(arg => !arg.startsWith("--out=") && !arg.startsWith("--cases="))
  || ["--out=", "--cases="].some(prefix => args.filter(arg => arg.startsWith(prefix)).length > 1)) throw new Error("Use --help for arguments");
const explicit = args.find(arg => arg.startsWith("--out="))?.slice(6);
const selectedCases = args.find(arg => arg.startsWith("--cases="))?.slice(8).split(",");
if (selectedCases?.some(name => !name)) throw new Error("--cases must contain scenario names");
const out = explicit ? path.resolve(explicit) : newOutputDirectory("validation", "turbine-thermal");
if (!out.startsWith(path.join(root, "build") + path.sep)) throw new Error("Output must stay in this repository's build directory");
if (explicit) await mkdir(out); // Never overwrite a previous run.
const artifact = await verifyInstalledSdk(root);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const helperEntry = path.join(out, "application-helpers.ts");
await writeFile(helperEntry, [
  ["bootstrapAircraft", "src/flight/jsbsim/bootstrapC172.ts"],
  ["createEngineControl", "src/flight/jsbsim/engineControl.ts"],
  ["getFdmProfile", "src/flight/jsbsim/fdmProfiles.ts"],
  ["flightParameterDefaults", "src/flight/settings/flightParameters.ts"],
  ["resolveAircraftDataFiles", "src/flight/jsbsim/hydrateJsbsimData.ts"],
  ["captureSimulation,restoreSimulation", "src/flight/physics/safeFlightState.ts"],
  ["resetFlightLocation", "src/flight/jsbsim/resetFlightLocation.ts"],
].map(([exports, file]) => `export {${exports}} from ${JSON.stringify(path.join(root, file))};`).join("\n") + "\n");
const helperBundle = path.join(out, "application-helpers.mjs");
const bundle = await rolldown({ input: helperEntry, plugins: [{ name: "terminal-base-url", transform(code) {
  return code.includes("import.meta.env.BASE_URL")
    ? { code: code.replaceAll("import.meta.env.BASE_URL", JSON.stringify("/")), map: null } : null;
} }],
  external: id => !id.startsWith(".") && !path.isAbsolute(id) });
let bundled;
try { bundled = await bundle.write({ file: helperBundle, format: "esm" }); } finally { await bundle.close(); }
const sourceFiles = [...new Set(bundled.output.flatMap(chunk => chunk.type === "chunk" ? Object.keys(chunk.modules) : []))]
  .filter(file => path.isAbsolute(file) && file.startsWith(root) && !file.startsWith(out));
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [path.relative(root, file), hash(await readFile(file))])));
const { bootstrapAircraft, createEngineControl, getFdmProfile, flightParameterDefaults, resolveAircraftDataFiles,
  captureSimulation, restoreSimulation, resetFlightLocation } = await import(pathToFileURL(helperBundle).href);
const aircraftId = "f-35b", profile = getFdmProfile(aircraftId), dt = 1 / 120;
const manifestFile = "public/jsbsim-data/manifest.json";
const manifestBytes = await readFile(path.join(root, manifestFile));
sourceHashes[manifestFile] = hash(manifestBytes);
const data = await Promise.all(resolveAircraftDataFiles(JSON.parse(manifestBytes.toString("utf8")), aircraftId)
  .map(async file => [file, await readFile(path.join(root, "public/jsbsim-data", file))]));
const dataHashes = Object.fromEntries(data.map(([file, bytes]) => [file, hash(bytes)]));
const opticalFile = "src/flight/aircraft/generated/f135-exhaust-lut.manifest.json";
const opticalBytes = await readFile(path.join(root, opticalFile));
sourceHashes[opticalFile] = hash(opticalBytes);
const surface = JSON.parse(opticalBytes.toString("utf8")).profile.surfaceEmission;
assert.equal(surface.unit, "cd/m2");
const parameterDefaults = flightParameterDefaults();
const defaultReferenceNits = parameterDefaults.get("osfs.exhaust.surfaceReferenceNits");
const defaultIntensity = parameterDefaults.get("osfs.exhaust.intensity");
// The same baked surface table/interpolation as production, without a GPU or
// exposure assumption. This computes expected material input, not screenshot
// brightness/perceived visibility or a measured F135 metal emissivity.
const surfaceObservation = kelvin => {
  const [minimum, maximum] = surface.temperatureKelvinRange;
  let rgb = [0, 0, 0];
  if (Number.isFinite(kelvin) && kelvin >= minimum) {
    const coordinate = Math.min(1, (kelvin - minimum) / (maximum - minimum)) * (surface.samples.length - 1);
    const low = Math.floor(coordinate), high = Math.min(surface.samples.length - 1, low + 1), fraction = coordinate - low;
    rgb = surface.samples[low].map((value, channel) => value + (surface.samples[high][channel] - value) * fraction);
  }
  const luminanceCdPerSquareMeter = .2126729 * rgb[0] + .7151522 * rgb[1] + .072175 * rgb[2];
  return { luminanceCdPerSquareMeter, equivalentLinearRgbCdPerSquareMeter: rgb,
    expectedLinearEmissionRgb: rgb.map(value => value * defaultIntensity / defaultReferenceNits),
    expectedLinearEmissionY: luminanceCdPerSquareMeter * defaultIntensity / defaultReferenceNits,
    temperatureClampedAtTableMaximum: kelvin > maximum };
};
const engineFile = "aircraft/F-35B-jsbsim/Engines/F135-PW-600.xml";
const engineXml = data.find(([file]) => file === engineFile)?.[1].toString("utf8");
assert.ok(engineXml, "Public F135 dependency is absent");
const scalar = tag => Number(new RegExp(`<${tag}>\\s*([\\d.eE+-]+)\\s*</${tag}>`).exec(engineXml)?.[1]);
const stoichiometricRatio = scalar("stoichiometric-fuel-air-ratio");
assert.ok(Number.isFinite(stoichiometricRatio) && stoichiometricRatio > 0, "Public engine must declare the tested stoichiometric bound");
// This is a checked transcription of the installed XML INPUT schedule, not
// a replacement for its energy/metal equations or an inferred F135 mass flow.
// Fail explicitly if the source changes to an unsupported function form.
const flowFunction = /<gas-mass-flow-kg-sec>([\s\S]*?)<\/gas-mass-flow-kg-sec>/.exec(engineXml)?.[1].replace(/\s+/g, "");
const flowMatch = /^<function><product><value>([\d.eE+-]+)<\/value><pow><quotient><property>propulsion\/engine\[#\]\/n2<\/property><value>100<\/value><\/quotient><value>2<\/value><\/pow><quotient><property>propulsion\/pt-lbs_sqft<\/property><value>([\d.eE+-]+)<\/value><\/quotient><sqrt><quotient><value>([\d.eE+-]+)<\/value><sum><property>propulsion\/tat-c<\/property><value>273.15<\/value><\/sum><\/quotient><\/sqrt><\/product><\/function>$/.exec(flowFunction ?? "");
assert.ok(flowMatch, "Update the qualification's source-input reader for the new XML mass-flow schedule");
const flowInputs = { referenceKgSec: Number(flowMatch[1]), pressurePsf: Number(flowMatch[2]), temperatureK: Number(flowMatch[3]) };
assert.ok(Object.values(flowInputs).every(value => Number.isFinite(value) && value > 0));
const base = "propulsion/engine[0]/", thermal = base + "thermal/";
const thermalProperties = {
  gasK: thermal + "nozzle-gas-temperature-k", metalK: thermal + "metal-temperature-k",
  stateK: thermal + "metal-temperature-state-k", initialized: thermal + "initialized",
  valid: thermal + "valid", suppliedAbFuelKgSec: thermal + "afterburner-fuel-flow-kg-sec",
  burnedAbFuelKgSec: thermal + "afterburner-burned-fuel-flow-kg-sec",
};
const trace = [], checks = [], sdkLog = [], catalogs = [];
const failures = [];
let dryHeating = null;
const close = (actual, expected, message, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `${message}: ${actual} differs from ${expected}`);
const canonical = property => property.replace(/\[0\]/g, "");
let boundEvaluations = 0, maxBurnedLimitErrorKgSec = 0, limitedFuelSeen = false;

async function withAircraft(name, options, run) {
  if (selectedCases && !selectedCases.includes(name)) return;
  const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false } });
  sdk.on("stderr", ({ message }) => sdkLog.push(`${name}: ${message}`));
  try {
    for (const [file, bytes] of data) sdk.writeDataFile(file, bytes.toString("utf8"));
    await bootstrapAircraft(sdk, aircraftId, { latDeg: 0, lonDeg: 0, altFt: 1000, airspeedKts: 0,
      throttleNorm: 0, engineRunning: false, ...options });
    sdk.setHoldDown(true);
    const get = property => sdk.getPropertyValue(property);
    const set = (property, value) => sdk.setPropertyValue(property, value);
    const sample = phase => {
      const values = Object.fromEntries(Object.entries(thermalProperties).map(([key, property]) => [key, get(property)]));
      const row = { scenario: name, phase, timeS: sdk.getSimTime(), ...values,
        ambientK: get("propulsion/tat-c") + 273.15, totalPressurePsf: get("propulsion/pt-lbs_sqft"),
        egtC: get(base + "egt-degc"), n2Pct: get(base + "n2"), fuelFlowPps: get(base + "fuel-flow-rate-pps"),
        running: get(base + "set-running"), augmentation: get(base + "augmentation"),
        metalVisibleEmission: surfaceObservation(values.metalK) };
      assert.ok([row.gasK, row.metalK, row.stateK, row.ambientK].every(value => Number.isFinite(value) && value > 0), `${name}/${phase}: invalid thermal observations`);
      assert.equal(row.valid, 1, `${name}/${phase}: native inputs invalid`);
      close(row.metalK, row.stateK, `${name}/${phase}: observer differs from exact state`);
      return row;
    };
    const bound = row => {
      if (row.augmentation !== 1) {
        close(row.suppliedAbFuelKgSec, 0, "Dry source reported supplied AB fuel");
        close(row.burnedAbFuelKgSec, 0, "Dry source reported burned AB fuel");
        return;
      }
      const incomingGasKgSec = flowInputs.referenceKgSec * (row.n2Pct / 100) ** 2
        * row.totalPressurePsf / flowInputs.pressurePsf * Math.sqrt(flowInputs.temperatureK / row.ambientK);
      const totalFuelKgSec = row.fuelFlowPps * .45359237;
      const coreFuelKgSec = Math.max(0, totalFuelKgSec - row.suppliedAbFuelKgSec);
      const remainingCapacityKgSec = Math.max(0, Math.max(0, incomingGasKgSec - coreFuelKgSec) * stoichiometricRatio - coreFuelKgSec);
      const limit = Math.min(row.suppliedAbFuelKgSec, remainingCapacityKgSec);
      assert.ok(row.suppliedAbFuelKgSec >= 0 && row.burnedAbFuelKgSec >= 0);
      assert.ok(row.suppliedAbFuelKgSec <= totalFuelKgSec + 1e-8, "AB supply exceeds all native fuel");
      const error = Math.abs(row.burnedAbFuelKgSec - limit);
      maxBurnedLimitErrorKgSec = Math.max(maxBurnedLimitErrorKgSec, error);
      close(row.burnedAbFuelKgSec, limit, "Burned AB fuel differs from the declared oxygen bound");
      boundEvaluations++;
      limitedFuelSeen ||= row.burnedAbFuelKgSec < row.suppliedAbFuelKgSec - 1e-5;
    };
    const control = createEngineControl(sdk, profile);
    let count = 0;
    const step = (phase, held = false) => {
      control.step(held); assert.equal(sdk.run(), true, `${name}/${phase}: native run failed`);
      const row = sample(phase); bound(row);
      if (++count % 120 === 0) trace.push(row);
      return row;
    };
    const advance = (phase, seconds, throttle, held = false) => {
      if (throttle !== undefined) set("fcs/throttle-cmd-norm", throttle);
      let row;
      for (let i = 0; i < Math.round(seconds / dt); i++) row = step(phase, held);
      trace.push(row);
      return row;
    };
    await run({ sdk, get, set, sample, step, advance, control });
    checks.push({ name, passed: true });
  } catch (error) {
    checks.push({ name, passed: false, error: error.stack ?? String(error) });
    failures.push(`${name}: ${error.message}`);
  } finally { sdk.destroy(); }
}

await withAircraft("warm-shortcut-after-cold-accepted-step", {}, ({ sdk, get, set, sample, step }) => {
  const cold = step("cold-first-accepted-step"); trace.push(cold);
  assert.equal(cold.initialized, 1);
  const time = sdk.getSimTime();
  set("propulsion/set-running", -1);
  const warmed = sample("same-time-InitRunning"); trace.push(warmed);
  close(sdk.getSimTime(), time, "InitRunning advanced simulation time");
  close(warmed.stateK, cold.stateK, "InitRunning changed an established cold wall at zero elapsed time");
  assert.equal(sdk.runIc(), true);
  close(get(thermalProperties.stateK), cold.stateK, "Warm zero-time RunIC changed an established wall");
});

await withAircraft("cold-start-heating-and-cutoff", {}, ({ sdk, get, set, sample, step, advance, control }) => {
  const catalog = sdk.queryPropertyCatalog("/thermal/"); catalogs.push(catalog);
  const access = new Map(catalog.split(/\r?\n/).flatMap(line => {
    const match = /^(\S+)\s+\(([RW]+)\)$/.exec(line.trim()); return match ? [[match[1], match[2]]] : [];
  }));
  for (const [key, property] of Object.entries(thermalProperties)) assert.equal(access.get(canonical(property)), key === "stateK" ? "RW" : "R", `Native property access ${property}`);
  assert.ok([...access.keys()].every(property => /^propulsion\/engine\/thermal\//.test(property)), "An auxiliary force carrier unexpectedly acquired thermal capabilities");
  const pending = sample("cold-RunIC"); trace.push(pending); assert.equal(pending.initialized, 0);
  const cold = step("cold-first-accepted-step"); trace.push(cold);
  close(cold.metalK, cold.ambientK, "Cold source did not initialize at ambient");
  for (const [key, property] of Object.entries(thermalProperties)) {
    if (key === "stateK") continue;
    const before = get(property); set(property, 123456); close(get(property), before, `Read-only observation accepted a write: ${property}`);
  }
  let running;
  for (let i = 0; i < 60 / dt; i++) { running = step("starter", true); if (running.running > .5) break; }
  trace.push(running); assert.equal(running.running, 1, "Actual aircraft starter did not reach running");
  const startRows = trace.filter(row => row.phase === "starter");
  assert.ok(startRows.some(row => row.gasK > cold.gasK + 10 && row.running === 0), "Cold starter never heated before running");
  assert.ok(startRows.some(row => row.gasK > row.metalK + 10), "Dynamic wall had no startup lag");
  const dry = advance("dry", 20, .98);
  assert.equal(dry.augmentation, 0); assert.ok(dry.metalK > cold.metalK + 10);
  const ab = advance("afterburner", 20, 1);
  assert.equal(ab.augmentation, 1); assert.ok(ab.gasK > dry.gasK + 10, "AB fuel did not increase modeled nozzle gas heat");
  assert.ok(ab.gasK > ab.metalK, "Dynamic wall instantly reached augmented gas temperature");
  assert.ok(limitedFuelSeen, "Public oxygen limit was never exercised by actual afterburner fuel");
  control.shutdown();
  const off = step("cutoff"); trace.push(off);
  assert.equal(off.running, 0); assert.equal(off.augmentation, 0);
  assert.ok(off.fuelFlowPps <= ab.fuelFlowPps + 1e-8, "Cutoff increased the native fuel-flow observation");
  assert.ok(off.metalK > cold.metalK + 10, "Cutoff discarded hot wall state");
  assert.ok(Math.abs(off.metalK - ab.metalK) < .02 * ab.metalK, "Cutoff caused an instantaneous wall discontinuity");
  // Existing FGTurbine::Off uses Seek for fuel rundown. Native Running/AB
  // turn off immediately, while PPS reaches zero over accepted finite time.
  let lastOff = off;
  for (let i = 0; i < 20 / dt; i++) {
    const row = step("cutoff-fuel-rundown");
    assert.equal(row.running, 0); assert.equal(row.augmentation, 0);
    assert.ok(row.fuelFlowPps <= lastOff.fuelFlowPps + 1e-8, "Native cutoff fuel did not decrease monotonically");
    lastOff = row;
  }
  trace.push(lastOff);
  close(lastOff.fuelFlowPps, 0, "Native cutoff fuel did not reach zero after bounded rundown");
  const cool = advance("long-cooldown", 180, 0);
  assert.ok(cool.metalK < off.metalK, "Stopped wall did not cool over longer accepted time");
  assert.ok(cool.metalK >= Math.min(cool.ambientK, cold.ambientK) - 1e-8, "Stopped wall cooled below its ambient baths");
});

await withAircraft("zero-time-hold-read-and-native-state-restore", { engineRunning: true, throttleNorm: .7 }, ({ sdk, get, set, sample, step, advance }) => {
  const pending = sample("warm-RunIC-pending"); trace.push(pending); assert.equal(pending.initialized, 0);
  const pendingWall = pending.stateK;
  assert.equal(sdk.runIc(), true); close(get(thermalProperties.stateK), pendingWall, "Warm RunIC initialized wall at zero time");
  assert.equal(get(thermalProperties.initialized), 0);
  const warm = step("warm-first-accepted-step"); trace.push(warm); assert.equal(warm.initialized, 1);
  advance("warm-dry", 5, .98);
  const before = sample("before-nonaging-checks"); trace.push(before);
  for (let i = 0; i < 200; i++) close(sample("repeated-read").stateK, before.stateK, "Reading aged the wall");
  const time = sdk.getSimTime();
  sdk.hold();
  try { for (let i = 0; i < 20; i++) assert.equal(sdk.run(), true); } finally { sdk.resume(); }
  close(sdk.getSimTime(), time, "Native hold advanced time"); close(get(thermalProperties.stateK), before.stateK, "Native hold aged wall");
  sdk.suspendIntegration();
  try { for (let i = 0; i < 20; i++) assert.equal(sdk.run(), true); } finally { sdk.resumeIntegration(); }
  close(get(thermalProperties.stateK), before.stateK, "Zero-dt evaluation aged wall");
  for (let i = 0; i < 3; i++) {
    assert.equal(sdk.runIc(), true); close(get(thermalProperties.stateK), before.stateK, "RunIC aged wall");
    set("propulsion/set-running", -1); close(get(thermalProperties.stateK), before.stateK, "InitRunning steady-state search aged wall");
  }
  sdk.setTrimStatus(true);
  try { for (let i = 0; i < 10; i++) assert.equal(sdk.run(), true); } finally { sdk.setTrimStatus(false); }
  close(get(thermalProperties.stateK), before.stateK, "Positive-dt trim evaluation aged wall");
  sdk.resetToInitialConditions(2); assert.equal(get(thermalProperties.initialized), 0); assert.equal(get(thermalProperties.valid), 0);
  assert.ok(get(thermalProperties.stateK) < before.stateK, "Cold reset retained the previous hot wall");
  set(thermalProperties.stateK, before.stateK); assert.equal(get(thermalProperties.initialized), 1);
  assert.equal(sdk.runIc(), true); set("propulsion/set-running", -1); assert.equal(sdk.runIc(), true);
  close(get(thermalProperties.stateK), before.stateK, "Exact native state restore was replaced by warm initialization");
  const next = step("native-restored-next-step"); trace.push(next);
  assert.ok(Math.abs(next.metalK - before.metalK) < .02 * before.metalK, "First restored step replaced native state with a seed");
});

await withAircraft("application-snapshot-recovery", { engineRunning: true, throttleNorm: .7 }, ({ sdk, get, sample, step, advance }) => {
  advance("warm-dry", 5, .98);
  const before = sample("before-snapshot"); trace.push(before);
  const snapshot = captureSimulation(sdk);
  const stateProperty = canonical(thermalProperties.stateK);
  close(snapshot.controls[stateProperty], before.stateK, "Application snapshot missed native wall state");
  advance("changed-after-snapshot", 2, 1);
  restoreSimulation(sdk, snapshot);
  close(get(thermalProperties.stateK), before.stateK, "Application recovery did not restore exact wall state");
  close(sdk.getSimTime(), snapshot.simTimeS, "Application recovery changed captured native time");
  assert.equal(get(thermalProperties.initialized), 1); assert.equal(get(thermalProperties.valid), 1);
  const restored = sample("application-restored"); trace.push(restored);
  const next = step("application-restored-next-step"); trace.push(next);
  assert.ok(Math.abs(next.metalK - before.metalK) < .02 * before.metalK, "Application recovery replaced wall on the next step");
});

for (const mode of ["free", "departure", "arrival"]) await withAircraft("relocation-" + mode,
  { engineRunning: true, throttleNorm: .7 }, ({ sdk, get, sample, step, advance }) => {
    advance("warm-dry", 5, .98);
    const before = sample("before-relocation"); trace.push(before);
    const location = { latDeg: 1, lonDeg: 2, altMeters: 1200,
      ...(mode === "free" ? {} : { flightPreset: { mode, headingDeg: 90, groundElevationMeters: 100, flightPathDeg: mode === "arrival" ? -3 : 0 } }) };
    resetFlightLocation(sdk, location, 100, aircraftId);
    sdk.setHoldDown(true); // Temperature qualification excludes ground/motion dynamics.
    close(get(thermalProperties.stateK), before.stateK, `${mode}: relocation discarded native hot state`);
    assert.equal(get(thermalProperties.initialized), 1); assert.equal(get(thermalProperties.valid), 1);
    trace.push(sample("relocated"));
    const next = step("relocated-next-step"); trace.push(next);
    assert.ok(Math.abs(next.metalK - before.metalK) < .02 * before.metalK, `${mode}: first step replaced relocated wall with a seed`);
  });

await withAircraft("cold-reset-and-model-reload", { engineRunning: true, throttleNorm: .7 }, async ({ sdk, get, sample, step, advance }) => {
  const warm = advance("warm-dry", 5, .98);
  sdk.resetToInitialConditions(2);
  assert.equal(get(thermalProperties.initialized), 0); assert.equal(get(thermalProperties.valid), 0);
  close(get(thermalProperties.stateK), get("propulsion/tat-c") + 273.15, "Reset wall is not ambient");
  assert.equal(sdk.runIc(), true); assert.ok(get(thermalProperties.stateK) < warm.stateK);
  await bootstrapAircraft(sdk, aircraftId, { latDeg: 0, lonDeg: 0, altFt: 1000, airspeedKts: 0, throttleNorm: 0, engineRunning: false });
  sdk.setHoldDown(true);
  const pending = sample("cold-model-reload"); trace.push(pending); assert.equal(pending.initialized, 0);
  const cold = step("cold-model-reload-first-step"); trace.push(cold);
  close(cold.stateK, cold.ambientK, "Reload retained previous hot state instead of fresh ambient");
  assert.ok(cold.stateK < warm.stateK);
});

await withAircraft("dry-99-cycle", {}, ({ step, advance }) => {
  const cold = step("cold-first-accepted-step"); trace.push(cold);
  let running;
  for (let i = 0; i < 60 / dt; i++) { running = step("starter", true); if (running.running > .5) break; }
  assert.equal(running.running, 1, "Actual cold starter did not reach running");
  const idle = advance("idle-settled", 60, 0);
  const dry = advance("99-percent-dry-from-idle", 120, .99);
  assert.equal(idle.augmentation, 0); assert.equal(dry.augmentation, 0, "99% unexpectedly enabled afterburner");
  assert.ok(dry.metalK > idle.metalK + 10 && dry.metalK > cold.metalK + 10, "99% dry did not heat the native metal from cold/idle");
  assert.ok(dry.metalVisibleEmission.luminanceCdPerSquareMeter > idle.metalVisibleEmission.luminanceCdPerSquareMeter,
    "Dry-heated native metal did not increase the baked visible luminance");
  const dryTail = trace.filter(row => row.scenario === "dry-99-cycle" && row.phase === "99-percent-dry-from-idle" && row.timeS > dry.timeS - 10);
  const dryTailSpanKelvin = Math.max(...dryTail.map(row => row.metalK)) - Math.min(...dryTail.map(row => row.metalK));
  assert.ok(dryTailSpanKelvin < 1, "Cold-to-dry fixture did not settle near its dry thermal equilibrium");
  const augmented = advance("afterburner-from-dry", 60, 1);
  assert.equal(augmented.augmentation, 1);
  assert.ok(augmented.gasK > dry.gasK + 10 && augmented.metalK > dry.metalK + 10, "AB did not heat beyond the dry thermal state");
  const firstDry = advance("99-percent-first-step-from-ab", dt, .99);
  assert.equal(firstDry.augmentation, 0); assert.ok(firstDry.metalK < augmented.metalK, "Hot metal did not begin cooling after returning to 99% dry");
  assert.ok(Math.abs(firstDry.metalK - augmented.metalK) < .02 * augmented.metalK, "AB→dry transition discarded wall state");
  const returnedDry = advance("99-percent-dry-from-ab", 120, .99);
  assert.equal(returnedDry.augmentation, 0); assert.equal(returnedDry.running, 1);
  assert.ok(returnedDry.metalK < augmented.metalK, "AB-heated wall did not cool in 99% dry operation");
  const sameDryEquilibriumErrorKelvin = Math.abs(returnedDry.metalK - dry.metalK);
  assert.ok(sameDryEquilibriumErrorKelvin < 1, "Hot/cold histories did not approach the same 99% dry equilibrium");
  const returnedTail = trace.filter(row => row.scenario === "dry-99-cycle" && row.phase === "99-percent-dry-from-ab" && row.timeS > returnedDry.timeS - 10);
  const returnedTailSpanKelvin = Math.max(...returnedTail.map(row => row.metalK)) - Math.min(...returnedTail.map(row => row.metalK));
  assert.ok(returnedTailSpanKelvin < 1, "AB-to-dry fixture did not settle near its dry thermal equilibrium");
  dryHeating = { cold, idle, dry, augmented, firstDry, returnedDry, dryTailSpanKelvin, returnedTailSpanKelvin, sameDryEquilibriumErrorKelvin,
    conditions: "Same native hold-down, zero wind/airspeed, 1000 ft; 60s idle, 120s 99% dry, 60s AB, 120s 99% dry, after an actual cold starter sequence.",
    interpretation: "99% dry heats metal from a colder idle state but cools hotter AB metal toward the same modeled dry equilibrium. Visible luminance is reported separately from native temperature; no scene visibility or F135 temperature calibration is inferred." };
});

for (const requested of selectedCases ?? []) if (!checks.some(check => check.name === requested)) failures.push("Unknown selected scenario: " + requested);
const finalSourceHashes = Object.fromEntries(await Promise.all(Object.keys(sourceHashes).map(async file => [file, hash(await readFile(path.join(root, file)))])));
const finalDataHashes = Object.fromEntries(await Promise.all(Object.keys(dataHashes).map(async file => [file, hash(await readFile(path.join(root, "public/jsbsim-data", file)))])));
const finalArtifact = await verifyInstalledSdk(root);
const sourceIdentityStable = isDeepStrictEqual(sourceHashes, finalSourceHashes) && isDeepStrictEqual(dataHashes, finalDataHashes)
  && isDeepStrictEqual(artifact, finalArtifact);
if (!sourceIdentityStable) failures.push("App source, aircraft data or installed SDK changed during qualification");
const report = {
  schema: "0sfs-installed-turbine-thermal/1", createdUtc: new Date().toISOString(), aircraftId, dt, artifact,
  sourceHashes, dataHashes, sourceIdentityStable, helperEnvironment: { viteBaseUrl: "/" }, helperBundleSha256: hash(await readFile(helperBundle)),
  toolSha256: hash(await readFile(fileURLToPath(import.meta.url))), selectedCases: selectedCases ?? "all", catalogs, checks, trace,
  dryHeating, opticalSurface: { source: opticalFile, temperatureKelvinRange: surface.temperatureKelvinRange, unit: surface.unit,
    referenceLuminanceCdPerSquareMeter: defaultReferenceNits, intensity: defaultIntensity,
    settings: "Catalogue defaults, not the pilot's persisted overrides or calibrated scene exposure." },
  configuredMassFlowInput: { ...flowInputs, expression: "referenceKgSec*(N2/100)^2*(totalPressurePsf/pressurePsf)*sqrt(temperatureK/TAT_K)", source: engineFile },
  stoichiometricFuelAirRatio: stoichiometricRatio, boundEvaluations, maxBurnedLimitErrorKgSec, limitedFuelSeen,
  failures, pass: checks.every(check => check.passed) && sourceIdentityStable && failures.length === 0,
  limitations: [
    "Actual installed SDK and public F135 dependency; inputs are provisional aircraft configuration, not measured F135 station, material or cooling parameters.",
    "Native hold-down isolates thermal lifecycle from flight, ground/collision and structural dynamics; relocation calls are the actual app helpers.",
    "The mass-flow input expression is read and checked against this XML schedule, not measured or inferred from a real F135. Native equation/closed-form checks are separately owned by JSBSim.",
    "The 2% next-step continuity guard detects lost state/warm reseeding at120Hz; it is a software lifecycle guard, not a calibrated F135 heating-rate tolerance.",
    "No browser/GPU render, timing benchmark, device qualification or physically calibrated visible-spectrum claim.",
  ],
};
await writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
await writeFile(path.join(out, "sdk.log"), sdkLog.join("\n") + "\n");
console.log(JSON.stringify({ out, pass: report.pass, checks, dryHeating, boundEvaluations, maxBurnedLimitErrorKgSec, limitedFuelSeen, sourceIdentityStable }, null, 2));
if (!report.pass) process.exitCode = 1;
