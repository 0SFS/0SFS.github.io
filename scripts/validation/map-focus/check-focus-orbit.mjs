#!/usr/bin/env node
/**
 * Does orbiting the chase camera load anything new? The acceptance check of
 * docs/proposals/flight-settings.md → Detail around the aircraft.
 *
 * Builds the app, serves it to headless Chrome through request interception
 * (no HTTP server), starts a flight, pauses it so the aircraft stays where it
 * is, waits for map loading to go quiet, then drags the chase camera through a
 * full turn and counts the map requests the turn caused. Once per map and focus
 * mode: with View, the camera decides what loads, so a turn loads what comes
 * into view; with Around the aircraft, everything within the focus radius is
 * loaded whichever way the camera looks, so a turn should load nothing.
 *
 * Map tiles and elevation come from the network, as they do for a pilot. The
 * Google runs need a Google Maps API key, read from GOOGLE_MAPS_API_KEY or from
 * the gitignored GOOGLE_3D_TILES.local.md; it goes to Google only and is never
 * written to the report.
 *
 * Usage: node scripts/validation/map-focus/check-focus-orbit.mjs
 *   [--maps=raster,google] [--modes=view,around] [--quiet=5] [--settle-limit=180] [--after=5] [--out=dir] [--no-build]
 *   [--foss-earth=dir: build against this FOSS Earth checkout, such as a worktree at a commit, not ../foss-earth]
 *   [--set.<parameter id>=<value> …, passed to every run as ?set.<id>=]
 *   [--no-turn: keep the camera still for as long as a turn takes, as the control
 *    for loading that happens without one]
 * Loading counts as settled after `--quiet` seconds without a map request, once
 * the map chip no longer shows tiles streaming.
 * Output: build/validation/map-focus/<local time>/report.json, and per run a
 * screenshot at the half turn (the camera faces the aircraft) and one after it.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { evaluate, openHeadlessChrome, waitForExpression } from "../../headless-chrome.mjs";
import { newOutputDirectory } from "../../outputDirectory.mjs";
import { resolvePagesDistFile } from "../../pagesDistFile.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const arg = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const out = arg("out") ? path.resolve(arg("out")) : newOutputDirectory("validation", "map-focus");
await mkdir(out, { recursive: true });
const maps = arg("maps", "raster,google").split(",");
const modes = arg("modes", "view,around").split(",");
/** Loading counts as settled after this many seconds without a map request. */
const quietSeconds = Number(arg("quiet", "5"));
const settleLimitSeconds = Number(arg("settle-limit", "180"));
/** Requests are still counted this long after the turn, for loading it set off late. */
const afterSeconds = Number(arg("after", "5"));
const turn = !process.argv.includes("--no-turn");
const extraSettings = Object.fromEntries(process.argv.filter(value => value.startsWith("--set.") && value.includes("="))
  .map(value => [value.slice(2, value.indexOf("=")), value.slice(value.indexOf("=") + 1)]));

const MAPS = {
  raster: { basemap: "usgs-imagery" },
  google: { basemap: "google" },
};
for (const map of maps) if (!MAPS[map]) throw new Error(`Unknown map ${map}; choose from ${Object.keys(MAPS).join(", ")}`);

function googleKey() {
  if (process.env.GOOGLE_MAPS_API_KEY) return process.env.GOOGLE_MAPS_API_KEY;
  const file = path.join(root, "GOOGLE_3D_TILES.local.md");
  if (!existsSync(file)) return null;
  return /AIza[0-9A-Za-z_-]{35}/.exec(readFileSync(file, "utf8"))?.[0] ?? null;
}
const key = maps.includes("google") ? googleKey() : null;
if (maps.includes("google") && !key) throw new Error("The Google runs need GOOGLE_MAPS_API_KEY or a key in GOOGLE_3D_TILES.local.md; or pass --maps=raster.");

const fossEarth = path.resolve(arg("foss-earth", path.join(root, "../foss-earth")));
/** Each of FOSS Earth's exports, resolved in the chosen checkout. */
function fossEarthAlias() {
  const escape = text => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return Object.entries(JSON.parse(readFileSync(path.join(fossEarth, "package.json"), "utf8")).exports)
    .map(([name, target]) => ({ find: new RegExp(`^${escape(`foss-earth${name.slice(1)}`)}$`), replacement: path.join(fossEarth, target) }));
}
const dist = path.join(out, "dist");
if (!process.argv.includes("--no-build")) {
  console.log("Building the app…");
  await build({
    root, logLevel: "warn",
    ...(arg("foss-earth") ? { resolve: { alias: fossEarthAlias() } } : {}),
    build: { outDir: dist, emptyOutDir: true },
  });
}

const mime = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm",
  ".css": "text/css", ".json": "application/json", ".xml": "text/xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".glb": "model/gltf-binary",
  ".webmanifest": "application/manifest+json",
};
const ORIGIN = "https://0sfs.test";
const chrome = await openHeadlessChrome(path.join(out, "chrome-profile"));
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
      // A map or elevation request: count it by host, never keeping the query, which may hold a key.
      current.lastExternalMs = Date.now();
      current.requests.push({ atMs: Date.now(), host: url.host });
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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const countByHost = requests => requests.reduce((hosts, { host }) => ({ ...hosts, [host]: (hosts[host] ?? 0) + 1 }), {});

/**
 * Waits until no map request has been made for `quietSeconds` and the map
 * chip no longer shows tiles streaming; returns how long that took. A pause in
 * requests alone can end before loading has.
 */
async function settle(current, sessionId) {
  const started = Date.now();
  while (Date.now() - started < settleLimitSeconds * 1000) {
    if (Date.now() - current.lastExternalMs >= quietSeconds * 1000
      && await evaluate(chrome, sessionId, `!document.querySelector(".is-streaming")`)) return (Date.now() - started) / 1000;
    await sleep(250);
  }
  return null;
}

const WIDTH = 1440;
const HEIGHT = 900;
/** One turn at the flight's mouse orbit rate, 0.005 rad per px at sensitivity 1 (flightCameraInput.ts). */
const TURN_PX = Math.ceil((2 * Math.PI) / 0.005);
const STEPS = 60;

async function orbitOneTurn(sessionId, atHalfTurn) {
  const y = HEIGHT / 2;
  const startX = (WIDTH - TURN_PX / 2) / 2;
  const mouse = (type, x, extra = {}) => chrome.send("Input.dispatchMouseEvent", {
    type, x, y, button: "right", buttons: type === "mouseReleased" ? 0 : 2, clickCount: 1, ...extra,
  }, sessionId);
  // Two half-turn drags keep the pointer on the canvas.
  for (let half = 0; half < 2; half++) {
    await mouse("mousePressed", startX);
    for (let step = 1; step <= STEPS / 2; step++) {
      await mouse("mouseMoved", startX + (TURN_PX / 2) * (step / (STEPS / 2)));
      await sleep(50);
    }
    await mouse("mouseReleased", startX + TURN_PX / 2);
    if (half === 0) await atHalfTurn();
  }
}

/** The commit a checkout is at, and whether it has changes on top. */
function checkout(directory) {
  const git = (...args) => execFileSync("git", ["-C", directory, ...args], { encoding: "utf8" }).trim();
  return { commit: git("rev-parse", "HEAD"), uncommittedChanges: git("status", "--porcelain", "--untracked-files=no") !== "" };
}

async function screenshot(sessionId, file) {
  const shot = await chrome.send("Page.captureScreenshot", { format: "png" }, sessionId);
  await writeFile(path.join(out, file), Buffer.from(shot.data, "base64"));
}

const report = {
  generatedAt: new Date().toISOString(), quietSeconds, settleLimitSeconds, afterSeconds,
  turnPx: turn ? TURN_PX : 0, viewport: { width: WIDTH, height: HEIGHT }, extraSettings,
  checkouts: { "0sfs": checkout(root), "foss-earth": checkout(fossEarth) },
  runs: {},
};
try {
  for (const map of maps) {
    for (const mode of modes) {
      const name = `${map}-${mode}`;
      console.log(`\n== ${name}`);
      const current = { exceptions: [], requests: [], lastExternalMs: Date.now() };
      const { targetId } = await chrome.send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await chrome.send("Target.attachToTarget", { targetId, flatten: true });
      sessions.set(sessionId, current);
      await chrome.send("Runtime.enable", {}, sessionId);
      await chrome.send("Page.enable", {}, sessionId);
      await chrome.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] }, sessionId);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false }, sessionId);
      // Every setting for this visit only, so runs do not depend on each other.
      const query = new URLSearchParams({
        flightPerf: "1",
        renderer: "webgl2",
        "set.map.source.basemap": MAPS[map].basemap,
        "set.map.focus.mode": mode,
        "set.map.focus.point": "aircraft",
        "set.input.mode": "mouse",
        "set.input.sensitivity.mouse.orbit": "1",
        "set.input.orbit.recenterMode": "hold",
        ...extraSettings,
        ...(map === "google" ? { key } : {}),
      });
      await chrome.send("Page.navigate", { url: `${ORIGIN}/fly/?${query}` }, sessionId);
      try {
        await waitForExpression(chrome, sessionId, "Boolean(window.osfsFrameProfiler) && window.osfsFrameProfiler.summary().frames > 60", 180000);
      } catch (error) {
        await screenshot(sessionId, `${name}-stuck.png`);
        throw new Error(`${name}: the flight never started (${error.message}). Exceptions: ${current.exceptions.join(" | ")}`);
      }
      // Paused, the aircraft stays where it is; the camera still orbits and the map still loads.
      await evaluate(chrome, sessionId, `window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP" })), true`);
      const settledAfter = await settle(current, sessionId);
      // Where the aircraft is, to say whether any ground lies within the focus radius.
      const altitudeFt = await evaluate(chrome, sessionId, `Number(document.querySelector('[data-metric="alt"]')?.textContent)`);
      const loading = await evaluate(chrome, sessionId, `(window.osfsLoadingDiagnostics?.().history ?? [])
        .map(({ elapsedMs, phase, update }) => ({ elapsedMs: Math.round(elapsedMs), phase, state: update.state, detail: update.detail ?? null }))`);
      const before = current.requests.length;
      if (turn) await orbitOneTurn(sessionId, () => screenshot(sessionId, `${name}-half-turn.png`));
      else {
        await sleep(STEPS * 25);
        await screenshot(sessionId, `${name}-half-turn.png`);
        await sleep(STEPS * 25);
      }
      await sleep(afterSeconds * 1000);
      const during = current.requests.slice(before);
      await screenshot(sessionId, `${name}.png`);
      report.runs[name] = {
        map, mode, altitudeFt, settledAfterSeconds: settledAfter, requestsBeforeTurn: before,
        requestsDuringTurn: during.length, duringTurnByHost: countByHost(during), exceptions: current.exceptions, loading,
      };
      console.log(`${altitudeFt} ft; settled after ${settledAfter === null ? `more than ${settleLimitSeconds} s (not settled)` : `${settledAfter.toFixed(1)} s`};`
        + ` ${before} map requests before the turn, ${during.length} during it${turn ? "" : " (camera still)"} and the ${afterSeconds} s after.`);
      if (current.exceptions.length) console.log(`  exceptions: ${current.exceptions.join(" | ")}`);
      await chrome.send("Target.closeTarget", { targetId });
      sessions.delete(sessionId);
    }
  }
} finally {
  await chrome.close();
}
// Nothing the page reported may carry the key.
const json = JSON.stringify(report, null, 2);
await writeFile(path.join(out, "report.json"), key ? json.replaceAll(key, "<key>") : json);
console.log(`\nReport: ${path.relative(root, path.join(out, "report.json"))}`);
