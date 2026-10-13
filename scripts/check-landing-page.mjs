#!/usr/bin/env node
/**
 * Headless check of the built site: the landing page, /fly/ boot from its
 * Start link, and the /rc/ controller. Serves `dist` (npm run build) through
 * Chrome Fetch interception — no HTTP server. Uses fly's headless Chrome
 * helpers from the fly checkout beside this one.
 *
 * The built bundle is what is checked, not the sources: /fly/ must load the
 * aircraft's own mesh (every glTF goes through Babylon's loader, which a
 * bundler bug broke on 2026-10-08 while every unit test passed), and the
 * landing page and the phone controller must not load the Babylon engine,
 * whatever chunk it ends up in. Babylon's shaders must reach /fly/ in a few
 * files, as foss-earth/vite's babylonShaderChunks() bundles them, not in the
 * hundreds the bundler makes of them without it. External hosts are blocked, so
 * the flight waits for terrain; the check stops once the aircraft is ready.
 *
 * Usage: node scripts/check-landing-page.mjs [--out=/new/directory] [--dist=dist]
 * Output: a new build/validation/landing/<date_time>/ unless --out names another.
 */
import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate, openHeadlessChrome, waitForExpression } from "../../fly/scripts/headless-chrome.mjs";
import { resolvePagesDistFile } from "../../fly/scripts/pagesDistFile.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

/** A new build/<where>/<date_time>/ folder; a second run in the same second gets -2. */
async function newOutputDirectory(...where) {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const parent = path.join(root, "build", ...where);
  await mkdir(parent, { recursive: true });
  for (let attempt = 1; ; attempt++) {
    const directory = path.join(parent, attempt === 1 ? stamp : `${stamp}-${attempt}`);
    try {
      await mkdir(directory);
      return directory;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
}
const args = process.argv.slice(2);
if (args.some((arg) => !arg.startsWith("--out=") && !arg.startsWith("--dist="))) {
  throw new Error("Usage: check-landing-page.mjs [--out=/new/directory] [--dist=dist]");
}
const outArg = args.find((arg) => arg.startsWith("--out="))?.slice(6);
const dist = path.resolve(root, args.find((arg) => arg.startsWith("--dist="))?.slice(7) ?? "dist");
await access(path.join(dist, "index.html"));
await access(path.join(dist, "fly", "index.html"));
await access(path.join(dist, "rc", "index.html"));
const out = outArg ? path.resolve(outArg) : await newOutputDirectory("validation", "landing");
if (outArg) await mkdir(out);

const mime = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm",
  ".css": "text/css", ".json": "application/json", ".xml": "text/xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".glb": "model/gltf-binary",
  ".webmanifest": "application/manifest+json",
};
const chrome = await openHeadlessChrome(path.join(out, "chrome-profile"));
const failures = [];
const sessions = new Map();
const detach = chrome.onEvent((message) => {
  const current = sessions.get(message.sessionId);
  if (!current) return;
  if (message.method === "Runtime.exceptionThrown") {
    current.exceptions.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  }
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
    current.consoleErrors.push(message.params.args.map((arg) => arg.description ?? arg.value ?? arg.type).join(" "));
  }
  if (message.method !== "Fetch.requestPaused") return;
  void (async () => {
    const { requestId, request } = message.params;
    const url = new URL(request.url);
    if (url.origin !== "https://0sfs.test") {
      current.blockedExternal.push(url.origin + url.pathname);
      await chrome.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }, message.sessionId);
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    let file;
    try { file = await resolvePagesDistFile(dist, pathname); }
    catch { file = null; }
    try {
      if (!file) throw new Error("Not a built file");
      const bytes = await readFile(file);
      current.loaded.push({ path: pathname, bytes: bytes.length });
      // The engine's own banner, which minification keeps: names say nothing
      // once Babylon is merged into a shared or entry chunk.
      if (/\.m?js$/.test(file) && bytes.includes("Babylon.js v")) current.babylon.push(pathname);
      if (/\.m?js$/.test(file) && bytes.includes("ShadersStore")) current.shaderFiles.push(pathname);
      await chrome.send("Fetch.fulfillRequest", {
        requestId, responseCode: 200,
        responseHeaders: [
          { name: "Content-Type", value: mime[path.extname(file)] ?? "application/octet-stream" },
          { name: "Cache-Control", value: "no-store" },
        ],
        body: bytes.toString("base64"),
      }, message.sessionId);
    } catch (error) {
      if (pathname !== "/favicon.ico") current.missingLocal.push({ path: pathname, error: error.message });
      await chrome.send("Fetch.fulfillRequest", { requestId, responseCode: 404, body: "" }, message.sessionId);
    }
  })().catch((error) => failures.push(error.message));
});

async function attachSession(label) {
  const current = { label, loaded: [], blockedExternal: [], missingLocal: [], exceptions: [], consoleErrors: [], babylon: [], shaderFiles: [] };
  const { targetId } = await chrome.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await chrome.send("Target.attachToTarget", { targetId, flatten: true });
  sessions.set(sessionId, current);
  await chrome.send("Runtime.enable", {}, sessionId);
  await chrome.send("Page.enable", {}, sessionId);
  await chrome.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] }, sessionId);
  return { current, sessionId, targetId };
}

const heavyAsset = /createFlightSimApp|createPhoneControllerApp|createGlobeModeApp|jsbsim|babylon/i;
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), dist, checks: {} };

try {
  const info = await attachSession("info");
  await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, info.sessionId);
  await chrome.send("Page.navigate", { url: "https://0sfs.test/?renderer=webgl2" }, info.sessionId);
  await waitForExpression(chrome, info.sessionId, "Boolean(document.querySelector('.info-page'))", 15000);
  const startHref = await evaluate(chrome, info.sessionId, "document.querySelector('.info-page__start')?.getAttribute('href')");
  assert.equal(startHref, "/fly/?renderer=webgl2", "Start flying dropped existing query parameters");
  const desktopShot = await chrome.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, info.sessionId);
  await writeFile(path.join(out, "info-desktop.png"), Buffer.from(desktopShot.data, "base64"));
  await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, info.sessionId);
  const phoneShot = await chrome.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, info.sessionId);
  await writeFile(path.join(out, "info-phone.png"), Buffer.from(phoneShot.data, "base64"));
  const heavy = info.current.loaded.filter((asset) => heavyAsset.test(asset.path));
  assert.equal(heavy.length, 0, "The landing page fetched a simulator or controller chunk: " + JSON.stringify(heavy));
  assert.deepEqual(info.current.babylon, [], "The landing page loaded the Babylon engine: " + JSON.stringify(info.current.babylon));
  const javascriptBytes = (assets) => assets.filter((asset) => /\.m?js$/.test(asset.path)).reduce((sum, asset) => sum + asset.bytes, 0);
  const infoLoaded = info.current.loaded.slice();
  report.checks.info = {
    startHref, loaded: infoLoaded.map((asset) => asset.path), exceptions: info.current.exceptions.slice(),
    javascriptBytes: javascriptBytes(infoLoaded),
  };

  await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, info.sessionId);
  await evaluate(chrome, info.sessionId, "document.querySelector('.info-page__start').click()");
  await waitForExpression(chrome, info.sessionId, "location.pathname.indexOf('/fly') === 0 && Boolean(window.osfsJsbsimBuild)", 30000);
  // The aircraft phase is ready once the mesh, or the fallback standing in for
  // it, is in place; a detail on that phase names the fallback.
  await waitForExpression(chrome, info.sessionId, "(() => { const report = window.osfsLoadingDiagnostics?.(); "
    + "return Boolean(report) && (report.phases.assets.state === 'ready' || report.outcome === 'failed'); })()", 60000);
  const loading = await evaluate(chrome, info.sessionId, "window.osfsLoadingDiagnostics()");
  // What /fly/ fetched after the landing page, until its aircraft was ready.
  const flyLoaded = info.current.loaded.slice(infoLoaded.length);
  report.checks.fly = {
    loaded: flyLoaded.map((asset) => asset.path),
    shaderFiles: info.current.shaderFiles.length,
    javascriptBytes: javascriptBytes(flyLoaded),
    totalBytes: flyLoaded.reduce((sum, asset) => sum + asset.bytes, 0),
    href: await evaluate(chrome, info.sessionId, "location.pathname + location.search"),
    jsbsim: await evaluate(chrome, info.sessionId, "window.osfsJsbsimBuild"),
    loading,
    exceptions: info.current.exceptions.slice(),
    consoleErrors: info.current.consoleErrors.slice(),
  };
  assert.equal(report.checks.fly.href, "/fly/?renderer=webgl2");
  assert.notEqual(loading.outcome, "failed", "Flight startup failed: " + loading.failure);
  assert.equal(loading.phases.assets.detail, undefined, "The aircraft's mesh did not load: " + loading.phases.assets.detail);
  assert.deepEqual(info.current.exceptions, [], "Uncaught exceptions on the landing page or /fly/: " + JSON.stringify(info.current.exceptions));
  // Files that hold Babylon's shader registry: 7 with babylonShaderChunks(), 341 without, on 2026-10-08.
  assert.ok(info.current.shaderFiles.length <= 20, `Babylon's shaders reached /fly/ in ${info.current.shaderFiles.length} files, `
    + "one request each: the build lacks babylonShaderChunks() from foss-earth/vite");
  await chrome.send("Target.closeTarget", { targetId: info.targetId });
  sessions.delete(info.sessionId);

  const remote = await attachSession("remote");
  await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, remote.sessionId);
  await chrome.send("Page.navigate", { url: "https://0sfs.test/rc/" }, remote.sessionId);
  await waitForExpression(chrome, remote.sessionId, "Boolean(document.querySelector('.phone-app'))", 15000);
  const remoteState = await evaluate(chrome, remote.sessionId, "({ pathname: location.pathname, jsbsim: Boolean(window.osfsJsbsimBuild), phone: Boolean(document.querySelector('.phone-app')) })");
  assert.match(remoteState.pathname, /^\/rc\/?$/);
  assert.equal(remoteState.jsbsim, false);
  assert.equal(remoteState.phone, true);
  const remoteHeavy = remote.current.loaded.filter((asset) => /createFlightSimApp|jsbsim|babylon/i.test(asset.path));
  assert.equal(remoteHeavy.length, 0, "Phone controller fetched a flight chunk: " + JSON.stringify(remoteHeavy));
  assert.deepEqual(remote.current.babylon, [], "Phone controller loaded the Babylon engine: " + JSON.stringify(remote.current.babylon));
  report.checks.remote = {
    ...remoteState, loaded: remote.current.loaded.map((asset) => asset.path), exceptions: remote.current.exceptions.slice(),
    javascriptBytes: javascriptBytes(remote.current.loaded),
  };
  await chrome.send("Target.closeTarget", { targetId: remote.targetId });
  sessions.delete(remote.sessionId);
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.stack ?? error.message;
  failures.push(report.failure);
} finally {
  detach();
  await chrome.close();
}

await writeFile(path.join(out, "report.json"), JSON.stringify({ ...report, failures }, null, 2) + "\n");
process.stdout.write(JSON.stringify({ report: path.join(out, "report.json"), passed: report.passed, failure: report.failure, failures }, null, 2) + "\n");
if (!report.passed) process.exitCode = 1;
