#!/usr/bin/env node
/** Reproducible real-simulator hero capture. See docs/proposals/landing-hero-video.md. */
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import https from 'node:https';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mp4, webm } from './hero-muxers.mjs';
import { cameraAt, validateCamera } from './hero-camera.js';
import { instrumentFlight, instrumentVideoTab } from './hero-instrument.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
if (process.argv.includes('--help')) {
  console.log('Usage: npm run capture:hero -- [--preview] [--tune] [--manual-camera] [--scenario=file.json] [--test-plan=plan.json] [--out=directory] [--fly=checkout] [--browser-testing=checkout] [--url=https://127.0.0.1:7470/fly/]');
  process.exit(0);
}
if (process.argv.slice(2).some(value => !['--preview', '--tune', '--manual-camera', '--check-tuner'].includes(value) && !/^--(?:scenario|test-plan|out|fly|browser-testing|url)=.+/.test(value))) throw new Error('Unknown argument; use --help.');
const argument = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const scenarioPath = path.resolve(argument('scenario', path.join(root, 'scripts/hero-scenario.json')));
let scenarioText = await readFile(scenarioPath, 'utf8');
const config = JSON.parse(scenarioText);
const output = path.resolve(argument('out', path.join(root, 'build/hero', config.name)));
const flyRoot = path.resolve(argument('fly', path.join(root, '../fly')));
const browserRoot = path.resolve(argument('browser-testing', path.join(root, '../../foss-earth/browser-testing')));
const checkingTuner = process.argv.includes('--check-tuner');
const tuning = process.argv.includes('--tune') || process.argv.includes('--manual-camera') || checkingTuner;
if (checkingTuner && !scenarioPath.startsWith(path.join(root, 'build') + path.sep)) throw new Error('Editor checks require an ignored build/ scenario copy.');
if (process.argv.includes('--manual-camera')) config.camera.mode = 'manual';
const preview = process.argv.includes('--preview');
const address = new URL(argument('url', 'https://127.0.0.1:7470/fly/'));
if (!['127.0.0.1', 'localhost'].includes(address.hostname) || address.protocol !== 'https:') throw new Error('Capture requires a local HTTPS development server.');
const testPlan = argument('test-plan', null);
if (testPlan) {
  if (!tuning) throw new Error('--test-plan is a tuning option.');
  const { createTestLink } = await import(pathToFileURL(path.join(browserRoot, '../ui/dist/diagnostics/testFeedback.js')));
  address.href = createTestLink(address.href, JSON.parse(await readFile(path.resolve(testPlan), 'utf8')));
}
if (!['google', 'usgs-imagery-topo'].includes(config.scene.scenery)) throw new Error('Choose Google 3D Tiles or USGS Imagery Topo scenery.');
const googleScenery = config.scene.scenery === 'google';
const sceneryName = googleScenery ? 'Google 3D Tiles' : 'USGS Imagery Topo';
const { fps, durationSeconds, throttleAtSeconds } = config.timeline;
if (!Number.isInteger(fps) || ![fps * durationSeconds, fps * throttleAtSeconds].every(value => Math.abs(value - Math.round(value)) < 1e-6) || durationSeconds <= 0 || fps < 1 || fps > 60 || durationSeconds > 15 || throttleAtSeconds < 0 || throttleAtSeconds >= durationSeconds) throw new Error('Use a bounded timeline with exact frame-aligned events.');
const bounded = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
if (!/^[a-z0-9-]+$/.test(config.name)) throw new Error('Use a lowercase alphanumeric scenario name with optional hyphens.');
if (!bounded(config.scene.latitude, -85, 85) || !bounded(config.scene.longitude, -180, 180)
  || !bounded(config.scene.heightAboveGroundMeters, 100, 10000) || !bounded(config.scene.headingDegrees, 0, 360)
  || !bounded(config.scene.airspeedKnots, 100, 600) || !Number.isFinite(Date.parse(config.scene.dateTime))) throw new Error('Invalid flight scene.');
if (![config.timeline.throttleBefore, config.timeline.throttleAfter].every(value => bounded(value, 0, 1))
  || !bounded(config.timeline.physicsHz, fps, 240) || config.timeline.physicsHz % fps !== 0
  || !bounded(config.timeline.initialPitchDegrees, -10, 30) || !bounded(config.timeline.climbPitchDegrees, -10, 60)
  || !bounded(config.timeline.pitchRampSeconds, 0.1, durationSeconds)) throw new Error('Invalid flight timeline.');
validateCamera(config.camera, durationSeconds);
if (![config.video.width, config.video.height].every(value => Number.isInteger(value) && value % 2 === 0 && bounded(value, 240, 1920))
  || ![config.video.vp9BitsPerSecond, config.video.h264BitsPerSecond].every(value => bounded(value, 100000, 10000000))
  || !bounded(config.video.posterQuality, 1, 100)) throw new Error('Invalid video dimensions or quality.');
await mkdir(output, { recursive: true });

const revision = directory => {
  try {
    return {
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim(),
      dirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: directory, encoding: 'utf8' }).trim(),
    };
  } catch { return { commit: null, dirty: null }; }
};

async function googleKey() {
  const names = ['GOOGLE_3D_TILES_KEY', 'FOSS_EARTH_GOOGLE_KEY'];
  for (const name of names) if (process.env[name]) return process.env[name];
  const files = [path.join(root, '../../foss-earth/app/.env.local'), path.join(root, '../../UMN-VR/tour/.env.local'), path.join(flyRoot, '.env.local')];
  const texts = await Promise.all(files.map(file => readFile(file, 'utf8').catch(() => '')));
  for (const name of names) for (const text of texts) {
    const match = text.match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.+)$`, 'm'));
    if (match) return match[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  throw new Error('No Google key found in the documented environment variables or local .env.local files.');
}
const key = googleScenery ? await googleKey() : null;
const sanitize = value => (key ? String(value).split(key).join('[redacted]') : String(value)).replace(/([?&](?:key|gkey)=)[^&\s"']+/gi, '$1[redacted]');
let server, serverLog, chrome, detach;
let probeStatus = 'not probed';
const profile = path.join(output, 'chrome-profile');
const errors = [];
const browserMessages = [];
async function reachable() {
  return new Promise(resolve => {
    const req = https.get(address, { rejectUnauthorized: false, timeout: 5000 }, res => { probeStatus = `HTTP ${res.statusCode}`; res.resume(); resolve(res.statusCode >= 200 && res.statusCode < 400); });
    req.on('error', error => { probeStatus = error.code ?? error.message; resolve(false); });
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}
async function ensureServer() {
  if (await reachable()) return;
  console.log('Starting the simulator development server.');
  serverLog = createWriteStream(path.join(output, 'server.log'));
  server = spawn('npm', ['run', 'llm-dev'], { cwd: flyRoot, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [server.stdout, server.stderr]) {
    let pending = '';
    stream.on('data', bytes => {
      pending += bytes.toString();
      const lines = pending.split('\n'); pending = lines.pop();
      for (const line of lines) serverLog.write(sanitize(line) + '\n');
    });
    stream.on('end', () => { if (pending) serverLog.write(sanitize(pending)); });
  }
  const deadline = Date.now() + 60000;
  while (!await reachable()) {
    if (Date.now() > deadline || server.exitCode !== null) throw new Error(`Simulator server did not become ready (${probeStatus}); inspect build/hero server.log.`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
try {
  await ensureServer();
  const helperPath = path.join(browserRoot, 'src/headlessChrome.mjs');
  let helperURL = pathToFileURL(helperPath);
  if (tuning && !checkingTuner) {
    // Reuse the shared isolated-profile CDP lifecycle, with a visible window.
    let helper = await readFile(helperPath, 'utf8');
    if (!helper.includes('"--headless=new"')) throw new Error('Visible Chrome launch anchor changed.');
    helper = helper.replace('"--headless=new"', '"--new-window"')
      .replaceAll('"./lifecycle.mjs"', JSON.stringify(pathToFileURL(path.join(browserRoot, 'src/lifecycle.mjs')).href))
      .replaceAll('"./evidence.mjs"', JSON.stringify(pathToFileURL(path.join(browserRoot, 'src/evidence.mjs')).href));
    helperURL = new URL('data:text/javascript;base64,' + Buffer.from(helper).toString('base64'));
  }
  const { openHeadlessChrome, evaluate, waitForExpression } = await import(helperURL);
  chrome = await openHeadlessChrome(profile, process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--ignore-certificate-errors', '--enable-unsafe-webgpu']);
  const cameraSource = await readFile(new URL('./hero-camera.js', import.meta.url), 'utf8');
  const startSource = tuning ? await readFile(new URL('./hero-start.js', import.meta.url), 'utf8') : '';
  const driver = `const heroCamera = (() => { ${cameraSource.replaceAll('export function ', 'function ')}; return { cameraAt, putCameraPoint }; })();\n`
    + (tuning ? `const heroStart = (() => { ${startSource.replaceAll('export function ', 'function ')}; return { startGroundKey, flightAtStart }; })();\n` : '')
    + await readFile(new URL('./hero-browser-driver.js', import.meta.url), 'utf8')
    + (tuning ? '\n' + await readFile(new URL('./hero-browser-tuner.js', import.meta.url), 'utf8') : '');
  let instrumented = false;
  let tabInstrumented = false;
  let savePending = Promise.resolve();
  detach = chrome.onEvent(message => {
    if (checkingTuner && browserMessages.length < 100 && message.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'warn'].includes(message.params.type)) {
      browserMessages.push(sanitize(message.params.args.map(arg => arg.value ?? arg.description ?? '').join(' ')));
    }
    if (checkingTuner && browserMessages.length < 100 && message.method === 'Log.entryAdded') browserMessages.push(sanitize(message.params.entry.text));
    if (message.method === 'Runtime.exceptionThrown') errors.push(sanitize(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text));
    if (message.method === 'Runtime.bindingCalled' && message.params.name === 'osfsHeroSave') {
      savePending = savePending.then(async () => {
        const next = JSON.parse(message.params.payload);
        // The browser may edit composition, duration and sky only. Keep the scripted aircraft inputs.
        const scene = next.scene;
        if (!bounded(scene.latitude, -85, 85) || !bounded(scene.longitude, -180, 180)
          || !bounded(scene.heightAboveGroundMeters, 100, 10000) || !bounded(scene.headingDegrees, 0, 360)
          || !Number.isFinite(Date.parse(scene.dateTime))) throw new Error('Invalid starting scene.');
        const duration = next.timeline.durationSeconds;
        if (!bounded(duration, (3 * fps + 1) / fps, 15) || Math.abs(Math.round(duration * fps) - duration * fps) > 1e-6) throw new Error('Invalid scene duration.');
        validateCamera(next.camera, duration);
        Object.assign(config.scene, { latitude: scene.latitude, longitude: scene.longitude,
          heightAboveGroundMeters: scene.heightAboveGroundMeters, headingDegrees: scene.headingDegrees, dateTime: new Date(scene.dateTime).toISOString() });
        if (!scene.solarTime) delete config.scene.solarTime;
        config.timeline.durationSeconds = duration;
        config.camera = next.camera;
        if (await readFile(scenarioPath, 'utf8') !== scenarioText) throw new Error('Scenario changed on disk. Reopen the editor before saving to preserve those edits.');
        const nextText = JSON.stringify(config, null, 2) + '\n';
        await writeFile(scenarioPath, nextText);
        scenarioText = nextText;
        await chrome.send('Runtime.evaluate', { expression: `window.__osfsHero.message.textContent='Scenario saved.'` }, message.sessionId);
        console.log('Saved scenario: ' + scenarioPath);
      }).catch(async error => {
        const text = sanitize(error.message);
        console.error(text);
        await chrome.send('Runtime.evaluate', { expression: `window.__osfsHero.message.textContent=${JSON.stringify('Save failed: ' + text)}` }, message.sessionId).catch(() => {});
      });
    }
    if (message.method !== 'Fetch.requestPaused') return;
    void (async () => {
      const { requestId } = message.params;
      const body = await chrome.send('Fetch.getResponseBody', { requestId }, message.sessionId);
      let source = body.base64Encoded ? Buffer.from(body.body, 'base64').toString('utf8') : body.body;
      if (message.params.request.url.includes('/hud/FlightControlPanel.tsx')) {
        source = instrumentVideoTab(source);
        tabInstrumented = true;
      } else {
        source = instrumentFlight(source, driver, Number(config.scene.heightAboveGroundMeters));
        instrumented = true;
      }
      const responseHeaders = (message.params.responseHeaders ?? []).filter(header => !/^(content-length|content-encoding|etag)$/i.test(header.name));
      await chrome.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders, body: Buffer.from(source).toString('base64') }, message.sessionId);
    })().catch(async error => {
      errors.push(sanitize(error.message));
      await chrome.send('Runtime.evaluate', { expression: `window.__osfsCaptureError=${JSON.stringify(sanitize(error.message))}` }, message.sessionId).catch(() => {});
      await chrome.send('Fetch.failRequest', { requestId: message.params.requestId, errorReason: 'Failed' }, message.sessionId).catch(() => {});
    });
  });
  const { targetId } = await chrome.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await chrome.send('Target.attachToTarget', { targetId, flatten: true });
  const run = expression => evaluate(chrome, sessionId, expression);
  await chrome.send('Runtime.enable', {}, sessionId);
  if (checkingTuner) await chrome.send('Log.enable', {}, sessionId);
  if (tuning) await chrome.send('Runtime.addBinding', { name: 'osfsHeroSave' }, sessionId);
  await chrome.send('Page.enable', {}, sessionId);
  const editorScale = tuning ? Math.max(1, 1280 / config.video.width, 720 / config.video.height) : 1;
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: Math.round(config.video.width * editorScale), height: Math.round(config.video.height * editorScale), deviceScaleFactor: 1, mobile: false }, sessionId);
  await chrome.send('Fetch.enable', { patterns: [{ urlPattern: '*src/flight/createFlightSimApp.ts*', requestStage: 'Response' },
    ...(tuning ? [{ urlPattern: '*src/flight/hud/FlightControlPanel.tsx*', requestStage: 'Response' }] : [])] }, sessionId);
  if (key) await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.origin===${JSON.stringify(address.origin)}) localStorage.setItem('foss-earth.settings.v1', JSON.stringify({version:1,values:{'map.source.googleKey':${JSON.stringify(key)}}}));` }, sessionId);
  const date = new Date(config.scene.dateTime);
  const settings = {
    ...(checkingTuner ? { 'input.mode': 'mouse' } : {}),
    'renderer.mode': 'webgpu', 'map.source.basemap': config.scene.scenery,
    'osfs.aircraft.id': 'f-35b', 'osfs.start.resume': false,
    'osfs.start.latitude': config.scene.latitude, 'osfs.start.longitude': config.scene.longitude,
    'osfs.start.heightAboveGround': config.scene.heightAboveGroundMeters, 'osfs.start.heading': config.scene.headingDegrees,
    'osfs.start.airspeed': config.scene.airspeedKnots, 'osfs.start.throttle': throttleAtSeconds === 0 ? config.timeline.throttleAfter : config.timeline.throttleBefore,
    'osfs.physics.rate': config.timeline.physicsHz,
    'osfs.sound.enabled': false, 'osfs.assist.autoTrim': false,
    'osfs.camera.chaseDistance': config.camera.distanceMeters, 'osfs.camera.chaseHeight': config.camera.heightMeters,
    'osfs.camera.orbitRestoreYaw': config.camera.orbitDegrees,
    'sky.model': 'dome', 'sky.time.mode': 'fixed', 'sky.time.date': date.toISOString().slice(0, 10),
    'sky.time.utcHours': date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600,
  };
  for (const [id, value] of Object.entries(settings)) address.searchParams.set(`set.${id}`, String(value));
  address.searchParams.set('renderer', 'webgpu');
  console.log(`Loading F-35B, ${sceneryName}, ${config.scene.dateTime}.`);
  // Camera gestures retain the app's own input-mode control; physics controls are captured by the driver.
  await chrome.send('Page.navigate', { url: address.href }, sessionId);
  await waitForExpression(chrome, sessionId, 'window.__osfsHero?.status().ready === true || window.__osfsCaptureError', 90000);
  const captureError = await run('window.__osfsCaptureError ?? null');
  if (captureError) throw new Error(captureError);
  if (!instrumented) throw new Error('The development application was not instrumented.');
  const initial = await run(`window.__osfsHero.prepare(${JSON.stringify({...config, tuning})})`);
  const expectedMode = googleScenery ? 'google-tiles' : 'raster-basemap';
  if (initial.mode !== expectedMode || (!googleScenery && initial.basemap !== config.scene.scenery)) throw new Error(`${sceneryName} did not activate; refusing a substitute capture.`);
  console.log(`Aircraft ready; waiting for ${sceneryName} scenery to settle.`);
  await waitForExpression(chrome, sessionId, '!window.__osfsHero.status().streaming', 60000);
  if (tuning) {
    if (!tabInstrumented) throw new Error('The Video tab was not instrumented.');
    const before = await run('window.__osfsHero.status()');
    await run('new Promise(resolve => setTimeout(resolve, 250))');
    const after = await run('window.__osfsHero.status()');
    if (!after.paused || Math.abs(after.time - before.time) > .00001) throw new Error('Tuning launch did not stay paused.');
    const tuningShot = await chrome.send('Page.captureScreenshot', {format: 'png'}, sessionId);
    await writeFile(path.join(output, 'tuning-preview.png'), Buffer.from(tuningShot.data, 'base64'));
    console.log(JSON.stringify({paused: after.paused, simulatedSeconds: after.time-before.time, latitude: after.state.latDeg, longitude: after.state.lonDeg}));
    console.log('Video tab ready: play, pause, scrub, set the start, and record the camera. Save scenario in the tab (or enter save here); quit or Ctrl+C closes the browser. Sky/date-time tabs still tune lighting.');
    if (checkingTuner) {
      const { checkTuner } = await import('./check-hero-tuner.mjs');
      try {
        await checkTuner({ run, chrome, sessionId, output, scenarioPath, errors });
        if (browserMessages.some(message => /GPUValidationError|used in submit while destroyed|uncaptured error|Device lost/i.test(message))) throw new Error('The editor produced graphics validation errors.');
      }
      catch (error) {
        await writeFile(path.join(output, 'editor-failure.json'), JSON.stringify({ message: sanitize(error.message), browserMessages, errors,
          details: await run('window.__osfsHero.inspectPreview()').catch(() => null) }, null, 2));
        throw error;
      }
    } else {
    const lines = createInterface({input: process.stdin, output: process.stdout});
    const stop = () => lines.close();
    process.once('SIGINT', stop);
    try {
      for await (const line of lines) {
        const value = line.trim();
        if (value === 'quit') break;
        if (value === 'save') {
          await run('window.osfsHeroSave(JSON.stringify(window.__osfsHero.exportScenario()))');
          await savePending;
        } else if (Number.isFinite(Date.parse(value))) {
          await run(`window.__osfsHero.setTime(${JSON.stringify(new Date(value).toISOString())})`);
          console.log('Applied. Enter save to keep it.');
        } else console.log('Enter an ISO date/time, save, or quit.');
      }
    } finally { lines.close(); process.removeListener('SIGINT', stop); }
    }
    await savePending;
  } else {
  await run(`(() => {
    if (!document.querySelector('.map-source-hud')) throw new Error('Map source credit is missing.');
    const style = document.createElement('style');
    style.textContent = 'body * { visibility: hidden !important; } canvas.flight-app__canvas { visibility: visible !important; }';
    document.head.appendChild(style);
  })()`);
  await run(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  const start = await run('window.__osfsHero.status()');
  if (start.sky?.renderedUtcMs == null || Math.abs(start.sky.renderedUtcMs - Date.parse(config.scene.dateTime)) > 1000) throw new Error('Rendered sky time does not match the requested scene time: ' + JSON.stringify(start.sky));
  console.log('Verified rendered sky: ' + JSON.stringify(start.sky));
  const first = await chrome.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
  await writeFile(path.join(output, 'preview.png'), Buffer.from(first.data, 'base64'));
  const poster = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: config.video.posterQuality, captureBeyondViewport: false }, sessionId);
  await writeFile(path.join(output, `${config.name}-poster.jpg`), Buffer.from(poster.data, 'base64'));
  const sourceFiles = ['capture-hero.mjs', 'hero-browser-driver.js', 'hero-camera.js', 'hero-instrument.mjs', 'hero-browser-encoder.js', 'hero-muxers.mjs'];
  const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, createHash('sha256').update(await readFile(new URL(file, import.meta.url))).digest('hex')])));
  const report = {
    config, start, capturedAt: new Date().toISOString(),
    source: 'real development simulator; browser-only instrumentation',
    provenance: { flight: revision(flyRoot), website: revision(root), scripts: sourceHashes,
      flightSourceSha256: createHash('sha256').update(await readFile(path.join(flyRoot, 'src/flight/createFlightSimApp.ts'))).digest('hex') },
    errors,
  };
  if (preview) console.log(`Preview: ${path.join(output, 'preview.png')}`);
  else {
    await run(await readFile(new URL('./hero-browser-encoder.js', import.meta.url), 'utf8'));
    await run(`window.__osfsHeroEncoder.init(${JSON.stringify(config)})`);
    const telemetry = [];
    const frames = Math.round(fps * durationSeconds);
    console.log(`Recording ${frames} frames at ${fps} fps; throttle changes at frame ${fps * throttleAtSeconds}.`);
    for (let index = 0; index < frames; index++) {
      const state = await run(`window.__osfsHero.frame(${index})`);
      if (state.fault) throw new Error(`Physics fault at frame ${index}: ${state.fault}`);
      telemetry.push(state);
      await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const shot = await chrome.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
      await run(`window.__osfsHeroEncoder.frame(${JSON.stringify(shot.data)}, ${index}, ${fps})`);
      if ([0, fps * throttleAtSeconds - 1, fps * throttleAtSeconds, Math.floor(frames * .7), frames - 1].includes(index)) await writeFile(path.join(output, `frame-${String(index).padStart(3, '0')}.png`), Buffer.from(shot.data, 'base64'));
      if (index % fps === 0) console.log(`Frame ${index}/${frames}: altitude ${state.state.altMeters.toFixed(1)} m; AB ${state.afterburner}.`);
    }
    const encoded = await run('window.__osfsHeroEncoder.finish()');
    const dimensions = { width: config.video.width, height: config.video.height, fps, frames };
    report.files = [];
    for (const video of encoded) {
      const bytes = video.name === 'vp9' ? webm(video, dimensions) : mp4(video, dimensions);
      const filename = `${config.name}.${video.name === 'vp9' ? 'webm' : 'mp4'}`;
      await writeFile(path.join(output, filename), bytes);
      report.files.push({ filename, codec: video.name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    report.telemetry = telemetry;
    report.checks = {
      frames, durationSeconds: frames / fps,
      scenery: telemetry.every(sample => sample.mode === expectedMode && (googleScenery || sample.basemap === config.scene.scenery)),
      skyTime: Math.abs(start.sky.renderedUtcMs - Date.parse(config.scene.dateTime)) < 1000,
      cameraOrbitStartDegrees: telemetry[0].cameraYawDegrees,
      cameraOrbitEndDegrees: telemetry.at(-1).cameraYawDegrees,
      cameraOrbit: telemetry.every(sample => {
        const expected = cameraAt(config.camera, sample.timestamp, durationSeconds);
        const angleError = Math.atan2(Math.sin((sample.camera.yawDegrees - expected.yawDegrees) * Math.PI / 180), Math.cos((sample.camera.yawDegrees - expected.yawDegrees) * Math.PI / 180));
        return Math.abs(angleError) < .001 && Math.abs(sample.camera.pitchDegrees - expected.pitchDegrees) < .01
          && Math.abs(sample.camera.distanceMeters - expected.distanceMeters) < .01
          && Math.abs(sample.camera.fieldOfViewDegrees - expected.fieldOfViewDegrees) < .01;
      }),
      noExternalTanks: telemetry.every(sample => sample.externalTanks.length === 2 && sample.externalTanks.every(tank => !tank.attached && tank.contentsLbs === 0)),
      throttleCueFrame: fps * throttleAtSeconds,
      throttleStep: telemetry.every(sample => Math.abs(sample.state.throttleNorm - (sample.timestamp < throttleAtSeconds ? config.timeline.throttleBefore : config.timeline.throttleAfter)) < .0001),
      dryBeforeCue: telemetry.slice(0, fps * throttleAtSeconds).every(sample => sample.afterburner === 0),
      afterburnerLit: telemetry.some(sample => sample.timestamp >= throttleAtSeconds && sample.afterburner > 0),
      afterburnerDelayed: (telemetry.find(sample => sample.afterburner > 0)?.timestamp ?? -1) > throttleAtSeconds,
      spoolingBeforeLight: telemetry.some(sample => sample.timestamp > throttleAtSeconds && sample.afterburner === 0 && sample.n2 > start.n2 + .01),
      afterburnerFirstLitSeconds: telemetry.find(sample => sample.afterburner > 0)?.timestamp ?? null,
      pitchAtThreeSecondsDegrees: telemetry[3 * fps]?.state.pitchRad * 180 / Math.PI,
      climbPitchReached: Math.abs(telemetry[3 * fps]?.state.pitchRad * 180 / Math.PI - config.timeline.climbPitchDegrees) < 3,
      climbing: telemetry.at(-1).state.altMeters > start.state.altMeters,
      headingHeld: telemetry.every(sample => Math.abs(Math.atan2(Math.sin(sample.state.headingRad - config.scene.headingDegrees * Math.PI / 180), Math.cos(sample.state.headingRad - config.scene.headingDegrees * Math.PI / 180))) < Math.PI / 180),
      westbound: telemetry.at(-1).state.lonDeg < start.state.lonDeg,
      simulatedSeconds: telemetry.at(-1).time - start.time,
      frameClock: Math.abs(telemetry.at(-1).time - start.time - (frames - 1) / fps) < .00001,
    };
    console.log(JSON.stringify({ files: report.files, checks: report.checks }, null, 2));
    if (!report.checks.scenery || !report.checks.afterburnerDelayed || !report.checks.spoolingBeforeLight || !report.checks.noExternalTanks || !report.checks.skyTime || !report.checks.cameraOrbit || !report.checks.climbPitchReached || !report.checks.throttleStep || !report.checks.dryBeforeCue || !report.checks.afterburnerLit || !report.checks.climbing || !report.checks.headingHeld || !report.checks.frameClock || errors.length) process.exitCode = 1;
  }
  await writeFile(path.join(output, 'capture.json'), JSON.stringify(report, null, 2));
  }
} catch (error) {
  console.error(sanitize(error.stack ?? error));
  if (errors.length) console.error(JSON.stringify(errors.map(sanitize), null, 2));
  process.exitCode = 1;
} finally {
  detach?.();
  if (chrome) await chrome.close();
  await rm(profile, { recursive: true, force: true });
  if (server) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch { /* Already exited. */ }
    await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', resolve); });
    serverLog?.end();
  }
}
