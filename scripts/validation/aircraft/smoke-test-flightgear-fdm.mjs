#!/usr/bin/env node
// Load JSBSim aircraft into the JSBSim WASM build 0sfs ships and see how far
// each gets without FlightGear around it: does it load, does it stand on its
// gear, do its engines make thrust, does it trim, and can a simple stand-in
// pilot fly it level for 30 seconds.
//
// This is a triage tool, not a qualification. A pass means the flight model is
// worth an afternoon; it says nothing about whether it flies like the aircraft.
//
//   node scripts/validation/aircraft/smoke-test-flightgear-fdm.mjs --fdm build/fg-aircraft-inventory/<run>/fdm
//   node scripts/validation/aircraft/smoke-test-flightgear-fdm.mjs --jsbsim-root ../Felipegalind0/jsbsim
//
// --shared-systems <a JSBSim checkout's systems/> supplies the shared system
// files FlightGear serves from its base data, which many models expect.
//
// The first form reads what scan-flightgear-aircraft.py --extract-fdm
// pulled out of FlightGear's aircraft packages. The second runs the same checks
// over the aircraft a JSBSim checkout ships in aircraft/, engine/ and systems/.
//
// FlightGear models often read properties from FlightGear's global tree
// (/controls/..., /systems/...) that Nasal or the instruments write. Standalone
// JSBSim throws when it evaluates one that does not exist, so every property
// path the model mentions and does not define itself is created - the cheapest
// possible stand-in for FlightGear - at 0, or at 1 where the model multiplies
// by it or it is a "serviceable" flag. The engine controls FlightGear
// would copy into the FDM are then driven both ways, through fcs/ and through
// /controls/, so a model wired either way gets its throttle. Every tank is kept
// full, because fuel transfer is so often Nasal; fuel systems are not tested.
//
// Each attempt loads the model afresh. A failed JSBSim trim can leave NaN in
// state that RunIC does not reset, and it would poison every attempt after it.
import { statSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { newOutputDirectory } from "../../outputDirectory.mjs";

const args = process.argv.slice(2);
const option = name => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
const fdmRoot = option("--fdm");
const jsbsimRoot = option("--jsbsim-root");
if (!fdmRoot === !jsbsimRoot) {
  throw new Error("Required: --fdm DIR (the fdm/ folder written by scan-flightgear-aircraft.py --extract-fdm) or --jsbsim-root DIR");
}
const only = option("--only")?.split(",");
// FlightGear bundles JSBSim's own systems/ directory and points JSBSim's
// systems path at it, so a model can say <system file="hydrodynamics"/> and
// get a file that is in neither its package nor FlightGear's own making.
// Without it, 39 of the 289 FlightGear models here fail to load.
const sharedSystems = option("--shared-systems");
const output = option("--out") ? path.resolve(option("--out")) : newOutputDirectory("fg-aircraft-inventory", "smoke");
const DT = 1 / 120;
const TRIM_SPEEDS_KTS = [120, 90, 160, 220, 70, 300, 50, 400];
const UNTRIMMED_START_KTS = [120, 180, 250, 90];
// JSBSim lets a property carry a sign, "-/orientation/pitch-deg", so a leading
// minus is allowed in front of either kind of path.
const ABSOLUTE_PROPERTY = /(?<![\w./])-?(\/[a-z][\w-]*(?:\[\d+\])?(?:\/[\w-]+(?:\[\d+\])?)+)/g;
// Anything shaped like a property path in element text or an attribute value,
// e.g. the input of a component, either side of a condition, or a test's value.
// Over-matching is harmless: only names the loaded model did not create get
// created, and only at zero.
const RELATIVE_PROPERTY = /(?<![\w./])-?([a-z][\w-]*(?:\[\d+\])?(?:\/[\w-]+(?:\[\d+\])?)+)(?![\w./-])/g;
const TEXT = />([^<]+)<|="([^"]*)"/g;
// A property can also be a single name with no slash, "sim-time-sec", which the
// path pattern above cannot tell from ordinary words. It is only taken as a
// property where an element expects one.
const PROPERTY_ELEMENT = /<(?:property|input|output|independentVar)\b[^>]*>\s*-?([A-Za-z][\w-]*(?:\[\d+\])?)\s*</g;
const canonical = name => name.replace(/\[0\]/g, "");
const finite = value => typeof value === "number" && Number.isFinite(value);
// After a native exception the SDK can fail to tear down. The aircraft has
// already been judged by then, so that is not the aircraft's failure.
const release = sdk => { try { sdk?.destroy(); } catch { /* instance is abandoned */ } };
const describe = error => error?.constructor?.name === "CppException" ? "native exception" : String(error?.message ?? error).slice(0, 200);

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

/** An aircraft the scanner extracted: its files under aircraft/<aero>/, FlightGear style. */
async function extractedSource(variantDir) {
  const source = JSON.parse(await readFile(path.join(variantDir, "source.json"), "utf8"));
  const files = [];
  for (const relative of await listFiles(path.join(variantDir, "aircraft"))) {
    files.push([`aircraft/${relative}`, await readFile(path.join(variantDir, "aircraft", relative), "utf8")]);
  }
  return {
    variant: source.variant, aero: source.aero, files,
    enginePath: `aircraft/${source.aero}/Engines`,
    // JSBSim looks in the aircraft's own Systems/ before this, so the shared
    // directory is a fallback, not an override.
    systemsPath: sharedSystems ? "systems" : `aircraft/${source.aero}/Systems`,
  };
}

/** JSBSim's shared systems/ directory, as FlightGear serves it to its aircraft. */
async function sharedSystemFiles() {
  if (!sharedSystems) return [];
  const files = [];
  for (const relative of (await listFiles(sharedSystems)).filter(file => file.endsWith(".xml"))) {
    files.push([`systems/${relative}`, await readFile(path.join(sharedSystems, relative), "utf8")]);
  }
  return files;
}

/** An aircraft in a JSBSim checkout, with that checkout's shared engine/ and systems/. */
async function jsbsimSource(root, name) {
  const files = [];
  for (const directory of [`aircraft/${name}`, "engine", "systems"]) {
    let listed = [];
    try { listed = await listFiles(path.join(root, directory)); } catch { continue; }
    for (const relative of listed.filter(file => file.endsWith(".xml"))) {
      files.push([`${directory}/${relative}`, await readFile(path.join(root, directory, relative), "utf8")]);
    }
  }
  return { variant: name, aero: name, files, enginePath: "engine", systemsPath: "systems" };
}

/**
 * Names that must stand in at 1 rather than 0. A property FlightGear normally
 * sets that the model multiplies by - the 787's lift is multiplied by
 * /controls/ice/wing/lift-coefficient, which FlightGear's icing code holds at
 * 1 - takes the whole term with it at 0. So is a "serviceable" flag, which
 * FlightGear uses for "this works".
 */
function multiplicativeProperties(text) {
  const factors = new Set();
  const stack = [];
  for (const [, closing, tag, , selfClosing, body] of text.matchAll(/<(\/?)([\w:-]+)([^>]*?)(\/?)>|([^<]+)/g)) {
    if (body !== undefined) {
      if (stack.at(-1) === "property" && stack.at(-2) === "product") factors.add(body.trim().replace(/^-/, ""));
    } else if (closing) stack.pop();
    else if (!selfClosing && !tag.startsWith("?") && !tag.startsWith("!")) stack.push(tag);
  }
  return factors;
}
const ONE_BY_NAME = /serviceable|-ok$|enabled$|available$/;
// ...but not a factor that is a position or a failure: at 1 the 737's
// /engines/engine[n]/reverser-pos-norm deploys its reversers. No rule is right
// for every model; this is triage, and a real import maps each one by hand.
const ZERO_BY_NAME = /revers|cutoff|brake|spoiler|fail|damage|fire|door|open|canopy|hook|chute|lock/;

/** Everything a model mentions that looks like a property, split by whether it is rooted. */
function referencedProperties(source) {
  const external = new Set();
  const referenced = new Set();
  const ones = new Set();
  for (const [runtimePath, contents] of source.files) {
    // Shared engine and systems files are only scanned when this model uses them.
    if (!runtimePath.startsWith("aircraft/")) continue;
    for (const match of contents.matchAll(ABSOLUTE_PROPERTY)) external.add(match[1]);
    const uncommented = contents.replace(/<!--[\s\S]*?-->/g, "");
    for (const [, text, attribute] of uncommented.matchAll(TEXT)) {
      for (const match of (text ?? attribute).matchAll(RELATIVE_PROPERTY)) referenced.add(match[1]);
    }
    for (const match of uncommented.matchAll(PROPERTY_ELEMENT)) referenced.add(match[1]);
    for (const name of multiplicativeProperties(uncommented)) if (!ZERO_BY_NAME.test(name)) ones.add(name);
  }
  for (const name of [...external, ...referenced]) if (ONE_BY_NAME.test(name)) ones.add(name);
  return { external, referenced, ones };
}

/** A fresh SDK with the model loaded and FlightGear's missing properties stood in for. */
async function boot(source, properties, logs) {
  const sdk = await JSBSimSdk.create({
    moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl, persistence: { enabled: false }, log: { console: false },
  });
  sdk.on("log", entry => { if (logs.length < 4000) logs.push(entry.message); });
  for (const [runtimePath, contents] of source.files) sdk.writeDataFile(runtimePath, contents);
  sdk.configurePaths({
    rootDir: "/runtime", aircraftPath: "aircraft", enginePath: source.enginePath, systemsPath: source.systemsPath,
  });
  // Conditions check their properties exist while the model loads, so rooted
  // paths are created first. Not all of them survive the load, so every name
  // the loaded model lacks is created again afterwards.
  const standIn = name => (properties.ones.has(name) ? 1 : 0);
  for (const property of properties.external) {
    try { sdk.setPropertyValue(property, standIn(property)); } catch { /* not a property path after all */ }
  }
  try {
    sdk.loadModelOrThrow(source.aero);
  } catch (error) {
    release(sdk);
    throw error;
  }
  sdk.setDt(DT);
  const catalog = new Set(sdk.getPropertyCatalog().map(line => canonical(line.replace(/ \([RW]+\)$/, ""))));
  let created = 0;
  for (const name of [...properties.external, ...properties.referenced]) {
    if (catalog.has(canonical(name)) || name.startsWith("ic/")) continue;
    try { sdk.setPropertyValue(name, standIn(name)); created += 1; } catch { /* not a property path after all */ }
  }
  let engines = 0;
  for (const line of catalog) {
    const match = /^propulsion\/engine(?:\[(\d+)\])?\//.exec(line);
    if (match) engines = Math.max(engines, Number(match[1] ?? 0) + 1);
  }
  const set = (property, value) => { try { sdk.setPropertyValue(property, value); } catch { /* absent on this model */ } };
  const controls = (throttle, gearDown) => {
    for (let n = 0; n < Math.max(engines, 1); n += 1) {
      set(`fcs/throttle-cmd-norm[${n}]`, throttle);
      set(`fcs/mixture-cmd-norm[${n}]`, 1);
      set(`/controls/engines/engine[${n}]/throttle`, throttle);
      set(`/controls/engines/engine[${n}]/mixture`, 1);
      set(`/controls/engines/engine[${n}]/magnetos`, 3);
      set(`/controls/engines/engine[${n}]/cutoff`, 0);
      set(`/controls/engines/engine[${n}]/condition`, 1);
      set(`/controls/engines/engine[${n}]/propeller-pitch`, 1);
    }
    // Fuel systems are often Nasal: a FlightGear script moves fuel into a
    // collector tank the engine feeds from. Refuelling every tank and freezing
    // consumption takes fuel plumbing out of this test entirely.
    set("propulsion/refuel", 1);
    set("propulsion/fuel_freeze", 1);
    set("propulsion/magneto_cmd", 3);
    set("/controls/electric/battery-switch", 1);
    set("gear/gear-cmd-norm", gearDown ? 1 : 0);
    set("gear/gear-pos-norm", gearDown ? 1 : 0);
    set("/controls/gear/gear-down", gearDown ? 1 : 0);
    set("fcs/flap-cmd-norm", 0);
    set("/controls/flight/flaps", 0);
  };
  const thrust = () => {
    let total = 0;
    for (let n = 0; n < engines; n += 1) {
      try { total += Math.max(0, sdk.getPropertyValue(`propulsion/engine[${n}]/thrust-lbs`)); } catch { /* none */ }
    }
    return total;
  };
  const state = () => ({
    altFt: sdk.getPropertyValue("position/h-sl-ft"),
    aglFt: sdk.getPropertyValue("position/h-agl-ft"),
    kts: sdk.getPropertyValue("velocities/vc-kts"),
    phi: sdk.getPropertyValue("attitude/phi-deg"),
    theta: sdk.getPropertyValue("attitude/theta-deg"),
  });
  // Where the model takes the stick from FlightGear's tree rather than fcs/,
  // under the plain name or a variant of it: the 737 reads elevator-sum.
  const stick = axis => [`fcs/${axis}-cmd-norm`, ...[...properties.external]
    .filter(name => new RegExp(`^/controls/flight/${axis}(-sum)?(\\[\\d+\\])?$`).test(name)), `/controls/flight/${axis}`];
  const axes = {
    elevator: [...new Set(stick("elevator"))], aileron: [...new Set(stick("aileron"))],
    pitchTrim: ["fcs/pitch-trim-cmd-norm", "/controls/flight/elevator-trim"],
  };
  return { sdk, created, engines, controls, thrust, state, axes, gearUnits: Math.round(sdk.getPropertyValue("gear/num-units") || 0) };
}

/** Level at 5,000 ft, engines running at 70%, gear and flaps up. */
function airStart(sim, kts) {
  const { sdk } = sim;
  sdk.setPropertyValue("ic/h-sl-ft", 5000);
  sdk.setPropertyValue("ic/terrain-elevation-ft", 0);
  sdk.setPropertyValue("ic/vc-kts", kts);
  sdk.setPropertyValue("ic/gamma-deg", 0);
  sim.controls(0.7, false);
  if (!sdk.runIc()) throw new Error("RunIC returned false");
  try { sdk.setPropertyValue("propulsion/set-running", -1); } catch { /* no engines */ }
  sim.controls(0.7, false);
}

/**
 * Thirty seconds from wherever the model is now, under a stand-in pilot that
 * holds the wings level and the starting altitude with elevator and aileron.
 *
 * 0sfs never flies an aircraft hands off: a player is on the stick and 0sfs's
 * auto-trim (src/flight/input/autoTrim.ts) takes out steady pitch moment. A
 * FlightGear airliner with its stabiliser at zero settles at about -5 degrees
 * of attack and noses over, which says nothing about whether it can be flown.
 * The question here is whether it can, so the same simple, fixed-gain loops
 * fly every aircraft, and the slow part of the pitch loop is put on trim as
 * well as elevator. Signs follow JSBSim and 0sfs: positive elevator and trim
 * pitch the nose down, positive aileron rolls right.
 */
function fly(sim, trimmed, startKts) {
  const { sdk } = sim;
  const read = property => sdk.getPropertyValue(property);
  const command = (property, value) => { try { sdk.setPropertyValue(property, value); } catch { /* absent */ } };
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const start = sim.state();
  let integral = 0;
  let maxRoll = 0;
  let maxAltError = 0;
  let thrustSeen = 0;
  let failed = null;
  const began = performance.now();
  for (let step = 0; step < 30 * 120; step += 1) {
    const theta = read("attitude/theta-rad");
    const phi = read("attitude/phi-rad");
    const altError = start.altFt - read("position/h-sl-ft");
    const target = clamp(0.05 + 0.0001 * altError - 0.004 * read("velocities/h-dot-fps"), -0.17, 0.26);
    integral = clamp(integral + (target - theta) * DT, -0.5, 0.5);
    const elevator = clamp(-(2 * (target - theta) + 0.5 * integral) + 0.6 * read("velocities/q-rad_sec"), -1, 1);
    const aileron = clamp(-1.5 * phi - 0.4 * read("velocities/p-rad_sec"), -1, 1);
    for (const property of sim.axes.elevator) command(property, elevator);
    // What 0sfs's auto-trim does for a player: carry the steady part on trim.
    // An airliner's stabiliser is its pitch trim, and elevator alone cannot
    // hold one level.
    for (const property of sim.axes.pitchTrim) command(property, clamp(-integral, -1, 1));
    for (const property of sim.axes.aileron) command(property, aileron);
    try {
      if (!sdk.run()) { failed = "run() returned false"; break; }
    } catch (error) { failed = describe(error); break; }
    if (step % 12 === 0) {
      const now = sim.state();
      if (!finite(now.altFt) || !finite(now.theta)) { failed = "non-finite state"; break; }
      // The first five seconds settle an untrimmed start; judge the rest.
      if (step >= 5 * 120) {
        maxRoll = Math.max(maxRoll, Math.abs(now.phi));
        maxAltError = Math.max(maxAltError, Math.abs(now.altFt - start.altFt));
      }
      thrustSeen = Math.max(thrustSeen, sim.thrust());
    }
  }
  const wallMs = performance.now() - began;
  const end = sim.state();
  return {
    ok: !failed && maxAltError < 1000 && maxRoll < 30 && Math.abs(end.kts - start.kts) < 0.5 * start.kts,
    trimmed, startKts,
    error: failed ?? undefined,
    thrustLbs: Math.round(thrustSeen),
    maxAltErrorFt: Math.round(maxAltError), speedChangeKts: Math.round(end.kts - start.kts),
    maxRollDeg: +maxRoll.toFixed(1),
    msPerSimSecond: +(wallMs / 30).toFixed(2),
  };
}

async function smoke(source) {
  const result = { variant: source.variant, aero: source.aero, load: "not attempted" };
  const logs = [];
  const properties = referencedProperties(source);

  // On the ground: let JSBSim find the equilibrium on the gear, then hold it.
  let sim;
  try {
    sim = await boot(source, properties, logs);
    result.load = "ok";
  } catch (error) {
    result.load = "failed";
    // The native exception's text is not reachable from this build (it
    // exports no getExceptionMessage), so keep the log lines leading up to it.
    result.loadError = (error?.logs ?? []).slice(-3).map(entry => entry.message.trim()).join(" | ") || describe(error);
    return result;
  }
  Object.assign(result, { createdProperties: sim.created, engines: sim.engines, gearUnits: sim.gearUnits });
  try {
    const { sdk } = sim;
    sdk.setPropertyValue("ic/lat-geod-deg", 44.88);
    sdk.setPropertyValue("ic/long-gc-deg", -93.22);
    sdk.setPropertyValue("ic/terrain-elevation-ft", 0);
    sdk.setPropertyValue("ic/h-agl-ft", 10);
    sdk.setPropertyValue("ic/vc-kts", 0);
    sim.controls(0, true);
    if (!sdk.runIc()) throw new Error("RunIC returned false");
    try { sdk.doTrim(2); result.groundTrim = "ok"; } catch { result.groundTrim = "failed"; }
    for (let step = 0; step < 5 * 120; step += 1) if (!sdk.run()) throw new Error("run() returned false");
    const ground = sim.state();
    const onWheels = Array.from({ length: sim.gearUnits }, (_, i) => sdk.getPropertyValue(`gear/unit[${i}]/WOW`)).filter(Boolean).length;
    result.ground = {
      ok: finite(ground.aglFt) && Math.abs(ground.kts) < 5 && onWheels > 0 && ground.aglFt < 40,
      cgAglM: +(ground.aglFt * 0.3048).toFixed(3), pitchDeg: +ground.theta.toFixed(2), rollDeg: +ground.phi.toFixed(2),
      wheelsDown: onWheels,
    };
  } catch (error) {
    result.ground = { ok: false, error: describe(error) };
  } finally {
    release(sim.sdk);
  }

  // In the air: find a speed it will trim at. JSBSim's full trim is stricter
  // than anything 0sfs needs - 0sfs flies from an initial state and never
  // trims - so a model that will not trim is still flown, from an untrimmed
  // start at a middling speed, and the result says which it was.
  result.trim = null;
  sim = null;
  for (const kts of TRIM_SPEEDS_KTS) {
    const attempt = await boot(source, properties, logs);
    try {
      airStart(attempt, kts);
      attempt.sdk.doTrim(1);
      result.trim = { kts };
      sim = attempt;
      break;
    } catch {
      release(attempt.sdk);
    }
  }
  const trimmed = Boolean(sim);
  try {
    if (trimmed) result.flight = fly(sim, true, result.trim.kts);
    if (!result.flight?.ok) {
      // Untrimmed, the start speed decides the outcome - 120 kt is below a
      // 787's stall and slow for a fighter - so try a few and keep the first
      // that flies, or the last attempt if none does.
      for (const kts of UNTRIMMED_START_KTS) {
        release(sim?.sdk);
        sim = await boot(source, properties, logs);
        airStart(sim, kts);
        result.flight = fly(sim, false, kts);
        if (result.flight.ok) break;
      }
    }
  } catch (error) {
    result.flight = { ok: false, trimmed, error: describe(error) };
  } finally {
    release(sim?.sdk);
    result.logTail = logs.filter(line => /error|warn|not found|does not exist|fail/i.test(line)).slice(0, 8);
  }
  return result;
}

const root = path.resolve(fdmRoot ?? jsbsimRoot);
const variants = fdmRoot
  ? (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name)
  : (await readdir(path.join(root, "aircraft"), { withFileTypes: true }))
    .filter(entry => entry.isDirectory()).map(entry => entry.name)
    .filter(name => { try { return statSync(path.join(root, "aircraft", name, `${name}.xml`)).isFile(); } catch { return false; } });
const shared = await sharedSystemFiles();
const results = [];
for (const variant of variants.filter(name => !only || only.includes(name)).sort()) {
  let result;
  try {
    const source = fdmRoot ? await extractedSource(path.join(root, variant)) : await jsbsimSource(root, variant);
    source.files.push(...shared);
    result = await smoke(source);
  } catch (error) {
    result = { variant, load: "harness error", loadError: String(error?.message ?? error).slice(0, 300) };
  }
  results.push(result);
  const verdict = result.load !== "ok" ? `load ${result.load}`
    : `ground ${result.ground?.ok ? "ok" : "no"}, trim ${result.trim ? result.trim.kts + " kt" : "no"}, `
      + `flight ${result.flight?.ok ? "ok" : "no"}, thrust ${result.flight?.thrustLbs ?? "-"} lbf`;
  console.log(`${variant.padEnd(28)} ${verdict}`);
}
await writeFile(path.join(output, "smoke.json"), JSON.stringify({ source: root, dt: DT, results }, null, 1));
const count = predicate => results.filter(predicate).length;
console.log(`\n${results.length} variants: ${count(r => r.load === "ok")} load, ${count(r => r.ground?.ok)} stand on their gear, `
  + `${count(r => r.trim)} trim, ${count(r => r.flight?.ok)} fly 30 s level, `
  + `${count(r => r.flight?.thrustLbs > 0)} make thrust -> ${output}`);
