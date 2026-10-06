// Installed-SDK, airborne F-35B development diagnostic. No browser or server.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmModuleUrl, wasmBinaryUrl } from "@felipegalind0/jsbsim/wasm";
import { newOutputDirectory } from "../../outputDirectory.mjs";
import { verifyInstalledSdk } from "../../verify-jsbsim-artifact.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const number = (name, fallback) => {
  const value = Number(option(name, fallback));
  if (!Number.isFinite(value)) throw new Error(name + " must be finite.");
  return value;
};
const configuration = {
  speedKts: number("--kts", 300), throttle: number("--throttle", 0.5),
  pitchDeg: number("--pitch", 3), trim: number("--pitch-trim", 0),
  stovl: number("--stovl", 0), altitudeFt: number("--alt-ft", 5000),
  seconds: number("--seconds", 60), fuelLb: number("--fuel-lb", 13100),
  elevator: number("--elevator", 0), aileron: number("--aileron", 0), rudder: number("--rudder", 0),
  controlSeconds: number("--control-seconds", number("--seconds", 60)),
  pilot: option("--pilot", "false") === "true", trimModel: option("--trim", "false") === "true",
};
const output = option("--out", undefined) ?? newOutputDirectory("validation", "f35b");
const root = path.resolve(new URL("../../../", import.meta.url).pathname);
const artifact = await verifyInstalledSdk(root);
const manifest = JSON.parse(await readFile(path.join(root, "public/jsbsim-data/manifest.json"), "utf8"));
const files = manifest.aircraft["f-35b"];
if (!Array.isArray(files) || !files.length) throw new Error("No F-35B dependency closure.");
const hashes = {};
const log = [];
const sdk = await JSBSimSdk.create({
  moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
  persistence: { enabled: false }, log: { console: false },
});
sdk.on("stderr", ({ message }) => log.push(message));
sdk.on("stdout", ({ message }) => log.push(message));
const get = name => sdk.getPropertyValue(name);
const set = (name, value) => sdk.setPropertyValue(name, value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const observations = [];
const paths = {
  time: "simulation/sim-time-sec", altitudeFt: "position/h-sl-ft", kts: "velocities/vc-kts",
  pitchDeg: "attitude/theta-deg", rollDeg: "attitude/phi-deg", headingDeg: "attitude/psi-deg",
  alphaDeg: "aero/alpha-deg", climbFps: "velocities/h-dot-fps", pitchRate: "velocities/q-rad_sec",
  elevator: "fcs/elevator-pos-norm", pitchTrim: "fcs/pitch-trim-cmd-norm",
  mainThrust: "propulsion/engine/thrust-lbs", fanThrust: "propulsion/engine[1]/thrust-lbs",
  rightPostThrust: "propulsion/engine[2]/thrust-lbs", leftPostThrust: "propulsion/engine[3]/thrust-lbs",
  nozzlePitch: "propulsion/engine/pitch-angle-rad", nozzleYaw: "propulsion/engine/yaw-angle-rad",
  stovl: "fcs/stovl-pos-norm", forceX: "forces/fbx-prop-lbs", forceZ: "forces/fbz-prop-lbs",
  physicalNozzlePitch: "fcs/nozzle-pitch-rad", physicalNozzleYaw: "fcs/nozzle-yaw-rad",
  momentY: "moments/m-prop-lbsft", momentX: "moments/l-prop-lbsft",
  yawMoment: "moments/n-prop-lbsft", yawRate: "velocities/r-rad_sec", rollRate: "velocities/p-rad_sec",
  weight: "inertia/weight-lbs", n1: "propulsion/engine/n1",
};
try {
  for (const file of files) {
    const bytes = await readFile(path.join(root, "public/jsbsim-data", file));
    hashes[file] = createHash("sha256").update(bytes).digest("hex");
    sdk.writeDataFile(file, bytes.toString("utf8"));
  }
  sdk.configurePaths({ rootDir: "/runtime", aircraftPath: "aircraft",
    enginePath: "aircraft/F-35B-jsbsim/Engines", systemsPath: "aircraft/F-35B-jsbsim/Systems" });
  sdk.loadModelOrThrow("F-35B-jsbsim");
  sdk.setDt(1 / 120);
  const controls = {
    "ic/lat-geod-deg": 0, "ic/long-gc-deg": 0, "ic/terrain-elevation-ft": 0,
    "ic/h-sl-ft": configuration.altitudeFt, "ic/vc-kts": configuration.speedKts,
    "ic/theta-deg": configuration.pitchDeg, "ic/gamma-deg": 0, "ic/alpha-deg": configuration.pitchDeg,
    "gear/gear-cmd-norm": 0, "gear/gear-pos-norm": 0,
    "fcs/throttle-cmd-norm": configuration.throttle, "fcs/pitch-trim-cmd-norm": configuration.trim,
    "fcs/mixture-cmd-norm": 1, "fcs/stovl-cmd-norm": configuration.stovl,
    "fcs/stovl-pos-norm": configuration.stovl,
    "propulsion/tank[0]/contents-lbs": configuration.fuelLb / 2,
    "propulsion/tank[1]/contents-lbs": configuration.fuelLb / 2,
  };
  for (const [name, value] of Object.entries(controls)) set(name, value);
  if (!sdk.runIc()) throw new Error("Initial conditions failed.");
  set("propulsion/set-running", -1);
  for (const [name, value] of Object.entries(controls)) set(name, value);
  if (!sdk.runIc()) throw new Error("Engine initialization failed.");
  if (configuration.trimModel) {
    try { sdk.doTrim(0); } catch (error) { log.push("Trim failed: " + error.message); }
  }
  const startingAltitude = get("position/h-sl-ft");
  let integral = 0;
  for (let step = 0; step <= configuration.seconds * 120; step++) {
    set("fcs/elevator-cmd-norm", step < configuration.controlSeconds * 120 ? configuration.elevator : 0);
    set("fcs/aileron-cmd-norm", step < configuration.controlSeconds * 120 ? configuration.aileron : 0);
    set("fcs/rudder-cmd-norm", step < configuration.controlSeconds * 120 ? configuration.rudder : 0);
    if (configuration.pilot) {
      const target = clamp(0.05 + 0.0001 * (startingAltitude - get("position/h-sl-ft"))
        - 0.004 * get("velocities/h-dot-fps"), -0.17, 0.26);
      integral = clamp(integral + (target - get("attitude/theta-rad")) / 120, -0.5, 0.5);
      set("fcs/elevator-cmd-norm", clamp(-(2 * (target - get("attitude/theta-rad")) + 0.5 * integral)
        + 0.6 * get("velocities/q-rad_sec"), -1, 1));
      set("fcs/aileron-cmd-norm", clamp(-1.5 * get("attitude/phi-rad") - 0.4 * get("velocities/p-rad_sec"), -1, 1));
      set("fcs/pitch-trim-cmd-norm", clamp(-integral, -1, 1));
    }
    if (step % 120 === 0) observations.push(Object.fromEntries(Object.entries(paths).map(([label, name]) => [label, get(name)])));
    if (step < configuration.seconds * 120 && !sdk.run()) throw new Error("Run failed at step " + step);
  }
  const report = { schema: 1, kind: "development diagnostic, not aircraft calibration",
    artifact, configuration, packageHashes: hashes, observations };
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ output, first: observations[0], last: observations.at(-1),
    maxAltitudeExcursionFt: Math.max(...observations.map(row => Math.abs(row.altitudeFt - startingAltitude))),
    finite: observations.every(row => Object.values(row).every(Number.isFinite)) }, null, 2));
} finally {
  await writeFile(path.join(output, "sdk.log"), log.join("\n") + "\n");
  sdk.destroy();
}
