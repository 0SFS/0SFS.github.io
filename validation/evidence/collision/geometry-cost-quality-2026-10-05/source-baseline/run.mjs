/**
 * Reproducible aircraft collision cost/quality experiment. No server or game
 * changes. Tools are isolated in build/tools/collision; outputs are dated.
 * --prepare-only extracts fixtures without launching a browser.
 * --input=<fixtures.json> reuses a prepared fixture (including optional CoACD).
 * --node selects Node timing; default is isolated headless Chromium CPU/WASM.
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { build } from "vite";
import { newOutputDirectory } from "../../outputDirectory.mjs";
import { BODY_COLLISION_PROBES, SF50_BODY_COLLISION_PROBES } from "../../../src/flight/physics/collisionGeometry.ts";
import { readAircraftGlb } from "./aircraftGeometry.mjs";
import { generateProxies } from "./proxies.mjs";
import { initialize, makeScenarios, prepareContactWindows, runTiming } from "./queries.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const execute = promisify(execFile);
async function machineState() {
  const cpus = os.cpus();
  const state = { timeMs: Date.now(), cpuTotalMs: cpus.map(c => Object.values(c.times).reduce((a, b) => a + b, 0)),
    cpuIdleMs: cpus.map(c => c.times.idle), memory: null, secondsSinceInput: null };
  if (process.platform === "darwin") {
    const results = await Promise.allSettled([
      execute("sysctl", ["-n", "kern.memorystatus_vm_pressure_level"]), execute("vm_stat"),
      execute("ioreg", ["-c", "IOHIDSystem", "-d", "4"], { maxBuffer: 16 * 1024 * 1024 }),
    ]);
    if (results[0].status === "fulfilled" && results[1].status === "fulfilled") {
      const stats = results[1].value.stdout;
      const count = name => Number(new RegExp(`^${name}:\\s+(\\d+)`, "m").exec(stats)?.[1]);
      state.memory = { pressure: Number(results[0].value.stdout), pageBytes: Number(/page size of (\d+) bytes/.exec(stats)?.[1]),
        compressions: count("Compressions"), swapouts: count("Swapouts"), swapins: count("Swapins") };
    }
    if (results[2].status === "fulfilled") {
      const idle = /"HIDIdleTime"\s*=\s*(\d+)/.exec(results[2].value.stdout);
      state.secondsSinceInput = idle ? Number(idle[1]) / 1e9 : null;
    }
  }
  return state;
}
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const at = arg.indexOf("="); return at < 0 ? [arg.replace(/^--/, ""), true]
    : [arg.slice(0, at).replace(/^--/, ""), arg.slice(at + 1)];
}));
const output = args.output ? path.resolve(String(args.output)) : newOutputDirectory("validation", "collision", "cost-quality");
mkdirSync(output, { recursive: true });
const config = { budgets: [1, 4, 8, 16, 32, 64], pointBudgets: [6, 12, 24, 48, 96],
  directionCount: Number(args.directions ?? 2048), cases: Number(args.cases ?? 128),
  rounds: Number(args.rounds ?? 11), minimumBlockMs: Number(args["block-ms"] ?? 20),
  seed: 20261005, toleranceMeters: 0.002 };
if (![config.directionCount, config.cases, config.rounds, config.minimumBlockMs].every(v => Number.isFinite(v) && v > 0)) {
  throw new Error("Benchmark counts and timing block length must be positive");
}
function hash(file) { return createHash("sha256").update(readFileSync(file)).digest("hex"); }
function write(file, value) { writeFileSync(path.join(output, file), `${JSON.stringify(value, null, 2)}\n`); }

function prepare() {
  const profiles = readFileSync(path.join(root, "src/flight/jsbsim/fdmProfiles.ts"), "utf8");
  const assets = [
    { id: "c172", file: "public/aircraft/cessna-172/Cessna_172_LOD3.glb", probes: BODY_COLLISION_PROBES,
      stance: Number(/const C172_STATI =\s*\{\s*staticMeters:\s*([\d.]+)/.exec(profiles)?.[1]) },
    { id: "sf50", file: "public/aircraft/cirrus-vision-jet/Cirrus_Vision_Jet_LOD3.glb", probes: SF50_BODY_COLLISION_PROBES,
      stance: Number(/const SF50_STATI =\s*\{\s*staticMeters:\s*([\d.]+)/.exec(profiles)?.[1]) },
  ];
  return assets.map(asset => {
    if (!Number.isFinite(asset.stance)) throw new Error("Could not read current aircraft visual stance");
    const original = readAircraftGlb(path.join(root, asset.file));
    const center = original.metadata.bounds.min.map((v, i) => (v + original.metadata.bounds.max[i]) / 2);
    const mesh = { id: asset.id,
      vertices: original.vertices.map((v, i) => v - center[i % 3]), indices: original.indices,
      metadata: { ...original.metadata, source: asset.file, recenteredByMeters: center,
        bounds: { min: original.metadata.bounds.min.map((v, i) => v - center[i]),
          max: original.metadata.bounds.max.map((v, i) => v - center[i]), size: original.metadata.bounds.size },
        pose: "GLB default rigid pose; gear included; control surfaces neutral; Propeller_Disc excluded" } };
    const generated = generateProxies(mesh, config);
    const legacy = { id: `legacy-${asset.probes.length}`, kind: "points", budget: asset.probes.length,
      points: asset.probes.map(p => [-p.left - center[0], p.up + asset.stance - center[1], -p.forward - center[2]]),
      metadata: { generationMs: 0, geometryBytes: asset.probes.length * 12,
        note: "Current runtime probes mapped through current static visual offset into mesh frame; no CG-change test" } };
    write(`${asset.id}-mesh.json`, mesh);
    console.log(`aircraft-collision: ${asset.id} extracted ${mesh.indices.length / 3} triangles, ${generated.candidates.length} generated candidates`);
    return { mesh, candidates: [legacy, ...generated.candidates], generation: generated.metadata,
      scenarios: makeScenarios(mesh, { count: config.cases, seed: config.seed }) };
  });
}

const fixtures = args.input ? JSON.parse(readFileSync(path.resolve(String(args.input)), "utf8")) : prepare();
await initialize();
for (const fixture of fixtures) {
  if (args["refresh-scenarios"]) {
    fixture.scenarios = makeScenarios(fixture.mesh, { count: config.cases, seed: config.seed });
    fixture.scenarioGeneration = { casesPerWorkload: config.cases, seed: config.seed, surfaceSampling: "area weighted", fixedPose: true };
  }
  if (fixture.scenarios.some(s => !["ground-dense", "far-miss"].includes(s.id) && !s.id.endsWith("-outside")
    && s.cases.some(c => c.longApproachDistanceMeters === undefined))) prepareContactWindows(fixture.mesh, fixture.scenarios);
  if (args["coacd-directory"]) {
    const dir = path.resolve(String(args["coacd-directory"]));
    const names = [`${fixture.mesh.id}-coacd.json`, `${fixture.mesh.id}-coacd-compact.json`];
    fixture.coacd = [];
    for (const name of names) {
      const file = path.join(dir, name);
      if (!existsSync(file)) continue;
      const artifact = JSON.parse(readFileSync(file, "utf8"));
      if (artifact.metadata.input.sourceAssetSha256 !== fixture.mesh.metadata.sha256) throw new Error(`CoACD source hash mismatch: ${name}`);
      fixture.candidates.push(...artifact.candidates);
      fixture.coacd.push({ source: name, sha256: hash(file), metadata: artifact.metadata });
    }
  }
  for (const candidate of fixture.candidates) {
    candidate.metadata.packedParameterBytes = candidate.kind === "points" ? candidate.points.length * 12
      : candidate.shapes.reduce((sum, shape) => sum + 28 + (shape.type === "hull" ?
        (shape.vertices.flat().length + (shape.indices?.length ?? 0)) * 4 : shape.type === "box" ? 12 : shape.type === "capsule" ? 8 : 4), 0);
  }
}
write("fixtures.json", fixtures);
const sourceFiles = ["aircraftGeometry.mjs", "proxies.mjs", "queries.mjs", "run.mjs"];
const provenance = {
  date: "2026-10-05", config, execution: args.node ? "Node CPU/WASM" : "headless Chromium CPU/WASM",
  nodeVersion: process.version, platform: process.platform, architecture: process.arch,
  cpuModel: os.cpus()[0]?.model, logicalCores: os.cpus().length, totalMemoryBytes: os.totalmem(),
  sourceHashes: Object.fromEntries(sourceFiles.map(name => [name, hash(new URL(name, import.meta.url))])),
  fixtureGeneration: fixtures.map(f => ({ aircraft: f.mesh.id, proxies: f.generation,
    scenarios: f.scenarioGeneration ?? { casesPerWorkload: f.scenarios[0].cases.length, seed: "inherited prepared fixture" } })),
  dependencies: JSON.parse(readFileSync(path.join(root, "build/tools/collision/package.json"), "utf8")).dependencies,
  limits: ["Two real aircraft; fixed GLB pose and translation-only casts", "Static local chunks; no streaming, geodetic conversion, rendering or JSBSim response",
    "Awake hot-cache block throughput; p95 is a block average, not frame latency", "Source meshes have open boundaries; first surface contact is the reference, not solid containment",
    "No GPU execution or mobile-device inference"],
};
write("provenance.json", provenance);
console.log(`aircraft-collision: output ${path.relative(root, output)}`);
if (args["prepare-only"]) process.exit(0);

let results;
if (args.node) {
  provenance.rapierVersion = await initialize();
  results = [];
  for (const fixture of fixtures) results.push({ aircraft: fixture.mesh.id,
    ...await runTiming(fixture.mesh, fixture.candidates, fixture.scenarios, { ...config, machineState }) });
} else {
  // Keep the profile, Chromium scratch and bundle inside this repository.
  const temporary = path.join(output, "browser-tmp"); mkdirSync(temporary, { recursive: true });
  process.env.TMPDIR = temporary;
  const localPlaywright = path.join(root, "build/tools/playwright/node_modules/playwright/index.mjs");
  const siblingPlaywright = path.join(root, "../foss-earth/build/tools/playwright/node_modules/playwright/index.mjs");
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ?? (existsSync(localPlaywright) ? localPlaywright : siblingPlaywright);
  if (!existsSync(playwrightPath)) throw new Error("Install Playwright in build/tools/playwright, or set PLAYWRIGHT_MODULE to its index.mjs");
  const { chromium } = await import(pathToFileURL(playwrightPath).href);
  const bundle = path.join(output, "bundle");
  const built = await build({ configFile: false, logLevel: "warn", build: { write: false, target: "esnext",
    lib: { entry: path.join(root, "scripts/validation/collision/queries.mjs"), name: "AircraftCollision", formats: ["iife"] } } });
  const code = (Array.isArray(built) ? built[0] : built).output.find(item => item.type === "chunk").code;
  writeFileSync(`${bundle}.js`, code);
  writeFileSync(path.join(output, "index.html"), `<meta charset="utf-8"><title>Aircraft collision CPU check</title><script>${code.replace(/<\/script/gi, "<\\/script")}</script>`);
  const executablePath = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const browser = await chromium.launch({ headless: true, executablePath, args: ["--disable-background-timer-throttling"] });
  try {
    provenance.browserVersion = browser.version();
    const page = await browser.newPage();
    await page.exposeFunction("collisionMachineState", machineState);
    page.on("console", message => { if (message.text().startsWith("aircraft-collision:")) console.log(message.text()); });
    page.on("pageerror", error => console.error(error.message));
    await page.goto(pathToFileURL(path.join(output, "index.html")).href);
    provenance.browser = await page.evaluate(() => ({ userAgent: navigator.userAgent,
      timerResolutionMs: (() => { const t = performance.now(); let next; do { next = performance.now(); } while (next === t); return next - t; })() }));
    results = await page.evaluate(async ({ fixtures, config }) => {
      const api = window.AircraftCollision;
      const rapierVersion = await api.initialize();
      const reports = [];
      for (const fixture of fixtures) reports.push({ aircraft: fixture.mesh.id,
        ...await api.runTiming(fixture.mesh, fixture.candidates, fixture.scenarios,
          { ...config, machineState: () => window.collisionMachineState() }) });
      return { rapierVersion, reports };
    }, { fixtures, config });
    provenance.rapierVersion = results.rapierVersion; results = results.reports;
  } finally { await browser.close(); }
}
const report = { provenance, aircraft: fixtures.map(f => ({ id: f.mesh.id, mesh: f.mesh.metadata,
  candidates: f.candidates.map(({ shapes, points, ...c }) => c), generation: f.generation, coacd: f.coacd })), results };
write("results.json", report);
console.table(results.flatMap(result => result.rows.filter(row => ["exact-triangles", "legacy-5", "legacy-6", "points-24", "hulls-16", "obb-16", "capsules-16"].includes(row.candidate))
  .map(row => ({ aircraft: result.aircraft, workload: row.workload, candidate: row.candidate,
    microseconds: row.timing.medianMs === null ? "unqualified" : (row.timing.medianMs * 1000).toFixed(2), missed: row.quality.missedHits,
    extra: row.quality.extraHits, early: row.quality.earlyHits }))));
console.log(`aircraft-collision: retained raw results ${path.relative(root, path.join(output, "results.json"))}`);
