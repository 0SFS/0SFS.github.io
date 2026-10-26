#!/usr/bin/env node
/**
 * Renders the bento laptop artwork from the saved captures: rtql8d's pre-made
 * MacBook Air (model.mjs) showing the captured flight, lit by the phone
 * artwork's studio and baked to a transparent image (scene.js). Reads
 * config.json and build/bento-laptop/captures/.
 *
 *   node scripts/bento-laptop/render.mjs [--no-candidate] [--no-preview]
 *
 * Writes public/media/bento-remote-laptop.webp, its PNG master and render.json
 * under build/bento-laptop/renders/, and the card preview at
 * build/bento-laptop/preview.png, laid out by the card CSS it suggests
 * (render.json `layout.css`). Unless --no-candidate, it also renders the
 * same session's phone capture with scripts/bento-phones/scene.js and its own
 * settings, as build/bento-laptop/renders/bento-remote-phone-candidate.*; the
 * installed phone artwork is only read. Needs no network once the model is in
 * place: Babylon comes from ../fly's node_modules and the captures are local.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensureModel } from './model.mjs';
import { pngSize } from './png.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '../..');
const workspace = path.resolve(site, '..');
const browserTesting = path.resolve(workspace, '../foss-earth/browser-testing');
const phoneScripts = path.join(site, 'scripts/bento-phones');
const out = path.join(site, 'build/bento-laptop');
const capturesDir = path.join(out, 'captures');
const rendersDir = path.join(out, 'renders');
const mediaDir = path.join(site, 'public/media');
const config = JSON.parse(await readFile(path.join(here, 'config.json'), 'utf8'));
const phoneConfig = JSON.parse(await readFile(path.join(phoneScripts, 'config.json'), 'utf8'));
const candidate = !process.argv.includes('--no-candidate');
const preview = !process.argv.includes('--no-preview');
const chromeBinary = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const { openHeadlessChrome } = await import(pathToFileURL(path.join(browserTesting, 'src/headlessChrome.mjs')));
const rel = file => path.relative(site, file);

// ── Babylon, with the glTF loader ─────────────────────────────────────────
const babylonCandidates = [
  path.join(workspace, 'fly/node_modules/@babylonjs'),
  path.resolve(workspace, '../foss-earth/app/node_modules/@babylonjs'),
  path.resolve(workspace, '../foss-earth/node_modules/@babylonjs'),
];
const babylonRoot = babylonCandidates.find(dir => existsSync(path.join(dir, 'core/Engines/engine.js')) && existsSync(path.join(dir, 'loaders/glTF/glTFFileLoader.js')));
if (!babylonRoot) throw new Error(`Babylon.js with its loaders not found; run npm install in ../fly. Looked in:\n${babylonCandidates.join('\n')}`);
const babylonDir = path.join(babylonRoot, 'core');
const loadersDir = path.join(babylonRoot, 'loaders');
const babylonVersion = JSON.parse(await readFile(path.join(babylonDir, 'package.json'), 'utf8')).version;
const loadersVersion = JSON.parse(await readFile(path.join(loadersDir, 'package.json'), 'utf8')).version;
if (loadersVersion !== babylonVersion) throw new Error(`@babylonjs/loaders ${loadersVersion} does not match @babylonjs/core ${babylonVersion}`);

// ── Model and captures ────────────────────────────────────────────────────
const model = await ensureModel(config);
const captures = JSON.parse(await readFile(path.join(capturesDir, 'captures.json'), 'utf8').catch(() => 'null'));
if (!captures) throw new Error(`missing ${rel(path.join(capturesDir, 'captures.json'))}; run node scripts/bento-laptop/capture.mjs first`);
async function captureSize(name) {
  const file = path.join(capturesDir, name);
  if (!existsSync(file)) throw new Error(`missing ${rel(file)}; run node scripts/bento-laptop/capture.mjs first`);
  return pngSize(await readFile(file));
}
// The laptop's capture fills the panel's width at its own shape, so it must be the page exactly.
const laptopCapture = await captureSize(config.captures.laptop);
const laptopPixels = [config.laptop.viewport.width * config.laptop.deviceScaleFactor, config.laptop.viewport.height * config.laptop.deviceScaleFactor];
if (laptopCapture.width !== laptopPixels[0] || laptopCapture.height !== laptopPixels[1]) {
  throw new Error(`${config.captures.laptop} is ${laptopCapture.width}x${laptopCapture.height}, not the ${laptopPixels.join('x')} laptop page`);
}
// The phone scene fills its screen edge to edge with the capture, so the shapes must match.
if (candidate) {
  const size = await captureSize(config.captures.phone);
  const screenAspect = phoneConfig.model.screen.length / phoneConfig.model.screen.width;
  if (Math.abs(size.width / size.height / screenAspect - 1) > 0.005) throw new Error(`${config.captures.phone} is ${size.width}x${size.height} but the phone's screen is ${screenAspect.toFixed(4)}:1`);
}

// Regions of the capture the phone must leave visible: the configured ones and the scenery credit as captured.
const attribution = captures.laptop?.state?.scenery;
if (!attribution?.shown || !attribution.box) throw new Error('captures.json records no visible scenery attribution');
const [vw, vh] = [config.laptop.viewport.width, config.laptop.viewport.height];
const [ax, ay, aw, ah] = attribution.box;
const protect = Object.fromEntries(Object.entries(config.render.protect).filter(([name]) => !name.startsWith('$')));
protect.attribution = [ax / vw, ay / vh, Math.min(1, (ax + aw) / vw), Math.min(1, (ay + ah) / vh)].map(value => Number(value.toFixed(4)));

// ── Static server for the scenes, Babylon, the model and the captures ─────
const types = {
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg',
  '.html': 'text/html', '.json': 'application/json', '.map': 'application/json', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
};
// The loaders import @babylonjs/core by its package name; the import map sends both packages to the server.
const shell = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:transparent">
<script type="importmap">${JSON.stringify({ imports: { '@babylonjs/core/': '/babylon/', '@babylonjs/loaders/': '/loaders/' } })}</script>
<script type="module">
Promise.all([import('/scene.js'), import('/phone-scene.js')]).then(([laptop, phone]) => { window.bento = { laptop, phone }; window.bentoReady = true; }, error => { window.bentoError = String(error && error.stack || error); });
</script>`;
const files = { '/scene.js': path.join(here, 'scene.js'), '/phone-scene.js': path.join(phoneScripts, 'scene.js') };
const routes = [['/babylon/', babylonDir], ['/loaders/', loadersDir], ['/model/', model.dir], ['/captures/', capturesDir], ['/renders/', rendersDir], ['/media/', mediaDir]];
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html' }).end(shell);
    return;
  }
  let file = files[url.pathname];
  for (const [prefix, dir] of routes) {
    if (url.pathname.startsWith(prefix)) {
      const candidateFile = path.resolve(dir, decodeURIComponent(url.pathname.slice(prefix.length)));
      if (candidateFile.startsWith(dir + path.sep)) file = candidateFile;
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
  // The page's errors, for a load that never finishes.
  const problems = [];
  const stopListening = chrome.onEvent(({ method, params, sessionId: from }) => {
    if (from !== sessionId) return;
    if (method === 'Runtime.exceptionThrown') problems.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
    if (method === 'Log.entryAdded' && params.entry.level === 'error') problems.push(`${params.entry.text} ${params.entry.url ?? ''}`.trim());
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') problems.push(params.args.map(arg => arg.value ?? arg.description).join(' '));
  });
  await chrome.send('Runtime.enable', {}, sessionId);
  await chrome.send('Page.enable', {}, sessionId);
  await chrome.send('Log.enable', {}, sessionId);
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
    throw new Error(`timed out loading ${url}${problems.length ? `; the page reported:\n  ${problems.slice(-8).join('\n  ')}` : ''}`);
  };
  const screenshot = async (file, size) => {
    const clip = size && { x: 0, y: 0, width: size[0], height: size[1], scale: 1 };
    const shot = await chrome.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, ...(clip && { clip }) }, sessionId);
    await writeFile(file, Buffer.from(shot.data, 'base64'));
  };
  return { run, navigate, screenshot, close: () => { stopListening(); return chrome.send('Target.closeTarget', { targetId }); } };
}

/** cwebp as scripts/bento-phones/render.mjs runs it, or Chrome's encoder if cwebp is missing. */
async function encodeWebp(pngFile, webpFile, quality, chromeWebp) {
  const cwebp = spawnSync('cwebp', ['-quiet', '-q', String(quality), '-alpha_q', '100', '-m', '6', '-sharp_yuv', '-metadata', 'none', pngFile, '-o', webpFile], { encoding: 'utf8' });
  if (cwebp.status === 0) {
    const version = spawnSync('cwebp', ['-version'], { encoding: 'utf8' }).stdout.trim().split('\n')[0];
    return `cwebp ${version} -q ${quality} -alpha_q 100 -m 6 -sharp_yuv`;
  }
  await writeFile(webpFile, Buffer.from(chromeWebp, 'base64'));
  return `Chrome canvas.toDataURL('image/webp', ${quality / 100})`;
}

/**
 * Lays the two images out as the card would, `width` pixels wide, and measures
 * in the browser how much of each protected region the phone covers: `phone`
 * counts pixels under the phone itself (alpha 128 and up), `shadow` pixels
 * under its shadow or edge (alpha 16 and up). `clearance` is the gap between
 * the phone itself and the region in CSS pixels on a `cssWidth` card, 0 if
 * they touch.
 */
function measureLayout(layout, laptopUrl, phoneUrl, regions, width, cssWidth) {
  return `(async () => {
    const layout = ${JSON.stringify(layout)}, regions = ${JSON.stringify(regions)}, W = ${width};
    const load = async url => { const image = new Image(); image.src = url; await image.decode(); return image; };
    const [laptop, phone] = await Promise.all([load(${JSON.stringify(laptopUrl)}), load(${JSON.stringify(phoneUrl)})]);
    const box = (spec, image) => ({ x: spec.left * W, y: spec.top * W, width: spec.width * W, height: spec.width * W * image.naturalHeight / image.naturalWidth, natural: [image.naturalWidth, image.naturalHeight] });
    const laptopBox = box(layout.laptop, laptop), phoneBox = box(layout.phone, phone);
    const H = Math.ceil(Math.max(laptopBox.y + laptopBox.height, phoneBox.y + phoneBox.height));
    const canvas = new OffscreenCanvas(W, H), ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(phone, phoneBox.x, phoneBox.y, phoneBox.width, phoneBox.height);
    const alpha = ctx.getImageData(0, 0, W, H).data;
    const scale = laptopBox.width / laptop.naturalWidth;
    const result = {};
    for (const [name, quad] of Object.entries(regions)) {
      ctx.clearRect(0, 0, W, H);
      ctx.beginPath();
      quad.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](laptopBox.x + x * scale, laptopBox.y + y * scale));
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.fill();
      const mask = ctx.getImageData(0, 0, W, H).data;
      let area = 0, under = 0, shaded = 0;
      for (let i = 3; i < mask.length; i += 4) {
        if (mask[i] < 128) continue;
        area++;
        if (alpha[i] >= 128) under++;
        if (alpha[i] >= 16) shaded++;
      }
      // Nearest phone pixel outside the region, by distance to the quad's edges.
      const corners = quad.map(([x, y]) => [laptopBox.x + x * scale, laptopBox.y + y * scale]);
      const toSegment = (px, py, [ax, ay], [bx, by]) => {
        const dx = bx - ax, dy = by - ay;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
        return Math.hypot(px - ax - t * dx, py - ay - t * dy);
      };
      let gap = Infinity;
      for (let i = 3; i < alpha.length && gap > 0; i += 4) {
        if (alpha[i] < 128) continue;
        if (mask[i] >= 128) { gap = 0; break; }
        const p = (i - 3) / 4, px = p % W + 0.5, py = Math.floor(p / W) + 0.5;
        for (let k = 0; k < 4; k++) gap = Math.min(gap, toSegment(px, py, corners[k], corners[(k + 1) % 4]));
      }
      result[name] = { areaPx: area, phone: Number((under / area).toFixed(4)), shadow: Number((shaded / area).toFixed(4)), clearance: Number((gap * ${cssWidth} / W).toFixed(1)) };
    }
    return { box: [W, H], laptop: laptopBox, phone: phoneBox, regions: result };
  })()`;
}

const output = config.render.output;
const pngFile = path.join(rendersDir, `${output}.png`);
const webpFile = path.join(mediaDir, `${output}.webp`);
const candidateName = `${phoneConfig.renders.remote.output}-candidate`;
const credit = `"${config.model.title}" (${config.model.source}) by ${config.model.author} (${config.model.authorUrl}), licensed under ${config.model.license} (${config.model.licenseUrl})`;
const report = {
  renderedAt: new Date().toISOString(),
  tool: 'scripts/bento-laptop/render.mjs',
  babylon: { version: babylonVersion, from: path.relative(workspace, babylonRoot) },
  model: {
    credit: `This work is based on ${credit}.`,
    changes: 'Recoloured silver (the export is Midnight), satin finish on the keys, lid opened to the configured angle, the wallpaper replaced by the captured flight, the logo on the lid hidden. The export files are unmodified; every change is made at render time.',
    files: Object.fromEntries(Object.entries(config.model.files).map(([name, sha256]) => [name, `sha256 ${sha256}`])),
    dir: rel(model.dir),
  },
  captures,
};

try {
  report.chrome = chrome.version?.product;
  const page = await openPage(1280, 800, 1);
  await page.navigate(`${base}/`, 'window.bentoReady');

  console.log(`Rendering ${output}.`);
  const result = await page.run(`bento.laptop.renderLaptop(${JSON.stringify(config)}, ${JSON.stringify({ regions: protect })})`);
  await writeFile(pngFile, Buffer.from(result.png, 'base64'));
  await mkdir(mediaDir, { recursive: true });
  const encoder = await encodeWebp(pngFile, webpFile, config.render.webpQuality, result.webp);
  report.laptop = {
    file: rel(webpFile),
    master: rel(pngFile),
    width: result.width,
    height: result.height,
    bytes: (await stat(webpFile)).size,
    masterBytes: (await stat(pngFile)).size,
    encoder,
    capture: captures.laptop?.file,
    protect,
    laptop: result.laptop,
    environment: result.environment,
    webgl: { version: result.webgl, renderer: result.renderer },
    stats: result.stats,
  };
  console.log(`Wrote ${rel(webpFile)}: ${result.width}x${result.height}, ${report.laptop.bytes} bytes (${encoder.split(' ')[0]}); master ${rel(pngFile)}.`);

  if (candidate) {
    // The phone artwork's own scene and settings, with this session's phone screen.
    const spec = structuredClone(phoneConfig);
    spec.renders.remote.phones = spec.renders.remote.phones.map(phone => ({ ...phone, screen: config.captures.phone }));
    console.log(`Rendering ${candidateName} from ${config.captures.phone}.`);
    const phone = await page.run(`bento.phone.renderArtwork(${JSON.stringify(spec)}, 'remote')`);
    const candidatePng = path.join(rendersDir, `${candidateName}.png`);
    const candidateWebp = path.join(rendersDir, `${candidateName}.webp`);
    await writeFile(candidatePng, Buffer.from(phone.png, 'base64'));
    const candidateEncoder = await encodeWebp(candidatePng, candidateWebp, phoneConfig.renders.webpQuality, phone.webp);
    report.phoneCandidate = {
      file: rel(candidateWebp),
      master: rel(candidatePng),
      width: phone.width,
      height: phone.height,
      bytes: (await stat(candidateWebp)).size,
      encoder: candidateEncoder,
      capture: captures.phone?.file,
      settings: 'scripts/bento-phones/config.json renders.remote with this screen; scripts/bento-phones/scene.js',
      stats: phone.stats,
    };
    console.log(`Wrote ${rel(candidateWebp)}: ${phone.width}x${phone.height}, ${report.phoneCandidate.bytes} bytes.`);
  }

  // The phone must leave the aircraft and the scenery credit visible, measured with the images as encoded.
  const layout = config.preview.layout;
  const phones = { installed: `/media/${path.basename(config.preview.phone)}` };
  if (candidate) phones.candidate = `/renders/${candidateName}.webp`;
  report.layout = { ...layout, coverage: {} };
  for (const [name, url] of Object.entries(phones)) {
    report.layout.coverage[name] = await page.run(measureLayout(layout, `/media/${output}.webp?${Date.now()}`, url, result.stats.regions, 1000, Math.min(...config.preview.widths)));
  }
  const installed = report.layout.coverage.installed;
  // The suggested card CSS, which the preview uses: the art box is as high as the lower image reaches, and both images sit in percentages of it.
  const boxHeight = Math.max(...[installed.laptop, installed.phone].map(image => image.y + image.height)) / installed.box[0];
  const percent = value => value ? `${Number((value * 100).toFixed(2))}%` : '0';
  const place = spec => `left: ${percent(spec.left)}; top: ${percent(spec.top / boxHeight)}; width: ${percent(spec.width)};`;
  report.layout.aspect = Number((1 / boxHeight).toFixed(4));
  report.layout.css = [
    `.feature__remote-art { position: relative; width: min(100%, ${Math.max(...config.preview.widths)}px); aspect-ratio: 1000 / ${Number((boxHeight * 1000).toFixed(2))}; margin: 16px auto 10px; }`,
    '.feature__remote-art img { position: absolute; display: block; height: auto; }',
    `.feature__remote-laptop { ${place(layout.laptop)} }`,
    `.feature__remote-phone { ${place(layout.phone)} }`,
  ];
  for (const [name, coverage] of Object.entries(report.layout.coverage)) {
    console.log(`Layout with the ${name} phone (art box ${report.layout.aspect} : 1): ${Object.entries(coverage.regions).map(([region, share]) => `${region} ${(share.phone * 100).toFixed(1)}% under the phone, ${(share.shadow * 100).toFixed(1)}% under its shadow, ${share.clearance} px clear at ${Math.min(...config.preview.widths)} px`).join('; ')}.`);
  }
  await page.close();

  await writeFile(path.join(rendersDir, 'render.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Wrote ${rel(path.join(rendersDir, 'render.json'))}.`);

  if (preview) {
    // The art box on the remote card's gradient at each width, with each phone, laid out by the suggested CSS; the captions are page text only.
    const file = (dir, name) => `${pathToFileURL(path.join(dir, name))}?${Date.now()}`;
    const image = (className, src, [width, height]) => `<img class="${className}" src="${src}" width="${width}" height="${height}" alt="">`;
    const laptopSrc = file(mediaDir, `${output}.webp`);
    const phoneSrcs = [['installed phone artwork (public/media)', file(site, config.preview.phone), installed.phone.natural]];
    if (candidate) phoneSrcs.push(['same-session phone candidate (build only)', file(rendersDir, `${candidateName}.webp`), report.layout.coverage.candidate.phone.natural]);
    const quads = width => {
      const scale = layout.laptop.width * width / result.width;
      return Object.entries(result.stats.regions).map(([name, quad]) => `<polygon class="${name}" points="${quad.map(([x, y]) => `${(layout.laptop.left * width + x * scale).toFixed(1)},${(layout.laptop.top * width + y * scale).toFixed(1)}`).join(' ')}"/>`).join('');
    };
    const card = (phoneSrc, phoneSize, width, guides) => `<figure style="background:${config.preview.background}"><div class="feature__remote-art" style="width:${width}px;margin:0">${image('feature__remote-laptop', laptopSrc, installed.laptop.natural)}${image('feature__remote-phone', phoneSrc, phoneSize)}${guides ? `<svg width="${width}" height="${(width * boxHeight).toFixed(2)}">${quads(width)}</svg>` : ''}</div><figcaption>${width} CSS px${guides ? ', protected regions' : ''}</figcaption></figure>`;
    const rows = phoneSrcs.map(([label, src, size]) => `<h3>Laptop with the ${label}</h3><div class="row">${config.preview.widths.map(width => card(src, size, width, false)).join('')}${card(src, size, Math.max(...config.preview.widths), true)}</div>`);
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:24px;background:#0b1110;font:12px system-ui;color:#9fb3ad}
      h3{margin:0 0 10px;font-weight:500}
      .row{display:flex;gap:20px;align-items:flex-start;margin-bottom:24px}
      figure{margin:0;padding:22px;border-radius:16px;border:1px solid #ffffff14}
      ${report.layout.css.join('\n      ')}
      .feature__remote-art svg{position:absolute;left:0;top:0;overflow:visible}
      polygon{fill:none;stroke-width:1}
      .display{stroke:#ffffff80}.aircraft{stroke:#ff5a5a}.attribution{stroke:#5ab0ff}
      figcaption{margin-top:8px}
    </style>${rows.join('')}`;
    const previewHtml = path.join(out, 'preview.html');
    await writeFile(previewHtml, html);
    const previewPage = await openPage(2000, 900, 2);
    await previewPage.navigate(pathToFileURL(previewHtml).href, `[...document.images].every(image => image.complete && image.naturalWidth)`);
    // Cropped to the cards, which end well short of the page's width.
    const size = await previewPage.run(`(() => { const boxes = [...document.querySelectorAll('figure')].map(figure => figure.getBoundingClientRect()); return [Math.ceil(Math.max(...boxes.map(box => box.right)) + 24), Math.ceil(Math.max(...boxes.map(box => box.bottom)) + 24)]; })()`);
    await previewPage.screenshot(path.join(out, 'preview.png'), size);
    await previewPage.close();
    console.log(`Wrote ${rel(path.join(out, 'preview.png'))}.`);
  }
} finally {
  await chrome.close();
  await rm(profile, { recursive: true, force: true });
  server.close();
}
