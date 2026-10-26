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
  ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".glb": "model/gltf-binary",
  ".webmanifest": "application/manifest+json",
  ".webm": "video/webm", ".mp4": "video/mp4",
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
      let body = bytes, responseCode = 200;
      const responseHeaders = [
        { name: "Content-Type", value: mime[path.extname(file)] ?? "application/octet-stream" },
        { name: "Cache-Control", value: "no-store" },
      ];
      // Match the preview server's byte-range behavior. Chrome's WebM seeking
      // needs these headers even when this intercepted response holds the file.
      if (/\.(webm|mp4)$/.test(file)) {
        responseHeaders.push({name:'Accept-Ranges',value:'bytes'});
        const rangeHeader = Object.entries(request.headers).find(([name]) => name.toLowerCase() === 'range')?.[1];
        const range = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader ?? '');
        if (range) {
          const first = Number(range[1]), last = Math.min(Number(range[2] || bytes.length - 1), bytes.length - 1);
          body = bytes.subarray(first, last + 1);
          responseCode = 206;
          responseHeaders.push({name:'Content-Range',value:`bytes ${first}-${last}/${bytes.length}`});
        }
        responseHeaders.push({name:'Content-Length',value:String(body.length)});
      }
      current.loaded.push({ path: pathname, bytes: body.length });
      // The engine's own banner, which minification keeps: names say nothing
      // once Babylon is merged into a shared or entry chunk.
      if (/\.m?js$/.test(file) && bytes.includes("Babylon.js v")) current.babylon.push(pathname);
      if (/\.m?js$/.test(file) && bytes.includes("ShadersStore")) current.shaderFiles.push(pathname);
      await chrome.send("Fetch.fulfillRequest", {
        requestId, responseCode, responseHeaders,
        body: body.toString("base64"),
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
  await chrome.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, info.sessionId);
  await chrome.send("Page.navigate", { url: "https://0sfs.test/?renderer=webgl2" }, info.sessionId);
  await waitForExpression(chrome, info.sessionId, "Boolean(document.querySelector('.feature__scenery')?.dataset.basemap)", 15000);
  const startHref = await evaluate(chrome, info.sessionId, "document.querySelector('.info-page__start')?.getAttribute('href')");
  assert.equal(startHref, "/fly/?renderer=webgl2&set.map.source.basemap=google", "Fly dropped existing query parameters or basemap");
  await waitForExpression(chrome, info.sessionId, "document.querySelectorAll('button[data-help][aria-expanded]').length === 6", 5000);
  report.checks.help = await evaluate(chrome, info.sessionId, `(() => {
    const buttons = [...document.querySelectorAll('button[data-help]')];
    if (document.querySelector('.info-page__nav,.info-page__hero')) throw Error('Removed introduction remains');
    const results = buttons.map(button => {
      const content = document.getElementById(button.getAttribute('aria-controls'));
      if (!content.hidden) throw Error('Help starts open');
      button.scrollIntoView({block:'center'});
      button.click();
      const box = content.getBoundingClientRect();
      if (content.getAttribute('role') !== 'tooltip' || box.left < 0 || box.right > innerWidth || box.top < 0 || box.bottom > innerHeight) throw Error('Tooltip clipped');
      if (getComputedStyle(content,'::backdrop').backgroundColor !== 'rgba(0, 0, 0, 0)') throw Error('Tooltip dims the page');
      if (getComputedStyle(content).pointerEvents !== 'auto') throw Error('Tooltip cannot receive pointer input');
      const heading = content.querySelector('h2,h4');
      if (heading && parseFloat(getComputedStyle(heading).fontSize) > 14) throw Error('Tooltip heading is not compact');
      const links = content.querySelectorAll('a');
      (links[0] ?? button).focus();
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      if (!content.hidden || document.activeElement !== button) throw Error('Escape/focus return failed');
      button.click();
      document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
      if (!content.hidden) throw Error('Outside dismissal failed');
      return {id:content.id, links:links.length, anchored:true};
    });
    window.scrollTo(0,0);
    return results;
  })()`);
  const stillPreview = await evaluate(chrome, info.sessionId, `(() => {
    const video = document.querySelector('.feature__scenery');
    return { paused: video.paused, readyState: video.readyState, time: video.currentTime,
      action: document.querySelector('.feature__video-toggle').getAttribute('aria-label') };
  })()`);
  assert.equal(stillPreview.paused, true, "Reduced motion started the video");
  assert.equal(stillPreview.time, 0);
  assert.equal(stillPreview.action, "Play flight preview");
  assert.equal(info.current.loaded.filter(asset => /\.(webm|mp4)$/.test(asset.path)).length, 0, "Reduced motion downloaded a video without being played");
  // A still preview switches its poster without downloading either video. The
  // real app's settings record keeps other saved values and presets intact.
  const switched = await evaluate(chrome, info.sessionId, `(() => {
    localStorage.setItem('foss-earth.settings.v1', JSON.stringify({version:1, values:{'renderer.mode':'webgl2'}, presets:{example:'Keep me'}}));
    const select = document.querySelector('.feature__map-select');
    select.value = 'usgs-imagery-topo'; select.dispatchEvent(new Event('change'));
    return {saved:JSON.parse(localStorage.getItem('foss-earth.settings.v1')), poster:document.querySelector('video').poster,
      credit:document.querySelector('.feature__map-credit').href, href:document.querySelector('.info-page__start').getAttribute('href')};
  })()`);
  assert.equal(switched.saved.values['map.source.basemap'], 'usgs-imagery-topo');
  assert.equal(switched.saved.values['renderer.mode'], 'webgl2');
  assert.equal(switched.saved.presets.example, 'Keep me');
  assert.match(switched.poster, /f35-westbound-umn-usgs-poster\.jpg/);
  assert.match(switched.credit, /usgs\.gov/);
  assert.match(switched.href, /set\.map\.source\.basemap=usgs-imagery-topo/);
  const previousDocument = await evaluate(chrome, info.sessionId, 'performance.timeOrigin');
  await chrome.send('Page.navigate', {url:'https://0sfs.test/?renderer=webgl2'}, info.sessionId);
  await waitForExpression(chrome, info.sessionId, `performance.timeOrigin !== ${previousDocument} && document.readyState === 'complete' && document.querySelector('video')?.dataset.basemap === 'usgs-imagery-topo'`, 5000);
  assert.equal(info.current.loaded.filter(asset => /\.(webm|mp4)$/.test(asset.path)).length, 0, 'A reduced-motion map change or reload downloaded a video');
  await chrome.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] }, info.sessionId);
  await waitForExpression(chrome, info.sessionId, "document.querySelector('.feature__scenery').currentTime > .05", 15000);
  const movingPreview = await evaluate(chrome, info.sessionId, `(() => {
    const video = document.querySelector('.feature__scenery');
    return { duration: video.duration, width: video.videoWidth, height: video.videoHeight,
      muted: video.muted, inline: video.playsInline, loop: video.loop,
      action: document.querySelector('.feature__video-toggle').getAttribute('aria-label') };
  })()`);
  assert.equal(movingPreview.duration, 5);
  assert.equal(movingPreview.width, 960);
  assert.equal(movingPreview.height, 540);
  assert.equal(movingPreview.muted && movingPreview.inline && movingPreview.loop, true);
  assert.equal(movingPreview.action, "Pause flight preview");
  assert.equal(await evaluate(chrome, info.sessionId, "document.querySelector('video').currentSrc.includes('-usgs.webm') || document.querySelector('video').currentSrc.includes('-usgs.mp4')"), true);
  assert.equal(info.current.loaded.some(asset => /f35-westbound-umn\.(webm|mp4)$/.test(asset.path)), false, 'The unselected Google video downloaded');
  await evaluate(chrome, info.sessionId, "window.__mediaEvents=[]; for(const event of ['emptied','loadstart','loadedmetadata','loadeddata','seeking','seeked','pause']) document.querySelector('video').addEventListener(event,()=>{const v=document.querySelector('video');window.__mediaEvents.push({event,time:v.currentTime,source:v.currentSrc,ready:v.readyState});})");
  await evaluate(chrome, info.sessionId, "document.querySelector('.feature__video-toggle').click()");
  assert.equal(await evaluate(chrome, info.sessionId, "document.querySelector('.feature__scenery').paused"), true, "Pause button did not pause");
  await evaluate(chrome, info.sessionId, "document.querySelector('video').currentTime = 2");
  await waitForExpression(chrome, info.sessionId, "!document.querySelector('video').seeking && document.querySelector('video').readyState >= 2 && Math.abs(document.querySelector('video').currentTime-2)<.05", 5000);
  report.checks.beforeMapSwitch = await evaluate(chrome, info.sessionId, "({time:document.querySelector('video').currentTime,source:document.querySelector('video').currentSrc})");
  await evaluate(chrome, info.sessionId, "(() => {const select=document.querySelector('.feature__map-select'); select.value='google'; select.dispatchEvent(new Event('change'));})()");
  await waitForExpression(chrome, info.sessionId, "document.querySelector('video').readyState >= 2 && !document.querySelector('video').seeking && Math.abs(document.querySelector('video').currentTime-2)<.05", 5000);
  assert.equal(await evaluate(chrome, info.sessionId, "document.querySelector('video').paused"), true, 'Map switching lost the paused state');
  assert.equal(await evaluate(chrome, info.sessionId, "document.querySelector('.feature__map-credit').href"), 'https://www.google.com/help/legalnotices_maps/');
  await evaluate(chrome, info.sessionId, "document.querySelector('.feature__video-toggle').click()");
  await waitForExpression(chrome, info.sessionId, "!document.querySelector('.feature__scenery').paused", 5000);
  report.checks.hero = { reducedMotion: stillPreview, playback: movingPreview, pauseAndResume: true,
    basemap: { persisted:true, preservesOtherSettings:true, loadsOnlySelectedVideo:true, attribution:true, pausedComparison:true } };
  report.checks.videoLinks = await evaluate(chrome, info.sessionId, `(() => {
    const card=document.querySelector('.feature--world').getBoundingClientRect();
    const link=document.querySelector('.info-page__start');
    for(const [x,y] of [[.1,.15],[.5,.5],[.9,.8]]) {
      if(document.elementFromPoint(card.x+card.width*x,card.y+card.height*y)?.closest('a')!==link) throw Error('Video background does not link to Fly');
    }
    for(const element of document.querySelectorAll('.feature__world-controls button,.feature__map-select,.feature__map-credit')) {
      const r=element.getBoundingClientRect();
      if(!element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))) throw Error('Fly link covers a control');
    }
    const fly=document.querySelector('.feature__fly').getBoundingClientRect();
    if(Math.abs(fly.x+fly.width/2-card.x-card.width/2)>1) throw Error('Fly is not centered');
    return {background:true, independentControls:true, centered:true};
  })()`);
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
  const backgroundPoint = await evaluate(chrome, info.sessionId, "(() => {const r=document.querySelector('.feature--world').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
  await chrome.send('Input.dispatchMouseEvent', {type:'mousePressed',...backgroundPoint,button:'left',clickCount:1}, info.sessionId);
  await chrome.send('Input.dispatchMouseEvent', {type:'mouseReleased',...backgroundPoint,button:'left',clickCount:1}, info.sessionId);
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
  assert.equal(report.checks.fly.href, "/fly/?renderer=webgl2&set.map.source.basemap=google");
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
  report.videoFailureState = await Promise.all([...sessions.entries()].filter(([, current]) => current.label === 'info').map(async ([id, current]) => ({
    video: await evaluate(chrome, id, "(() => {const v=document.querySelector('video');return v && {source:v.currentSrc,time:v.currentTime,paused:v.paused,readyState:v.readyState,seeking:v.seeking,error:v.error?.message,basemap:v.dataset.basemap,selector:document.querySelector('select')?.value,sources:[...v.children].map(s=>s.src),saved:JSON.parse(localStorage.getItem('foss-earth.settings.v1'))?.values['map.source.basemap']};})()").catch(() => null),
    exceptions: current.exceptions,
    events: await evaluate(chrome, id, 'window.__mediaEvents').catch(() => null),
    media: current.loaded.filter(asset => /\.(webm|mp4)$/.test(asset.path)),
  })));
  failures.push(report.failure);
} finally {
  detach();
  await chrome.close();
}

await writeFile(path.join(out, "report.json"), JSON.stringify({ ...report, failures }, null, 2) + "\n");
process.stdout.write(JSON.stringify({ report: path.join(out, "report.json"), passed: report.passed, failure: report.failure, failures }, null, 2) + "\n");
if (!report.passed) process.exitCode = 1;
