#!/usr/bin/env node
/**
 * A page for framing the multiplayer phones' chase cameras by hand.
 *
 *   node scripts/bento-phones/tune.mjs [--port=7489] [--no-open]
 *
 * It brings up the same live two-phone session as capture.mjs, at config's
 * framings, and serves both phones' screens live on http://127.0.0.1:7489/.
 * Dragging a screen orbits that phone's camera as a finger on the phone does;
 * scrolling or the buttons pinch it closer or farther. Capture & render
 * screenshots both phones as they are, writes their framings to config.json
 * (distance and height to start at, one swipe to turn) so capture.mjs takes
 * the same pictures, and reruns render.mjs. Done, or Ctrl-C, closes Chrome and
 * the simulator server if this started it. The page is served on loopback
 * only; the session's key and invitation never reach it.
 */
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  closeBrowser, config, log, onLog, openBrowser, pinchCamera, sanitize, saveCaptures, shootMultiplayer, stamp, startMultiplayer, swipeCamera,
} from './capture.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '../..');
const configFile = path.join(here, 'config.json');
const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const port = Number(arg('port') ?? 7489);

// The app's chase camera (aircraft/src/createPlaceholderAircraft.ts, controls/src/flightCameraInput.ts):
// a finger turns it 0.005 rad per pixel at the default touch sensitivity of 1, the orbit pitch stays within
// osfs.camera.orbitPitchLimits and the distance within osfs.camera.chaseZoomLimits, both at their defaults.
const ORBIT = 0.005;
const PITCH = { min: -60 * Math.PI / 180, max: 81 * Math.PI / 180 };
const RADIUS = { min: 8, max: 500 };
const clamp = (value, { min, max }) => Math.min(max, Math.max(min, value));
const spec = config.captures.multiplayer;
const aircraftName = id => ({ 'f-35b': 'F-35B', 'cirrus-vision-jet': 'Vision Jet' })[id] ?? id;
const label = { host: `Left phone · ${aircraftName(spec.host.flight.aircraft)}, hosting`, guest: `Right phone · ${aircraftName(spec.guest.aircraft)}, joined` };

// ── The cameras ───────────────────────────────────────────────────────────
/** What the app's chase camera is doing, followed move by move from the gestures sent to it. */
function follow(camera) {
  const pitch0 = Math.atan2(camera.heightMeters, camera.distanceMeters);
  return { pitch0, radius: clamp(Math.hypot(camera.distanceMeters, camera.heightMeters), RADIUS), yaw: 0, pitch: pitch0 };
}
const orbit = (camera, dx, dy) => { camera.yaw += dx * ORBIT; camera.pitch = clamp(camera.pitch + dy * ORBIT, PITCH); };
const zoom = (camera, factor) => { camera.radius = clamp(camera.radius * factor, RADIUS); };

/**
 * The config framing that reproduces `camera`: the same start pitch at the new
 * distance, then one swipe for the turn. Tenths of a metre move the camera
 * under 8 cm; whole pixels turn it under 0.3°.
 */
function framing(camera) {
  const distanceMeters = +(camera.radius * Math.cos(camera.pitch0)).toFixed(1);
  const heightMeters = +(camera.radius * Math.sin(camera.pitch0)).toFixed(1);
  const yaw = Math.atan2(Math.sin(camera.yaw), Math.cos(camera.yaw));
  const swipe = [Math.round(yaw / ORBIT), Math.round((camera.pitch - Math.atan2(heightMeters, distanceMeters)) / ORBIT)];
  return { distanceMeters, heightMeters, swipes: swipe[0] || swipe[1] ? [swipe] : [] };
}
const describe = camera => ({
  radius: +camera.radius.toFixed(2),
  pitchDegrees: +(camera.pitch * 180 / Math.PI).toFixed(1),
  yawDegrees: +(Math.atan2(Math.sin(camera.yaw), Math.cos(camera.yaw)) * 180 / Math.PI).toFixed(1),
  framing: framing(camera),
});

/** Rewrites the two multiplayer camera lines in config.json, leaving the rest of its layout alone. */
async function saveFramings(framings) {
  const text = await readFile(configFile, 'utf8');
  const line = camera => `"camera": { "distanceMeters": ${camera.distanceMeters}, "heightMeters": ${camera.heightMeters}, "swipes": [${camera.swipes.map(swipe => `[${swipe.join(', ')}]`).join(', ')}] }`;
  const order = [framings.host, framings.guest];
  let count = 0;
  const next = text.replace(/"camera": \{ "distanceMeters": [^}]*\}/g, match => (count < order.length ? line(order[count++]) : match));
  const parsed = JSON.parse(next);
  const written = parsed.captures.multiplayer;
  if (count !== 2 || JSON.stringify(written.host.camera) !== JSON.stringify(framings.host) || JSON.stringify(written.guest.camera) !== JSON.stringify(framings.guest)) {
    throw new Error('config.json no longer has the two multiplayer camera lines this expects; nothing was written.');
  }
  await writeFile(configFile, next);
  spec.host.camera = framings.host;
  spec.guest.camera = framings.guest;
}

// ── The page's connection ─────────────────────────────────────────────────
const clients = new Set();
const lastFrame = {};
const lines = [];
let phase = 'starting';
let problem = null;
let renders = null;
const phones = {};
const send = (client, event, data) => client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
const broadcast = (event, data) => { for (const client of clients) send(client, event, data); };
const state = () => ({
  phase, problem, renders, label, viewport: config.phone.viewport,
  phones: Object.fromEntries(Object.entries(phones).map(([name, phone]) => [name, { ...describe(phone.camera), start: phone.start, moving: phone.moving }])),
});
const publish = () => broadcast('state', state());
onLog(text => { lines.push(text); lines.splice(0, lines.length - 40); broadcast('log', text); });

// ── Gestures ──────────────────────────────────────────────────────────────
/** Sends what the page asked for since the last gesture as one swipe and one pinch, so a fast drag never queues up. */
async function pump(phone) {
  if (phone.moving) return;
  phone.moving = true;
  try {
    while (phase === 'ready' && (phone.pending.reset || Math.abs(phone.pending.dx) >= 1 || Math.abs(phone.pending.dy) >= 1 || phone.pending.zoom !== 1)) {
      if (phone.pending.reset) {
        // Back to where config started it, the short way round.
        const { camera, startCamera: start } = phone, turn = start.yaw - camera.yaw;
        phone.pending = { dx: Math.atan2(Math.sin(turn), Math.cos(turn)) / ORBIT, dy: (start.pitch - camera.pitch) / ORBIT, zoom: start.radius / camera.radius };
      }
      const dx = Math.round(phone.pending.dx), dy = Math.round(phone.pending.dy), factor = phone.pending.zoom;
      phone.pending = { dx: phone.pending.dx - dx, dy: phone.pending.dy - dy, zoom: 1 };
      if (dx || dy) await swipeCamera(phone.device, [[dx, dy]], { steps: 3, stepMs: 0, afterMs: 0, onMove: (x, y) => orbit(phone.camera, x, y) });
      if (factor !== 1) await pinchCamera(phone.device, factor, { onZoom: step => zoom(phone.camera, step) });
      publish();
    }
  } catch (error) {
    log(`${phone.device.name}: ${error.message}`);
  } finally {
    phone.moving = false;
    publish();
  }
}
const idle = async () => { while (Object.values(phones).some(phone => phone.moving)) await new Promise(resolve => setTimeout(resolve, 50)); };

/** Streams a phone's screen to the page as JPEG frames, a quarter of the captured pixels. */
async function watch(name, phone) {
  phone.device.on('Page.screencastFrame', ({ data, sessionId }) => {
    phone.device.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    lastFrame[name] = data;
    broadcast('frame', { phone: name, data });
  });
  const { width, height } = config.phone.viewport;
  await phone.device.send('Page.startScreencast', { format: 'jpeg', quality: 75, maxWidth: width, maxHeight: height });
}

// ── Capture and render ────────────────────────────────────────────────────
function render() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(here, 'render.mjs'), '--only=multiplayer'], { cwd: site, stdio: ['ignore', 'pipe', 'pipe'] });
    let rest = '';
    const read = bytes => {
      const text = rest + bytes;
      const parts = text.split('\n');
      rest = parts.pop();
      for (const part of parts) if (part.trim()) log(`render: ${part}`);
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.on('error', reject);
    child.on('exit', code => { if (rest.trim()) log(`render: ${rest}`); code === 0 ? resolve() : reject(new Error(`render.mjs exited with ${code}`)); });
  });
}

async function captureAndRender() {
  phase = 'capturing';
  problem = null;
  publish();
  try {
    await idle();
    const framings = { host: framing(phones.host.camera), guest: framing(phones.guest.camera) };
    const record = await shootMultiplayer(session, framings, 'live-session, framed by hand in tune.mjs');
    await saveCaptures({ multiplayer: stamp(record) });
    await saveFramings(framings);
    log(`Saved the framings to config.json: host ${JSON.stringify(framings.host)}, guest ${JSON.stringify(framings.guest)}.`);
    phase = 'rendering';
    publish();
    await render();
    const version = Date.now();
    renders = ['multiplayer-left', 'multiplayer-right'].map(name => `/media/${config.renders[name].output}.webp?v=${version}`);
  } catch (error) {
    problem = sanitize(error.message);
    log(`Capture failed: ${error.message}`);
  } finally {
    phase = 'ready';
    publish();
  }
}

// ── Server ────────────────────────────────────────────────────────────────
const mediaNames = new Set(Object.values(config.renders).map(entry => entry?.output).filter(Boolean).map(name => `${name}.webp`));
const body = request => new Promise((resolve, reject) => {
  let text = '';
  request.on('data', bytes => { text += bytes; if (text.length > 1e4) request.destroy(); });
  request.on('end', () => { try { resolve(text ? JSON.parse(text) : {}); } catch (error) { reject(error); } });
  request.on('error', reject);
});

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const reply = (status, data, type = 'application/json') => {
    response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    response.end(type === 'application/json' ? JSON.stringify(data) : data);
  };
  try {
    if (request.method === 'GET' && url.pathname === '/') return reply(200, await readFile(path.join(here, 'tune.html')), 'text/html; charset=utf-8');
    if (request.method === 'GET' && url.pathname === '/state') return reply(200, state());
    if (request.method === 'GET' && url.pathname === '/events') {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      clients.add(response);
      request.on('close', () => clients.delete(response));
      send(response, 'state', state());
      for (const text of lines) send(response, 'log', text);
      for (const [name, data] of Object.entries(lastFrame)) send(response, 'frame', { phone: name, data });
      return;
    }
    if (request.method === 'GET' && url.pathname.startsWith('/media/')) {
      const name = url.pathname.slice('/media/'.length);
      if (!mediaNames.has(name)) return reply(404, { error: 'not found' });
      return reply(200, await readFile(path.join(site, 'public/media', name)), 'image/webp');
    }
    if (request.method !== 'POST') return reply(404, { error: 'not found' });
    const input = await body(request);
    if (url.pathname === '/done') {
      reply(200, { ok: true });
      return shutdown(0);
    }
    if (phase !== 'ready') return reply(409, { error: `the session is ${phase}` });
    const phone = phones[input.phone];
    if (url.pathname === '/capture') {
      reply(202, { ok: true });
      return captureAndRender();
    }
    if (!phone) return reply(400, { error: 'no such phone' });
    if (url.pathname === '/orbit' && Number.isFinite(input.dx) && Number.isFinite(input.dy)) {
      phone.pending.dx += clamp(input.dx, { min: -2000, max: 2000 });
      phone.pending.dy += clamp(input.dy, { min: -2000, max: 2000 });
    } else if (url.pathname === '/zoom' && Number.isFinite(input.factor) && input.factor > 0) {
      phone.pending.zoom *= clamp(input.factor, { min: 0.25, max: 4 });
    } else if (url.pathname === '/reset') {
      phone.pending.reset = true;
    } else return reply(400, { error: 'bad request' });
    reply(202, { ok: true });
    pump(phone);
  } catch (error) {
    if (!response.headersSent) reply(500, { error: sanitize(error.message) });
  }
});

let session = null;
let stopping = null;
function shutdown(code) {
  stopping ??= (async () => {
    phase = 'stopping';
    publish();
    for (const client of clients) client.end();
    server.close();
    server.closeAllConnections?.();
    await session?.close().catch(() => {});
    await closeBrowser();
    log('Closed Chrome and the session; stopped.');
    process.exit(code);
  })();
  return stopping;
}
process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
const pageUrl = `http://127.0.0.1:${port}/`;
log(`Tuner page: ${pageUrl} (starting the session; this takes a minute or two)`);
if (!process.argv.includes('--no-open') && process.platform === 'darwin') spawn('open', [pageUrl], { stdio: 'ignore', detached: true }).unref();

try {
  await openBrowser();
  session = await startMultiplayer();
  for (const name of ['host', 'guest']) {
    const phone = { device: session[name], camera: follow(spec[name].camera), pending: { dx: 0, dy: 0, zoom: 1 }, moving: false };
    await swipeCamera(phone.device, spec[name].camera.swipes, { onMove: (x, y) => orbit(phone.camera, x, y) });
    phone.startCamera = { ...phone.camera };
    phone.start = spec[name].camera;
    phones[name] = phone;
    await watch(name, phone);
  }
  phase = 'ready';
  log('Ready: drag a screen to orbit, scroll to zoom, then Capture & render.');
  publish();
} catch (error) {
  console.error(sanitize(error.stack ?? error));
  problem = sanitize(error.message);
  publish();
  await shutdown(1);
}
