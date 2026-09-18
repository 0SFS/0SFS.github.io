/**
 * Render step for `scripts/check-phone-layout.mjs`.
 *
 * `render.tsx` is deliberately not named `*.test.tsx`: it writes files as a
 * side effect and must not be collected by `npm run test`. This config opts it
 * in explicitly, and is the only thing that runs it.
 */
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  root: path.resolve(import.meta.dirname, '../..'),
  plugins: [react()],
  test: { include: ['scripts/phone-layout/render.tsx'] },
})
