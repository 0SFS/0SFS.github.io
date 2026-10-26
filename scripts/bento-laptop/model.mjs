#!/usr/bin/env node
/**
 * Fetches the pre-made laptop model the artwork renders: rtql8d's "MacBook Air
 * M2" (CC-BY-4.0), Sketchfab's own glTF export, from the pinned commits of the
 * public repositories in config.json `model.mirrors`. Every file must match its
 * SHA-256 in `model.files`; files already in place that match are kept.
 *
 *   node scripts/bento-laptop/model.mjs
 *
 * The files are data only: render.mjs serves them to Babylon's glTF loader and
 * never runs anything from them. They live in their own ignored directory,
 * build/bento-laptop/model/macbook-air-m2/, and are never edited there.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '../..');

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** Makes sure every model file is present and unmodified. Returns the model directory and what happened to each file. */
export async function ensureModel(config, { log = console.log } = {}) {
  const model = config.model;
  const dir = path.resolve(site, model.dir);
  const files = {};
  for (const [name, expected] of Object.entries(model.files)) {
    const file = path.resolve(dir, name);
    if (!file.startsWith(dir + path.sep)) throw new Error(`model file ${name} is outside ${model.dir}`);
    const existing = await readFile(file).catch(() => null);
    if (existing && sha256(existing) === expected) { files[name] = 'present'; continue; }
    let fetched = null;
    const failures = [];
    for (const mirror of model.mirrors) {
      const url = new URL(name.split('/').map(encodeURIComponent).join('/'), mirror);
      try {
        const response = await fetch(url, { redirect: 'follow' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        const hash = sha256(bytes);
        if (hash !== expected) throw new Error(`SHA-256 ${hash.slice(0, 12)}…, expected ${expected.slice(0, 12)}…`);
        fetched = { bytes, from: url.origin };
        break;
      } catch (error) {
        failures.push(`${url.href}: ${error.message}`);
      }
    }
    if (!fetched) throw new Error(`Could not fetch ${name} for the laptop model:\n  ${failures.join('\n  ')}`);
    await mkdir(path.dirname(file), { recursive: true });
    // Written beside its final name and renamed, so an interrupted fetch never leaves a partial file in place.
    const partial = `${file}.partial`;
    await writeFile(partial, fetched.bytes);
    await rename(partial, file).catch(async error => { await rm(partial, { force: true }); throw error; });
    files[name] = `fetched (${fetched.bytes.length} bytes)`;
    log(`Model: ${name} ${files[name]}.`);
  }
  return { dir, files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(await readFile(path.join(here, 'config.json'), 'utf8'));
  const { dir, files } = await ensureModel(config);
  console.log(`Model "${config.model.title}" by ${config.model.author} (${config.model.license}) in ${path.relative(site, dir)}: ${Object.values(files).filter(state => state === 'present').length} of ${Object.keys(files).length} files already present and verified.`);
}
