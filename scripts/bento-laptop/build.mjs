#!/usr/bin/env node
/**
 * The bento laptop artwork in one command: captures both screens from one live
 * paired session (capture.mjs), then renders the laptop, the same-session phone
 * candidate and the card preview from them (render.mjs).
 *
 *   node scripts/bento-laptop/build.mjs                 # capture, then render
 *   node scripts/bento-laptop/build.mjs --render-only   # render from the saved captures
 *
 * --no-candidate and --no-preview go to render.mjs. A failed capture stops
 * here and leaves the previous captures and artwork in place.
 * See docs/proposals/bento-laptop-rendering.md.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const renderArgs = ['--no-candidate', '--no-preview'];
const unknown = args.filter(arg => arg !== '--render-only' && !renderArgs.includes(arg));
if (unknown.length) {
  console.error(`Unknown option ${unknown.join(', ')}. Usage: node scripts/bento-laptop/build.mjs [--render-only] [--no-candidate] [--no-preview]`);
  process.exit(2);
}

// Each step stops its own browser and server on an interrupt; wait for that rather than exit under it.
process.on('SIGINT', () => {});
process.on('SIGTERM', () => {});

function run(script, scriptArgs = []) {
  const result = spawnSync(process.execPath, [path.join(here, script), ...scriptArgs], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`${script} ${result.signal ? `stopped by ${result.signal}` : `failed (exit ${result.status})`}; nothing after it ran.`);
    process.exit(result.status || 1);
  }
}

if (!args.includes('--render-only')) run('capture.mjs');
run('render.mjs', args.filter(arg => renderArgs.includes(arg)));
