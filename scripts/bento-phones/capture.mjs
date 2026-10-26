#!/usr/bin/env node
/**
 * Captures the real screens shown on the bento phones: the phone controller
 * paired live with a running flight, and two phones in one real multiplayer
 * session. Writes PNGs and a provenance record to build/bento-phones/captures/.
 *
 *   node scripts/bento-phones/capture.mjs [--only=remote|multiplayer] [--remote=fixture]
 *
 * It reuses a simulator dev server already listening on config.server.port, or
 * starts `npm run llm-dev` in ../fly on that port and stops it afterwards.
 * Pairing and invitation links are bearer credentials: they stay in memory and
 * are never printed or written. tune.mjs imports the session steps from here.
 * See docs/proposals/bento-phone-renderings.md.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '../..');
const workspace = path.resolve(site, '..');
const flyRoot = path.join(workspace, 'fly');
const browserTesting = path.resolve(workspace, '../foss-earth/browser-testing');
const out = path.join(site, 'build/bento-phones');
const capturesDir = path.join(out, 'captures');
export const config = JSON.parse(await readFile(path.join(here, 'config.json'), 'utf8'));
const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const only = arg('only');
const remoteMode = arg('remote') ?? 'live';
const chromeBinary = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const { openHeadlessChrome, evaluate } = await import(pathToFileURL(path.join(browserTesting, 'src/headlessChrome.mjs')));
const { deviceUserAgent } = await import(pathToFileURL(path.join(browserTesting, 'src/headlessPage.mjs')));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const secrets = new Set();
/** Removes keys, invitation fragments and pairing links from anything printed or saved. */
export const sanitize = value => {
  let text = String(value);
  for (const secret of secrets) if (secret) text = text.split(secret).join('[redacted]');
  return text.replace(/([?&](?:key|gkey)=)[^&\s"']+/gi, '$1[redacted]').replace(/#(?:[^\s"']*&)?(?:join|peer|mp)=[^\s"']*/g, '#[redacted]');
};
const logListeners = new Set();
/** Prints a sanitized progress line; tune.mjs also forwards it to its page. */
export const log = message => {
  const text = sanitize(message);
  console.log(text);
  for (const listener of logListeners) listener(text);
};
export const onLog = listener => { logListeners.add(listener); return () => logListeners.delete(listener); };

async function googleKey() {
  const names = ['GOOGLE_3D_TILES_KEY', 'FOSS_EARTH_GOOGLE_KEY'];
  for (const name of names) if (process.env[name]) return process.env[name];
  // The same local files the hero capture reads; nothing here is copied anywhere else.
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
    if (Date.now() > deadline || server.exitCode !== null) throw new Error(`The simulator server did not start (${probeStatus}); see build/bento-phones/server.log.`);
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
/** One isolated browser context per device, as separate phones and computers have separate storage. */
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
  const device = {
    name, sessionId, send, run,
    async navigate(url) { await send('Page.navigate', { url }); },
    async wait(expression, timeoutMs = 20000, label = expression) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        try { if (await run(expression)) return; } catch { /* Navigation in progress. */ }
        await sleep(200);
      }
      // What the page showed, for the person rerunning this: build/bento-phones/failed/.
      const failed = path.join(out, 'failed', `${name.replace(/\W+/g, '-')}.png`);
      await mkdir(path.dirname(failed), { recursive: true });
      await device.screenshot(failed).catch(() => {});
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
    async screenshot(file) {
      await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(file, Buffer.from(shot.data, 'base64'));
      return file;
    },
    /** Calls `listener(params)` on this device's `method` events, such as Page.screencastFrame; returns the unsubscribe. */
    on(method, listener) {
      return chrome.onEvent(message => { if (message.sessionId === sessionId && message.method === method) listener(message.params); });
    },
    async close() { await chrome.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {}); },
  };
  return device;
}

/** `set.<id>=<value>` parameters the flight reads at startup. */
function flightUrl(base, flight, extra = {}) {
  const date = new Date(flight.dateTime);
  const settings = {
    'osfs.aircraft.id': flight.aircraft, 'osfs.start.resume': false,
    'osfs.start.latitude': flight.latitude, 'osfs.start.longitude': flight.longitude,
    'osfs.start.heading': flight.headingDegrees, 'osfs.start.airspeed': flight.airspeedKnots, 'osfs.start.throttle': flight.throttle,
    'osfs.sound.enabled': false,
    'sky.time.mode': 'fixed', 'sky.time.date': date.toISOString().slice(0, 10),
    'sky.time.utcHours': date.getUTCHours() + date.getUTCMinutes() / 60,
    ...(flight.scenery === 'google' ? { 'map.source.basemap': 'google' } : {}),
    ...extra,
  };
  const url = new URL(`${base}/fly/`);
  for (const [id, value] of Object.entries(settings)) url.searchParams.set(`set.${id}`, String(value));
  return url.href;
}
const cameraSettings = camera => camera ? { 'osfs.camera.chaseDistance': camera.distanceMeters, 'osfs.camera.chaseHeight': camera.heightMeters } : {};

/** Whether a touch at these CSS pixels lands on the flight canvas rather than the HUD. */
export const onCanvas = (device, x, y) => device.run(`document.elementFromPoint(${x}, ${y})?.classList.contains('flight-app__canvas')`);

/**
 * Turns the chase camera as a pilot does on a phone: one-finger swipes across
 * open sky on the flight canvas, each `[dx, dy]` CSS pixels. The orbit follows
 * the finger 0.005 rad per pixel, so a long swipe goes in parts that keep the
 * finger on the sky and turn the camera just as far. Each move lands on whole
 * pixels and is reported to `onMove(dx, dy)`, so tune.mjs can follow the camera.
 */
export async function swipeCamera(device, swipes = [], { steps = 12, stepMs = 16, afterMs = 150, onMove } = {}) {
  const { width, height } = config.phone.viewport;
  const at = (total, part, parts) => Math.round(total * part / parts);
  for (const [totalX, totalY] of swipes) {
    const parts = Math.max(1, Math.ceil(Math.hypot(totalX, totalY) / 240));
    for (let part = 0; part < parts; part++) {
      const dx = at(totalX, part + 1, parts) - at(totalX, part, parts), dy = at(totalY, part + 1, parts) - at(totalY, part, parts);
      const x = Math.round(width / 2 - dx / 2), y = Math.round(height * 0.3 - dy / 2);
      if (!await onCanvas(device, x, y)) throw new Error(`${device.name}: the swipe would start on the HUD, not the flight canvas`);
      await device.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 7 }] });
      for (let step = 1; step <= steps; step++) {
        await device.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + at(dx, step, steps), y: y + at(dy, step, steps), id: 7 }] });
        onMove?.(at(dx, step, steps) - at(dx, step - 1, steps), at(dy, step, steps) - at(dy, step - 1, steps));
        if (stepMs) await sleep(stepMs);
      }
      await device.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      if (afterMs) await sleep(afterMs);
    }
  }
}

/**
 * Zooms the chase camera as a two-finger pinch does: the app scales the
 * camera's distance by the fingers' old spread over their new one, so spreading
 * comes closer. The fingers stay level about one point, so the camera does not
 * turn. Spreads are whole pixels; each step's factor goes to `onZoom(factor)`.
 */
export async function pinchCamera(device, factor, { steps = 6, stepMs = 0, onZoom } = {}) {
  const { width, height } = config.phone.viewport;
  const x = Math.round(width / 2), y = Math.round(height * 0.3);
  // Half the fingers' spread, in CSS pixels: from a little apart to well apart, all over open sky.
  const near = 60, far = 220;
  let left = factor;
  while (Math.abs(Math.log(left)) > 1e-3) {
    const [from, to] = left < 1 ? [near, Math.min(far, Math.round(near / left))] : [far, Math.max(near, Math.round(far / left))];
    if (from === to) break;
    for (const half of [from, to]) for (const side of [-1, 1]) {
      if (!await onCanvas(device, x + side * half, y)) throw new Error(`${device.name}: the pinch would touch the HUD, not the flight canvas`);
    }
    const fingers = half => [{ x: x - half, y, id: 1 }, { x: x + half, y, id: 2 }];
    await device.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(from) });
    let previous = from;
    for (let step = 1; step <= steps; step++) {
      const half = Math.round(from + (to - from) * step / steps);
      await device.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(half) });
      onZoom?.(previous / half);
      previous = half;
      if (stepMs) await sleep(stepMs);
    }
    await device.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    left /= from / to;
  }
}

const FLIGHT_READY = `Boolean(document.querySelector('.flight-app__canvas') && document.querySelector('.foss-earth-panel-launcher-button')
  && !document.querySelector('[aria-busy="true"]'))`;
/** The scenery download readout in the HUD, in MB/s; null when the HUD has none. */
const DOWNLOAD_RATE = `(() => { const chip = document.querySelector('.map-download-speed'); if (!chip) return null;
  const value = parseFloat(chip.textContent.replace(/[^0-9.]/g, '')); return Number.isFinite(value) ? value : null; })()`;

/** Waits until the flight is up and its scenery has stopped downloading for `quietMs`. */
export async function settle(device, { minMs, quietMs, maxMs }) {
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
/** Closes every open side panel so the screenshot shows the flight. */
async function closePanels(device) {
  await device.run(`(() => {
    for (const button of document.querySelectorAll('.foss-earth-tab-close')) if (button.offsetParent) button.click();
    return true;
  })()`);
  await sleep(400);
}

// ── Remote controller ─────────────────────────────────────────────────────
async function captureRemote(base) {
  const spec = config.captures.remote;
  const { width, height } = config.phone.viewport;
  const file = path.join(capturesDir, spec.file);
  if (remoteMode === 'fixture') return captureRemoteFixture(file);

  const desktop = await openDevice('desktop', { ...spec.desktop });
  // The controller asks once to go fullscreen; on a real phone the pilot answers it before flying.
  const phone = await openDevice('phone', { width, height, scale: config.phone.captureScale, phone: true,
    init: `try { localStorage.setItem('osfs.fullscreen-prompt-dismissed', '1'); } catch {}` });
  try {
    log('Remote: loading the desktop flight.');
    await desktop.navigate(flightUrl(base, spec.flight));
    const desktopSettle = await settle(desktop, { minMs: 2000, quietMs: 1000, maxMs: 20000 });
    await openPanelTab(desktop, 'Remote Control');
    await desktop.wait(`Boolean(document.querySelector('.phone-pairing [data-copy]') && !document.querySelector('.phone-pairing [data-copy]').hidden)`, 30000, 'a pairing link');
    // The page's own Copy link, caught in the page instead of the system clipboard.
    await desktop.run(`(navigator.clipboard.writeText = text => { window.__bentoPairing = text; return Promise.resolve(); }, true)`);
    await desktop.click('.phone-pairing [data-copy]');
    const pairing = await desktop.run('window.__bentoPairing');
    if (!pairing) throw new Error('The Remote Control tab gave no pairing link.');
    secrets.add(pairing);
    secrets.add(new URL(pairing).hash);
    const pairingOrigin = new URL(pairing).origin;
    log(`Remote: pairing the phone through ${new URL(pairing).pathname} on the server's network address.`);
    await phone.navigate(pairing);
    await phone.wait(`Boolean(document.querySelector('.phone-controls'))`, 30000, 'the phone controller');
    // Paired once the link chip is live: the controller is receiving the flight's status.
    const LINK = `document.querySelector('.phone-link')`;
    await phone.wait(`Boolean(${LINK}?.classList.contains('phone-link--live'))`, 60000, 'the live pairing');
    // Take control is a primary button until the phone flies, then a toggle that stays, pressed, beside Pause.
    if (spec.takeControl && !await phone.run(`${LINK}.textContent.includes('Phone priority')`)) {
      await phone.click('.phone-actions > button', 'Take control');
      await phone.wait(`${LINK}.textContent.includes('Phone priority')`, 15000, 'the phone to take control');
    }
    await sleep(spec.settleMs);
    let stick = null;
    if (spec.stick) {
      const pad = await phone.run(`(() => { const r = document.querySelector('.phone-cluster__pad > .phone-stick').getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, radius: Math.min(r.width, r.height) / 2 }; })()`);
      stick = { x: pad.x + spec.stick[0] * pad.radius, y: pad.y + spec.stick[1] * pad.radius };
      await phone.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pad.x, y: pad.y, id: 1 }] });
      for (let step = 1; step <= 6; step++) {
        await phone.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pad.x + (stick.x - pad.x) * step / 6, y: pad.y + (stick.y - pad.y) * step / 6, id: 1 }] });
        await sleep(30);
      }
      await sleep(500);
    }
    const state = await phone.run(`({
      buttons: [...document.querySelectorAll('.phone-actions > button')].map(button => button.textContent.trim()),
      readouts: document.querySelector('.phone-controls')?.innerText.replace(/\\s+/g, ' ').slice(0, 400),
    })`);
    await phone.screenshot(file);
    if (stick) await phone.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    log(`Remote: captured ${path.relative(site, file)}.`);
    return {
      file: path.relative(site, file), path: 'live-paired', pairing: `QR link from the desktop flight's Remote Control tab, opened on the emulated phone through ${pairingOrigin.replace(/\/\/[^:]+/, '//<LAN address>')}`,
      viewport: { ...config.phone.viewport, deviceScaleFactor: config.phone.captureScale }, desktopFlight: spec.flight, desktopSettle,
      tookControl: Boolean(spec.takeControl), stickFraction: spec.stick ?? null, phoneState: state,
    };
  } finally {
    await phone.close();
    await desktop.close();
  }
}

/**
 * The fallback when no live pairing is possible: rc's own layout harness renders
 * the real PhoneController with its fixture client (148 kt, 4250 ft, 271°,
 * phone flying, throttle 62%), and this screenshots its `flying` page.
 */
async function captureRemoteFixture(file) {
  const fixtureDir = path.join(out, 'rc-fixture');
  await mkdir(fixtureDir, { recursive: true });
  const render = spawnSync('npx', ['vitest', 'run', '--config', 'scripts/phone-layout/vitest.config.ts'],
    { cwd: path.join(workspace, 'rc'), encoding: 'utf8', env: { ...process.env, UI_LAYOUT_OUT: fixtureDir } });
  if (render.status !== 0) throw new Error(`rc's layout harness failed:\n${render.stdout}\n${render.stderr}`);
  const html = await readFile(path.join(fixtureDir, 'flying.html'), 'utf8');
  const { width, height } = config.phone.viewport;
  const phone = await openDevice('phone-fixture', { width, height, scale: config.phone.captureScale, phone: true });
  try {
    const { frameTree } = await phone.send('Page.getFrameTree');
    await phone.send('Page.setDocumentContent', { frameId: frameTree.frame.id, html });
    await sleep(400);
    await phone.screenshot(file);
  } finally { await phone.close(); }
  log(`Remote: captured the fixture ${path.relative(site, file)}.`);
  return { file: path.relative(site, file), path: 'fixture', fixture: '../rc/scripts/phone-layout/render.tsx client(false, "phone"), page "flying"',
    viewport: { ...config.phone.viewport, deviceScaleFactor: config.phone.captureScale } };
}

// ── Multiplayer ───────────────────────────────────────────────────────────
async function captureMultiplayer(base) {
  const spec = config.captures.multiplayer;
  const session = await startMultiplayer(base);
  try {
    // Paused, the chase cameras stay where the pilots turn them.
    await swipeCamera(session.host, spec.host.camera?.swipes);
    await swipeCamera(session.guest, spec.guest.camera?.swipes);
    return await shootMultiplayer(session);
  } finally { await session.close(); }
}

/**
 * Brings up the session up to the moment the pilots aim their cameras: both
 * phones connected, flown side by side for a moment and paused, panels closed,
 * the chase cameras where config's distance and height start them.
 */
export async function startMultiplayer(base = origin) {
  const spec = config.captures.multiplayer;
  const { width, height } = config.phone.viewport;
  const key = spec.host.flight.scenery === 'google' ? await googleKey() : null;
  if (spec.host.flight.scenery === 'google' && !key) throw new Error('Google 3D Tiles need GOOGLE_3D_TILES_KEY or a local .env.local key; none was found.');
  if (key) secrets.add(key);
  // Each phone keeps its own key in its own storage, as a pilot who configured scenery would.
  const init = `try { localStorage.setItem('osfs.fullscreen-prompt-dismissed', '1');
    ${key ? `localStorage.setItem('foss-earth.settings.v1', JSON.stringify({ version: 1, values: { 'map.source.googleKey': ${JSON.stringify(key)} } }));` : ''} } catch {}`;
  const host = await openDevice('host phone', { width, height, scale: config.phone.captureScale, phone: true, init });
  const guest = await openDevice('guest phone', { width, height, scale: config.phone.captureScale, phone: true, init });
  const close = async () => { await guest.close(); await host.close(); };
  try {
    log('Multiplayer: loading the host flight.');
    await host.navigate(flightUrl(base, spec.host.flight, cameraSettings(spec.host.camera)));
    await host.wait(FLIGHT_READY, 120000, 'the host flight');
    // Paused, the host keeps about its start speed, and the guest arrives beside it.
    await host.click('.flight-shell-pause-button');
    const hostLoad = await settle(host, spec.settle);
    await openPanelTab(host, 'Multiplayer');
    await host.click('.multiplayer-panel .flight-panel__command', 'Host flight');
    await host.wait(`Boolean(document.querySelector('.multiplayer-invitation__link')?.href)`, 30000, 'an invitation');
    const invitation = new URL(await host.run(`document.querySelector('.multiplayer-invitation__link').href`));
    secrets.add(invitation.href);
    secrets.add(invitation.hash);
    // The guest's aircraft, as the host's Set aircraft control writes it into the invitation.
    invitation.searchParams.set('set.osfs.aircraft.id', spec.guest.aircraft);
    for (const [id, value] of Object.entries({ ...cameraSettings(spec.guest.camera), 'osfs.sound.enabled': false,
      'sky.time.mode': 'fixed', 'sky.time.date': new Date(spec.host.flight.dateTime).toISOString().slice(0, 10),
      'sky.time.utcHours': new Date(spec.host.flight.dateTime).getUTCHours() + new Date(spec.host.flight.dateTime).getUTCMinutes() / 60,
      ...(spec.host.flight.scenery === 'google' ? { 'map.source.basemap': 'google' } : {}) })) invitation.searchParams.set(`set.${id}`, String(value));
    secrets.add(invitation.href);
    log('Multiplayer: the guest opens the invitation.');
    await guest.navigate(invitation.href);
    await guest.wait(FLIGHT_READY, 120000, 'the guest flight');
    await guest.wait(`[...document.querySelectorAll('.multiplayer-panel .flight-panel__command')].some(button => button.offsetParent && button.textContent.trim() === 'Join flight')`, 30000, 'Join flight');
    await guest.click('.multiplayer-panel .flight-panel__command', 'Join flight');
    await host.wait(`document.querySelector('.multiplayer-panel [role=status]')?.textContent.includes('connected')`, 45000, 'the host to see the guest');
    await guest.wait(`document.querySelector('.multiplayer-panel [role=status]')?.textContent.includes('connected')`, 45000, 'the guest to connect');
    log('Multiplayer: two pilots connected; waiting for scenery.');
    const status = {
      host: await host.run(`document.querySelector('.multiplayer-panel [role=status]').textContent`),
      guest: await guest.run(`document.querySelector('.multiplayer-panel [role=status]').textContent`),
      hostDetails: await host.run(`document.querySelector('.multiplayer-panel details p:last-child')?.textContent ?? ''`),
    };
    await closePanels(host);
    await closePanels(guest);
    const guestSettle = await settle(guest, spec.settle);
    // The guest's physics has not stepped since its spawn, so the pose it reports is still its old start.
    // Both pilots press Resume, fly together at the same speed for a moment, and pause again.
    const PAUSE = `document.querySelector('.flight-shell-pause-button')`;
    await Promise.all([host.run(`${PAUSE}.click()`), guest.run(`${PAUSE}.click()`)]);
    await sleep(spec.flyTogetherMs);
    await Promise.all([host.run(`${PAUSE}.click()`), guest.run(`${PAUSE}.click()`)]);
    const paused = { host: await host.run(`${PAUSE}.getAttribute('aria-label')`), guest: await guest.run(`${PAUSE}.getAttribute('aria-label')`) };
    return { spec, host, guest, key, status, hostLoad, guestSettle, paused, close };
  } catch (error) {
    await close();
    throw error;
  }
}

/**
 * Waits for the scenery the aimed cameras brought into view, screenshots both
 * phones and returns their provenance. `cameras` are the framings as config
 * would reproduce them; tune.mjs passes the ones the person chose.
 */
export async function shootMultiplayer(session, cameras = {}, how = 'live-session') {
  const { spec, host, guest } = session;
  const camera = { host: cameras.host ?? spec.host.camera, guest: cameras.guest ?? spec.guest.camera };
  const hostSettle = await settle(host, { ...spec.settle, minMs: 1500 });
  await settle(guest, { ...spec.settle, minMs: 500 });
  const hostFile = await host.screenshot(path.join(capturesDir, spec.host.file));
  const guestFile = await guest.screenshot(path.join(capturesDir, spec.guest.file));
  log(`Multiplayer: captured ${path.relative(site, hostFile)} and ${path.relative(site, guestFile)}.`);
  return {
    path: how, status: session.status, viewport: { ...config.phone.viewport, deviceScaleFactor: config.phone.captureScale },
    flewTogetherMs: spec.flyTogetherMs, pauseButtons: session.paused,
    host: { file: path.relative(site, hostFile), flight: spec.host.flight, camera: camera.host, load: session.hostLoad, settle: hostSettle },
    guest: { file: path.relative(site, guestFile), aircraft: spec.guest.aircraft, camera: camera.guest, settle: session.guestSettle,
      spawn: 'the app\'s own guest spawn beside the paused host' },
    googleKey: session.key ? 'local key in each emulated phone\'s storage only; not in the invitation (Include gkey stayed Off)' : null,
  };
}

// ── Browser and record ────────────────────────────────────────────────────
const profile = path.join(out, 'chrome-profile');
const capturesFile = path.join(capturesDir, 'captures.json');

/** Reuses or starts the simulator server, then opens Chrome; closeBrowser undoes both. */
export async function openBrowser({ server: needServer = true } = {}) {
  await mkdir(capturesDir, { recursive: true });
  const serverState = needServer ? await ensureServer() : 'not needed';
  chrome = await openHeadlessChrome(profile, chromeBinary, [
    '--ignore-certificate-errors', '--enable-unsafe-webgpu',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  ]);
  return { server: serverState, chrome: chrome.version.product, origin };
}
export async function closeBrowser() {
  if (chrome) await chrome.close().catch(() => {});
  chrome = null;
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  await stopServer();
}

/** Dates a capture with the revisions it was taken from, so one carried over by --only stays accurately dated. */
export function stamp(result) {
  const revisions = Object.fromEntries(['fly', 'rc', 'multiplayer', 'aircraft', 'F-35B', 'SF-50', '0sfs.github.io'].map(name => [name, revision(path.join(workspace, name))]));
  revisions['foss-earth/app'] = revision(path.resolve(workspace, '../foss-earth/app'));
  return { capturedAt: new Date().toISOString(), chrome: chrome?.version.product ?? null, revisions, ...result };
}
/** Writes captures.json with these captures replacing their earlier records. */
export async function saveCaptures(captures, fields = {}) {
  const previous = JSON.parse(await readFile(capturesFile, 'utf8').catch(() => '{}'));
  const report = { ...previous, ...fields, capturedAt: new Date().toISOString(), ...captures };
  await writeFile(capturesFile, sanitize(JSON.stringify(report, null, 2)) + '\n');
  log(`Wrote ${path.relative(site, capturesFile)}.`);
}

// ── Run ───────────────────────────────────────────────────────────────────
if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] ?? '')).href) {
  try {
    const { server: serverState, chrome: product } = await openBrowser({ server: !(remoteMode === 'fixture' && only === 'remote') });
    const captures = {};
    if (!only || only === 'remote') captures.remote = stamp(await captureRemote(origin));
    if (!only || only === 'multiplayer') captures.multiplayer = stamp(await captureMultiplayer(origin));
    await saveCaptures(captures, { tool: 'scripts/bento-phones/capture.mjs', server: serverState, chrome: product });
  } catch (error) {
    console.error(sanitize(error.stack ?? error));
    process.exitCode = 1;
  } finally {
    await closeBrowser();
  }
}
