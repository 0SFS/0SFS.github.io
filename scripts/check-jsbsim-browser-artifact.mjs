import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate, openHeadlessChrome, waitForExpression } from "./headless-chrome.mjs";
import { newOutputDirectory } from "./outputDirectory.mjs";
import { resolvePagesDistFile } from "./pagesDistFile.mjs";
import { verifyInstalledSdk } from "./verify-jsbsim-artifact.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.some(arg => !arg.startsWith("--out=") && !arg.startsWith("--dist="))) throw new Error("Usage: check-jsbsim-browser-artifact.mjs [--out=/new/directory] [--dist=dist]");
const outArg = args.find(arg => arg.startsWith("--out="))?.slice(6);
const dist = path.resolve(root, args.find(arg => arg.startsWith("--dist="))?.slice(7) ?? "dist");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const installed = await verifyInstalledSdk(root);
const built = JSON.parse(await readFile(path.join(dist, "jsbsim-artifact.json"), "utf8"));
assert.deepEqual(built.identity, installed.identity, "Build identity differs from installed SDK");
assert.deepEqual(built.packageArchive, installed.packageArchive, "Build was produced from another package archive");
assert.deepEqual(built.files, installed.files, "Build's source-file manifest differs from installed SDK");
for (const [name, digest] of Object.entries(built.emitted)) assert.equal(hash(await readFile(path.join(dist, name))), digest, "Stale emitted file: " + name);
const manifestBytes = await readFile(path.join(dist, "jsbsim-data/manifest.json"));
const manifest = JSON.parse(manifestBytes);
// Default: a new build/validation/jsbsim-browser-artifact/<date_time>/.
const out = outArg ? path.resolve(outArg) : newOutputDirectory("validation", "jsbsim-browser-artifact");
if (outArg) await mkdir(out); // Earlier browser evidence must not be overwritten.
const chrome = await openHeadlessChrome(path.join(out, "chrome-profile"));
const results = [], failures = [], sessions = new Map();
const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".css": "text/css", ".json": "application/json", ".xml": "text/xml", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".glb": "model/gltf-binary" };
const detach = chrome.onEvent(message => {
  const current = sessions.get(message.sessionId);
  if (!current) return;
  if (message.method === "Runtime.exceptionThrown") current.exceptions.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) current.console.push({ type: message.params.type, text: message.params.args.map(arg => arg.value ?? arg.description ?? arg.type).join(" ") });
  if (message.method !== "Fetch.requestPaused") return;
  void (async () => {
    const { requestId, request } = message.params;
    const url = new URL(request.url);
    if (url.origin !== "https://0sfs.test") {
      current.blockedExternal.push(url.origin + url.pathname); // Do not retain URL query credentials.
      await chrome.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }, message.sessionId);
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    let file;
    try { file = await resolvePagesDistFile(dist, pathname); }
    catch { file = null; }
    if (file && !file.startsWith(dist + path.sep)) throw new Error("Unsafe application asset request");
    try {
      if (!file) throw new Error("Not a built file");
      const bytes = await readFile(file);
      current.loaded.push({ path: pathname, sha256: hash(bytes), bytes: bytes.length });
      await chrome.send("Fetch.fulfillRequest", { requestId, responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: mime[path.extname(file)] ?? "application/octet-stream" }, { name: "Cache-Control", value: "no-store" }], body: bytes.toString("base64") }, message.sessionId);
    } catch (error) {
      if (pathname !== "/favicon.ico") current.missingLocal.push({ path: pathname, error: error.message });
      await chrome.send("Fetch.fulfillRequest", { requestId, responseCode: 404, body: "" }, message.sessionId);
    }
  })().catch(error => failures.push(error.message));
});
try {
  for (const aircraftId of ["cessna-172", "cirrus-vision-jet", "cirrus-vision-jet-g2", "cirrus-vision-jet-g3"]) {
    const current = { aircraftId, loaded: [], blockedExternal: [], missingLocal: [], console: [], exceptions: [], passed: false };
    results.push(current);
    const { targetId } = await chrome.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await chrome.send("Target.attachToTarget", { targetId, flatten: true });
    sessions.set(sessionId, current);
    try {
      await chrome.send("Runtime.enable", {}, sessionId);
      await chrome.send("Page.enable", {}, sessionId);
      await chrome.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] }, sessionId);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
      // Saved settings would win over nothing here, but a clean record keeps runs independent;
      // the aircraft is set for this visit only.
      await chrome.send("Page.addScriptToEvaluateOnNewDocument", { source: "localStorage.clear();" }, sessionId);
      const settings = new URLSearchParams({ renderer: "webgl2", "set.osfs.aircraft.id": aircraftId, "set.osfs.aircraft.lod": "auto", "set.osfs.aircraft.optInLods": "off" });
      await chrome.send("Page.navigate", { url: `https://0sfs.test/fly/?${settings}` }, sessionId);
      await waitForExpression(chrome, sessionId, "Boolean(window.osfsJsbsimBuild)", 20000);
      current.runtime = await evaluate(chrome, sessionId, "window.osfsJsbsimBuild");
      assert.equal(current.runtime.aircraftId, aircraftId, "Browser booted another aircraft");
      assert.deepEqual(current.runtime.build, installed.identity, "Browser executing another SDK build");
      current.verifiedAssets = {};
      for (const [field, expectedSource] of [["moduleUrl", "wasm/jsbsim_wasm.mjs"], ["wasmUrl", "wasm/jsbsim_wasm.wasm"]]) {
        const url = new URL(current.runtime.assets[field], "https://0sfs.test/");
        assert.equal(url.origin, "https://0sfs.test", "SDK asset URL escaped the built app");
        const loaded = current.loaded.find(asset => asset.path === url.pathname);
        assert.ok(loaded, "Browser did not request its declared SDK asset: " + field);
        assert.equal(loaded.sha256, installed.files[expectedSource], "Browser SDK bytes differ from installed package");
        assert.equal(built.emitted[url.pathname.slice(1)], loaded.sha256, "Browser SDK asset absent from build inventory");
        current.verifiedAssets[field] = loaded;
      }
      current.verifiedAircraftFiles = [];
      for (const file of manifest.aircraft[aircraftId]) {
        const loaded = current.loaded.find(asset => asset.path === "/jsbsim-data/" + file);
        assert.ok(loaded, "Browser did not request selected aircraft file: " + file);
        assert.equal(loaded.sha256, hash(await readFile(path.join(dist, "jsbsim-data", file))));
        current.verifiedAircraftFiles.push(loaded);
      }
      assert.equal(current.missingLocal.length, 0, "Missing local build assets");
      assert.equal(current.exceptions.length, 0, "Browser runtime exception");
      current.pageStatus = await evaluate(chrome, sessionId, "document.querySelector('#app-log')?.innerText ?? document.body.innerText");
      current.passed = true;
    } catch (error) { current.failure = error.stack ?? error.message; }
    finally {
      try {
        const screenshot = await chrome.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
        current.screenshot = aircraftId + ".png";
        await writeFile(path.join(out, current.screenshot), Buffer.from(screenshot.data, "base64"));
      } catch (error) { current.screenshotError = error.message; }
      sessions.delete(sessionId);
      await chrome.send("Target.closeTarget", { targetId });
    }
  }
} catch (error) { failures.push(error.stack ?? error.message); }
finally { detach(); await chrome.close(); }
const report = {
  schemaVersion: 1, generatedAt: new Date().toISOString(),
  scope: "Production bundle and real browser WASM boot for four aircraft; external terrain/fonts blocked. Does not certify terrain readiness, GPU performance, flight fidelity, or full UI interaction.",
  serverStarted: false, visibleBrowserUsed: false, installed, emitted: built.emitted,
  aircraftManifestSha256: hash(manifestBytes), results, failures,
  browserLoadedAssetsVerified: results.length === 4 && results.every(result => result.passed) && failures.length === 0,
};
await writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
process.stdout.write(JSON.stringify({ report: path.join(out, "report.json"), passed: report.browserLoadedAssetsVerified, results: results.map(({ aircraftId, passed, failure }) => ({ aircraftId, passed, failure })), failures }, null, 2) + "\n");
if (!report.browserLoadedAssetsVerified) process.exitCode = 1;
