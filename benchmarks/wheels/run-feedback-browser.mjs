// Headless-Chromium measurement of the browser-only wheel feedback costs:
//  - tire audio: OfflineAudioContext render time (empty / silent graph / touchdown
//    trace) and main-thread AudioParam scheduling per frame;
//  - rendering: Babylon frame time with the wheel debug overlay off vs on.
// Opens no visible browser and starts no server: Playwright request
// interception serves the bundle with COOP/COEP headers so timers are
// cross-origin-isolated. The WebGL renderer string is recorded so a software
// fallback (SwiftShader/llvmpipe) is labelled rather than reported as GPU.
//
//   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node benchmarks/wheels/run-feedback-browser.mjs [out.json]
import { build } from "vite";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const moduleName = process.env.PLAYWRIGHT_MODULE;
let chromium;
try {
  ({ chromium } = await import(moduleName ? pathToFileURL(path.resolve(moduleName)).href : "playwright"));
} catch (error) {
  throw new Error("Install Playwright separately and set PLAYWRIGHT_MODULE to its index.mjs.", { cause: error });
}
const output = process.argv[2] ? path.resolve(process.argv[2])
  : fileURLToPath(new URL("../../../foss-earth/benchmarks/wheels/results-feedback-browser.json", import.meta.url));

const result = await build({
  root, configFile: false, publicDir: false, logLevel: "warn",
  build: { write: false, minify: true, lib: { entry: fileURLToPath(new URL("feedbackBrowser.entry.ts", import.meta.url)),
    formats: ["iife"], name: "FeedbackBrowser" } },
});
const bundle = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === "chunk").code;
const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath = process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined);
const browser = await chromium.launch({ headless: true, executablePath,
  args: ["--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-webgpu"] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const headers = { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" };
  await page.route("https://bench.invalid/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/bundle.js") return route.fulfill({ status: 200, contentType: "text/javascript", headers, body: bundle });
    return route.fulfill({ status: 200, contentType: "text/html", headers,
      body: '<!doctype html><meta charset="utf-8"><title>Wheel feedback benchmark</title><body><script src="/bundle.js"></script></body>' });
  });
  await page.goto("https://bench.invalid/index.html");
  const audio = await page.evaluate(options => window.measureTireAudio(options), { seconds: 10, sampleRate: 48_000, repeats: 7 });
  const render = await page.evaluate(options => window.measureWheelOverlay(options), { frames: 240, blocks: 6, batch: 20 });
  if (errors.length) throw new Error(errors.join("\n"));
  const software = /swiftshader|llvmpipe|software|basic render/i.test(`${render.renderer} ${render.vendor}`);
  const sha256 = file => createHash("sha256").update(readFileSync(path.join(root, file))).digest("hex");
  const report = {
    generatedAt: new Date().toISOString(),
    machine: { cpu: os.cpus()[0]?.model, platform: os.platform(), arch: os.arch(), node: process.version },
    browser: { name: "Chromium (Playwright, headless)", version: browser.version(), executablePath: executablePath ?? "playwright bundled" },
    gpu: { renderer: render.renderer, vendor: render.vendor, hardware: !software,
      note: software ? "SOFTWARE rasterizer: frame costs are not GPU measurements" : "Hardware GPU reported by WebGL (unmasked renderer)" },
    sourceSha256: Object.fromEntries(["src/flight/audio/createTireAudio.ts", "src/flight/diagnostics/createWheelSpinDebugOverlay.ts",
      "src/flight/physics/wheelSpin.ts"].map(file => [file, sha256(file)])),
    labels: {
      measured: "Headless Chromium on this machine: OfflineAudioContext render wall time per rendered second, batched main-thread AudioParam scheduling per 60 Hz frame, and Babylon scene.render() CPU submit time plus a forced gl.finish() (means over 20-frame batches; per-frame p50/p95 too when timers are cross-origin isolated) with the wheel overlay off/on in an isolated small scene.",
      inferred: "Real-time audio-thread headroom from offline render speed; in-game frame cost from an isolated scene.",
      unmeasured: "Real-time AudioContext on an audio device, the full globe/terrain/aircraft scene, GPU timer queries, Safari/Firefox, mobile devices, power.",
    },
    audio, render,
  };
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  const fmt = value => value === undefined || value === null ? "—" : Number(value).toFixed(3);
  console.table(Object.entries(audio.cases).map(([name, value]) => ({ audio: name,
    "render ms / rendered s p50": fmt(value.renderMsPerRenderedSecond.p50), "p95": fmt(value.renderMsPerRenderedSecond.p95),
    "update µs / frame p50": fmt(value.mainThreadUpdateMicrosecondsPerFrame?.p50) })));
  console.table(Object.entries(render.cases).map(([name, value]) => ({ render: name,
    "submit ms/frame p50": fmt(value.batchMeanCpuSubmitMs.p50), "submit p95": fmt(value.batchMeanCpuSubmitMs.p95),
    "+finish ms/frame p50": fmt(value.batchMeanSubmitPlusGlFinishMs.p50), "+finish p95": fmt(value.batchMeanSubmitPlusGlFinishMs.p95) })));
  console.log(JSON.stringify({ gpu: report.gpu, browser: report.browser.version, isolated: [audio.crossOriginIsolated, render.crossOriginIsolated] }));
  console.log("Results:", output);
} finally {
  await browser.close();
}
