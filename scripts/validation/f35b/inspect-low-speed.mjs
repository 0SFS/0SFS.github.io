// Aircraft-model diagnostic: actual installed SDK, no force or pose overrides.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmModuleUrl, wasmBinaryUrl } from "@felipegalind0/jsbsim/wasm";
import { newOutputDirectory } from "../../outputDirectory.mjs";
import { verifyInstalledSdk } from "../../verify-jsbsim-artifact.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => args.find(arg => arg.startsWith(name + "="))?.slice(name.length + 1) ?? fallback;
if (args.includes("--help")) {
  console.log("node scripts/validation/f35b/inspect-low-speed.mjs [--out=build/new-directory] [--cases=id,...] [--seconds=10] [--baseline-directory=build/retained-xml]\nNative aircraft control/force diagnostic; development assumptions, not real F-35 handling qualification.");
  process.exit(0);
}
const requestedOutput = option("--out", undefined);
const out = path.resolve(requestedOutput ?? newOutputDirectory("validation", "f35b-low-speed"));
if (!out.startsWith(path.join(root, "build") + path.sep)) throw new Error("--out must be a new directory under build/.");
if (requestedOutput) {
  await mkdir(path.dirname(out), { recursive: true });
  await mkdir(out, { recursive: false });
}
const seconds = Number(option("--seconds", "10"));
if (!Number.isFinite(seconds) || seconds < 3 || seconds > 60) throw new Error("--seconds must be 3..60.");
const cases = [
  ...[0, 60, 100, 150].map(speed => ({ id: `conventional-${speed}`, speed, conversion: 0, throttle: 0.98, mode: 0, axis: "neutral" })),
  ...["neutral", "aileron", "elevator", "rudder"].flatMap(axis => [0, 1].map(mode => ({
    id: `hover-${mode ? "manual" : "auto"}-${axis}`, speed: 0, conversion: 1, throttle: 0.98, mode, axis,
  }))),
  ...[0.48, 0.8].map(throttle => ({ id: `hover-throttle-${throttle}`, speed: 0, conversion: 1, throttle, mode: 0, axis: "aileron" })),
  { id: "partial-60", speed: 60, conversion: 0.5, throttle: 0.98, mode: 0, axis: "aileron" },
  { id: "entry-60", speed: 60, conversion: 0, conversionCommand: 1, throttle: 0.98, mode: 0, axis: "neutral" },
  ...[0, 60, 150].flatMap(speed => [0.48, 0.8, 0.98].flatMap(throttle => [0, 0.25, 0.5, 0.75, 1].map(conversion => ({
    id: `grid-${speed}-${throttle}-${conversion}`, speed, conversion, throttle, mode: 0, axis: "neutral",
  })))),
  ...[0.25, 0.5, 0.75].flatMap(conversion => ["aileron", "elevator", "rudder"].map(axis => ({
    id: `partial-${conversion}-${axis}`, speed: 60, conversion, throttle: 0.98, mode: 0, axis,
  }))),
];
const selected = option("--cases", undefined)?.split(",");
const configurations = selected ? cases.filter(item => selected.includes(item.id)) : cases;
if (!configurations.length) throw new Error("No matching cases.");
const manifest = JSON.parse(await readFile(path.join(root, "public/jsbsim-data/manifest.json"), "utf8"));
const data = await Promise.all(manifest.aircraft["f-35b"].map(async file => [file, await readFile(path.join(root, "public/jsbsim-data", file))]));
const runtimeHashes = Object.fromEntries(data.map(([file, bytes]) => [file, createHash("sha256").update(bytes).digest("hex")]));
const baselineDirectory = option("--baseline-directory", undefined);
if (baselineDirectory) {
  const directory = path.resolve(baselineDirectory);
  if (!directory.startsWith(path.join(root, "build") + path.sep)) throw new Error("Baseline must be explicitly retained under build/.");
  for (const record of data) {
    if (["F-35B-jsbsim.xml", "liftfan.xml", "sidefan.xml"].includes(path.basename(record[0]))) {
      record[1] = await readFile(path.join(directory, path.basename(record[0])));
    }
  }
}
const loadedHashes = Object.fromEntries(data.map(([file, bytes]) => [file, createHash("sha256").update(bytes).digest("hex")]));
const artifact = await verifyInstalledSdk(root);
const observations = [
  ["time", "simulation/sim-time-sec"], ["speedKts", "velocities/vc-kts"], ["qbar", "aero/qbar-psf"],
  ["roll", "attitude/phi-rad"], ["pitch", "attitude/theta-rad"], ["heading", "attitude/psi-rad"],
  ["p", "velocities/p-rad_sec"], ["q", "velocities/q-rad_sec"], ["r", "velocities/r-rad_sec"],
  ["altitudeFt", "position/h-sl-ft"], ["conversion", "fcs/stovl-pos-norm"],
  ["nozzlePitch", "fcs/nozzle-pitch-rad"], ["nozzleYaw", "fcs/nozzle-yaw-rad"],
  ["rollControl", "fcs/stovl-roll-control"], ["pitchControl", "fcs/stovl-pitch-control"],
  ["mainThrust", "propulsion/engine[0]/thrust-lbs"], ["fanThrust", "propulsion/engine[1]/thrust-lbs"],
  ["rightPostThrust", "propulsion/engine[2]/thrust-lbs"], ["leftPostThrust", "propulsion/engine[3]/thrust-lbs"],
  ["fanN2", "propulsion/engine[1]/n2"], ["rightPostN2", "propulsion/engine[2]/n2"], ["leftPostN2", "propulsion/engine[3]/n2"],
  ["fanCommand", "fcs/stovl-fan-command"], ["rightPostCommand", "fcs/stovl-right-post-command"], ["leftPostCommand", "fcs/stovl-left-post-command"],
  ...[..."xyz"].flatMap(axis => [[`propForce${axis}`, `forces/fb${axis}-prop-lbs`], [`aeroForce${axis}`, `forces/fb${axis}-aero-lbs`],
    [`weight${axis}`, `forces/fb${axis}-weight-lbs`], [`appliedTotal${axis}`, `forces/fb${axis}-total-lbs`]]),
  ...[..."lmn"].flatMap(axis => [[`propMoment${axis}`, `moments/${axis}-prop-lbsft`], [`aeroMoment${axis}`, `moments/${axis}-aero-lbsft`]]),
  ["augmentation", "propulsion/engine[0]/augmentation"], ["flaps", "fcs/flap-pos-norm"],
  ...[0, 1, 2, 3].flatMap(index => [..."xyz"].map(axis => [`engine${index}Force${axis}`, `propulsion/engine[${index}]/body-force-${axis}-lbs`])),
];
const results = [];
for (const configuration of configurations) {
  const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl, persistence: { enabled: false }, log: { console: false } });
  const log = [];
  sdk.on("stderr", ({ message }) => log.push(message));
  try {
    for (const [file, bytes] of data) sdk.writeDataFile(file, bytes.toString("utf8"));
    sdk.configurePaths({ rootDir: "/runtime", aircraftPath: "aircraft", enginePath: "aircraft/F-35B-jsbsim/Engines", systemsPath: "aircraft/F-35B-jsbsim/Systems" });
    sdk.loadModelOrThrow("F-35B-jsbsim");
    sdk.setDt(1 / 120);
    const initial = {
      "ic/lat-geod-deg": 0, "ic/long-gc-deg": 0, "ic/terrain-elevation-ft": -100000,
      "ic/h-sl-ft": 5000, "ic/vc-kts": configuration.speed,
      "ic/theta-deg": 0, "ic/gamma-deg": 0, "ic/alpha-deg": 0,
      "gear/gear-cmd-norm": 0, "gear/gear-pos-norm": 0, "fcs/pitch-trim-cmd-norm": 0,
      "fcs/throttle-cmd-norm": configuration.throttle, "fcs/mixture-cmd-norm": 1,
      "fcs/stovl-cmd-norm": configuration.conversion, "fcs/stovl-pos-norm": configuration.conversion,
      "fcs/control-law-mode": configuration.mode,
    };
    const initialize = () => { for (const [property, value] of Object.entries(initial)) sdk.setPropertyValue(property, value); };
    initialize();
    if (!sdk.runIc()) throw new Error("RunIC failed.");
    sdk.setPropertyValue("propulsion/set-running", -1);
    initialize();
    if (!sdk.runIc()) throw new Error("Engine RunIC failed.");
    const batch = sdk.createPropertyBatch(observations.map(([, property]) => property));
    if (batch.missing.length) throw new Error("Missing native observations: " + batch.missing.join(", "));
    const rows = [];
    for (let step = 0; step <= seconds * 120; step++) {
      const time = step / 120;
      if (configuration.conversionCommand !== undefined) sdk.setPropertyValue("fcs/stovl-cmd-norm", configuration.conversionCommand);
      for (const axis of ["aileron", "elevator", "rudder"]) {
        // App maps positive right-yaw input to negative native rudder command.
        sdk.setPropertyValue(`fcs/${axis}-cmd-norm`, configuration.axis === axis && time >= 1 && time < 2 ? (axis === "rudder" ? -0.3 : 0.3) : 0);
      }
      const values = batch.read();
      rows.push(Object.fromEntries(observations.map(([label], index) => [label, values[index]])));
      if (step < seconds * 120 && !sdk.run()) throw new Error("Run failed.");
    }
    const result = { configuration, finite: rows.every(row => Object.values(row).every(Number.isFinite)),
      extrema: Object.fromEntries(["roll", "pitch", "p", "q", "r"].map(key => [key, Math.max(...rows.map(row => Math.abs(row[key])))])),
      samples: [0, 1, 1.1, 1.5, 2, 3, 5, seconds].filter(time => time <= seconds).map(time => rows[Math.round(time * 120)]),
    };
    results.push(result);
    const labels = observations.map(([label]) => label);
    await writeFile(path.join(out, configuration.id + ".csv"), labels.join(",") + "\n" + rows.map(row => labels.map(key => row[key]).join(",")).join("\n") + "\n");
    console.log(JSON.stringify({ case: configuration.id, finite: result.finite, extrema: result.extrema, final: rows.at(-1) }));
    batch.dispose();
  } finally {
    await writeFile(path.join(out, configuration.id + "-sdk.log"), log.join("\n") + "\n");
    sdk.destroy();
  }
}
await writeFile(path.join(out, "report.json"), JSON.stringify({ schema: 1, scope: "Untrimmed airborne aircraft-model diagnostic; no real aircraft qualification", timestep: 1 / 120, seconds, plant: baselineDirectory ? "explicit retained baseline in MEMFS" : "runtime", runtimeHashes, loadedHashes, artifact, results }, null, 2) + "\n");
console.log(JSON.stringify({ output: out }));
