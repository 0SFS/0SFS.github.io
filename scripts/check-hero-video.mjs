#!/usr/bin/env node
/** Decode and seek both generated containers in Chrome, not just their headers. */
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
if (process.argv.includes('--help')) {
  console.log('Usage: npm run check:hero -- [--dir=capture-directory] [--install] [--browser-testing=checkout]');
  process.exit(0);
}
if (process.argv.slice(2).some(value => value !== '--install' && !/^--(?:dir|browser-testing)=.+/.test(value))) throw new Error('Unknown argument; use --help.');
const argument = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const directory = path.resolve(argument('dir', path.join(root, 'build/hero/f35-westbound-umn')));
const output = path.join(directory, 'decode-check');
const profile = path.join(output, 'chrome-profile');
await mkdir(output, { recursive: true });
const capture = JSON.parse(await readFile(path.join(directory, 'capture.json'), 'utf8'));
if (!capture.checks?.afterburnerDelayed || !capture.checks?.spoolingBeforeLight || !capture.checks?.noExternalTanks || !capture.checks?.skyTime || !capture.checks?.cameraOrbit || !capture.checks?.climbPitchReached || !capture.checks?.throttleStep || !capture.checks?.frameClock || !capture.checks?.dryBeforeCue || !capture.checks?.afterburnerLit || !capture.checks?.climbing || !capture.checks?.westbound || capture.errors.length) throw new Error('Capture telemetry did not pass. Record a fresh clip before checking or installing.');
const browserRoot = path.resolve(argument('browser-testing', path.join(root, '../../foss-earth/browser-testing')));
const { openHeadlessChrome, evaluate } = await import(pathToFileURL(path.join(browserRoot, 'src/headlessChrome.mjs')));
let chrome;
const results = [];
try {
  chrome = await openHeadlessChrome(profile, process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  const { targetId } = await chrome.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await chrome.send('Target.attachToTarget', { targetId, flatten: true });
  await chrome.send('Runtime.enable', {}, sessionId);
  for (const file of capture.files) {
    const bytes = await readFile(path.join(directory, file.filename));
    if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`Capture hash mismatch: ${file.filename}`);
    const type = file.codec === 'vp9' ? 'video/webm' : 'video/mp4';
    const result = await evaluate(chrome, sessionId, `(async () => {
      document.body.replaceChildren();
      const video = document.createElement('video');
      video.muted = true; video.preload = 'auto';
      document.body.appendChild(video);
      const bounded = (promise, label) => {
        let timer;
        return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), 8000); })]).finally(() => clearTimeout(timer));
      };
      const loaded = new Promise((resolve, reject) => {
        video.addEventListener('loadeddata', resolve, {once:true});
        video.addEventListener('error', () => reject(new Error('Decode error ' + video.error?.code)), {once:true});
      });
      video.src = ${JSON.stringify(`data:${type};base64,${bytes.toString('base64')}`)};
      await bounded(loaded, 'Video load timed out');
      const canvas = document.createElement('canvas');
      canvas.width = 720; canvas.height = 405 * 3;
      const context = canvas.getContext('2d', {willReadFrequently:true});
      const seeks = [];
      for (const [index, time] of [0, 2, 4.9].entries()) {
        if (Math.abs(video.currentTime - time) > .0001) {
          const seeked = new Promise(resolve => video.addEventListener('seeked', resolve, {once:true}));
          video.currentTime = time;
          await bounded(seeked, 'Video seek timed out');
        }
        context.drawImage(video, 0, index * 405, 720, 405);
        seeks.push(video.currentTime);
      }
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0, square = 0, count = 0;
      for (let i = 0; i < data.length; i += 400) { sum += data[i]; square += data[i] * data[i]; count++; }
      const variance = square / count - (sum / count) ** 2;
      const reset = new Promise(resolve => video.addEventListener('seeked', resolve, {once:true}));
      video.currentTime = 0;
      await bounded(reset, 'Playback reset timed out');
      await video.play();
      await bounded(new Promise(resolve => {
        const frame = (_, metadata) => metadata.mediaTime > .04 ? resolve() : video.requestVideoFrameCallback(frame);
        video.requestVideoFrameCallback(frame);
      }), 'Playback did not advance');
      video.pause();
      return { duration: video.duration, width: video.videoWidth, height: video.videoHeight, seeks,
        advancedTo: video.currentTime, variance, contact: canvas.toDataURL('image/jpeg', .88) };
    })()`);
    const { contact, ...metrics } = result;
    const passed = Math.abs(metrics.duration - capture.config.timeline.durationSeconds) < .05
      && metrics.width === capture.config.video.width && metrics.height === capture.config.video.height
      && metrics.advancedTo > .04 && metrics.variance > 20;
    await writeFile(path.join(output, `${file.codec}-contact.jpg`), Buffer.from(contact.split(',')[1], 'base64'));
    results.push({ file: file.filename, passed, ...metrics });
  }
  const passed = results.length === 2 && results.every(result => result.passed);
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ passed, results }, null, 2));
  console.log(JSON.stringify({ passed, results }, null, 2));
  if (!passed) process.exitCode = 1;
  if (passed && process.argv.includes('--install')) {
    const media = path.join(root, 'public/media');
    await mkdir(media, { recursive: true });
    const names = [...capture.files.map(file => file.filename), `${capture.config.name}-poster.jpg`];
    for (const name of names) await copyFile(path.join(directory, name), path.join(media, name));
    await writeFile(path.join(media, `${capture.config.name}.json`), JSON.stringify({
      config: capture.config, capturedAt: capture.capturedAt,
      source: capture.source, provenance: capture.provenance, checks: capture.checks,
      files: capture.files, decode: results,
    }, null, 2) + '\n');
    // Keep the visible timestamp consistent after the sunset is tuned.
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: capture.config.scene.timeZone, day:'numeric', month:'short', year:'numeric',
      hour:'2-digit', minute:'2-digit', hourCycle:'h23', timeZoneName:'short',
    }).formatToParts(new Date(capture.config.scene.dateTime)).map(part => [part.type, part.value]));
    const caption = `F-35B · Minneapolis · ${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} ${parts.timeZoneName}`;
    const htmlPath = path.join(root, 'index.html');
    const html = await readFile(htmlPath, 'utf8');
    const captionPattern = /<span>F-35B · Minneapolis · [^<]+<\/span>/g;
    if ([...html.matchAll(captionPattern)].length !== 1) throw new Error('Hero timestamp caption anchor changed.');
    let updated = html.replace(captionPattern, `<span>${caption}</span>`);
    // A new capture gets new URLs so an already-open browser cannot reuse old media.
    for (const name of names) {
      const version = createHash('sha256').update(await readFile(path.join(media, name))).digest('hex').slice(0, 12);
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      updated = updated.replace(new RegExp(`media/${escaped}(?:\\?v=[a-f0-9]+)?`, 'g'), `media/${name}?v=${version}`);
    }
    await writeFile(htmlPath, updated);
    console.log(`Installed verified video and poster in ${media}`);
  }
} finally {
  if (chrome) await chrome.close();
  await rm(profile, { recursive: true, force: true });
}
