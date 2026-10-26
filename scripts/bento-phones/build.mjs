#!/usr/bin/env node
/**
 * One command for the bento phone artwork: capture the real screens, then render.
 *
 *   node scripts/bento-phones/build.mjs                 # capture both, render both
 *   node scripts/bento-phones/build.mjs --render-only   # rerender from build/bento-phones/captures/
 *
 * Also passes through --only=remote|multiplayer (both steps), --remote=fixture
 * (capture) and --no-preview (render). See docs/proposals/bento-phone-renderings.md.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const known = /^--(?:render-only|only=(?:remote|multiplayer)|remote=(?:live|fixture)|no-preview)$/;
const unknown = args.filter(value => !known.test(value));
if (unknown.length) {
  console.error(`Unknown option: ${unknown.join(' ')}\nUsage: node scripts/bento-phones/build.mjs [--render-only] [--only=remote|multiplayer] [--remote=fixture] [--no-preview]`);
  process.exit(2);
}

function run(script, scriptArgs) {
  const result = spawnSync(process.execPath, [path.join(here, script), ...scriptArgs], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!args.includes('--render-only')) run('capture.mjs', args.filter(value => /^--(?:only|remote)=/.test(value)));
run('render.mjs', args.filter(value => /^--(?:only=|no-preview$)/.test(value)));
