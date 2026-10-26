#!/usr/bin/env node
/**
 * Renders the bento phone artwork from the captured screens: a phone built in
 * code with Babylon.js (scene.js), lit by a procedural studio, baked to
 * transparent images. Reads config.json and build/bento-phones/captures/.
 *
 *   node scripts/bento-phones/render.mjs [--only=remote|multiplayer] [--debug=environment] [--no-preview]
 *
 * Writes public/media/<output>.webp, PNG masters and render.json under
 * build/bento-phones/renders/, and a dark-card preview at
 * build/bento-phones/preview.png. Needs no network: Babylon comes from an
 * installed node_modules and the captures are local files.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '../..');
const workspace = path.resolve(site, '..');
const browserTesting = path.resolve(workspace, '../foss-earth/browser-testing');
const out = path.join(site, 'build/bento-phones');
const capturesDir = path.join(out, 'captures');
const rendersDir = path.join(out, 'renders');
const mediaDir = path.join(site, 'public/media');
const config = JSON.parse(await readFile(path.join(here, 'config.json'), 'utf8'));
const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const only = arg('only');
const debug = arg('debug');
const preview = !process.argv.includes('--no-preview') && !debug;
const chromeBinary = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const { openHeadlessChrome } = await import(pathToFileURL(path.join(browserTesting, 'src/headlessChrome.mjs')));

const names = Object.keys(config.renders).filter(name => config.renders[name]?.phones && (!only || name === only || name.startsWith(`${only}-`)));
if (!names.length) throw new Error(`no render called ${only}`);

// ── Babylon ───────────────────────────────────────────────────────────────
const babylonCandidates = [
  path.join(workspace, 'fly/node_modules/@babylonjs/core'),
  path.resolve(workspace, '../foss-earth/app/node_modules/@babylonjs/core'),
  path.resolve(workspace, '../foss-earth/node_modules/@babylonjs/core'),
];
const babylonDir = babylonCandidates.find(dir => existsSync(path.join(dir, 'Engines/engine.js')));
if (!babylonDir) throw new Error(`Babylon.js not found; run npm install in ../fly. Looked in:\n${babylonCandidates.join('\n')}`);
const babylonVersion = JSON.parse(await readFile(path.join(babylonDir, 'package.json'), 'utf8')).version;

// ── Captures ──────────────────────────────────────────────────────────────
function pngSize(buffer) {
  if (buffer.toString('ascii', 1, 4) !== 'PNG') throw new Error('not a PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
const screenAspect = config.model.screen.length / config.model.screen.width;
const screens = {};
for (const name of names) {
  for (const phone of config.renders[name].phones) {
    const file = path.join(capturesDir, phone.screen);
    if (!existsSync(file)) throw new Error(`missing ${path.relative(site, file)}; run node scripts/bento-phones/capture.mjs first`);
    const size = pngSize(await readFile(file));
    const aspect = size.width / size.height;
    // The capture fills the screen edge to edge, so it must have the screen's shape.
    if (Math.abs(aspect / screenAspect - 1) > 0.005) throw new Error(`${phone.screen} is ${size.width}x${size.height} (${aspect.toFixed(4)}:1) but the screen is ${screenAspect.toFixed(4)}:1`);
    screens[phone.screen] = size;
  }
}

// ── Static server for the scene, Babylon and the captures ─────────────────
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.html': 'text/html', '.json': 'application/json', '.map': 'application/json' };
const shell = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:transparent">
<script type="module">
import('/scene.js').then(module => { window.bento = module; window.bentoReady = true; }, error => { window.bentoError = String(error && error.stack || error); });
</script>`;
const routes = [['/babylon/', babylonDir], ['/captures/', capturesDir]];
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  let file;
  if (url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html' }).end(shell);
    return;
  }
  if (url.pathname === '/scene.js') file = path.join(here, 'scene.js');
  for (const [prefix, dir] of routes) {
    if (url.pathname.startsWith(prefix)) {
      const candidate = path.resolve(dir, decodeURIComponent(url.pathname.slice(prefix.length)));
      if (candidate.startsWith(dir + path.sep)) file = candidate;
    }
  }
  try {
    if (!file) throw new Error('not found');
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

// ── Browser ───────────────────────────────────────────────────────────────
await mkdir(rendersDir, { recursive: true });
const profile = path.join(out, 'chrome-profile-render');
await rm(profile, { recursive: true, force: true });
const chrome = await openHeadlessChrome(profile, chromeBinary, ['--force-device-scale-factor=1', '--hide-scrollbars', '--ignore-gpu-blocklist']);

async function openPage(width, height, scale) {
  const { targetId } = await chrome.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await chrome.send('Target.attachToTarget', { targetId, flatten: true });
  await chrome.send('Runtime.enable', {}, sessionId);
  await chrome.send('Page.enable', {}, sessionId);
  await chrome.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false }, sessionId);
  const run = async (expression, timeoutMs = 120000) => {
    const result = await chrome.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId, timeoutMs);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const navigate = async (url, readyExpression, timeoutMs = 60000) => {
    await chrome.send('Page.navigate', { url }, sessionId);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const state = await run(`(${readyExpression}) ? 'ready' : (window.bentoError || '')`).catch(() => '');
      if (state === 'ready') return;
      if (state) throw new Error(state);
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error(`timed out loading ${url}`);
  };
  const screenshot = async file => {
    const shot = await chrome.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId);
    await writeFile(file, Buffer.from(shot.data, 'base64'));
  };
  return { run, navigate, screenshot, close: () => chrome.send('Target.closeTarget', { targetId }) };
}

function encodeWebp(pngFile, webpFile, chromeWebp) {
  const cwebp = spawnSync('cwebp', ['-quiet', '-q', String(config.renders.webpQuality), '-alpha_q', '100', '-m', '6', '-sharp_yuv', '-metadata', 'none', pngFile, '-o', webpFile], { encoding: 'utf8' });
  if (cwebp.status === 0) {
    const version = spawnSync('cwebp', ['-version'], { encoding: 'utf8' }).stdout.trim().split('\n')[0];
    return `cwebp ${version} -q ${config.renders.webpQuality} -alpha_q 100 -m 6 -sharp_yuv`;
  }
  return writeFile(webpFile, Buffer.from(chromeWebp, 'base64')).then(() => `Chrome canvas.toDataURL('image/webp', ${config.renders.webpQuality / 100})`);
}

const report = {
  renderedAt: new Date().toISOString(),
  tool: 'scripts/bento-phones/render.mjs',
  babylon: { version: babylonVersion, from: path.relative(workspace, babylonDir) },
  model: `${config.model.length} x ${config.model.width} x ${config.model.thickness} mm phone built in code (scripts/bento-phones/scene.js); no external model or texture assets`,
  captures: JSON.parse(await readFile(path.join(capturesDir, 'captures.json'), 'utf8').catch(() => '{}')),
  renders: {},
};
const previous = JSON.parse(await readFile(path.join(rendersDir, 'render.json'), 'utf8').catch(() => '{}'));

try {
  report.chrome = chrome.version?.product;
  const page = await openPage(1280, 800, 1);
  await page.navigate(`${base}/`, 'window.bentoReady');
  for (const name of debug ? [names[0]] : names) {
    const spec = config.renders[name];
    console.log(debug ? `Rendering the ${debug} check.` : `Rendering ${spec.output}.`);
    const result = await page.run(`bento.renderArtwork(${JSON.stringify(config)}, ${JSON.stringify(name)}, ${JSON.stringify({ debug })})`);
    if (debug) {
      const file = path.join(rendersDir, `debug-${debug}.png`);
      await writeFile(file, Buffer.from(result.png, 'base64'));
      console.log(`Wrote ${path.relative(site, file)}.`);
      break;
    }
    const pngFile = path.join(rendersDir, `${spec.output}.png`);
    const webpFile = path.join(mediaDir, `${spec.output}.webp`);
    await writeFile(pngFile, Buffer.from(result.png, 'base64'));
    await mkdir(mediaDir, { recursive: true });
    const encoder = await encodeWebp(pngFile, webpFile, result.webp);
    const bytes = (await stat(webpFile)).size;
    report.renders[name] = {
      file: path.relative(site, webpFile),
      master: path.relative(site, pngFile),
      width: result.width,
      height: result.height,
      bytes,
      encoder,
      screens: result.screens.map(screen => ({ ...screen, capture: report.captures?.[name.startsWith('remote') ? 'remote' : 'multiplayer']?.path })),
      environment: result.environment,
      webgl: { version: result.webgl, renderer: result.renderer },
      stats: result.stats,
    };
    console.log(`Wrote ${path.relative(site, webpFile)}: ${result.width}x${result.height}, ${bytes} bytes (${encoder.split(' ')[0]}).`);
  }
  await page.close();

  if (!debug) {
    for (const name of Object.keys(previous.renders ?? {})) if (config.renders[name]?.phones) report.renders[name] ??= previous.renders[name];
    await writeFile(path.join(rendersDir, 'render.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(`Wrote ${path.relative(site, path.join(rendersDir, 'render.json'))}.`);
  }

  if (preview) {
    // The two cards' backgrounds from landing.css, at the widths each image will be shown.
    const cards = [
      [['bento-remote-phone'], 'radial-gradient(ellipse at 90% 100%, #213b34 0%, #15221f 65%)', [300, 360, 400]],
      [['bento-multiplayer-left', 'bento-multiplayer-right'], 'radial-gradient(ellipse at 100% 10%, #1d3b4a, #121c25 75%)', [200, 250, 300]],
    ];
    const image = (file, width) => `<img src="${pathToFileURL(path.join(mediaDir, file + '.webp'))}?${Date.now()}" style="width:${width}px">`;
    const figure = ([files, background, widths]) => `<div class="row">${widths.map(width => `<figure style="background:${background}"><div class="pair">${files.map(file => image(file, width)).join('')}</div><figcaption>${width} CSS px${files.length > 1 ? ' each' : ''}</figcaption></figure>`).join('')}</div>`;
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:24px;background:#0b1110;font:12px system-ui;color:#9fb3ad}
      .row{display:flex;gap:20px;align-items:flex-start;margin-bottom:24px}
      figure{margin:0;padding:22px;border-radius:16px;border:1px solid #ffffff14}
      img{display:block}
      .pair{display:flex;gap:24px;align-items:flex-start}
      figcaption{margin-top:8px}
    </style>${cards.map(figure).join('')}`;
    const previewHtml = path.join(out, 'preview.html');
    await writeFile(previewHtml, html);
    const previewPage = await openPage(2000, 900, 2);
    await previewPage.navigate(pathToFileURL(previewHtml).href, `[...document.images].every(image => image.complete && image.naturalWidth)`);
    await previewPage.screenshot(path.join(out, 'preview.png'));
    await previewPage.close();
    console.log(`Wrote ${path.relative(site, path.join(out, 'preview.png'))}.`);
  }
} finally {
  await chrome.close();
  await rm(profile, { recursive: true, force: true });
  server.close();
}
