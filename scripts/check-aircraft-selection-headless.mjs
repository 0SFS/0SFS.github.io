import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { evaluate, openHeadlessChrome, waitForExpression } from "./headless-chrome.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const outArg = process.argv.slice(2).find(arg => arg.startsWith("--out="))?.slice(6);
if (!outArg) throw new Error("Usage: check-aircraft-selection-headless.mjs --out=/new/artifact/directory");
const out = path.resolve(outArg);
await mkdir(out); // Refuse to overwrite earlier acceptance evidence.
const fixtureRoot = path.join(out, "fixture");
const bundleRoot = path.join(out, "bundle");
await mkdir(fixtureRoot);
const importPath = relative => JSON.stringify(path.join(root, relative));
const fixture = [
  "import {createFlightControlPanel} from " + importPath("src/flight/hud/createFlightControlPanel.tsx") + ";",
  "import " + importPath("src/styles/globe.css") + ";",
  "import " + importPath("src/styles/flight.css") + ";",
  "const noop=()=>{};",
  "const snapshot={flightState:{latDeg:45,lonDeg:-93,altMeters:1500,headingRad:0,airspeedKts:150,throttleNorm:.5},fps:60,paused:true,viewMode:'third',runtimeStatus:{message:'Static UI acceptance fixture'},rendererMode:'webgl2',googleTerrainDetail:null,aircraftId:'cirrus-vision-jet',generationId:'g1',lodId:'auto',optInLodsEnabled:false,modelStatus:'ready',modelActiveLodId:'lod3',modelTriangles:1514,modelError:null};",
  "window.__aircraftFixture={applied:[],scope:'React aircraft controls and shell with a static snapshot; no FDM'};",
  "const panel=createFlightControlPanel(document.getElementById('panel'),snapshot,{initialWeather:{windDirectionDeg:0,windSpeedKts:0},onLocationApply:noop,onWeatherChange:noop,onPausedChange:noop,onViewModeChange:noop,onAircraftApply:selection=>{window.__aircraftFixture.applied.push(selection);Object.assign(snapshot,selection);panel.update({...snapshot});return null;},onGoogleTerrainDetailChange:noop,onAutomaticGoogleTerrainDetailChange:noop,onFlightTerrainRequirementChange:noop,onTerrainDetailOverrideChange:noop,onTerrainDetailAnchorChange:noop,onKeyboardStickSettingsChange:noop,onOrbitInvertChange:noop,onArcadeGroundLaunchesChange:noop,onCollisionDebugChange:noop,onWheelSpinModeChange:noop,onTireSoundChange:noop,onGroundInteractionAction:noop});",
  "const opening=setInterval(()=>{panel.openOrSelectTab('aircraft');if(document.querySelector('.flight-panel__aircraft-gallery'))clearInterval(opening);},25);setTimeout(()=>clearInterval(opening),2000);",
].join("\n");
await writeFile(path.join(fixtureRoot, "entry.tsx"), fixture);
await writeFile(path.join(fixtureRoot, "index.html"), '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aircraft UI acceptance fixture</title><style>html,body{margin:0}*{box-sizing:border-box}</style><div class="flight-app"><div id="panel"></div></div><script type="module" src="/entry.tsx"></script>');
await build({
  configFile: false, root: fixtureRoot, publicDir: false, base: "/",
  plugins: [react()], logLevel: "warn",
  resolve: { alias: { react: path.join(root, "node_modules/react"), "react-dom": path.join(root, "node_modules/react-dom") }, dedupe: ["react", "react-dom"] },
  build: { outDir: bundleRoot, emptyOutDir: false, minify: false },
});
const chrome = await openHeadlessChrome(path.join(out, "chrome-profile"));
const failures = [], network = [], browserErrors = [];
const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const detach = chrome.onEvent(message => {
  if (message.method === "Runtime.exceptionThrown") browserErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  if (message.method !== "Fetch.requestPaused") return;
  void (async () => {
    const { requestId, request } = message.params;
    const url = new URL(request.url);
    if (url.origin !== "https://0sfs.test") {
      failures.push("Unexpected external fixture request: " + request.url);
      await chrome.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }, message.sessionId);
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    const base = pathname.startsWith("/aircraft/thumbnails/") ? path.join(root, "public") : bundleRoot;
    const file = path.resolve(base, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!file.startsWith(base + path.sep)) throw new Error("Unsafe fixture request");
    try {
      const bytes = await readFile(file);
      network.push({ path: pathname, sha256: createHash("sha256").update(bytes).digest("hex") });
      await chrome.send("Fetch.fulfillRequest", {
        requestId, responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: mime[path.extname(file)] ?? "application/octet-stream" }, { name: "Cache-Control", value: "no-store" }],
        body: bytes.toString("base64"),
      }, message.sessionId);
    } catch (error) {
      if (pathname !== "/favicon.ico") failures.push("Fixture request failed: " + pathname + ": " + error.message);
      await chrome.send("Fetch.fulfillRequest", { requestId, responseCode: 404, body: "" }, message.sessionId);
    }
  })().catch(error => failures.push(error.message));
});
// Intersect focus bounds with each clipping ancestor as well as the viewport;
// an offscreen control can still be programmatically clicked in Chromium.
const focusGeometry = `(() => {const e=document.activeElement,r=e.getBoundingClientRect();let clip={top:0,left:0,right:innerWidth,bottom:innerHeight};for(let p=e.parentElement;p;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(s.overflowY)){clip.top=Math.max(clip.top,b.top+p.clientTop);clip.bottom=Math.min(clip.bottom,b.top+p.clientTop+p.clientHeight);}if(/auto|scroll|hidden|clip/.test(s.overflowX)){clip.left=Math.max(clip.left,b.left+p.clientLeft);clip.right=Math.min(clip.right,b.left+p.clientLeft+p.clientWidth);}}const s=getComputedStyle(e),outline=s.outlineStyle==='none'?0:parseFloat(s.outlineWidth)+parseFloat(s.outlineOffset);const contained=pad=>r.top-pad>=clip.top-1&&r.bottom+pad<=clip.bottom+1&&r.left-pad>=clip.left-1&&r.right+pad<=clip.right+1;return {tag:e.tagName,text:e.textContent?.trim(),visible:contained(0),outlineStyle:s.outlineStyle,outlineFullyVisible:contained(Math.max(0,outline)),clip,bounds:{top:r.top,bottom:r.bottom,left:r.left,right:r.right},isApply:e.matches('.flight-panel__aircraft-controls > button')};})()`;
const results = [];
try {
  for (const viewport of [
    { name: "wide", width: 1440, height: 900 },
    { name: "narrow", width: 360, height: 760 },
    { name: "short", width: 740, height: 360 },
  ]) {
    const { targetId } = await chrome.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await chrome.send("Target.attachToTarget", { targetId, flatten: true });
    await chrome.send("Runtime.enable", {}, sessionId);
    await chrome.send("Page.enable", {}, sessionId);
    await chrome.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] }, sessionId);
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false }, sessionId);
    await chrome.send("Page.navigate", { url: "https://0sfs.test/" }, sessionId);
    await waitForExpression(chrome, sessionId, "Boolean(document.querySelector('.flight-panel__generation-field select'))");
    await waitForExpression(chrome, sessionId, "Array.from(document.images).every(image=>image.complete && image.naturalWidth>0)");
    const key = async (name, code) => {
      await chrome.send("Input.dispatchKeyEvent", { type: "keyDown", key: name, code: name, windowsVirtualKeyCode: code, ...(name === "Enter" ? { text: "\r" } : {}) }, sessionId);
      await chrome.send("Input.dispatchKeyEvent", { type: "keyUp", key: name, code: name, windowsVirtualKeyCode: code }, sessionId);
    };
    await evaluate(chrome, sessionId, "document.querySelector('input[value=\"cirrus-vision-jet\"]').focus()");
    await key("ArrowLeft", 37);
    await waitForExpression(chrome, sessionId, "!document.querySelector('.flight-panel__generation-field')");
    await key("ArrowRight", 39);
    await waitForExpression(chrome, sessionId, "Boolean(document.querySelector('.flight-panel__generation-field'))");
    const geometry = await evaluate(chrome, sessionId, "(() => {const gallery=document.querySelector('.flight-panel__aircraft-gallery'),controls=document.querySelector('.flight-panel__aircraft-controls'),focus=document.activeElement;const g=gallery.getBoundingClientRect(),c=controls.getBoundingClientRect(),f=focus.getBoundingClientRect();return {controlsOutsideGallery:!gallery.contains(controls),controlsBelowGallery:c.top>=g.bottom,documentFits:document.documentElement.scrollWidth<=innerWidth,focusVisible:f.top>=Math.max(0,g.top)&&f.bottom<=Math.min(innerHeight,g.bottom)&&f.left>=0&&f.right<=innerWidth,galleryHeight:g.height,galleryScrollHeight:gallery.scrollHeight,galleryClientHeight:gallery.clientHeight,overflowY:getComputedStyle(gallery).overflowY,focusedFamily:focus.value,focusOutline:getComputedStyle(focus.closest('label')).outlineStyle};})()");
    await evaluate(chrome, sessionId, "(() => {const select=document.querySelector('.flight-panel__generation-field select');select.value='g2+';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await waitForExpression(chrome, sessionId, "document.querySelector('.flight-panel__generation-field select').value==='g2+'");
    await evaluate(chrome, sessionId, "document.querySelector('.flight-panel__generation-field select').focus()");
    await key("Tab", 9);
    const controlFocus = await evaluate(chrome, sessionId, focusGeometry);
    const screenshot = await chrome.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
    await writeFile(path.join(out, viewport.name + ".png"), Buffer.from(screenshot.data, "base64"));
    const appliedBefore = await evaluate(chrome, sessionId, "window.__aircraftFixture.applied.length");
    let applyFocus;
    for (let tabs = 0; tabs < 12; tabs++) {
      await key("Tab", 9);
      applyFocus = await evaluate(chrome, sessionId, focusGeometry);
      if (applyFocus.isApply) break;
    }
    if (!applyFocus?.isApply) throw new Error("Keyboard navigation did not reach aircraft Apply.");
    const applyScreenshot = await chrome.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
    await writeFile(path.join(out, viewport.name + "-apply.png"), Buffer.from(applyScreenshot.data, "base64"));
    await key("Enter", 13);
    await waitForExpression(chrome, sessionId, "window.__aircraftFixture.applied.length===1");
    const applied = await evaluate(chrome, sessionId, "window.__aircraftFixture.applied[0]");
    const passed = geometry.controlsOutsideGallery && geometry.controlsBelowGallery && geometry.documentFits && geometry.focusVisible
      && geometry.overflowY === "auto" && geometry.focusOutline !== "none" && controlFocus.visible
      && applyFocus.visible && applyFocus.outlineStyle !== "none"
      && appliedBefore === 0 && applied.aircraftId === "cirrus-vision-jet-g2" && applied.generationId === "g2+";
    results.push({ ...viewport, passed, geometry, controlFocus, applyFocus, appliedBefore, applied, screenshot: viewport.name + ".png", applyScreenshot: viewport.name + "-apply.png" });
    await chrome.send("Target.closeTarget", { targetId });
  }
} catch (error) { failures.push(error.stack ?? error.message); } finally { detach(); await chrome.close(); }
const report = {
  schemaVersion: 1, generatedAt: new Date().toISOString(), scope: "Actual aircraft React components, shell and CSS; static snapshot, no FDM.",
  serverStarted: false, visibleBrowserUsed: false, results, network, browserErrors, failures,
  passed: results.every(result => result.passed) && failures.length === 0 && browserErrors.length === 0,
};
await writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
process.stdout.write(JSON.stringify({ passed: report.passed, report: path.join(out, "report.json"), results: results.map(({ name, passed }) => ({ name, passed })), failures, browserErrors }, null, 2) + "\n");
if (!report.passed) process.exitCode = 1;
