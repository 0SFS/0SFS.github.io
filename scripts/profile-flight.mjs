#!/usr/bin/env node
/**
 * Where the flight's frame time goes, measured in the real app.
 *
 * Builds the app, serves it to headless Chrome through request interception
 * (no HTTP server), and flies it with the frame profiler on: once per
 * configuration, so the attitude indicator's WebGPU and Canvas 2D renderers,
 * and the globe's WebGPU and WebGL renderers, can be held against each other
 * on the same machine and GPU. Map and elevation tiles come from the network,
 * as they do for a pilot; everything of the app's own is served from the build.
 *
 * Each run waits for the flight to start, lets streaming settle, then measures
 * a fresh window of frames. It reports the profiler's summary: every
 * instrumented section's mean, p95 and share of the frame, and GPU time where
 * the device can time it. Chrome runs with WebGPU developer features on, so
 * GPU timestamps are not rounded to 0.1 ms.
 *
 * Usage: node scripts/profile-flight.mjs [--out=dir] [--seconds=10] [--settle=5] [--runs=a,b,c] [--no-build]
 *   runs: webgpu-webgpu, webgpu-canvas2d, webgl2-canvas2d (globe renderer, then attitude indicator renderer)
 * Output: build/profile-flight/<local time>/report.json and a screenshot per run.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { evaluate, openHeadlessChrome, waitForExpression } from "./headless-chrome.mjs";
import { newOutputDirectory } from "./outputDirectory.mjs";
import { resolvePagesDistFile } from "./pagesDistFile.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const arg = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const out = arg("out") ? path.resolve(arg("out")) : newOutputDirectory("profile-flight");
await mkdir(out, { recursive: true });
const seconds = Number(arg("seconds", "10"));
const settleSeconds = Number(arg("settle", "5"));
const RUNS = {
  "webgpu-webgpu": { globe: "webgpu", attitude: "webgpu" },
  "webgpu-canvas2d": { globe: "webgpu", attitude: "canvas2d" },
  "webgl2-canvas2d": { globe: "webgl2", attitude: "canvas2d" },
};
const runNames = arg("runs", Object.keys(RUNS).join(",")).split(",");
for (const name of runNames) if (!RUNS[name]) throw new Error(`Unknown run ${name}; choose from ${Object.keys(RUNS).join(", ")}`);

const dist = path.join(out, "dist");
if (!process.argv.includes("--no-build")) {
  console.log("Building the app…");
  await build({ root, logLevel: "warn", build: { outDir: dist, emptyOutDir: true } });
}

const mime = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm",
  ".css": "text/css", ".json": "application/json", ".xml": "text/xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".glb": "model/gltf-binary",
  ".webmanifest": "application/manifest+json",
};
const ORIGIN = "https://0sfs.test";
const chrome = await openHeadlessChrome(path.join(out, "chrome-profile"), undefined, ["--enable-webgpu-developer-features"]);
const sessions = new Map();
chrome.onEvent(message => {
  const current = sessions.get(message.sessionId);
  if (!current) return;
  if (message.method === "Runtime.exceptionThrown") {
    current.exceptions.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  }
  if (message.method !== "Fetch.requestPaused") return;
  void (async () => {
    const { requestId, request } = message.params;
    const url = new URL(request.url);
    if (url.origin !== ORIGIN) {
      // Map and elevation tiles: the network, as a pilot's browser would.
      current.external++;
      await chrome.send("Fetch.continueRequest", { requestId }, message.sessionId);
      return;
    }
    let file = null;
    try { file = await resolvePagesDistFile(dist, url.pathname); } catch { /* 404 below */ }
    if (!file) {
      await chrome.send("Fetch.fulfillRequest", { requestId, responseCode: 404, body: "" }, message.sessionId);
      return;
    }
    const bytes = await readFile(file);
    await chrome.send("Fetch.fulfillRequest", {
      requestId, responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: mime[path.extname(file)] ?? "application/octet-stream" }],
      body: bytes.toString("base64"),
    }, message.sessionId);
  })().catch(error => current.exceptions.push(`interception: ${error.message}`));
});

const SUMMARY = `(() => {
  const summary = window.osfsFrameProfiler.summary();
  const text = selector => document.querySelector(selector)?.textContent?.trim() ?? null;
  return JSON.stringify({
    summary,
    instrument: { ias: text('[data-metric="ias"]'), alt: text('[data-metric="alt"]'), hdg: text('[data-metric="hdg"]'), vs: text('[data-metric="vs"]') },
    attitudeCanvas: Boolean(document.querySelector('.flight-hud__attitude canvas')),
    gpuTimed: window.osfsFrameProfile?.gpuTimed() ?? null,
  });
})()`;

// Which GPU the numbers are from: a software adapter would make them meaningless.
const ADAPTER = `(async () => {
  const adapter = await navigator.gpu?.requestAdapter();
  const info = adapter?.info;
  return info ? { vendor: info.vendor, architecture: info.architecture, description: info.description, fallback: Boolean(info.isFallbackAdapter) } : null;
})()`;

const report = { generatedAt: new Date().toISOString(), seconds, settleSeconds, runs: {} };
try {
  for (const name of runNames) {
    const run = RUNS[name];
    console.log(`\n== ${name}: globe ${run.globe}, attitude indicator ${run.attitude}`);
    const current = { exceptions: [], external: 0 };
    const { targetId } = await chrome.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await chrome.send("Target.attachToTarget", { targetId, flatten: true });
    sessions.set(sessionId, current);
    await chrome.send("Runtime.enable", {}, sessionId);
    await chrome.send("Page.enable", {}, sessionId);
    await chrome.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] }, sessionId);
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false }, sessionId);
    await chrome.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try { localStorage.setItem("osfs.attitude-renderer", ${JSON.stringify(run.attitude)}); } catch {}`,
    }, sessionId);
    await chrome.send("Page.navigate", { url: `${ORIGIN}/fly/?flightPerf=1&renderer=${run.globe}` }, sessionId);
    try {
      await waitForExpression(chrome, sessionId, "Boolean(window.osfsFrameProfiler) && window.osfsFrameProfiler.summary().frames > 60", 180000);
    } catch (error) {
      const shot = await chrome.send("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(path.join(out, `${name}-stuck.png`), Buffer.from(shot.data, "base64"));
      throw new Error(`${name}: the flight never started (${error.message}). Exceptions: ${current.exceptions.join(" | ")}`);
    }
    await new Promise(resolve => setTimeout(resolve, settleSeconds * 1000));
    // A fresh window, after the spawn's streaming has settled.
    await evaluate(chrome, sessionId, "window.osfsFrameProfiler.enabled = false, window.osfsFrameProfiler.enabled = true");
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    const measured = JSON.parse(await evaluate(chrome, sessionId, SUMMARY));
    measured.gpuAdapter = await evaluate(chrome, sessionId, ADAPTER);
    const shot = await chrome.send("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(path.join(out, `${name}.png`), Buffer.from(shot.data, "base64"));
    report.runs[name] = { ...run, ...measured, externalRequests: current.external, exceptions: current.exceptions };

    const { summary } = measured;
    const fps = summary.frame.meanMs > 0 ? 1000 / summary.frame.meanMs : 0;
    console.log(`${summary.frames} frames, ${summary.frame.meanMs.toFixed(2)} ms apart (${fps.toFixed(0)} fps), p95 ${summary.frame.p95Ms.toFixed(2)} ms;`
      + ` measured ${summary.measuredMeanMs.toFixed(2)} ms. Aircraft: IAS ${measured.instrument.ias} kt, ALT ${measured.instrument.alt} ft, VS ${measured.instrument.vs} fpm.`
      + ` Globe GPU timing ${measured.gpuTimed ? "available" : "unavailable"}.`
      + ` GPU: ${measured.gpuAdapter ? `${measured.gpuAdapter.vendor} ${measured.gpuAdapter.architecture}${measured.gpuAdapter.fallback ? " (software fallback)" : ""}` : "no WebGPU adapter"}.`);
    for (const section of summary.sections) {
      const label = `${"  ".repeat(section.depth)}${section.name}`;
      console.log(`  ${label.padEnd(30)} mean ${section.meanMs.toFixed(3).padStart(7)} ms  p95 ${section.p95Ms.toFixed(3).padStart(7)} ms  ${(section.shareOfFrame * 100).toFixed(1).padStart(5)}% of frame`);
    }
    if (current.exceptions.length) console.log(`  exceptions: ${current.exceptions.join(" | ")}`);
    await chrome.send("Target.closeTarget", { targetId });
    sessions.delete(sessionId);
  }
} finally {
  await chrome.close();
}
await writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2));
console.log(`\nReport: ${path.relative(root, path.join(out, "report.json"))}`);
