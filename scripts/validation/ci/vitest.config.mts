// Runs the CI measurement probes on their own, on one worker:
//   npx vitest run --config scripts/validation/ci/vitest.config.mts
// They are named *.probe.ts, which `npm run test` does not collect, so they
// never run as part of the suite they measure.
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  root: path.resolve(import.meta.dirname, '../../..'),
  resolve: { dedupe: ['@babylonjs/core', '@babylonjs/loaders', '3d-tiles-renderer', 'react', 'react-dom'] },
  test: { include: ['scripts/validation/ci/*.probe.ts'], maxWorkers: 1, testTimeout: 600_000 },
})
