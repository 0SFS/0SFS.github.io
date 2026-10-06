// 0SFS owns this aircraft/control integration diagnostic. No browser or server.
// Compare abort and shutdown using the installed WASM and the application's
// actual engineControl implementation, with native hold-down removing motion.
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
const out = newOutputDirectory("validation", "turbine-shutdown");
const artifact = await verifyInstalledSdk(root);
const controlSource = await readFile(path.join(root, "src/flight/jsbsim/engineControl.ts"), "utf8");
// engineControl imports only types; stripping them loads the current control
// without duplicating it or pulling browser UI into this terminal diagnostic.
const { createEngineControl, engineIndices } = await import("data:text/javascript;base64,"
  + Buffer.from(stripTypeScriptTypes(controlSource)).toString("base64"));
const manifest = JSON.parse(await readFile(path.join(root, "public/jsbsim-data/manifest.json"), "utf8"));
const dt = 1 / 120;
const samples = [];
const hashes = {};
const sdkLog = [];
const definitions = [
  { aircraftId: "f-35b", model: "F-35B-jsbsim", enginePath: "aircraft/F-35B-jsbsim/Engines",
    systemsPath: "aircraft/F-35B-jsbsim/Systems", engineFile: "aircraft/F-35B-jsbsim/Engines/F135-PW-600.xml" },
  { aircraftId: "cirrus-vision-jet", model: "sf50", enginePath: "engine", systemsPath: "systems", engineFile: "engine/fj33_5a.xml" },
];

for (const definition of definitions) {
  const xml = await readFile(path.join(root, "public/jsbsim-data", definition.engineFile), "utf8");
  const idleN2 = Number(/<idlen2>\s*([\d.]+)/.exec(xml)?.[1]);
  assert.ok(Number.isFinite(idleN2));
  for (const scenario of ["abort-below-idle", "shutdown-from-idle", "shutdown-from-full-power"]) {
    const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
      persistence: { enabled: false }, log: { console: false } });
    sdk.on("stderr", ({ message }) => sdkLog.push(message));
    try {
      for (const file of manifest.aircraft[definition.aircraftId]) {
        const bytes = await readFile(path.join(root, "public/jsbsim-data", file));
        hashes[file] = createHash("sha256").update(bytes).digest("hex");
        sdk.writeDataFile(file, bytes.toString("utf8"));
      }
      sdk.configurePaths({ rootDir: "/runtime", aircraftPath: "aircraft",
        enginePath: definition.enginePath, systemsPath: definition.systemsPath });
      sdk.loadModelOrThrow(definition.model);
      sdk.setDt(dt);
      const get = name => sdk.getPropertyValue(name);
      const set = (name, value) => sdk.setPropertyValue(name, value);
      for (const [name, value] of Object.entries({
        "ic/lat-geod-deg": 0, "ic/long-gc-deg": 0, "ic/h-sl-ft": 1000,
        "ic/vc-kts": 0, "ic/terrain-elevation-ft": 0,
        "fcs/throttle-cmd-norm": 0, "fcs/mixture-cmd-norm": 1,
      })) set(name, value);
      assert.equal(sdk.runIc(), true);
      sdk.setHoldDown(true);
      const control = createEngineControl(sdk, { engine: "turbine",
        startSpeed: { property: "propulsion/engine[0]/n2", runningAt: idleN2 } });
      const step = held => { control.step(held); assert.equal(sdk.run(), true); };
      const read = elapsed => ({ elapsed, simTime: get("simulation/sim-time-sec"),
        n1: get("propulsion/engine[0]/n1"), n2: get("propulsion/engine[0]/n2"),
        running: get("propulsion/engine[0]/set-running"), starter: get("propulsion/starter_cmd"),
        cutoff: get("propulsion/cutoff_cmd"), fuelFlowPps: get("propulsion/engine[0]/fuel-flow-rate-pps"),
        qbarPsf: get("aero/qbar-psf"), airspeedKts: get("velocities/vc-kts") });
      step(false); // Leave native zero-time initialization before commands.
      let ready = false;
      for (let i = 0; i < 60 / dt; i++) {
        step(true);
        if (scenario === "abort-below-idle" ? get("propulsion/engine[0]/n2") >= idleN2 - 1
          : get("propulsion/engine[0]/set-running") > .5) { ready = true; break; }
      }
      assert.ok(ready, `${definition.aircraftId} did not reach ${scenario}`);
      if (scenario !== "abort-below-idle") {
        set("fcs/throttle-cmd-norm", scenario === "shutdown-from-full-power" ? 1 : 0);
        for (let i = 0; i < 15 / dt; i++) step(false);
        control.shutdown();
      } else control.step(false);
      const trace = [read(0)];
      for (let i = 1; i <= 15 / dt; i++) { step(false); trace.push(read(i * dt)); }
      const firstBelow = threshold => trace.find(row => row.n2 <= threshold)?.elapsed ?? null;
      samples.push({ aircraftId: definition.aircraftId, scenario, engineCount: engineIndices(sdk).length,
        idleN2, secondsToN2: { 30: firstBelow(30), 10: firstBelow(10), 1: firstBelow(1) }, trace });
    } finally { sdk.destroy(); }
  }
}

const comparisons = definitions.map(({ aircraftId }) => {
  const cases = samples.filter(sample => sample.aircraftId === aircraftId);
  const abort = cases.find(sample => sample.scenario === "abort-below-idle");
  return { aircraftId, maxNormalizedDecayDifference: Math.max(...cases.flatMap(sample => sample.trace.map((row, i) =>
    Math.abs(row.n2 / sample.trace[0].n2 - abort.trace[i].n2 / abort.trace[0].n2)))),
  maxAbsQbarPsf: Math.max(...cases.flatMap(sample => sample.trace.map(row => Math.abs(row.qbarPsf)))) };
});
const pass = comparisons.every(comparison => comparison.maxNormalizedDecayDifference < 1e-10 && comparison.maxAbsQbarPsf < 1e-8)
  && samples.every(sample => sample.trace.every(row => row.starter === 0 && row.cutoff === 1)
    && sample.trace.slice(1).every(row => row.running === 0));
const report = { schema: "0sfs-turbine-shutdown-comparison/1", createdUtc: new Date().toISOString(), artifact,
  dt, conditions: "Native hold-down, zero airspeed/wind, 1000 ft, no reset during rundown. No wall-clock timing measurements.",
  controlSha256: createHash("sha256").update(controlSource).digest("hex"), hashes, comparisons, samples, pass,
  limitations: "Tests equal native decay across control paths, not F135/FJ33 physical coast-down calibration or the live app's ground-recovery path." };
await writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
await writeFile(path.join(out, "sdk.log"), sdkLog.join("\n") + "\n");
console.log(JSON.stringify({ out, pass, comparisons, cases: samples.map(({ trace, ...sample }) => ({
  ...sample, initial: trace[0], afterOneSecond: trace[120], afterFiveSeconds: trace[600],
})) }, null, 2));
if (!pass) process.exitCode = 1;
