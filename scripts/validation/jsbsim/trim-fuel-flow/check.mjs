// Does the fork.6 WASM binary carry the FGTurbine::Trim() fuel-flow assignment?
//
// The defect's signature is that a zero-time trim reports the PREVIOUS
// operating point's fuel flow. Two consequences are checked here, mirroring
// the native TestTurbineTrimFuelFlow:
//   1. the value read at a throttle setting is independent of what was
//      trimmed before it, and
//   2. dry fuel flow rises with throttle instead of staying put.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { JSBSimSdk } from "../dist/index.js";
import { wasmBinaryUrl, wasmModuleUrl } from "../dist/wasm.js";

const nativeRoot = process.env.JSBSIM_SOURCE_ROOT;
assert.ok(nativeRoot, "Set JSBSIM_SOURCE_ROOT");

// The F16 FCS maps the command onto a 0..2 position range, so commands at or
// below 0.49 stay dry and 1.0 requests augmentation.
const DRY = [0.0, 0.2, 0.35, 0.49];
const ALL = [...DRY, 1.0];

function copyXml(sdk, from, to) {
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const input = path.join(from, entry.name);
    const output = `${to}/${entry.name}`;
    if (entry.isDirectory()) copyXml(sdk, input, output);
    else if (entry.name.endsWith(".xml")) sdk.writeDataFile(output, readFileSync(input));
  }
}

async function trimmedSdk() {
  const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl, log: { console: false } });
  copyXml(sdk, path.join(nativeRoot, "aircraft/f16"), "aircraft/f16");
  copyXml(sdk, path.join(nativeRoot, "engine"), "engine");
  copyXml(sdk, path.join(nativeRoot, "systems"), "systems");
  assert.equal(sdk.loadModel("f16"), true);
  sdk.setPropertyValue("ic/h-sl-ft", 5000);
  sdk.setPropertyValue("ic/vc-kts", 300);
  assert.equal(sdk.runIc(), true);
  // set-running forces throttle to 1, so it must precede the settings below.
  sdk.setPropertyValue("propulsion/set-running", -1);
  return sdk;
}

function trimAt(sdk, command) {
  sdk.setPropertyValue("fcs/throttle-cmd-norm[0]", command);
  sdk.setPropertyValue("fcs/throttle-pos-norm[0]", command);
  const before = sdk.getPropertyValue("simulation/sim-time-sec");
  assert.equal(sdk.runIc(), true);
  assert.equal(sdk.getPropertyValue("simulation/sim-time-sec"), before, "trim advanced time");
  return sdk.getPropertyValue("propulsion/engine[0]/fuel-flow-rate-gph");
}

// Reference: each setting trimmed in its own freshly booted executive, so no
// earlier operating point exists to be retained.
const reference = {};
for (const command of ALL) {
  const sdk = await trimmedSdk();
  reference[command] = trimAt(sdk, command);
  sdk.destroy();
}

// Same settings, one executive, deliberately out of order and revisited.
const shared = await trimmedSdk();
let worst = 0;
console.log("cmd    isolated-gph    in-sequence-gph   relative-difference");
for (const command of [1.0, 0.0, 0.49, 0.2, 1.0, 0.35, 0.0]) {
  const got = trimAt(shared, command);
  const rel = Math.abs(got - reference[command]) / Math.max(reference[command], 1e-12);
  worst = Math.max(worst, rel);
  console.log(`${command.toFixed(2)}   ${reference[command].toFixed(4).padStart(12)}   ${got.toFixed(4).padStart(15)}   ${rel.toExponential(2)}`);
}
shared.destroy();

const dry = DRY.map(c => reference[c]);
console.log(`\ndry sweep (gph): ${dry.map(v => v.toFixed(2)).join("  ")}`);
console.log(`augmented (1.0): ${reference[1.0].toFixed(2)}`);
console.log(`worst order-dependence: ${worst.toExponential(3)}`);

assert.ok(worst < 1e-6, `trimmed fuel flow depends on evaluation order (worst ${worst})`);
assert.deepEqual(dry, [...dry].sort((a, b) => a - b), "dry fuel flow must rise with throttle");
assert.ok(dry.at(-1) > dry[0], "dry fuel flow must vary with throttle");
assert.ok(reference[1.0] > dry.at(-1), "augmented fuel flow must exceed dry");
console.log("\nPASS: trim reports its own operating point in the WASM binary");
