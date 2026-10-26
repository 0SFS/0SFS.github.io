#!/usr/bin/env node
/**
 * Captures the screens for the bento laptop artwork: the real 0SFS flight in an
 * emulated 13-inch MacBook Air browser, paired through the flight's own Remote
 * Control link with an emulated phone that takes control, resumes the flight
 * and flies it. Both screens are captured in that one session; the phone's is
 * kept as a candidate beside the installed phone artwork. Writes PNGs and a
 * provenance record to build/bento-laptop/captures/.
 *
 *   node scripts/bento-laptop/capture.mjs
 *
 * It reuses a simulator dev server already listening on config.server.port, or
 * starts `npm run llm-dev` in ../fly on that port and stops it afterwards.
 * The Google key and the pairing link are bearer credentials: they stay in
 * memory and are never printed or written. The laptop's Remote Control panel,
 * whose QR code carries the link, is closed before its screen is captured.
 * See docs/proposals/bento-laptop-rendering.md.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pngSize, stitchPngRows } from './png.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '../..');
const workspace = path.resolve(site, '..');
const flyRoot = path.join(workspace, 'fly');
const browserTesting = path.resolve(workspace, '../foss-earth/browser-testing');
const out = path.join(site, 'build/bento-laptop');
const capturesDir = path.join(out, 'captures');
const config = JSON.parse(await readFile(path.join(here, 'config.json'), 'utf8'));
const scenario = JSON.parse(await readFile(path.join(site, config.flight.scenario), 'utf8'));
const chromeBinary = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const { openHeadlessChrome, evaluate } = await import(pathToFileURL(path.join(browserTesting, 'src/headlessChrome.mjs')));
const { deviceUserAgent } = await import(pathToFileURL(path.join(browserTesting, 'src/headlessPage.mjs')));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const secrets = new Set();
/** Removes keys, invitation fragments and pairing links from anything printed or saved. */
const sanitize = value => {
  let text = String(value);
  for (const secret of secrets) if (secret) text = text.split(secret).join('[redacted]');
  return text.replace(/([?&](?:key|gkey)=)[^&\s"']+/gi, '$1[redacted]').replace(/#(?:[^\s"']*&)?(?:join|peer|mp)=[^\s"']*/g, '#[redacted]');
};
const log = message => console.log(sanitize(message));

async function googleKey() {
  const names = ['GOOGLE_3D_TILES_KEY', 'FOSS_EARTH_GOOGLE_KEY'];
  for (const name of names) if (process.env[name]) return process.env[name];
  // The same local files the hero and phone captures read; nothing here is copied anywhere else.
  const files = [path.resolve(workspace, '../foss-earth/app/.env.local'), path.resolve(workspace, '../UMN-VR/tour/.env.local'), path.join(flyRoot, '.env.local')];
  const texts = await Promise.all(files.map(file => readFile(file, 'utf8').catch(() => '')));
  for (const name of names) for (const text of texts) {
    const match = text.match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.+)$`, 'm'));
    if (match) return match[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return null;
}

function revision(dir) {
  const git = args => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  const head = git(['rev-parse', '--short=12', 'HEAD']);
  if (head.status !== 0) return null;
  const dirty = git(['status', '--porcelain', '--untracked-files=no']).stdout.trim().split('\n').filter(Boolean).length;
  return { commit: head.stdout.trim(), modifiedFiles: dirty };
}

// ── Simulator server ──────────────────────────────────────────────────────
const port = Number(config.server.port);
const origin = `https://127.0.0.1:${port}`;
let server;
let probeStatus = 'not probed';
function reachable() {
  return new Promise(resolve => {
    const request = https.get(`${origin}/fly/`, { rejectUnauthorized: false, timeout: 4000 }, response => {
      probeStatus = `HTTP ${response.statusCode}`; response.resume(); resolve(response.statusCode < 400);
    });
    request.on('error', error => { probeStatus = error.code ?? error.message; resolve(false); });
    request.on('timeout', () => { request.destroy(); resolve(false); });
  });
}
async function ensureServer() {
  if (await reachable()) { log(`Using the simulator server already on port ${port}.`); return 'reused'; }
  log(`Starting the simulator dev server on port ${port} (npm run llm-dev).`);
  const serverLog = createWriteStream(path.join(out, 'server.log'));
  server = spawn('npm', ['run', 'llm-dev', '--', '--port', String(port)], { cwd: flyRoot, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', bytes => serverLog.write(sanitize(bytes)));
  const deadline = Date.now() + config.server.readyTimeoutMs;
  while (!await reachable()) {
    if (Date.now() > deadline || server.exitCode !== null) throw new Error(`The simulator server did not start (${probeStatus}); see build/bento-laptop/server.log.`);
    await sleep(250);
  }
  return 'started';
}
async function stopServer() {
  if (!server || server.exitCode !== null) return;
  try { process.kill(-server.pid, 'SIGTERM'); } catch { /* Already gone. */ }
  await Promise.race([new Promise(resolve => server.once('exit', resolve)), sleep(5000)]);
}

// ── Devices ───────────────────────────────────────────────────────────────
let chrome;
/** One isolated browser context per device, as a laptop and a phone have separate storage. */
async function openDevice(name, { width, height, scale = 1, phone = false, init = '' }) {
  const { browserContextId } = await chrome.send('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await chrome.send('Target.createTarget', { url: 'about:blank', browserContextId, newWindow: true });
  const { sessionId } = await chrome.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params = {}) => chrome.send(method, params, sessionId);
  await send('Runtime.enable');
  await send('Page.enable');
  if (phone) {
    await send('Emulation.setUserAgentOverride', deviceUserAgent(chrome.version.product, { model: config.phone.userAgentModel, mobile: true }));
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: phone,
    ...(phone ? { screenOrientation: { type: width > height ? 'landscapePrimary' : 'portraitPrimary', angle: width > height ? 90 : 0 } } : {}) });
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  if (init) await send('Page.addScriptToEvaluateOnNewDocument', { source: init });
  const run = expression => evaluate(chrome, sessionId, expression);
  // A marked page that loses its mark was reloaded, which ends its flight or its pairing.
  let marked = false;
  const reloaded = () => Object.assign(new Error(`${name}: the page reloaded`), { reloaded: true });
  const device = {
    name, width, height, scale, send, run,
    async navigate(url) { marked = false; await send('Page.navigate', { url }); },
    /** Marks the page on screen; from now on a reload fails every wait and check. */
    async mark() { await run('(window.__bentoPage = true)'); marked = true; },
    async check() { if (marked && !await run('window.__bentoPage === true').catch(() => false)) throw reloaded(); },
    async wait(expression, timeoutMs = 20000, label = expression) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        let state = null;
        try { state = await run(`({ ok: Boolean(${expression}), marked: window.__bentoPage === true })`); } catch { /* Navigation in progress. */ }
        if (state && marked && !state.marked) throw reloaded();
        if (state?.ok) return;
        await sleep(200);
      }
      // What the page showed, for the person rerunning this: build/bento-laptop/failed/.
      const failed = path.join(out, 'failed', `${name.replace(/\W+/g, '-')}.png`);
      await mkdir(path.dirname(failed), { recursive: true });
      await device.screenshot(failed, { scale: 0.5 }).catch(() => {});
      const text = await run(`document.body?.innerText.replace(/\\s+/g, ' ').slice(0, 600)`).catch(() => '');
      throw new Error(`${name}: timed out waiting for ${label}\n  page: ${path.relative(site, failed)}\n  text: ${text}`);
    },
    /** Clicks the first visible, enabled element matching `selector` whose text is `text` (when given), waiting for it. */
    async click(selector, text, timeoutMs = 20000) {
      const find = `[...document.querySelectorAll(${JSON.stringify(selector)})].find(element => element.offsetParent !== null && !element.disabled
        && (${JSON.stringify(text ?? null)} === null || element.textContent.trim() === ${JSON.stringify(text ?? '')}))`;
      await device.wait(`Boolean(${find})`, timeoutMs, `${selector}${text ? ` "${text}"` : ''}`);
      await run(`${find}.click()`);
    },
    /** Saves the viewport as one PNG at `scale` times its device pixels; for images well under 8 MiB. Returns when it was taken. */
    async screenshot(file, { scale: shotScale = 1 } = {}) {
      await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false,
        ...(shotScale === 1 ? {} : { clip: { x: 0, y: 0, width, height, scale: shotScale } }) });
      const at = Date.now();
      await writeFile(file, Buffer.from(shot.data, 'base64'));
      return at;
    },
    async touch(type, touchPoints) { await send('Input.dispatchTouchEvent', { type, touchPoints }); },
    async close() { await chrome.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {}); },
  };
  return device;
}

// ── The laptop's frame ────────────────────────────────────────────────────
// Each band of the laptop's screen stays under this many pixels, so its PNG
// fits one protocol message (8 MiB of base64) even for detailed scenery.
const BAND_PIXELS = 2_000_000;
// The page's next animation frame waits while the frame on screen is copied.
const HOLD_FRAMES = `new Promise(resolve => {
  const native = window.requestAnimationFrame;
  window.__bentoHeldFrames = { native, callbacks: [] };
  window.requestAnimationFrame = callback => { window.__bentoHeldFrames.callbacks.push(callback); return 0; };
  // One frame to draw what was already queued, one more for it to reach the screen.
  native.call(window, () => native.call(window, () => resolve(true)));
})`;
const RELEASE_FRAMES = `(() => {
  const held = window.__bentoHeldFrames;
  if (!held) return false;
  delete window.__bentoHeldFrames;
  window.requestAnimationFrame = held.native;
  for (const callback of held.callbacks) held.native.call(window, callback);
  return true;
})()`;

/**
 * Copies the laptop's screen as one lossless PNG of a single rendered frame.
 * A 2940 x 1838 frame of the city can exceed the 8 MiB the browser protocol
 * carries in one message, so the page holds its next animation frame, CSS
 * animations stand still, and the frame is copied in horizontal bands, twice.
 * Only when both copies match byte for byte are the bands joined, row for row:
 * then they are one frame. Returns null when the screen changed meanwhile.
 * `state()` reads the page while the frame is held.
 */
async function captureFrame(device, file, state) {
  const { width, height, scale } = device;
  const bands = Math.max(1, Math.ceil(width * height * scale * scale / BAND_PIXELS));
  await device.send('Animation.enable');
  await device.run(HOLD_FRAMES);
  await device.send('Animation.setPlaybackRate', { playbackRate: 0 });
  const heldAt = Date.now();
  try {
    const held = await state();
    const copies = [];
    for (let copy = 0; copy < 2; copy++) {
      const parts = [];
      for (let band = 0; band < bands; band++) {
        const y = Math.round(height * band / bands), next = Math.round(height * (band + 1) / bands);
        const shot = await device.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true,
          clip: { x: 0, y, width, height: next - y, scale: 1 } });
        const part = Buffer.from(shot.data, 'base64');
        const size = pngSize(part);
        if (size.width !== width * scale || size.height !== (next - y) * scale) {
          throw new Error(`a screen band came back ${size.width}x${size.height}, not ${width * scale}x${(next - y) * scale}`);
        }
        parts.push(part);
      }
      copies.push(parts);
    }
    if (!copies[0].every((part, index) => part.equals(copies[1][index]))) return null;
    await writeFile(file, stitchPngRows(copies[0]));
    return { heldAt, copiedMs: Date.now() - heldAt, bands, held };
  } finally {
    await device.send('Animation.setPlaybackRate', { playbackRate: 1 }).catch(() => {});
    await device.run(RELEASE_FRAMES).catch(() => {});
    await device.send('Animation.disable').catch(() => {});
  }
}

// ── The flight ────────────────────────────────────────────────────────────
const scene = scenario.scene;
/** `set.<id>` parameters the flight reads at startup: the hero scenario with this artwork's chase camera. */
function flightSettings() {
  const date = new Date(scene.dateTime);
  const camera = config.camera;
  return {
    'osfs.aircraft.id': config.flight.aircraft, 'osfs.start.resume': false,
    'osfs.start.latitude': scene.latitude, 'osfs.start.longitude': scene.longitude,
    'osfs.start.heightAboveGround': scene.heightAboveGroundMeters,
    'osfs.start.heading': scene.headingDegrees, 'osfs.start.airspeed': scene.airspeedKnots,
    'osfs.start.throttle': config.flight.throttle,
    'sky.time.mode': 'fixed', 'sky.time.date': date.toISOString().slice(0, 10),
    'sky.time.utcHours': date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600,
    ...(scene.scenery === 'google' ? { 'map.source.basemap': 'google' } : {}),
    'osfs.camera.chaseDistance': camera.distanceMeters, 'osfs.camera.chaseHeight': camera.heightMeters,
    'osfs.camera.fieldOfView': camera.fieldOfViewDegrees,
    ...config.flight.settings,
  };
}
function flightUrl(base, settings) {
  const url = new URL(`${base}/fly/`);
  for (const [id, value] of Object.entries(settings)) url.searchParams.set(`set.${id}`, String(value));
  // As in the hero capture: the query parameter picks the renderer's backend at startup.
  if (settings['renderer.mode']) url.searchParams.set('renderer', settings['renderer.mode']);
  return url.href;
}

const FLIGHT_READY = `Boolean(document.querySelector('.flight-app__canvas') && document.querySelector('.foss-earth-panel-launcher-button')
  && !document.querySelector('[aria-busy="true"]'))`;
/** The scenery download readout in the HUD, in MB/s; null when the HUD has none. */
const DOWNLOAD_RATE = `(() => { const value = parseFloat(document.querySelector('.map-download-speed .map-download-value')?.textContent ?? '');
  return Number.isFinite(value) ? value : null; })()`;
const LAPTOP_PAUSED = `document.querySelector('.flight-shell-pause-button')?.getAttribute('aria-pressed') === 'true'`;
const SHOWN = `element => { if (!element) return false; const box = element.getBoundingClientRect(), style = getComputedStyle(element);
  return box.width > 0 && box.height > 0 && box.right > 0 && box.bottom > 0 && box.left < innerWidth && box.top < innerHeight
    && style.visibility !== 'hidden' && Number(style.opacity) > 0; }`;
/** What the laptop's own screen says: its HUD, its scenery credit and its panels. */
const LAPTOP_STATE = `(() => {
  const shown = ${SHOWN};
  const text = selector => document.querySelector(selector)?.textContent.replace(/\\s+/g, ' ').trim() ?? null;
  const number = selector => { const value = parseFloat((text(selector) ?? '').replace(/[^0-9.+-]/g, '')); return Number.isFinite(value) ? value : null; };
  const credit = document.querySelector('.map-source-hud');
  const box = credit?.getBoundingClientRect();
  return {
    paused: ${LAPTOP_PAUSED},
    iasKnots: number('[data-metric="ias"]'), headingDegrees: number('[data-metric="hdg"]'), verticalSpeedFpm: number('[data-metric="vs"]'),
    fps: number('#flightFps'),
    scenery: credit ? {
      text: credit.innerText.replace(/\\s+/g, ' ').trim(), shown: shown(credit),
      logo: [...credit.querySelectorAll('img')].some(image => shown(image) && image.complete && image.naturalWidth > 0),
      warning: shown(credit.querySelector('.map-source-hud__warning')),
      box: [box.left, box.top, box.width, box.height].map(Math.round),
    } : null,
    renderer: text('.hud-chip--gpu'),
    openPanels: [...document.querySelectorAll('.foss-earth-tab-button')].filter(shown).map(tab => tab.textContent.trim()),
    pairingPanelShown: shown(document.querySelector('.phone-pairing')),
    viewport: [innerWidth, innerHeight, devicePixelRatio],
  };
})()`;
const LAPTOP_PAIRING_STATUS = `document.querySelector('.phone-pairing [data-status]')?.textContent.trim() ?? null`;
/** What the phone's own screen says: its link chip, the flight readouts it receives, its pause button. */
const PHONE_STATE = `(() => {
  const chip = document.querySelector('.phone-link');
  const pause = document.querySelector('.phone-pause');
  const tapes = [...document.querySelectorAll('.phone-actions .flight-hud__tape')].map(tape =>
    [tape.querySelector('.flight-hud__label')?.textContent.trim(), Number(tape.querySelector('.flight-hud__value')?.textContent)]);
  return {
    link: chip ? [...chip.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim() : null,
    status: chip?.querySelector('[role="status"]')?.textContent.trim() ?? null,
    live: Boolean(chip?.classList.contains('phone-link--live')),
    paused: pause ? pause.getAttribute('aria-pressed') === 'true' : null,
    readouts: Object.fromEntries(tapes),
  };
})()`;
const PHONE_LIVE = `(() => { const chip = document.querySelector('.phone-link');
  return Boolean(chip?.classList.contains('phone-link--live') && chip.textContent.includes('Phone priority')); })()`;

/** Waits until the flight is up and its scenery has stopped downloading for `quietMs`. */
async function settle(device, { minMs, quietMs, maxMs }) {
  const start = Date.now();
  await device.wait(FLIGHT_READY, 120000, 'the flight to finish loading');
  let quietSince = null;
  while (Date.now() - start < maxMs) {
    const rate = await device.run(DOWNLOAD_RATE).catch(() => null);
    if (rate === 0 || rate === null) quietSince ??= Date.now(); else quietSince = null;
    if (Date.now() - start >= minMs && quietSince !== null && Date.now() - quietSince >= quietMs) return { settledMs: Date.now() - start, quiet: true };
    await sleep(250);
  }
  return { settledMs: Date.now() - start, quiet: false };
}

/** Opens a tab of the flight's side panel by its label. */
async function openPanelTab(device, label) {
  const open = await device.run(`[...document.querySelectorAll('.foss-earth-tab-button')].some(tab => tab.offsetParent && tab.textContent.trim() === ${JSON.stringify(label)})`);
  if (open) { await device.click('.foss-earth-tab-button', label); return; }
  await device.click('.foss-earth-panel-launcher-button');
  await device.wait(`[...document.querySelectorAll('.foss-earth-new-tab-choice')].some(choice => choice.offsetParent)`, 5000, 'the new-tab menu');
  await device.click('.foss-earth-new-tab-choice', label);
}
/** Closes every open side panel so the screen shows the flight. */
async function closePanels(device) {
  await device.run(`(() => {
    for (const button of document.querySelectorAll('.foss-earth-tab-close')) if (button.offsetParent) button.click();
    return true;
  })()`);
  await sleep(400);
}

/** Where the phone's pitch/roll pad is, in CSS pixels. */
const stickPad = phone => phone.run(`(() => { const r = document.querySelector('.phone-cluster__pad > .phone-stick').getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, radius: Math.min(r.width, r.height) / 2 }; })()`);
/** Puts a finger on the phone's stick and moves it to `[x, y]`, fractions of the pad's radius (+x right, +y down). */
async function holdStick(phone, pad, [fx, fy]) {
  const target = { x: pad.x + fx * pad.radius, y: pad.y + fy * pad.radius };
  await phone.touch('touchStart', [{ x: pad.x, y: pad.y, id: 1 }]);
  for (let step = 1; step <= 6; step++) {
    await phone.touch('touchMove', [{ x: pad.x + (target.x - pad.x) * step / 6, y: pad.y + (target.y - pad.y) * step / 6, id: 1 }]);
    await sleep(16);
  }
}
const releaseStick = phone => phone.touch('touchEnd', []);

/** Presses the phone's own pause button and waits for the laptop to follow. */
async function phoneSetPaused(phone, laptop, paused) {
  if ((await phone.run(PHONE_STATE)).paused === paused) return;
  await phone.click('.phone-pause');
  await laptop.wait(`(${LAPTOP_PAUSED}) === ${paused}`, 10000, `the laptop to ${paused ? 'pause' : 'resume'} from the phone`);
  await phone.wait(`document.querySelector('.phone-pause')?.getAttribute('aria-pressed') === '${paused}'`, 10000, `the phone to show the flight ${paused ? 'paused' : 'flying'}`);
}

const headingTurn = (from, to) => ((to - from + 540) % 360) - 180;

/**
 * The dev server prepares a dependency the first time a page imports it and
 * then reloads every open page, which ends a pairing: an invitation pairs once.
 * So the controller is opened once on its own, until it stays up, before the
 * flight loads. Returns how many loads that took.
 */
async function prepareController(base) {
  const page = await openDevice('controller-warm-up', { ...config.phone.viewport, phone: true,
    init: `try { localStorage.setItem('osfs.fullscreen-prompt-dismissed', '1'); } catch {}` });
  try {
    await page.navigate(`${base}/rc/`);
    for (let loads = 1; loads <= 5; loads++) {
      await page.wait(`Boolean(document.querySelector('.phone-app'))`, 60000, 'the controller page');
      await page.mark();
      await sleep(4000);
      try { await page.check(); return loads; } catch (error) { if (!error.reloaded) throw error; }
      await page.navigate(`${base}/rc/`);
    }
    throw new Error('The controller page kept reloading on the dev server.');
  } finally {
    await page.close();
  }
}

// ── Capture ───────────────────────────────────────────────────────────────
async function capture(base) {
  const spec = config.pairing;
  const key = scene.scenery === 'google' ? await googleKey() : null;
  if (scene.scenery === 'google' && !key) throw new Error('Google 3D Tiles need GOOGLE_3D_TILES_KEY or a local .env.local key; none was found.');
  if (key) secrets.add(key);
  // The laptop keeps the key in its own storage, as a pilot who set up the scenery would; the phone never sees it.
  const laptopInit = key ? `try { if (location.pathname.startsWith('/fly/')) localStorage.setItem('foss-earth.settings.v1', JSON.stringify({ version: 1, values: { 'map.source.googleKey': ${JSON.stringify(key)} } })); } catch {}` : '';
  const laptop = await openDevice('laptop', { ...config.laptop.viewport, scale: config.laptop.deviceScaleFactor, init: laptopInit });
  // The controller asks once to go fullscreen; on a real phone the pilot answers it before flying.
  const phone = await openDevice('phone', { ...config.phone.viewport, scale: config.phone.captureScale, phone: true,
    init: `try { localStorage.setItem('osfs.fullscreen-prompt-dismissed', '1'); } catch {}` });
  const steps = [];
  const step = (name, details) => { steps.push({ at: new Date().toISOString(), step: name, ...details }); log(`  ✓ ${name}`); };
  try {
    // The flight, paused as soon as it is up so it waits over the campus while the scenery streams in.
    const settings = flightSettings();
    log(`Laptop: loading the ${config.flight.aircraft} at ${scene.latitude}, ${scene.longitude}, sky time ${scene.dateTime}, ${scene.scenery} scenery.`);
    await laptop.navigate(flightUrl(base, settings));
    await laptop.wait(FLIGHT_READY, 120000, 'the flight to finish loading');
    await laptop.click('.flight-shell-pause-button');
    await laptop.wait(LAPTOP_PAUSED, 5000, 'the laptop flight to pause');
    await laptop.mark();
    const loaded = await settle(laptop, config.settle);
    const atLoad = await laptop.run(LAPTOP_STATE);
    if (scene.scenery === 'google' && !/3D Tiles/i.test(atLoad.scenery?.text ?? '')) {
      throw new Error(`Google 3D Tiles did not come up (scenery chip: ${atLoad.scenery?.text ?? 'none'}); refusing a substitute.`);
    }
    step('laptop flight loaded and paused by the laptop', { settle: loaded, laptop: atLoad });

    // Pairing, as a pilot does it: the Remote Control tab's link, opened on the phone.
    log('Pairing: the laptop\'s Remote Control tab, Copy link, opened on the phone.');
    await openPanelTab(laptop, 'Remote Control');
    await laptop.wait(`Boolean(document.querySelector('.phone-pairing [data-copy]') && !document.querySelector('.phone-pairing [data-copy]').hidden)`, 30000, 'a pairing link');
    // The page's own Copy link, caught in the page instead of the system clipboard.
    await laptop.run(`(navigator.clipboard.writeText = text => { window.__bentoPairing = text; return Promise.resolve(); }, true)`);
    await laptop.click('.phone-pairing [data-copy]');
    const pairing = await laptop.run('window.__bentoPairing');
    if (!pairing) throw new Error('The Remote Control tab gave no pairing link.');
    secrets.add(pairing);
    secrets.add(new URL(pairing).hash);
    await laptop.run('delete window.__bentoPairing');
    const pairingVia = `${new URL(pairing).protocol}//<LAN address>:${new URL(pairing).port}${new URL(pairing).pathname}`;
    await phone.navigate(pairing);
    await phone.wait(`Boolean(document.querySelector('.phone-controls'))`, 30000, 'the phone controller');
    await phone.mark();
    await phone.wait(`Boolean(document.querySelector('.phone-link')?.classList.contains('phone-link--live'))`, 60000, 'the live pairing');
    step('phone paired through the Remote Control link', { via: pairingVia, phone: await phone.run(PHONE_STATE), laptopStatus: await laptop.run(LAPTOP_PAIRING_STATUS) });

    await phone.click('.phone-actions > button', 'Take control');
    await phone.wait(PHONE_LIVE, 15000, 'the phone to take control');
    await laptop.wait(`(${LAPTOP_PAIRING_STATUS} ?? '').startsWith('Phone priority')`, 15000, 'the laptop to report phone priority');
    const tookControl = { phone: await phone.run(PHONE_STATE), laptopStatus: await laptop.run(LAPTOP_PAIRING_STATUS), laptop: await laptop.run(LAPTOP_STATE) };
    step('phone took control', tookControl);

    // Telemetry: the paused flight's readouts on the phone are the laptop's.
    const telemetry = {
      phoneHeading: tookControl.phone.readouts.HDG, laptopHeading: tookControl.laptop.headingDegrees,
      phoneAirspeed: tookControl.phone.readouts.IAS, laptopAirspeed: tookControl.laptop.iasKnots,
    };
    telemetry.agrees = Math.abs(headingTurn(telemetry.laptopHeading, telemetry.phoneHeading)) <= 1 && Math.abs(telemetry.phoneAirspeed - telemetry.laptopAirspeed) <= 2;
    step('phone shows the laptop\'s heading and airspeed', telemetry);
    if (!telemetry.agrees) throw new Error('The phone\'s readouts do not match the laptop\'s HUD.');

    // The laptop's screen as its pilot sees it: panels closed, the QR code with them.
    await closePanels(laptop);
    const closed = await laptop.run(LAPTOP_STATE);
    if (closed.openPanels.length || closed.pairingPanelShown) throw new Error(`Panels still open on the laptop: ${closed.openPanels.join(', ') || 'Remote Control'}.`);
    await phone.wait(PHONE_LIVE, 10000, 'the pairing to outlive the closed panel');
    const resettled = await settle(laptop, { ...config.settle, minMs: config.settle.quietMs });
    step('laptop panels closed; the phone stays paired with priority', { settle: resettled, laptop: closed, phone: await phone.run(PHONE_STATE) });

    // The phone resumes the flight and both screens are captured while it flies.
    const pad = await stickPad(phone);
    await phoneSetPaused(phone, laptop, false);
    step('phone resumed the laptop\'s flight', { laptopPaused: await laptop.run(LAPTOP_PAUSED) });
    // Written under pending names, and given their own only when the whole session passes.
    const laptopFile = path.join(capturesDir, `pending-${config.captures.laptop}`);
    const phoneFile = path.join(capturesDir, `pending-${config.captures.phone}`);
    // The laptop's frame rate readout averages half-second windows, and its first after the pause spans the pause.
    await laptop.wait(`(${LAPTOP_STATE}).fps >= 1`, spec.fpsTimeoutMs, 'the flying laptop\'s frame rate readout');
    let shot = null, phoneAt, phoneState, attempts = 0;
    while (!shot && attempts < spec.captureAttempts) {
      attempts++;
      if (spec.captureStick) await holdStick(phone, pad, spec.captureStick);
      await sleep(spec.captureDelayMs);
      phoneAt = await phone.screenshot(phoneFile);
      phoneState = await phone.run(PHONE_STATE);
      shot = await captureFrame(laptop, laptopFile, () => laptop.run(LAPTOP_STATE));
      if (spec.captureStick) await releaseStick(phone);
      if (!shot) log(`  The laptop's screen changed while it was being copied (attempt ${attempts}); trying again.`);
    }
    if (!shot) throw new Error(`The laptop's screen never held still for a whole copy in ${attempts} attempts.`);
    await laptop.check();
    await phone.check();
    const laptopState = shot.held;
    const apartMs = shot.heldAt - phoneAt;
    const problems = [
      laptopState.paused && 'the laptop was paused',
      (laptopState.openPanels.length || laptopState.pairingPanelShown) && 'a panel was open on the laptop',
      scene.scenery === 'google' && !(laptopState.scenery?.shown && laptopState.scenery.logo) && 'the scenery credit was not shown',
      laptopState.scenery?.warning && 'the scenery credit showed a warning',
      !(phoneState.live && phoneState.link === 'Phone priority') && 'the phone was not live with priority',
      phoneState.paused && 'the phone showed the flight paused',
      apartMs > spec.captureWindowMs && `the screens were captured ${apartMs} ms apart`,
    ].filter(Boolean);
    if (problems.length) throw new Error(`Capture rejected: ${problems.join('; ')}.`);
    step('captured the phone, then the laptop, while the phone flew', { apartMs, attempts, laptopBands: shot.bands, laptopCopyMs: shot.copiedMs, laptop: laptopState, phone: phoneState });

    // Control: the phone's stick rolls the laptop's aircraft right until its heading turns, then back left as long.
    const before = await laptop.run(LAPTOP_STATE);
    const rollStart = Date.now();
    await holdStick(phone, pad, [spec.roll, 0]);
    let afterRight = before;
    while (Date.now() - rollStart < spec.rollTimeoutMs && !(headingTurn(before.headingDegrees, afterRight.headingDegrees) >= spec.minHeadingChangeDegrees)) {
      await sleep(200);
      afterRight = await laptop.run(LAPTOP_STATE);
    }
    const heldMs = Date.now() - rollStart;
    await releaseStick(phone);
    await holdStick(phone, pad, [-spec.roll, 0]);
    await sleep(heldMs);
    await releaseStick(phone);
    await sleep(400);
    const afterLeft = await laptop.run(LAPTOP_STATE);
    const turned = headingTurn(before.headingDegrees, afterRight.headingDegrees);
    step('phone stick turned the laptop\'s aircraft', { stick: spec.roll, heldMs, headingBefore: before.headingDegrees,
      headingAfterRightRoll: afterRight.headingDegrees, headingAfterLeftRoll: afterLeft.headingDegrees, turnedRightDegrees: turned,
      laptopFps: afterRight.fps });
    if (!(turned >= spec.minHeadingChangeDegrees)) throw new Error(`The phone's right roll turned the laptop's heading ${turned}° in ${heldMs} ms, not at least ${spec.minHeadingChangeDegrees}° right.`);
    await phoneSetPaused(phone, laptop, true);
    await laptop.check();
    await phone.check();
    const end = { laptop: await laptop.run(LAPTOP_STATE), phone: await phone.run(PHONE_STATE) };
    if (!end.laptop.paused || !end.phone.live) throw new Error('The session did not end paused and paired.');
    step('phone paused the laptop\'s flight; still paired', end);

    const laptopSize = pngSize(await readFile(laptopFile));
    const phoneSize = pngSize(await readFile(phoneFile));
    const laptopKept = path.join(capturesDir, config.captures.laptop), phoneKept = path.join(capturesDir, config.captures.phone);
    await rename(laptopFile, laptopKept);
    await rename(phoneFile, phoneKept);
    log(`Laptop: ${path.relative(site, laptopKept)} (${laptopSize.width}x${laptopSize.height}, ${shot.bands} bands of one held frame).`);
    log(`Phone: ${path.relative(site, phoneKept)} (${phoneSize.width}x${phoneSize.height}).`);
    return {
      laptop: {
        file: path.relative(site, laptopKept), capturedAt: new Date(shot.heldAt).toISOString(), pixels: [laptopSize.width, laptopSize.height],
        device: config.laptop.label, viewport: { ...config.laptop.viewport, deviceScaleFactor: config.laptop.deviceScaleFactor },
        copy: `${shot.bands} horizontal bands of one held frame, copied twice and identical, joined row for row`, state: laptopState,
      },
      phone: {
        file: path.relative(site, phoneKept), capturedAt: new Date(phoneAt).toISOString(), pixels: [phoneSize.width, phoneSize.height],
        viewport: { ...config.phone.viewport, deviceScaleFactor: config.phone.captureScale }, userAgentModel: config.phone.userAgentModel,
        stick: spec.captureStick ?? null, state: phoneState,
        use: 'a candidate from the same pairing as the laptop capture; public/media/bento-remote-phone.webp is a separate, earlier session',
      },
      flight: {
        scenario: config.flight.scenario, settings, externalTanks: 'none: a fresh flight (osfs.start.resume=false) starts the F-35B without them',
      },
      pairing: {
        via: pairingVia,
        session: 'one pairing from Take control to the end; the screenshots and every check below belong to it',
        steps,
      },
      googleKey: key ? 'given to the laptop page through its own storage; never in a URL, log or file' : null,
    };
  } catch (error) {
    error.steps = steps;
    throw error;
  } finally {
    await phone.close();
    await laptop.close();
  }
}

// ── Run ───────────────────────────────────────────────────────────────────
const profile = path.join(out, 'chrome-profile-capture');
// The server runs in its own process group, so an interrupt would not reach it: stop it and the browser first.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    console.error(`Interrupted (${signal}); stopping the browser and the simulator server.`);
    if (chrome) await chrome.close().catch(() => {});
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
    await stopServer();
    process.exit(130);
  });
}
try {
  await mkdir(capturesDir, { recursive: true });
  const serverState = await ensureServer();
  await rm(profile, { recursive: true, force: true });
  chrome = await openHeadlessChrome(profile, chromeBinary, [
    '--ignore-certificate-errors', '--enable-unsafe-webgpu',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  ]);
  const controllerLoads = await prepareController(origin);
  log(`Controller page ready on the dev server (${controllerLoads} load${controllerLoads === 1 ? '' : 's'}).`);
  // A dependency only the flight's later steps import can still reload the pages once; then the whole session runs again.
  let result;
  for (let session = 1; !result; session++) {
    try {
      result = await capture(origin);
    } catch (error) {
      if (!error.reloaded || session >= 2) throw error;
      log(`${error.message} (the dev server prepared a dependency); starting the session again.`);
    }
  }
  const revisions = Object.fromEntries(['fly', 'rc', 'aircraft', 'F-35B', 'F135', '0sfs.github.io'].map(name => [name, revision(path.join(workspace, name))]));
  revisions['foss-earth/app'] = revision(path.resolve(workspace, '../foss-earth/app'));
  const report = { tool: 'scripts/bento-laptop/capture.mjs', capturedAt: new Date().toISOString(), server: serverState, chrome: chrome.version.product, revisions, ...result };
  const file = path.join(capturesDir, 'captures.json');
  await writeFile(file, sanitize(JSON.stringify(report, null, 2)) + '\n');
  log(`Wrote ${path.relative(site, file)}.`);
} catch (error) {
  console.error(sanitize(error.stack ?? error));
  process.exitCode = 1;
  // What the failed session did and showed, for the person rerunning this.
  const failed = path.join(out, 'failed');
  await mkdir(failed, { recursive: true });
  if (error.steps) await writeFile(path.join(failed, 'steps.json'), sanitize(JSON.stringify(error.steps, null, 2)) + '\n');
  for (const name of Object.values(config.captures)) await rename(path.join(capturesDir, `pending-${name}`), path.join(failed, name)).catch(() => {});
  console.error(`See ${path.relative(site, failed)}/.`);
} finally {
  if (chrome) await chrome.close().catch(() => {});
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  await stopServer();
}
