// Does the WASM binary honour <idlefuelflow> in a turbine engine package?
//
// JSBSim's FGTurbine derives idle fuel flow from rated thrust alone
// (pow(MilThrust, 0.2) * 107 lbm/hr), which for the SF50's 1,846 lbf gives
// 71.4 US gph: six times the 11.3 gph the WPR20FA051 recorder shows at ground
// idle, and above the two lowest printed AFM cruise rows. fork.7 lets the
// package state the figure instead. This loads the app's own SF50 package and
// reads idle fuel flow, so a binary that ignores the element reports the
// derived value and fails.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { JSBSimSdk } from "../dist/index.js";
import { wasmBinaryUrl, wasmModuleUrl } from "../dist/wasm.js";

const dataRoot = process.env.OSFS_JSBSIM_DATA_ROOT;
assert.ok(dataRoot, "Set OSFS_JSBSIM_DATA_ROOT to the app's public/jsbsim-data");

const engineXml = readFileSync(path.join(dataRoot, "engine/fj33_5a.xml"), "utf8");
const declared = Number(engineXml.match(/<idlefuelflow>([^<]+)<\/idlefuelflow>/)?.[1]);
assert.ok(Number.isFinite(declared), "engine/fj33_5a.xml must declare <idlefuelflow>");
// FGTurbine's fallback, and JSBSim's JET-A density for the volume readout.
const derived = Math.pow(Number(engineXml.match(/<milthrust unit="LBS">([^<]+)</)[1]), 0.2) * 107.0;
const LB_PER_US_GAL = 6.74;

function copyXml(sdk, from, to) {
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const input = path.join(from, entry.name);
    const output = `${to}/${entry.name}`;
    if (entry.isDirectory()) copyXml(sdk, input, output);
    else if (entry.name.endsWith(".xml")) sdk.writeDataFile(output, readFileSync(input));
  }
}

const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl, log: { console: false } });
copyXml(sdk, path.join(dataRoot, "aircraft/sf50"), "aircraft/sf50");
copyXml(sdk, path.join(dataRoot, "engine"), "engine");
assert.equal(sdk.loadModel("sf50"), true);

// Ground idle: on the runway, engine running, thrust lever closed.
sdk.setPropertyValue("ic/h-sl-ft", 0);
sdk.setPropertyValue("ic/vc-kts", 0);
assert.equal(sdk.runIc(), true);
sdk.setPropertyValue("propulsion/set-running", -1);
sdk.setPropertyValue("fcs/throttle-cmd-norm[0]", 0);
sdk.setPropertyValue("fcs/throttle-pos-norm[0]", 0);
assert.equal(sdk.runIc(), true);

const gph = sdk.getPropertyValue("propulsion/engine[0]/fuel-flow-rate-gph");
const pph = gph * LB_PER_US_GAL;
const n1 = sdk.getPropertyValue("propulsion/engine[0]/n1");
const n2 = sdk.getPropertyValue("propulsion/engine[0]/n2");
sdk.destroy();

console.log(`package <idlefuelflow>: ${declared.toFixed(1)} lbm/hr (${(declared / LB_PER_US_GAL).toFixed(2)} gph)`);
console.log(`FGTurbine fallback    : ${derived.toFixed(1)} lbm/hr (${(derived / LB_PER_US_GAL).toFixed(2)} gph)`);
console.log(`model at ground idle  : ${pph.toFixed(1)} lbm/hr (${gph.toFixed(2)} gph), N1 ${n1.toFixed(1)} %, N2 ${n2.toFixed(1)} %`);

const relative = Math.abs(pph - declared) / declared;
assert.ok(relative < 0.01, `idle fuel flow ${pph.toFixed(1)} lbm/hr is not the declared ${declared} lbm/hr `
  + `(FGTurbine's fallback is ${derived.toFixed(1)}); this binary ignores <idlefuelflow>`);
console.log(`\nPASS: the binary honours <idlefuelflow> (${(relative * 100).toFixed(3)} % from the declared value)`);
