#!/usr/bin/env node
// 0sfs owns this check that the F-35B's empirical engine model, offered beside
// the coupled engine plant in Engine → Simulation, is the aircraft as it flew
// before the plant: its files are that commit's bytes, and that commit's own
// F-35B integration suite passes against it on the installed SDK.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newOutputDirectory } from '../../outputDirectory.mjs';
import { verifyInstalledSdk } from '../../verify-jsbsim-artifact.mjs';

// The last commit before the F135 became the coupled engine plant.
const BEFORE_PLANT = 'd92a928a';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: node scripts/validation/f35b/check-f135-empirical-engine-model.mjs [--out=build/new-directory]');
  process.exit(0);
}
assert.ok(args.every(arg => arg.startsWith('--out=')) && args.length <= 1);
const out = args[0] ? path.resolve(args[0].slice(6)) : newOutputDirectory('validation', 'f135-empirical-engine-model');
assert.ok(out.startsWith(path.join(root, 'build') + path.sep));
if (args[0]) await mkdir(out);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...gitArgs) => execFileSync('git', ['-C', root, ...gitArgs], { maxBuffer: 1 << 26 });
const artifact = await verifyInstalledSdk(root);

const before = 'public/jsbsim-data/aircraft/F-35B-jsbsim/';
const now = 'public/jsbsim-data/aircraft/F-35B-jsbsim-empirical/';
const files = await Promise.all([
  ['F-35B-jsbsim.xml', 'F-35B-jsbsim-empirical.xml'],
  ['Engines/F135-PW-600.xml', 'Engines/F135-PW-600.xml'],
  ['Engines/liftfan.xml', 'Engines/liftfan.xml'],
  ['Engines/sidefan.xml', 'Engines/sidefan.xml'],
].map(async ([was, is]) => {
  const original = git('show', `${BEFORE_PLANT}:${before}${was}`);
  return { was: before + was, is: now + is, sha256: sha256(original),
    identical: original.equals(await readFile(path.join(root, now, is))) };
}));
for (const file of files) assert.ok(file.identical, `${file.is} differs from ${BEFORE_PLANT}:${file.was}`);

// That commit's suite, changed only to load the empirical engine model and its package.
const changes = [
  ['const profile = getFdmProfile(aircraftId);', 'const profile = getFdmProfile(aircraftId, "empirical");'],
  ['resolveAircraftDataFiles(manifest, aircraftId)', 'resolveAircraftDataFiles(manifest, profile.dataPackage!)'],
  ['await bootstrapAircraft(sdk, aircraftId, options);', 'await bootstrapAircraft(sdk, aircraftId, { ...options, engineModel: "empirical" });'],
  ['await bootstrapAircraft(sdk, aircraftId);', 'await bootstrapAircraft(sdk, aircraftId, { engineModel: "empirical" });'],
  ['await bootstrapAircraft(sdk, aircraftId, { throttleNorm: 1 });', 'await bootstrapAircraft(sdk, aircraftId, { throttleNorm: 1, engineModel: "empirical" });'],
  ['"/runtime/aircraft/F-35B-jsbsim/Engines/F135-PW-600.xml"', '"/runtime/aircraft/F-35B-jsbsim-empirical/Engines/F135-PW-600.xml"'],
];
let suite = git('show', `${BEFORE_PLANT}:src/flight/jsbsim/f35b.integration.test.ts`).toString();
const original = suite;
suite = suite.replace(/from "(\.\.?\/[^"]+)"/g, (_, relative) =>
  `from ${JSON.stringify(path.join(root, 'src/flight/jsbsim', relative))}`);
for (const [from, to] of changes) {
  assert.ok(suite.includes(from), `The suite no longer contains: ${from}`);
  suite = suite.replaceAll(from, to);
}
const suiteFile = path.join(out, 'empirical.f35b.integration.test.ts');
await writeFile(suiteFile, suite);

// What a pilot comparing the two should feel: thrust after throttle steps on a
// sea-level static stand, in simulation time. Times are to 10, 50 and 90 % of
// each step's change, from the command; reheat also gives its first burning step.
const src = file => JSON.stringify(path.join(root, 'src/flight', file));
const responseFile = path.join(out, 'response.ab.test.ts');
await writeFile(responseFile, `// @vitest-environment jsdom
import { readFileSync, writeFileSync } from "node:fs";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { it } from "vitest";
import { bootstrapAircraft } from ${src('jsbsim/bootstrapC172')};
import { ENGINE_MODEL_IDS, getFdmProfile } from ${src('jsbsim/fdmProfiles')};
import { resolveAircraftDataFiles } from ${src('jsbsim/hydrateJsbsimData')};
import { FIXED_DT } from ${src('physics/fixedStepLoop')};

const manifest = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8"));
const thrust = sdk => sdk.getPropertyValue("propulsion/engine/thrust-lbs");
function step(sdk, throttle, seconds) {
  const start = thrust(sdk);
  sdk.setPropertyValue("fcs/throttle-cmd-norm", throttle);
  const trace = [];
  for (let i = 1; i <= Math.round(seconds / FIXED_DT); i++) {
    sdk.run();
    trace.push([i * FIXED_DT, thrust(sdk), sdk.getPropertyValue("propulsion/engine/augmentation")]);
  }
  const end = trace.at(-1)[1];
  const reach = f => trace.find(([, value]) => (value - start) / (end - start) >= f)?.[0] ?? null;
  return { fromLbf: Math.round(start), toLbf: Math.round(end), t10S: reach(0.1), t50S: reach(0.5), t90S: reach(0.9),
    firstReheatBurnS: trace.find(([, , burning]) => burning > 0.5)?.[0] ?? null };
}
it("measures each engine model's throttle response", async () => {
  const result = {};
  for (const engineModel of ENGINE_MODEL_IDS) {
    const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl, persistence: { enabled: false }, log: { console: false } });
    try {
      for (const file of resolveAircraftDataFiles(manifest, getFdmProfile("f-35b", engineModel).dataPackage ?? "f-35b")) {
        sdk.writeDataFile(file, readFileSync("public/jsbsim-data/" + file, "utf8"));
      }
      await bootstrapAircraft(sdk, "f-35b", { engineModel, holdDown: true, altFt: 0, airspeedKts: 0, throttleNorm: 0 });
      for (let i = 0; i < 30 / FIXED_DT; i++) sdk.run();
      result[engineModel] = { idleLbf: Math.round(thrust(sdk)), idleToMil: step(sdk, 0.99, 15),
        milToMax: step(sdk, 1, 10), maxToIdle: step(sdk, 0, 15) };
    } finally { sdk.destroy(); }
  }
  writeFileSync(${JSON.stringify(path.join(out, 'response.json'))}, JSON.stringify(result, null, 2) + "\\n");
}, 600_000);
`);
await writeFile(path.join(out, 'vitest.config.mts'), `import base from ${JSON.stringify(path.join(root, 'vite.config.ts'))};
export default { ...base, root: ${JSON.stringify(root)}, test: { ...base.test,
  include: ${JSON.stringify([suiteFile, responseFile].map(file => path.relative(root, file)))}, exclude: ["**/node_modules/**"] } };
`);
const run = spawnSync('npx', ['vitest', 'run', '--config', path.join(out, 'vitest.config.mts'), '--maxWorkers=50%',
  '--reporter=default', '--reporter=json', `--outputFile.json=${path.join(out, 'vitest.json')}`],
{ cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
await writeFile(path.join(out, 'vitest.log'), run.stdout + run.stderr);
const results = JSON.parse(await readFile(path.join(out, 'vitest.json'), 'utf8'));
const report = {
  schema: 1,
  question: 'Is the empirical engine model the F-35B as it flew before the coupled engine plant, and how do the two respond?',
  beforePlantCommit: git('rev-parse', BEFORE_PLANT).toString().trim(),
  sdk: { identity: artifact.identity, packageArchive: artifact.packageArchive },
  files,
  suite: { source: `${BEFORE_PLANT}:src/flight/jsbsim/f35b.integration.test.ts`, sha256: sha256(original), changes },
  tests: { total: results.numTotalTests, passed: results.numPassedTests, failed: results.numFailedTests },
  response: {
    conditions: 'Sea-level ISA static stand (hold-down), throttle 0 for 30 s, then 0.99 for 15 s, 1 for 10 s and 0 for 15 s; 120 Hz; simulation time, not wall-clock.',
    byEngineModel: JSON.parse(await readFile(path.join(out, 'response.json'), 'utf8')),
  },
  passed: run.status === 0 && results.numFailedTests === 0 && results.numTotalTests > 0,
};
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.tests), report.passed ? 'passed' : 'FAILED', out);
process.exit(report.passed ? 0 : 1);
