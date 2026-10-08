// What one JSBSim integration-test fixture costs, part by part: the WASM
// instance, the data files, the bootstrap with and without starting the
// engine, a step, and the test harness around a step. It also starts the
// engine the other way, after a RunIC with it stopped, and compares where the
// two starts end. Run it alone, on one worker:
//   npx vitest run --config scripts/validation/ci/vitest.config.mts
// It writes fixture.json to a dated folder under build/validation/ci/jsbsim-fixture/.
// Interpretation: FOSS Earth's docs/ci-cd.md; the 2026-10-08 record:
// validation/evidence/ci/2026-10-08/.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { expect, it } from "vitest";
import { bootstrapAircraft } from "../../../src/flight/jsbsim/bootstrapC172";
import { getFdmProfile, type EngineModelId } from "../../../src/flight/jsbsim/fdmProfiles";
import { resolveAircraftDataFiles } from "../../../src/flight/jsbsim/hydrateJsbsimData";
import { FIXED_DT } from "../../../src/flight/physics/fixedStepLoop";
import { newOutputDirectory } from "../../outputDirectory.mjs";

const CASES = [
  { name: "F-35B, coupled engine plant", aircraftId: "f-35b", engineModel: "plant" },
  { name: "F-35B, empirical engine", aircraftId: "f-35b", engineModel: "empirical" },
  { name: "Cessna 172", aircraftId: "cessna-172", engineModel: undefined },
] as const satisfies readonly { name: string; aircraftId: "f-35b" | "cessna-172"; engineModel?: EngineModelId }[];
const ROUNDS = 4;
const STEPS = 1200; // 10 s at 120 Hz
const CALLS = 100_000;
const READS = ["attitude/theta-rad", "attitude/phi-rad", "propulsion/engine[0]/thrust-lbs"];
const ENGINE = ["propulsion/engine[0]/thrust-lbs", "propulsion/engine[0]/n1", "propulsion/engine[0]/n2"];

const manifest: unknown = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8"));
const since = (start: number) => +(performance.now() - start).toFixed(3);
const shell = (command: string) => {
  try { return execSync(command, { encoding: "utf8" }).trim(); } catch { return null; }
};

async function createSdk(testCase: (typeof CASES)[number]) {
  let start = performance.now();
  const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl, persistence: { enabled: false }, log: { console: false } });
  const createMs = since(start);
  start = performance.now();
  const profile = getFdmProfile(testCase.aircraftId, testCase.engineModel);
  for (const file of resolveAircraftDataFiles(manifest, profile.dataPackage ?? testCase.aircraftId)) {
    sdk.writeDataFile(file, readFileSync("public/jsbsim-data/" + file, "utf8"));
  }
  return { sdk, createMs, dataMs: since(start) };
}

it("measures each part of a JSBSim test fixture", async () => {
  const record: Record<string, unknown> = {
    schema: "0sfs-ci-jsbsim-fixture/1",
    measuredAt: new Date().toISOString(),
    commit: shell("git rev-parse --short=12 HEAD"),
    workingTreeChanged: Boolean(shell("git status --short")),
    sdkVersion: JSON.parse(readFileSync("node_modules/@felipegalind0/jsbsim/package.json", "utf8")).version,
    node: process.version,
    cpu: os.cpus()[0]?.model,
    cores: os.cpus().length,
    loadAverageAtStart: os.loadavg(),
    memoryPressureLevelAtStart: shell("sysctl -n kern.memorystatus_vm_pressure_level"),
    physicsHz: Math.round(1 / FIXED_DT),
  };
  const cases: Record<string, unknown> = {};

  for (const testCase of CASES) {
    // Whole fixtures, as a test builds one. The first instance in a worker also compiles the WASM.
    const fixtures = [];
    for (let round = 0; round < ROUNDS; round++) {
      const { sdk, createMs, dataMs } = await createSdk(testCase);
      const start = performance.now();
      await bootstrapAircraft(sdk, testCase.aircraftId, { engineModel: testCase.engineModel });
      fixtures.push({ createMs, dataMs, bootstrapMs: since(start) });
      sdk.destroy();
    }

    // The bootstrap without starting the engine, and the start afterwards. The
    // bootstrap starts the engine straight after its first RunIC; here a RunIC
    // with the engine stopped comes first.
    const stopped = await createSdk(testCase);
    let start = performance.now();
    await bootstrapAircraft(stopped.sdk, testCase.aircraftId, { engineModel: testCase.engineModel, engineRunning: false });
    const bootstrapEngineStoppedMs = since(start);
    start = performance.now();
    stopped.sdk.setPropertyValue("propulsion/set-running", -1);
    const startAfterStoppedRunIcMs = since(start);
    expect(stopped.sdk.runIc()).toBe(true);
    start = performance.now();
    stopped.sdk.setPropertyValue("propulsion/set-running", -1);
    const startWhileRunningMs = since(start);
    expect(stopped.sdk.runIc()).toBe(true);

    // Where the two starts end: the bootstrap's own, and the one after the stopped RunIC.
    const { sdk: started } = await createSdk(testCase);
    await bootstrapAircraft(started, testCase.aircraftId, { engineModel: testCase.engineModel });
    const engine = [started, stopped.sdk].map(each => {
      const batch = each.createPropertyBatch(ENGINE);
      const values = Object.fromEntries(ENGINE.map((name, index) => [name, batch.read()[index]])
        .filter(([name]) => !batch.missing.includes(name as string)));
      batch.dispose();
      return values;
    });
    const largestRelativeDifference = Math.max(...Object.keys(engine[0]).map(name =>
      Math.abs(engine[0][name] - engine[1][name]) / Math.max(Math.abs(engine[0][name]), 1e-9)));
    started.destroy();
    stopped.sdk.destroy();

    // Ten seconds of steps: bare, with the F-35B tests' harness around each, and with one batched read.
    const { sdk } = await createSdk(testCase);
    await bootstrapAircraft(sdk, testCase.aircraftId, { engineModel: testCase.engineModel });
    start = performance.now();
    for (let step = 0; step < STEPS; step++) if (!sdk.run()) throw new Error("JSBSim run failed");
    const bareMs = since(start);
    start = performance.now();
    for (let step = 0; step < STEPS; step++) {
      expect(sdk.run()).toBe(true);
      expect(Math.abs(sdk.getPropertyValue(READS[0]))).toBeLessThan(10);
      expect(Math.abs(sdk.getPropertyValue(READS[1]))).toBeLessThan(10);
      expect(sdk.getPropertyValue(READS[2])).toBeGreaterThan(-1);
    }
    const harnessMs = since(start);
    const batch = sdk.createPropertyBatch(READS);
    expect(batch.missing).toEqual([]);
    let failures = 0;
    start = performance.now();
    for (let step = 0; step < STEPS; step++) {
      if (!sdk.run()) failures++;
      const [theta, phi, thrust] = batch.read();
      if (!(Math.abs(theta) < 10 && Math.abs(phi) < 10 && thrust > -1)) failures++;
    }
    const batchedMs = since(start);
    expect(failures).toBe(0);
    sdk.destroy();

    const bootstrapMedianMs = [...fixtures.slice(1).map(fixture => fixture.bootstrapMs)].sort((a, b) => a - b)[1];
    cases[testCase.name] = {
      fixtures, bootstrapEngineStoppedMs,
      startInBootstrapMs: +(bootstrapMedianMs - bootstrapEngineStoppedMs).toFixed(3),
      startAfterStoppedRunIcMs, startWhileRunningMs,
      endOfStart: { afterBootstrap: engine[0], afterStoppedRunIc: engine[1], largestRelativeDifference },
      steps: { count: STEPS, bareMs, perStepUs: +(bareMs / STEPS * 1000).toFixed(2),
        harnessMs, batchedMs, startInBootstrapInSteps: Math.round((bootstrapMedianMs - bootstrapEngineStoppedMs) / (bareMs / STEPS)) },
    };
  }
  record.cases = cases;

  // The harness primitives on their own.
  const { sdk } = await createSdk(CASES[0]);
  await bootstrapAircraft(sdk, "f-35b");
  let sum = 0;
  let start = performance.now();
  for (let call = 0; call < CALLS; call++) sum += sdk.getPropertyValue(READS[0]);
  const propertyReadUs = +(since(start) / CALLS * 1000).toFixed(3);
  start = performance.now();
  for (let call = 0; call < CALLS; call++) expect(sum).toBe(sum);
  const expectUs = +(since(start) / CALLS * 1000).toFixed(3);
  sdk.destroy();
  record.perCallUs = { getPropertyValueByName: propertyReadUs, expectToBe: expectUs };
  record.loadAverageAtEnd = os.loadavg();
  record.memoryPressureLevelAtEnd = shell("sysctl -n kern.memorystatus_vm_pressure_level");

  const file = path.join(newOutputDirectory("validation", "ci", "jsbsim-fixture"), "fixture.json");
  writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  console.log(`Wrote ${file}`);
});
