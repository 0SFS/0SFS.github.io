// Headless browser check that the shipped worklet and WASM load and render in a
// real AudioWorkletGlobalScope. Same approach as benchmarks/wheels/run-audio-headless.mjs:
// a Vite library bundle loaded from a file URL into headless Chromium. No server.
//
//   node benchmarks/audio/run-worklet-headless.mjs [outDir]
//
// Writes to a new build/benchmarks/audio/worklet-check/<date_time>/ unless outDir
// is given. Playwright is found as benchmarks/playwright.mjs describes.
//
// Result kind "headless-worklet-check": proves the load path only. OfflineAudioContext
// has no output route, so it says nothing about dropouts or real-time performance.
import { build } from "vite";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { newOutputDirectory } from "../../scripts/outputDirectory.mjs";
import { importPlaywright } from "../playwright.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const { chromium } = await importPlaywright();

const outputDirectory = process.argv[2] ? path.resolve(process.argv[2]) : newOutputDirectory("benchmarks", "audio", "worklet-check");
mkdirSync(outputDirectory, { recursive: true });
const wasm = readFileSync(path.join(root, "src/flight/audio/dsp/audio-dsp.wasm"));
const workletSource = readFileSync(path.join(root, "src/flight/audio/worklet/dspProcessor.js"), "utf8");
const provenance = JSON.parse(readFileSync(path.join(root, "src/flight/audio/dsp/audio-dsp.provenance.json"), "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (sha256(wasm) !== provenance.wasm?.sha256) throw new Error("audio-dsp.wasm does not match its provenance record");

const result = await build({
  root, configFile: false, publicDir: false, logLevel: "warn",
  build: {
    write: false, minify: false,
    lib: { entry: fileURLToPath(new URL("workletHeadless.entry.ts", import.meta.url)), formats: ["iife"], name: "AudioWorkletCheck" },
  },
});
const output = (Array.isArray(result) ? result[0] : result).output;
writeFileSync(path.join(outputDirectory, "bundle.js"), output.find((item) => item.type === "chunk").code);
writeFileSync(path.join(outputDirectory, "index.html"), "<!doctype html><meta charset=\"utf-8\"><title>Audio worklet check</title><body></body>");

const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath = process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined);
const browser = await chromium.launch({ headless: true, executablePath });
const cases = [
  { name: "off-is-silent", tier: 0, tireWatts: 15_000, sampleRate: 48_000 },
  { name: "low-tire-cue-48k", tier: 1, tireWatts: 15_000, sampleRate: 48_000 },
  { name: "low-tire-cue-44k1", tier: 1, tireWatts: 15_000, sampleRate: 44_100 },
];
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(outputDirectory, "index.html")).href);
  await page.addScriptTag({ path: path.join(outputDirectory, "bundle.js") });
  const runs = [];
  for (const check of cases) {
    const rendered = await page.evaluate((input) => window.runWorkletCheck(input), {
      wasmBase64: wasm.toString("base64"), workletSource, seconds: 1, ...check,
    });
    runs.push({ ...check, ...rendered });
  }
  if (errors.length) throw new Error(errors.join("\n"));
  const failures = runs.filter((run) => run.nonFinite > 0 || run.messages.includes("failed") || run.messages.includes("processorerror")
    || run.peak > 0.8912509381337456 + 1e-6 || (run.tier === 0 ? run.peak !== 0 : run.secondHalfRms <= 1e-5)
    || !run.messages.includes("ready"));
  const report = {
    schema: "osfs-audio-bench/1",
    kind: "headless-worklet-check",
    disclaimer: "Load-path check in headless Chromium with OfflineAudioContext. No output route, no real-time timing.",
    createdUtc: new Date().toISOString(),
    environment: { platform: process.platform, browserBuild: browser.version() },
    inputs: { sweepSha256: "n/a (fixed tire-cue input)", seed: 0x53463530, bridge: "none (processorOptions only)" },
    build: { wasmSha256: provenance.wasm.sha256, workletSha256: sha256(workletSource) },
    dropouts: { count: null, detector: "none: offline render has no output route" },
    runs: runs.map((run) => ({
      tier: ["off", "low", "med", "high"][run.tier], sampleRate: run.sampleRate, pass: "sweep", shed: 0,
      name: run.name, messages: run.messages,
      output: { peak: run.peak, nonFiniteSamples: run.nonFinite, secondHalfRms: run.secondHalfRms },
      timing: { provenance: "not measured", aggregate: { samples: 0, p95Ms: null, maxMs: null, overQuantumCount: 0 } },
    })),
  };
  writeFileSync(path.join(outputDirectory, "results.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ outputDirectory, browser: browser.version(), runs: report.runs }, null, 2));
  if (failures.length) throw new Error(`Worklet check failed: ${failures.map((run) => run.name).join(", ")}`);
} finally {
  await browser.close();
}
