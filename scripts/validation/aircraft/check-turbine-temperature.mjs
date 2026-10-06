// 0SFS owns this installed-aircraft diagnostic: no browser, server or wall-clock benchmark.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmModuleUrl, wasmBinaryUrl } from "@felipegalind0/jsbsim/wasm";
import { newOutputDirectory } from "../../outputDirectory.mjs";
import { verifyInstalledSdk } from "../../verify-jsbsim-artifact.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const out = newOutputDirectory("validation", "turbine-temperature");
const artifact = await verifyInstalledSdk(root);
const controlSource = await readFile(path.join(root, "src/flight/jsbsim/engineControl.ts"), "utf8");
const { createEngineControl } = await import("data:text/javascript;base64,"
  + Buffer.from(stripTypeScriptTypes(controlSource)).toString("base64"));
const manifest = JSON.parse(await readFile(path.join(root, "public/jsbsim-data/manifest.json"), "utf8"));
const hashes = {};
const sdkLog = [];
const trace = [];
const dt = 1 / 120;
const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
  persistence: { enabled: false }, log: { console: false } });
sdk.on("stderr", ({ message }) => sdkLog.push(message));
try {
  for (const file of manifest.aircraft["f-35b"]) {
    const bytes = await readFile(path.join(root, "public/jsbsim-data", file));
    hashes[file] = createHash("sha256").update(bytes).digest("hex");
    sdk.writeDataFile(file, bytes.toString("utf8"));
  }
  sdk.configurePaths({ rootDir: "/runtime", aircraftPath: "aircraft",
    enginePath: "aircraft/F-35B-jsbsim/Engines", systemsPath: "aircraft/F-35B-jsbsim/Systems" });
  sdk.loadModelOrThrow("F-35B-jsbsim");
  sdk.setDt(dt);
  const get = name => sdk.getPropertyValue(name);
  const set = (name, value) => sdk.setPropertyValue(name, value);
  const temperaturePath = "propulsion/engine[0]/egt-degc";
  const catalog = sdk.queryPropertyCatalog("egt-degc");
  assert.match(catalog, /propulsion\/engine\/egt-degc\s+\(R\)/);
  for (const [name, value] of Object.entries({
    "ic/lat-geod-deg": 0, "ic/long-gc-deg": 0, "ic/h-sl-ft": 1000,
    "ic/vc-kts": 0, "ic/terrain-elevation-ft": 0,
    "fcs/throttle-cmd-norm": 0, "fcs/mixture-cmd-norm": 1,
  })) set(name, value);
  assert.equal(sdk.runIc(), true);
  sdk.setHoldDown(true);
  const control = createEngineControl(sdk, { engine: "turbine",
    startSpeed: { property: "propulsion/engine[0]/n2", runningAt: 60 } });
  const read = phase => ({ phase, time: get("simulation/sim-time-sec"),
    egtC: get(temperaturePath), tatC: get("propulsion/tat-c"),
    n1: get("propulsion/engine[0]/n1"), n2: get("propulsion/engine[0]/n2"),
    running: get("propulsion/engine[0]/set-running"),
    augmentation: get("propulsion/engine[0]/augmentation"),
    fuelFlowPps: get("propulsion/engine[0]/fuel-flow-rate-pps") });
  const step = (phase, held = false) => {
    control.step(held); assert.equal(sdk.run(), true);
    const row = read(phase); assert.ok(Number.isFinite(row.egtC)); trace.push(row); return row;
  };
  trace.push(read("cold-RunIC"));
  step("cold");
  const cold = trace.at(-1).egtC;
  set(temperaturePath, 1234);
  assert.equal(get(temperaturePath), cold, "read-only property accepted a write");
  for (let i = 0; i < 60 / dt && get("propulsion/engine[0]/set-running") < .5; i++) step("start", true);
  assert.ok(trace.some(row => row.phase === "start" && row.running === 0 && row.egtC > cold + 10));
  assert.ok(get("propulsion/engine[0]/set-running") > .5, "F135 did not start");
  for (let i = 0; i < 5 / dt; i++) step("idle");
  set("fcs/throttle-cmd-norm", .98);
  for (let i = 0; i < 20 / dt; i++) step("dry");
  set("fcs/throttle-cmd-norm", 1);
  for (let i = 0; i < 5 / dt; i++) step("afterburner");
  assert.ok(trace.some(row => row.phase === "afterburner" && row.augmentation === 1));
  const runningRows = trace.filter(row => ["idle", "dry", "afterburner"].includes(row.phase));
  const maxRunFormulaErrorC = Math.max(...runningRows.map(row => Math.abs(
    row.egtC - (row.tatC + 363.1 + (row.n2 - 60) / 40 * 357.1))));
  assert.ok(maxRunFormulaErrorC < 1e-8, "temperature differs from native Run schedule");
  const beforeShutdown = read("before-shutdown");
  control.shutdown();
  for (let i = 0; i < 15 / dt; i++) step("shutdown");
  const firstOff = trace.find(row => row.phase === "shutdown");
  assert.equal(firstOff.running, 0);
  assert.ok(firstOff.egtC > 700, "hot stopped engine abruptly lost temperature");
  assert.ok(Math.abs(firstOff.egtC - (beforeShutdown.egtC - 7.3 * dt)) < 1e-8);
  const hotStopped = read("hot-stopped");
  assert.equal(sdk.runIc(), true);
  trace.push(read("hot-stopped-RunIC"));
  step("first-step-after-stopped-RunIC");
  const adjacentDeltas = trace.slice(1).map((row, i) => ({ phase: row.phase,
    previousPhase: trace[i].phase, time: row.time, deltaC: row.egtC - trace[i].egtC }));
  const largestJump = adjacentDeltas.reduce((a, b) => Math.abs(b.deltaC) > Math.abs(a.deltaC) ? b : a);
  const report = { schema: "0sfs-turbine-temperature/1", createdUtc: new Date().toISOString(), artifact,
    aircraftId: "f-35b", dt, catalog, hashes, trace, pass: true,
    findings: { coldC: cold, heatedBeforeRunning: true, maxRunFormulaErrorC,
      beforeShutdown, firstOff, hotStopped, largestJump,
      afterburnerTemperature: "Baseline EGT matches the native N2/TAT schedule; separate thermal/nozzle-gas-temperature-k and metal state are outside this legacy-EGT diagnostic." },
    limitations: ["Existing generic EGT estimate; no F135 calibration or measured station definition. The optional native thermal model is qualified separately.",
      "Native startup/Trim/reset phase discontinuities are observed, not repaired by this read-only release.",
      "Native hold-down, zero wind/airspeed at 1000 ft; this is software lifecycle evidence, not aircraft thermal qualification."] };
  await writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
  await writeFile(path.join(out, "sdk.log"), sdkLog.join("\n") + "\n");
  console.log(JSON.stringify({ out, pass: report.pass, findings: report.findings }, null, 2));
} finally { sdk.destroy(); }
