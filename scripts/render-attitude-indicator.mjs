#!/usr/bin/env node
/**
 * Renders the attitude indicator at a spread of attitudes onto one contact
 * sheet, for a human to look at: level, banked, inverted, vertical, crabbing,
 * spinning, parked, and at the phone layout's size. Every case is drawn twice,
 * WebGPU on the left and the Canvas 2D fallback on the right, so the two
 * backends can be held against each other.
 *
 * Then it times both the way the app runs them: an attitude that changes
 * every frame, drawn in requestAnimationFrame onto visible canvases, many
 * instruments at once so the cost shows in the frame interval. Reading pixels
 * back is avoided: it pushes Chrome's canvas onto the CPU and times that
 * instead.
 *
 * Uses the real modules, bundled on the spot, in headless Chrome driven over
 * a pipe on the machine's own GPU: no server, no app, no JSBSim. The page is
 * loaded from a file, because WebGPU needs a secure context.
 *
 * Usage: node scripts/render-attitude-indicator.mjs [output-directory] [--copies=N]
 * Output: build/attitude-indicator/<local time>/attitude-indicator.png
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { evaluate, openHeadlessChrome, waitForExpression } from "./headless-chrome.mjs";
import { newOutputDirectory } from "./outputDirectory.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const positional = process.argv.slice(2).filter(arg => !arg.startsWith("--"));
const COPIES = Number(process.argv.find(arg => arg.startsWith("--copies="))?.slice(9) ?? 24);
const OUT = positional[0] ? path.resolve(positional[0]) : newOutputDirectory("attitude-indicator");
mkdirSync(OUT, { recursive: true });

const bundle = path.join(OUT, "attitudeRenderer.js");
const built = spawnSync("npx", ["rolldown", "src/flight/hud/attitudeRenderer.ts",
  "--format", "iife", "--name", "Attitude", "--file", bundle], { cwd: ROOT, encoding: "utf8" });
if (built.status !== 0) {
  console.error(built.stdout, built.stderr);
  throw new Error("Could not bundle the attitude indicator.");
}

const fps = knots => knots * 1.68781;
/** Ground velocity from a track, a ground speed and a flight path angle. */
const moving = (trackDeg, knots, pathDeg) => {
  const speed = fps(knots);
  const level = Math.cos(pathDeg * Math.PI / 180) * speed;
  return {
    northVelocityFps: Math.cos(trackDeg * Math.PI / 180) * level,
    eastVelocityFps: Math.sin(trackDeg * Math.PI / 180) * level,
    verticalSpeedFps: Math.sin(pathDeg * Math.PI / 180) * speed,
  };
};
const CASES = [
  { title: "Level, north", roll: 0, pitch: 0, heading: 0, ...moving(0, 120, 0) },
  { title: "Climb 10° nose, 6° path", roll: 0, pitch: 10, heading: 45, ...moving(45, 110, 6) },
  { title: "Bank 30° right, stick held", roll: 30, pitch: 4, heading: 90, ...moving(88, 120, 0), stick: { x: 0.4, y: -0.2, active: true } },
  { title: "Bank 60° left", roll: -60, pitch: 6, heading: 200, ...moving(203, 130, -1) },
  { title: "Crab 12° into wind", roll: 0, pitch: 3, heading: 348, ...moving(0, 100, 0) },
  { title: "Dive 40°", roll: 0, pitch: -40, heading: 330, ...moving(330, 200, -38) },
  { title: "Nose up 85°", roll: 0, pitch: 85, heading: 270, ...moving(270, 150, 80) },
  { title: "Inverted", roll: 180, pitch: -5, heading: 120, ...moving(120, 140, 5) },
  { title: "Spin: path far below", roll: 25, pitch: 15, heading: 60, ...moving(100, 50, -60) },
  { title: "Tail slide", roll: 0, pitch: 80, heading: 0, ...moving(0, 20, -85) },
  { title: "Parked", roll: 0, pitch: 2, heading: 135, northVelocityFps: 0, eastVelocityFps: 0, verticalSpeedFps: 0 },
  { title: "Phone size, bank 20°", roll: 20, pitch: 5, heading: 250, ...moving(250, 120, 2), size: 130 },
];

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Attitude indicator</title><style>
  body { margin: 0; padding: 16px; background: #1c2230; color: #e8edf5; font: 12px "SF Mono", Menlo, monospace; }
  main { display: flex; flex-wrap: wrap; gap: 14px 22px; width: ${3 * 470}px; }
  figure { margin: 0; }
  .pair { display: flex; gap: 8px; align-items: flex-start; }
  canvas { display: block; }
  figcaption { margin-top: 4px; opacity: 0.8; }
  #bench { position: fixed; left: 0; top: 0; opacity: 0.01; display: flex; flex-wrap: wrap; width: 1400px; }
</style></head><body><p>Left: WebGPU. Right: Canvas 2D fallback.</p><main></main><div id="bench"></div>
<script>${readFileSync(bundle, "utf8")}</script>
<script>
(async () => {
  const rad = Math.PI / 180;
  const adapter = await navigator.gpu?.requestAdapter();
  const device = adapter ? await adapter.requestDevice() : null;
  const main = document.querySelector("main");
  const canvasOf = (size, parent) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    canvas.style.width = canvas.style.height = size + "px";
    parent.append(canvas);
    return canvas;
  };
  const stateOf = item => ({
    rollRad: item.roll * rad, pitchRad: item.pitch * rad, headingRad: item.heading * rad,
    northVelocityFps: item.northVelocityFps, eastVelocityFps: item.eastVelocityFps, verticalSpeedFps: item.verticalSpeedFps,
  });
  const backends = [];
  for (const item of ${JSON.stringify(CASES)}) {
    const size = item.size ?? 220;
    const figure = document.createElement("figure");
    const pair = document.createElement("div");
    pair.className = "pair";
    const caption = document.createElement("figcaption");
    caption.textContent = item.title;
    figure.append(pair, caption);
    main.append(figure);
    for (const gpu of [true, false]) {
      const renderer = Attitude.createAttitudeRenderer(canvasOf(size, pair), { device: gpu ? device : null });
      backends.push(await renderer.ready);
      renderer.draw(stateOf(item), item.stick ?? { x: 0, y: 0, active: false });
    }
  }
  await device?.queue.onSubmittedWorkDone();
  window.backends = backends;
  window.rendered = true;

  // Timing, one backend at a time, on visible canvases.
  const bench = document.getElementById("bench");
  const time = (gpu, copies) => new Promise(resolve => {
    bench.replaceChildren();
    const renderers = [...Array(copies)].map(() => Attitude.createAttitudeRenderer(canvasOf(220, bench), { device: gpu ? device : null }));
    Promise.all(renderers.map(renderer => renderer.ready)).then(() => {
      const total = 180, warm = 20;
      let frame = 0, start = 0, script = 0;
      const tick = now => {
        if (frame === warm) start = now;
        const t0 = performance.now();
        renderers.forEach((renderer, index) => renderer.draw({
          rollRad: frame * 0.02 + index, pitchRad: Math.sin(frame * 0.01 + index) * 0.5, headingRad: frame * 0.005 + index,
          northVelocityFps: 200, eastVelocityFps: 20, verticalSpeedFps: 5,
        }, { x: 0, y: 0, active: false }));
        if (frame >= warm) script += performance.now() - t0;
        if (++frame < total + warm) { requestAnimationFrame(tick); return; }
        const frames = total;
        renderers.forEach(renderer => renderer.destroy());
        resolve({ frameMs: (performance.now() - start) / frames, scriptMs: script / frames / copies });
      };
      requestAnimationFrame(tick);
    });
  });
  const results = {};
  // Thrown away: the first run on a page pays for the JIT and first uploads.
  await time(Boolean(device), 1);
  if (device) results.webgpu = { one: await time(true, 1), many: await time(true, ${COPIES}) };
  results.canvas2d = { one: await time(false, 1), many: await time(false, ${COPIES}) };
  bench.replaceChildren();
  window.timing = results;
})().catch(error => { window.failure = String(error && error.stack || error); });
</script></body></html>`;

const page = path.join(OUT, "attitude-indicator.html");
writeFileSync(page, html);
const profile = mkdtempSync(path.join(OUT, "chrome-"));
const chrome = await openHeadlessChrome(profile);
try {
  const { targetId } = await chrome.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await chrome.send("Target.attachToTarget", { targetId, flatten: true });
  await chrome.send("Runtime.enable", {}, sessionId);
  await chrome.send("Page.enable", {}, sessionId);
  await chrome.send("Emulation.setDeviceMetricsOverride",
    { width: 3 * 470 + 32, height: 900, deviceScaleFactor: 2, mobile: false }, sessionId);
  await chrome.send("Page.navigate", { url: pathToFileURL(page).href }, sessionId);
  await waitForExpression(chrome, sessionId, "window.rendered === true || typeof window.failure === 'string'", 60000);
  const failure = await evaluate(chrome, sessionId, "window.failure ?? null");
  if (failure) throw new Error(failure);
  const backends = await evaluate(chrome, sessionId, "window.backends");
  console.log(`Backends drawn: ${[...new Set(backends)].join(", ")}`);
  const height = await evaluate(chrome, sessionId, "document.querySelector('main').getBoundingClientRect().bottom + 16");
  await chrome.send("Emulation.setDeviceMetricsOverride",
    { width: 3 * 470 + 32, height: Math.ceil(height), deviceScaleFactor: 2, mobile: false }, sessionId);
  await new Promise(resolve => setTimeout(resolve, 300));
  const shot = await chrome.send("Page.captureScreenshot", { format: "png" }, sessionId);
  writeFileSync(path.join(OUT, "attitude-indicator.png"), Buffer.from(shot.data, "base64"));

  await waitForExpression(chrome, sessionId, "window.timing !== undefined || typeof window.failure === 'string'", 120000);
  const timing = await evaluate(chrome, sessionId, "window.timing ?? null");
  if (!timing) throw new Error(await evaluate(chrome, sessionId, "window.failure"));
  const line = (name, result) => {
    if (!result) return `${name.padEnd(10)} unavailable`;
    return `${name.padEnd(10)} 1 instrument: frame ${result.one.frameMs.toFixed(2)} ms, script ${result.one.scriptMs.toFixed(3)} ms`
      + ` | ${COPIES} instruments: frame ${result.many.frameMs.toFixed(2)} ms, script ${result.many.scriptMs.toFixed(3)} ms each`;
  };
  console.log("Timing (requestAnimationFrame, 2x pixel density, attitude changing every frame):");
  console.log(line("WebGPU", timing.webgpu));
  console.log(line("Canvas 2D", timing.canvas2d));
  writeFileSync(path.join(OUT, "timing.json"), JSON.stringify({ copies: COPIES, ...timing }, null, 2));
} finally {
  await chrome.close();
  rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  rmSync(bundle, { force: true });
  rmSync(page, { force: true });
}
console.log(`Contact sheet: ${path.relative(ROOT, path.join(OUT, "attitude-indicator.png"))}`);
