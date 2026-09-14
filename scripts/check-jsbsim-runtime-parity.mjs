#!/usr/bin/env node
// Matched software/runtime scenarios; no real-aircraft calibration claim.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyInstalledSdk } from "./verify-jsbsim-artifact.mjs";
import { JSBSimSdk, buildIdentity } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
function option(name) {
  const at = args.indexOf(name);
  if (at < 0 || !args[at + 1]) throw new Error(`Required: ${name} VALUE`);
  return path.resolve(args[at + 1]);
}
const python = option("--python");
const nativeBuild = option("--native-build");
const nativeSource = option("--native-source");
const output = option("--output");
const hash = value => createHash("sha256").update(value).digest("hex");
const git = spawnSync("git", ["--no-optional-locks", "-C", nativeSource, "rev-parse", "HEAD"], { encoding: "utf8" });
assert.equal(git.status, 0, git.stderr);
assert.equal(git.stdout.trim(), buildIdentity.native.commit, "native and WASM commits must agree");
const cache = await readFile(path.join(nativeBuild, "CMakeCache.txt"), "utf8");
assert.ok(cache.includes(`CMAKE_HOME_DIRECTORY:INTERNAL=${nativeSource}\n`), "native build must use the selected canonical source");
const nativeDirty = spawnSync("git", ["--no-optional-locks", "-C", nativeSource, "status", "--porcelain", "--untracked-files=normal"], { encoding: "utf8" });
assert.equal(nativeDirty.status, 0, nativeDirty.stderr);
assert.equal(nativeDirty.stdout.trim(), "", "commit/preserve native source before recording parity");
const installedArtifact = await verifyInstalledSdk(root);
assert.deepEqual(installedArtifact.identity, buildIdentity);
const packageManifest = JSON.parse(await readFile(path.join(root, "public/jsbsim-data/manifest.json"), "utf8"));
const files = {};
for (const entry of new Set(Object.values(packageManifest.aircraft).flat())) {
  files[entry] = await readFile(path.join(root, "public/jsbsim-data", entry), "utf8");
}
const models = [
  ["cessna-172", "c172p", true],
  ["cirrus-vision-jet", "sf50", false],
  ["cirrus-vision-jet-g2", "sf50-g2", false],
  ["cirrus-vision-jet-g3", "sf50-g3", false],
];
const properties = [
  "simulation/sim-time-sec", "position/lat-geod-deg", "position/long-gc-deg", "position/h-sl-ft",
  "velocities/u-fps", "velocities/v-fps", "velocities/w-fps", "velocities/vc-kts",
  "attitude/phi-rad", "attitude/theta-rad", "attitude/psi-rad",
  "velocities/p-rad_sec", "velocities/q-rad_sec", "velocities/r-rad_sec",
  "inertia/weight-lbs", "inertia/cg-x-in", "inertia/cg-y-in", "inertia/cg-z-in",
  "atmosphere/T-R", "atmosphere/P-psf", "atmosphere/rho-slugs_ft3",
  "atmosphere/wind-north-fps", "atmosphere/wind-east-fps", "atmosphere/wind-down-fps",
  "propulsion/engine[0]/thrust-lbs", "propulsion/tank[0]/contents-lbs", "gear/gear-pos-norm",
];
const initial = {
  "ic/lat-geod-deg": 44.977753, "ic/long-gc-deg": -93.265011,
  "ic/h-sl-ft": 5000, "ic/terrain-elevation-ft": 0, "ic/psi-true-deg": 300,
  "ic/theta-deg": 0, "ic/phi-deg": 0,
  "fcs/elevator-cmd-norm": 0, "fcs/aileron-cmd-norm": 0, "fcs/rudder-cmd-norm": 0,
  "fcs/flap-cmd-norm": 0, "fcs/left-brake-cmd-norm": 0, "fcs/right-brake-cmd-norm": 0,
  "ic/vw-mag-fps": 0,
};
const scenarios = models.map(([id, model, piston]) => ({
  id, model, piston, dt: 1 / 120, steps: 240, files: packageManifest.aircraft[id],
  initial: { ...initial, "ic/vc-kts": piston ? 100 : 130, "gear/gear-cmd-norm": piston ? 1 : 0,
    "gear/gear-pos-norm": piston ? 1 : 0, [piston ? "fcs/flap-pos-deg" : "fcs/flap-pos-norm"]: 0 },
  properties: [...properties, ...(piston ? ["propulsion/engine[0]/engine-rpm"] : ["propulsion/engine[0]/n1", "propulsion/engine[0]/n2"])],
  throttleChecks: piston ? [0.65] : [0, 0.35, 1, 0],
  reset: { "ic/lat-geod-deg": 46.7867, "ic/long-gc-deg": -92.1005, "ic/h-sl-ft": 8500, "ic/psi-true-deg": 45 },
}));
await mkdir(path.dirname(output), { recursive: true });
const evidenceRoot = await mkdtemp(output + ".evidence-");
const work = evidenceRoot;
const input = { files, scenarios };
// Reconfigure and rebuild here so a stale extension cannot satisfy a source label.
const nativeBuildCommands = [
  ["cmake", "-S", nativeSource, "-B", nativeBuild, "-DCMAKE_BUILD_TYPE=Release", "-DBUILD_DOCS=OFF", "-DBUILD_PYTHON_MODULE=ON",
    "-DBUILD_JULIA_PACKAGE=OFF", "-DBUILD_MATLAB_SFUNCTION=OFF", `-DPython3_EXECUTABLE=${python}`,
    `-DCYTHON_EXECUTABLE=${path.join(path.dirname(python), "cython")}`],
  ["cmake", "--build", nativeBuild, "--clean-first", "--target", "_jsbsim", "FGLogTest1", "--parallel", "6"],
];
const nativeEnvironment = { ...process.env };
for (const variable of ["TRAVIS", "APPVEYOR", "GITHUB_RUN_NUMBER", "GITHUB_SHA"]) delete nativeEnvironment[variable];
for (const [command, ...arguments_] of nativeBuildCommands) {
  console.log("Native verification: " + [command, ...arguments_].join(" "));
  const result = spawnSync(command, arguments_, { encoding: "utf8", env: nativeEnvironment, timeout: 300000, maxBuffer: 32 * 1024 * 1024 });
  await writeFile(path.join(work, arguments_[0] === "--build" ? "native-build.log" : "native-configure.log"), (result.stdout ?? "") + (result.stderr ?? ""));
  assert.equal(result.status, 0, `Native build failed; inspect ${work}: ${result.stderr}`);
}
const afterBuildHead = spawnSync("git", ["--no-optional-locks", "-C", nativeSource, "rev-parse", "HEAD"], { encoding: "utf8" });
const afterBuildStatus = spawnSync("git", ["--no-optional-locks", "-C", nativeSource, "status", "--porcelain", "--untracked-files=normal"], { encoding: "utf8" });
assert.equal(afterBuildHead.status, 0); assert.equal(afterBuildHead.stdout, git.stdout);
assert.equal(afterBuildStatus.status, 0); assert.equal(afterBuildStatus.stdout.trim(), "", "Native source changed during compilation");
await writeFile(path.join(work, "input.json"), JSON.stringify(input));
await writeFile(path.join(work, "native.py"), `import json, os, sys, pathlib, hashlib\nos.environ['JSBSIM_DEBUG']='0'\nimport jsbsim\nwork=pathlib.Path(sys.argv[1]); data=json.loads((work/'input.json').read_text()); results=[]\nfor case in data['scenarios']:\n root=work/case['model']; root.mkdir()\n for name in case['files']:\n  p=root/name; p.parent.mkdir(parents=True,exist_ok=True); p.write_bytes(data['files'][name].encode('utf-8'))\n f=jsbsim.FGFDMExec(str(root)); f.set_debug_level(0)\n f.set_aircraft_path('aircraft'); f.set_engine_path('engine'); f.set_systems_path('systems')\n assert f.load_model(case['model']); f.set_dt(case['dt'])\n catalog={line.split(' (')[0].replace('[0]','') for line in f.get_property_catalog()}\n for prop in case['properties']: assert prop.replace('[0]','') in catalog, 'Missing native property: '+prop\n for name,value in case['initial'].items(): f[name]=value\n assert f.run_ic()\n f['propulsion/set-running']=-1\n if case['piston']:\n  f['propulsion/magneto_cmd']=3; f['fcs/mixture-cmd-norm']=1\n states=[]\n def record(label):\n  states.append({'label':label,'values':[float(f[p]) for p in case['properties']]})\n for throttle in case['throttleChecks']:\n  f['fcs/throttle-cmd-norm']=throttle\n  assert f.run_ic(); record('zero-time:'+str(throttle))\n f['fcs/throttle-cmd-norm']=0.65 if case['piston'] else 0.35\n assert f.run_ic(); record('initial')\n for step in range(1,case['steps']+1):\n  if step==61: f['fcs/elevator-cmd-norm']=0.02; f['fcs/aileron-cmd-norm']=0.03\n  if step==121: f['fcs/elevator-cmd-norm']=0; f['fcs/aileron-cmd-norm']=0\n  assert f.run()\n  if step==1 or step%30==0: record('step:'+str(step))\n f.reset_to_initial_conditions(2)\n for name,value in {**case['initial'],**case['reset']}.items(): f[name]=value\n f['fcs/throttle-cmd-norm']=0.65 if case['piston'] else 0.35\n assert f.run_ic()\n f['propulsion/set-running']=-1\n if case['piston']:\n  f['propulsion/magneto_cmd']=3; f['fcs/mixture-cmd-norm']=1\n f['fcs/throttle-cmd-norm']=0.65 if case['piston'] else 0.35\n assert f.run_ic(); record('reset'); assert f.run(); record('reset-first-step')\n results.append({'id':case['id'],'samples':states})\nmodule=pathlib.Path(jsbsim.__file__).resolve()\nimport jsbsim._jsbsim as loaded_extension\nso=pathlib.Path(loaded_extension.__file__).resolve()\n(work/'native.json').write_text(json.dumps({'module':str(module),'extension':str(so),'extensionSha256':hashlib.sha256(so.read_bytes()).hexdigest(),'scenarios':results},allow_nan=False))\n`);
const run = spawnSync(python, [path.join(work, "native.py"), work], {
  encoding: "utf8", env: { ...process.env, PYTHONPATH: path.join(nativeBuild, "tests"), PYTHONOPTIMIZE: "0", JSBSIM_DEBUG: "0" },
  timeout: 120000, maxBuffer: 8 * 1024 * 1024,
});
await writeFile(path.join(work, "native.log"), run.stdout + run.stderr);
assert.equal(run.status, 0, `Native scenario failed: ${run.stderr}\nEvidence: ${work}`);
const native = JSON.parse(await readFile(path.join(work, "native.json"), "utf8"));
assert.ok(native.extension.startsWith(nativeBuild + path.sep), "Python must load the matching native build");
const wasm = [];
for (const scenario of scenarios) {
  const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl, log: { console: false } });
  try {
    for (const name of scenario.files) sdk.writeDataFile(name, files[name]);
    assert.equal(sdk.loadModel(scenario.model), true);
    sdk.setDt(scenario.dt);
    const catalog = new Set(sdk.queryPropertyCatalog("").split("\n").map(line => line.split(" (")[0].replaceAll("[0]", "")));
    for (const property of scenario.properties) assert.ok(catalog.has(property.replaceAll("[0]", "")), "Missing WASM property: " + property);
    for (const [name, value] of Object.entries(scenario.initial)) sdk.setPropertyValue(name, value);
    assert.equal(sdk.runIc(), true);
    sdk.setPropertyValue("propulsion/set-running", -1);
    if (scenario.piston) {
      sdk.setPropertyValue("propulsion/magneto_cmd", 3);
      sdk.setPropertyValue("fcs/mixture-cmd-norm", 1);
    }
    const samples = [];
    const record = label => samples.push({ label, values: scenario.properties.map(name => sdk.getPropertyValue(name)) });
    for (const throttle of scenario.throttleChecks) {
      sdk.setPropertyValue("fcs/throttle-cmd-norm", throttle);
      assert.equal(sdk.runIc(), true); record(`zero-time:${throttle}`);
    }
    sdk.setPropertyValue("fcs/throttle-cmd-norm", scenario.piston ? 0.65 : 0.35);
    assert.equal(sdk.runIc(), true); record("initial");
    for (let step = 1; step <= scenario.steps; step++) {
      if (step === 61) { sdk.setPropertyValue("fcs/elevator-cmd-norm", 0.02); sdk.setPropertyValue("fcs/aileron-cmd-norm", 0.03); }
      if (step === 121) { sdk.setPropertyValue("fcs/elevator-cmd-norm", 0); sdk.setPropertyValue("fcs/aileron-cmd-norm", 0); }
      assert.equal(sdk.run(), true);
      if (step === 1 || step % 30 === 0) record(`step:${step}`);
    }
    sdk.resetToInitialConditions(2);
    for (const [name, value] of Object.entries({ ...scenario.initial, ...scenario.reset })) sdk.setPropertyValue(name, value);
    sdk.setPropertyValue("fcs/throttle-cmd-norm", scenario.piston ? 0.65 : 0.35);
    assert.equal(sdk.runIc(), true);
    sdk.setPropertyValue("propulsion/set-running", -1);
    if (scenario.piston) {
      sdk.setPropertyValue("propulsion/magneto_cmd", 3);
      sdk.setPropertyValue("fcs/mixture-cmd-norm", 1);
    }
    sdk.setPropertyValue("fcs/throttle-cmd-norm", scenario.piston ? 0.65 : 0.35);
    assert.equal(sdk.runIc(), true); record("reset");
    assert.equal(sdk.run(), true); record("reset-first-step");
    wasm.push({ id: scenario.id, samples });
  } finally { sdk.destroy(); }
  assert.equal(sdk.exec.isDeleted(), true);
}
// Declared before comparison: cross-compiler roundoff budget, not an aircraft-fidelity tolerance.
const tolerances = { absolute: 1e-7, relative: 1e-8, purpose: "native/WASM numerical agreement over two seconds and reset; absolute floor uses each property's named unit" };
function verifyScenarioOutcomes(result, scenario) {
  const sample = label => result.samples.find(value => value.label === label);
  const value = (label, property) => sample(label).values[scenario.properties.indexOf(property)];
  const near = (actual, expected, message, epsilon = 1e-7) => assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} vs ${expected}`);
  for (const direction of ["north", "east", "down"]) {
    near(value("initial", `atmosphere/wind-${direction}-fps`), 0, "initial wind");
    near(value("reset", `atmosphere/wind-${direction}-fps`), 0, "reset wind");
  }
  near(value("initial", "simulation/sim-time-sec"), 0, "initial clock");
  near(value("step:240", "simulation/sim-time-sec"), scenario.steps * scenario.dt, "clock advancement");
  near(value("reset", "simulation/sim-time-sec"), 0, "reset clock");
  near(value("reset-first-step", "simulation/sim-time-sec"), scenario.dt, "reset first-step clock");
  near(value("reset", "position/lat-geod-deg"), scenario.reset["ic/lat-geod-deg"], "reset latitude");
  near(value("reset", "position/long-gc-deg"), scenario.reset["ic/long-gc-deg"], "reset longitude");
  near(value("reset", "position/h-sl-ft"), scenario.reset["ic/h-sl-ft"], "reset altitude", 1e-6);
}
const failures = [];
let maximumNormalizedError = 0;
for (let c = 0; c < scenarios.length; c++) {
  const a = native.scenarios[c], b = wasm[c];
  verifyScenarioOutcomes(a, scenarios[c]); verifyScenarioOutcomes(b, scenarios[c]);
  assert.equal(a.id, b.id); assert.equal(a.samples.length, b.samples.length);
  for (let s = 0; s < a.samples.length; s++) {
    // Python spells integral float throttle values with .0; labels are normalized only for comparison.
    assert.equal(a.samples[s].label.replace(/\.0$/, ""), b.samples[s].label);
    for (let p = 0; p < scenarios[c].properties.length; p++) {
      const x = a.samples[s].values[p], y = b.samples[s].values[p];
      const allowed = tolerances.absolute + tolerances.relative * Math.max(Math.abs(x), Math.abs(y));
      const normalized = Math.abs(x - y) / allowed;
      if (!Number.isFinite(x) || !Number.isFinite(y) || normalized > 1) failures.push({ id: a.id, sample: b.samples[s].label, property: scenarios[c].properties[p], native: x, wasm: y, allowed });
      maximumNormalizedError = Math.max(maximumNormalizedError, normalized);
    }
  }
}
await mkdir(path.dirname(output), { recursive: true });
const report = { schemaVersion: 1, status: failures.length ? "failed" : "passed", scope: "software agreement; not aircraft performance calibration", buildIdentity, installedArtifact, nativeBuildCommands, evidenceRoot,
  wasmSha256: hash(await readFile(wasmBinaryUrl)), native: { module: native.module, extension: native.extension, extensionSha256: native.extensionSha256, commit: git.stdout.trim() },
  inputSha256: hash(JSON.stringify(input)), aircraftFiles: Object.fromEntries(Object.entries(files).map(([name, contents]) => [name, hash(contents)])),
  conditions: scenarios, tolerances, maximumNormalizedError, failures, nativeSamples: native.scenarios, wasmSamples: wasm,
};
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
await writeFile(output + ".inputs.json", JSON.stringify(input, null, 2) + "\n");
console.log(JSON.stringify({ status: report.status, scenarios: scenarios.length, maximumNormalizedError, failures: failures.length, output }));
assert.equal(failures.length, 0, `Runtime comparison failed; inspect ${output}`);
