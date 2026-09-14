// Does a zero-time reset leave a shut-off SF50 engine shut off?
//
// The app's location reset (src/flight/jsbsim/resetFlightLocation.ts) runs
// RunIC, writes propulsion/engine/set-running 0 when the saved engine was not
// running, and runs RunIC again. Upstream FGTurbine only commits spool state
// after trim for a running engine. Local fc13a97b (PR #1505) and 6c3547be
// (PR #1508) assign N1, N2 and fuel flow inside Trim() for every engine, so a
// shut-off engine comes out of the reset spooled and burning fuel.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const pkg = process.env.OSFS_JSBSIM_PACKAGE;
const dataRoot = process.env.OSFS_JSBSIM_DATA_ROOT;
assert.ok(pkg && dataRoot, "Set OSFS_JSBSIM_PACKAGE (installed package dir) and OSFS_JSBSIM_DATA_ROOT (public/jsbsim-data)");
const { JSBSimSdk } = await import(path.join(pkg, "dist/index.js"));
const { wasmBinaryUrl, wasmModuleUrl } = await import(path.join(pkg, "dist/wasm.js"));
const identity = JSON.parse(readFileSync(path.join(pkg, "package.json"), "utf8"));

function copyXml(sdk, from, to) {
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const input = path.join(from, entry.name);
    const output = `${to}/${entry.name}`;
    if (entry.isDirectory()) copyXml(sdk, input, output);
    else if (entry.name.endsWith(".xml")) sdk.writeDataFile(output, readFileSync(input));
  }
}

const E = "propulsion/engine[0]/";
const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl, log: { console: false } });
copyXml(sdk, path.join(dataRoot, "aircraft/sf50"), "aircraft/sf50");
copyXml(sdk, path.join(dataRoot, "engine"), "engine");
assert.equal(sdk.loadModel("sf50"), true);
sdk.setDt(1 / 120);

const sample = (label) => {
  const row = {
    label,
    t: sdk.getPropertyValue("simulation/sim-time-sec"),
    running: sdk.getPropertyValue(E + "set-running"),
    n1: sdk.getPropertyValue(E + "n1"),
    n2: sdk.getPropertyValue(E + "n2"),
    fuelFlowPph: sdk.getPropertyValue(E + "fuel-flow-rate-pps") * 3600,
    fuelUsedLb: sdk.getPropertyValue(E + "fuel-used-lbs"),
  };
  console.log(`${label.padEnd(26)} t=${row.t.toFixed(3)} running=${row.running} N1=${row.n1.toFixed(1)} N2=${row.n2.toFixed(1)} `
    + `fuel flow=${row.fuelFlowPph.toFixed(1)} lb/h fuel used=${row.fuelUsedLb.toFixed(4)} lb`);
  return row;
};

// Airborne, engine never started, thrust lever at 0.6, applied the way the
// app applies a location whose saved engine state is not running.
sdk.setPropertyValue("ic/h-sl-ft", 5000);
sdk.setPropertyValue("ic/vc-kts", 150);
sdk.setPropertyValue("ic/gamma-deg", 0);
sdk.setPropertyValue("fcs/throttle-cmd-norm", 0.6);
assert.equal(sdk.runIc(), true);
sdk.setPropertyValue("propulsion/engine/set-running", 0);
sdk.setPropertyValue("fcs/throttle-cmd-norm", 0.6);
assert.equal(sdk.runIc(), true);

console.log(`package ${identity.name}@${identity.version}`);
const reset = sample("after the reset");
for (let i = 0; i < 120; i += 1) sdk.run();
const later = sample("after 1 s of flight");
sdk.destroy();

const spooled = reset.n2 > 1 || reset.fuelFlowPph > 0 || later.fuelUsedLb > 0;
console.log(spooled
  ? "\nFAIL: the shut-off engine came out of the reset spooled or burning fuel"
  : "\nPASS: the shut-off engine stayed shut off through the reset");
process.exitCode = spooled ? 1 : 0;
