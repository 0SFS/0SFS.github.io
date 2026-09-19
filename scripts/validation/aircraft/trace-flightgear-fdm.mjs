#!/usr/bin/env node
// Fly one extracted FlightGear model and print what it is doing, second by
// second, so a smoke-test failure turns into a reason.
//
//   node scripts/validation/aircraft/trace-flightgear-fdm.mjs \
//     --fdm build/fg-aircraft-inventory/<run>/fdm --variant 787-8-GEnx --kts 250
//
// It is the same boot and stand-in as smoke-test-flightgear-fdm.mjs, with the
// state printed rather than judged, and with --set to try a property by hand:
//
//   --set /controls/flight/elevator-sum=-0.5     one FlightGear-tree input
//   --pilot false                                hands off instead of flown
//
// This is what showed that the 787 was holding full nose-up elevator at 16
// degrees of attack and still descending (its lift was being multiplied by a
// property nothing had set), and that the 737's elevator never moved at all.
// The logic is deliberately duplicated from the smoke test rather than
// imported: that file is a script that runs on import, and a diagnostic should
// not be able to change what the smoke test measures.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";

const args = process.argv.slice(2);
const option = (name, fallback) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : fallback; };
const fdmRoot = option("--fdm");
const variant = option("--variant");
if (!fdmRoot || !variant) throw new Error("Required: --fdm DIR --variant ID");
const startKts = Number(option("--kts", 140));
const seconds = Number(option("--seconds", 20));
const piloted = option("--pilot", "true") !== "false";
const sharedSystems = option("--shared-systems");
const overrides = args.flatMap((value, index) => (args[index - 1] === "--set" ? [value] : []))
  .map(pair => [pair.slice(0, pair.lastIndexOf("=")), Number(pair.slice(pair.lastIndexOf("=") + 1))]);

const DT = 1 / 120;
const ABSOLUTE = /(?<![\w./])-?(\/[a-z][\w-]*(?:\[\d+\])?(?:\/[\w-]+(?:\[\d+\])?)+)/g;
const RELATIVE = /(?<![\w./])-?([a-z][\w-]*(?:\[\d+\])?(?:\/[\w-]+(?:\[\d+\])?)+)(?![\w./-])/g;
const TEXT = />([^<]+)<|="([^"]*)"/g;
const PROPERTY_ELEMENT = /<(?:property|input|output|independentVar)\b[^>]*>\s*-?([A-Za-z][\w-]*(?:\[\d+\])?)\s*</g;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), relative));
    else files.push(relative);
  }
  return files;
}

const directory = path.join(fdmRoot, variant);
const source = JSON.parse(await readFile(path.join(directory, "source.json"), "utf8"));
const { aero } = source;
const sdk = await JSBSimSdk.create({
  moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl, persistence: { enabled: false }, log: { console: false },
});
const referenced = new Set();
const factors = new Set();
for (const relative of await listFiles(path.join(directory, "aircraft"))) {
  const contents = await readFile(path.join(directory, "aircraft", relative), "utf8");
  sdk.writeDataFile(`aircraft/${relative}`, contents);
  const uncommented = contents.replace(/<!--[\s\S]*?-->/g, "");
  for (const match of uncommented.matchAll(ABSOLUTE)) referenced.add(match[1]);
  for (const [, text, attribute] of uncommented.matchAll(TEXT)) {
    for (const match of (text ?? attribute).matchAll(RELATIVE)) referenced.add(match[1]);
  }
  for (const match of uncommented.matchAll(PROPERTY_ELEMENT)) referenced.add(match[1]);
  // A property the model multiplies by stands in at 1, not 0.
  const stack = [];
  for (const [, closing, tag, , selfClosing, body] of uncommented.matchAll(/<(\/?)([\w:-]+)([^>]*?)(\/?)>|([^<]+)/g)) {
    if (body !== undefined) {
      if (stack.at(-1) === "property" && stack.at(-2) === "product") factors.add(body.trim().replace(/^-/, ""));
    } else if (closing) stack.pop();
    else if (!selfClosing && !tag.startsWith("?") && !tag.startsWith("!")) stack.push(tag);
  }
}
if (sharedSystems) {
  for (const relative of (await listFiles(sharedSystems)).filter(file => file.endsWith(".xml"))) {
    sdk.writeDataFile(`systems/${relative}`, await readFile(path.join(sharedSystems, relative), "utf8"));
  }
}
const set = (property, value) => { try { sdk.setPropertyValue(property, value); } catch { /* absent */ } };
const get = property => { try { return sdk.getPropertyValue(property); } catch { return NaN; } };
const standIn = name => (factors.has(name) && !/revers|cutoff|brake|fail|damage|fire|door|open/.test(name) ? 1 : 0);
for (const name of referenced) if (name.startsWith("/")) set(name, standIn(name));
sdk.configurePaths({
  rootDir: "/runtime", aircraftPath: "aircraft",
  enginePath: `aircraft/${aero}/Engines`, systemsPath: sharedSystems ? "systems" : `aircraft/${aero}/Systems`,
});
sdk.loadModelOrThrow(aero);
sdk.setDt(DT);
const catalog = new Set(sdk.getPropertyCatalog().map(line => line.replace(/ \([RW]+\)$/, "").replace(/\[0\]/g, "")));
for (const name of referenced) {
  if (!catalog.has(name.replace(/\[0\]/g, "")) && !name.startsWith("ic/")) set(name, standIn(name));
}
let engines = 0;
for (const line of catalog) {
  const match = /^propulsion\/engine(?:\[(\d+)\])?\//.exec(line);
  if (match) engines = Math.max(engines, Number(match[1] ?? 0) + 1);
}
const controls = () => {
  for (let n = 0; n < Math.max(engines, 1); n += 1) {
    set(`fcs/throttle-cmd-norm[${n}]`, 0.7);
    set(`fcs/mixture-cmd-norm[${n}]`, 1);
    set(`/controls/engines/engine[${n}]/throttle`, 0.7);
    set(`/controls/engines/engine[${n}]/mixture`, 1);
    set(`/controls/engines/engine[${n}]/magnetos`, 3);
  }
  set("propulsion/refuel", 1);
  set("propulsion/fuel_freeze", 1);
  set("propulsion/magneto_cmd", 3);
  set("gear/gear-cmd-norm", 0);
  set("gear/gear-pos-norm", 0);
  for (const [property, value] of overrides) set(property, value);
};
set("ic/h-sl-ft", 5000);
set("ic/terrain-elevation-ft", 0);
set("ic/vc-kts", startKts);
set("ic/gamma-deg", 0);
controls();
sdk.runIc();
set("propulsion/set-running", -1);
controls();

console.log(`${variant} (${aero}): ${engines} engine(s), weight ${get("inertia/weight-lbs").toFixed(0)} lb, `
  + `CG x ${get("inertia/cg-x-in").toFixed(1)} in, ${piloted ? "flown level" : "hands off"} from ${startKts} kt`);
const startAlt = get("position/h-sl-ft");
let integral = 0;
for (let step = 0; step <= seconds * 120; step += 1) {
  if (piloted) {
    const theta = get("attitude/theta-rad");
    const target = clamp(0.05 + 0.0001 * (startAlt - get("position/h-sl-ft")) - 0.004 * get("velocities/h-dot-fps"), -0.17, 0.26);
    integral = clamp(integral + (target - theta) * DT, -0.5, 0.5);
    const elevator = clamp(-(2 * (target - theta) + 0.5 * integral) + 0.6 * get("velocities/q-rad_sec"), -1, 1);
    const aileron = clamp(-1.5 * get("attitude/phi-rad") - 0.4 * get("velocities/p-rad_sec"), -1, 1);
    set("fcs/elevator-cmd-norm", elevator);
    set("/controls/flight/elevator", elevator);
    set("fcs/aileron-cmd-norm", aileron);
    set("/controls/flight/aileron", aileron);
    set("fcs/pitch-trim-cmd-norm", clamp(-integral, -1, 1));
    set("/controls/flight/elevator-trim", clamp(-integral, -1, 1));
    for (const [property, value] of overrides) set(property, value);
  }
  if (step % 240 === 0) {
    const field = (label, value, digits = 1) => `${label} ${value.toFixed(digits).padStart(6)}`;
    console.log(`t ${String(step / 120).padStart(3)}  ${field("alt", get("position/h-sl-ft"), 0)}  `
      + `${field("kts", get("velocities/vc-kts"), 0)}  ${field("pitch", get("attitude/theta-deg"))}  `
      + `${field("roll", get("attitude/phi-deg"))}  ${field("alpha", get("aero/alpha-deg"))}  `
      + `${field("elev", get("fcs/elevator-pos-rad"), 3)}  ${field("thrust", get("propulsion/engine/thrust-lbs"), 0)}`);
  }
  if (!sdk.run()) { console.log("run() returned false"); break; }
}
sdk.destroy();
