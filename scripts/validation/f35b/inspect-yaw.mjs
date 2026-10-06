// Aircraft-data diagnostic, installed SDK only. No browser, terrain or engine edits.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmModuleUrl, wasmBinaryUrl } from "@felipegalind0/jsbsim/wasm";
import { newOutputDirectory } from "../../outputDirectory.mjs";
import { verifyInstalledSdk } from "../../verify-jsbsim-artifact.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at < 0 ? fallback : args[at + 1];
};
const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = option("--out", undefined) ?? newOutputDirectory("validation", "f35b-yaw");
await mkdir(output, { recursive: true });
const seconds = Number(option("--seconds", "24"));
if (!Number.isFinite(seconds) || seconds < 8 || seconds > 120) throw new Error("--seconds must be 8..120.");
const controlLaw = option("--mode", "auto");
const modes = { auto: 0, manual: 1, "fly-by-wire": 2 };
if (!Object.hasOwn(modes, controlLaw)) throw new Error("--mode must be auto, manual or fly-by-wire.");
const yawSchedule = option("--yaw-schedule", "runtime");
if (!["runtime", "constant"].includes(yawSchedule)) throw new Error("--yaw-schedule must be runtime or constant.");
const config = [
  ...[160, 300, 450, 600].flatMap(speed => [
    { id: `conventional-${speed}-rate`, speed, conversion: 0, disturbance: "rate", throttle: 0.48 },
    { id: `conventional-${speed}-release`, speed, conversion: 0, disturbance: "release", throttle: 0.48 },
  ]),
  { id: "conventional-450-neutral", speed: 450, conversion: 0, disturbance: "neutral", throttle: 0.48 },
  { id: "conventional-600-neutral", speed: 600, conversion: 0, disturbance: "neutral", throttle: 0.48 },
  { id: "conventional-450-turn-decelerate", speed: 450, conversion: 0, disturbance: "turn", throttle: 0.48 },
  { id: "partial-160-release", speed: 160, conversion: 0.5, disturbance: "release", throttle: 0.98 },
  { id: "hover-rate", speed: 0, conversion: 1, disturbance: "rate", throttle: 0.98 },
  { id: "hover-release", speed: 0, conversion: 1, disturbance: "release", throttle: 0.98 },
];
const selected = option("--cases", undefined)?.split(",");
const cases = selected ? config.filter(item => selected.includes(item.id)) : config;
if (!cases.length) throw new Error("No matching cases.");
const manifest = JSON.parse(await readFile(path.join(root, "public/jsbsim-data/manifest.json"), "utf8"));
const files = manifest.aircraft["f-35b"];
const data = await Promise.all(files.map(async file => [file, await readFile(path.join(root, "public/jsbsim-data", file))]));
const runtimeHashes = Object.fromEntries(data.map(([file, bytes]) => [file, createHash("sha256").update(bytes).digest("hex")]));
if (yawSchedule === "constant") {
  // Explicit aircraft-law comparator in MEMFS only; public/original source
  // files remain untouched. Isolates the scheduled gain from all other edits.
  const aircraft = data.find(([file]) => file.endsWith("/F-35B-jsbsim.xml"));
  const xml = aircraft[1].toString("utf8");
  const scheduled = /<fcs_function name="yaw gain schedule">[\s\S]*?<\/fcs_function>/;
  if (!scheduled.test(xml)) throw new Error("Runtime XML has no yaw schedule to compare.");
  aircraft[1] = Buffer.from(xml.replace(scheduled, '<fcs_function name="yaw gain schedule"><function><value>1</value></function></fcs_function>'));
}
const packageHashes = Object.fromEntries(data.map(([file, bytes]) => [file, createHash("sha256").update(bytes).digest("hex")]));
const artifact = await verifyInstalledSdk(root);
const observations = [
  ["time", "simulation/sim-time-sec"], ["r", "velocities/r-rad_sec"],
  ["beta", "aero/beta-rad"], ["scheduler", "fcs/yaw-scheduler"],
  ["rudderPosition", "fcs/rudder-position"], ["rudderRad", "fcs/rudder-pos-rad"],
  ["qbar", "aero/qbar-psf"], ["speed", "velocities/vc-kts"],
  ["roll", "attitude/phi-rad"], ["pitch", "attitude/theta-rad"],
  ["altitude", "position/h-sl-ft"], ["nozzleYaw", "fcs/nozzle-yaw-rad"],
  ["mode", "fcs/control-law-mode"], ["fbwEnabled", "fcs/fbw-enabled"], ["yawGain", "fcs/yaw-gain-schedule"],
  ["rudderCmd", "fcs/rudder-cmd-norm"], ["aileronCmd", "fcs/aileron-cmd-norm"], ["elevatorCmd", "fcs/elevator-cmd-norm"],
];
const rms = values => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / Math.max(1, values.length));
const summary = rows => ({
  rRms: rms(rows.map(row => row.r)), rPeak: Math.max(...rows.map(row => Math.abs(row.r))),
  betaRms: rms(rows.map(row => row.beta)),
  schedulerSaturatedFraction: rows.filter(row => Math.abs(row.scheduler) > 0.99).length / Math.max(1, rows.length),
  rateZeroCrossings: rows.reduce((state, row) => {
    const sign = Math.abs(row.r) > 0.001 ? Math.sign(row.r) : state.sign;
    return { sign, crossings: state.crossings + (state.sign !== 0 && sign !== state.sign ? 1 : 0) };
  }, { sign: 0, crossings: 0 }).crossings,
});
const results = [];
for (const configuration of cases) {
  const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false } });
  const log = [];
  sdk.on("stderr", ({ message }) => log.push(message));
  try {
    for (const [file, bytes] of data) sdk.writeDataFile(file, bytes.toString("utf8"));
    sdk.configurePaths({ rootDir: "/runtime", aircraftPath: "aircraft",
      enginePath: "aircraft/F-35B-jsbsim/Engines", systemsPath: "aircraft/F-35B-jsbsim/Systems" });
    sdk.loadModelOrThrow("F-35B-jsbsim");
    sdk.setDt(1 / 120);
    const converted = configuration.conversion > 0;
    const initial = {
      "ic/lat-geod-deg": 0, "ic/long-gc-deg": 0, "ic/terrain-elevation-ft": -100000,
      "ic/h-sl-ft": configuration.speed === 0 ? 1000 : 5000,
      "ic/vc-kts": configuration.speed,
      "ic/theta-deg": converted ? 0 : 1.92, "ic/gamma-deg": 0, "ic/alpha-deg": converted ? 0 : 1.92,
      "ic/r-rad_sec": configuration.disturbance === "rate" ? 0.05 : 0,
      "gear/gear-cmd-norm": 0, "gear/gear-pos-norm": 0,
      "fcs/pitch-trim-cmd-norm": converted ? 0 : -0.059,
      "fcs/throttle-cmd-norm": configuration.throttle,
      "fcs/mixture-cmd-norm": 1,
      "fcs/stovl-cmd-norm": configuration.conversion,
      "fcs/stovl-pos-norm": configuration.conversion,
      "fcs/control-law-mode": modes[controlLaw],
    };
    const initialize = () => { for (const [property, value] of Object.entries(initial)) sdk.setPropertyValue(property, value); };
    initialize();
    if (!sdk.runIc()) throw new Error("RunIC failed.");
    sdk.setPropertyValue("propulsion/set-running", -1);
    initialize();
    if (!sdk.runIc()) throw new Error("Engine RunIC failed.");
    const rows = [];
    for (let step = 0; step <= seconds * 120; step++) {
      const time = step / 120;
      sdk.setPropertyValue("fcs/rudder-cmd-norm", configuration.disturbance === "release" && time >= 1.5 && time < 2 ? -0.5 : 0);
      if (configuration.disturbance === "turn") {
        sdk.setPropertyValue("fcs/aileron-cmd-norm", time >= 1 && time < 3 ? 0.3 : 0);
        sdk.setPropertyValue("fcs/throttle-cmd-norm", time >= 3 ? 0 : configuration.throttle);
      }
      rows.push(Object.fromEntries(observations.map(([label, property]) => [label, sdk.getPropertyValue(property)])));
      if (step < seconds * 120 && !sdk.run()) throw new Error("Run failed.");
    }
    const early = rows.filter(row => row.time >= 3 && row.time < 8);
    const late = rows.filter(row => row.time >= seconds - 5);
    const result = {
      configuration, finite: rows.every(row => Object.values(row).every(Number.isFinite)),
      early: summary(early), late: summary(late), final: rows.at(-1),
      bySecond: Array.from({ length: Math.ceil(seconds) }, (_, second) => ({ time: second,
        ...summary(rows.filter(row => row.time >= second && row.time < second + 1)) })),
    };
    results.push(result);
    const headers = observations.map(([label]) => label);
    await writeFile(path.join(output, configuration.id + ".csv"), headers.join(",") + "\n"
      + rows.map(row => headers.map(key => row[key]).join(",")).join("\n") + "\n");
    console.log(JSON.stringify({ case: configuration.id, early: result.early, late: result.late, finite: result.finite }));
  } finally {
    await writeFile(path.join(output, configuration.id + "-sdk.log"), log.join("\n") + "\n");
    sdk.destroy();
  }
}
await writeFile(path.join(output, "report.json"), JSON.stringify({ schema: 1, kind: "Aircraft FCS yaw development diagnostic, not performance calibration",
  output, seconds, timestep: 1 / 120, controlLaw, yawSchedule, runtimeHashes, packageHashes, artifact, results }, null, 2) + "\n");
console.log(JSON.stringify({ output }));
