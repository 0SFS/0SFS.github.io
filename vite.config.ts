import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { findLanAddress } from './scripts/dev-lan.mjs'

/** GitHub Pages has no SPA fallback; /fly/ and /rc/ must be real files. */
function copyIndexToPagesPaths(): Plugin {
  let outDir = 'dist'
  return {
    name: 'copy-index-to-pages-paths',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const index = path.join(outDir, 'index.html')
      if (!existsSync(index)) return
      for (const dir of ['fly', 'rc']) {
        mkdirSync(path.join(outDir, dir), { recursive: true })
        cpSync(index, path.join(outDir, dir, 'index.html'))
      }
    },
  }
}

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1]
// A `<owner>.github.io` repository is served from the domain root; any other
// repository is served from `/<repository>/`.
const isRootPagesSite = repositoryName?.endsWith('.github.io') ?? false
const base = process.env.GITHUB_ACTIONS && repositoryName && !isRootPagesSite ? `/${repositoryName}/` : '/'

function getGitOutput(command: string): string | null {
  try {
    return execSync(command, { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

function getRepositorySlug(): string {
  const envRepository = process.env.GITHUB_REPOSITORY?.trim()
  if (envRepository) return envRepository

  const remoteUrl = getGitOutput('git config --get remote.origin.url') ?? ''
  const githubMatch = remoteUrl.match(/github\.com[:/]([^/]+\/[^/]+)$/)
  return githubMatch?.[1].replace(/\.git$/, '') ?? ''
}

const sourceCommit = getGitOutput('git rev-parse --short=12 HEAD') ?? 'unknown'
const sourceDirty = Boolean(getGitOutput('git status --short'))
const sourceVersion = `${sourceCommit}${sourceDirty ? '-dirty' : ''}`

/**
 * Tells the page which address other devices can reach this dev server on.
 *
 * A browser cannot discover its own LAN address — WebRTC stopped handing that
 * out years ago — but the dev server knows it. The phone controller QR needs
 * it, because a QR pointing at `localhost` is unreachable from a phone.
 *
 * Injected only when the server is actually bound to something other than
 * loopback, so the QR never advertises an address nothing is listening on.
 */
function lanOriginPlugin(): Plugin {
  let origin: string | null = null
  return {
    name: 'osfs-lan-origin',
    apply: 'serve',
    configureServer(server) {
      const publish = () => {
        const address = server.httpServer?.address()
        if (!address || typeof address === 'string') return
        const bound = address.address
        const loopback = bound === '127.0.0.1' || bound === '::1' || bound === 'localhost'
        if (loopback) return
        // `0.0.0.0`/`::` means every interface; pick the routable one.
        const host = bound === '0.0.0.0' || bound === '::' ? findLanAddress()?.address : bound
        if (!host) return
        origin = `${server.config.server.https ? 'https' : 'http'}://${host}:${address.port}`
      }
      server.httpServer?.once('listening', publish)
    },
    transformIndexHtml() {
      if (!origin) return
      return [{
        tag: 'script',
        injectTo: 'head-prepend' as const,
        children: `window.__OSFS_LAN_ORIGIN__=${JSON.stringify(origin)}`,
      }]
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base,
  server: {
    fs: { allow: [".", "../foss-earth"] },
    // `scripts/dev-lan.mjs` supplies these so a phone gets a secure context on
    // the LAN; `crypto.randomUUID` and the wake lock need one. Plain `npm run
    // dev` leaves them unset and stays on HTTP.
    ...(process.env.DEV_TLS_CERT && process.env.DEV_TLS_KEY
      ? { https: { cert: readFileSync(process.env.DEV_TLS_CERT), key: readFileSync(process.env.DEV_TLS_KEY) } }
      : {}),
  },
  resolve: {
    dedupe: ['@babylonjs/core', '@babylonjs/loaders', '3d-tiles-renderer', 'react', 'react-dom'],
  },
  optimizeDeps: {
    exclude: ['@felipegalind0/jsbsim'],
  },
  assetsInclude: ['**/*.wasm'],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __SOURCE_VERSION__: JSON.stringify(sourceVersion),
    __REPOSITORY_SLUG__: JSON.stringify(getRepositorySlug()),
  },
  plugins: [react(), copyIndexToPagesPaths(), lanOriginPlugin()],
  test: {
    // `build/` holds gitignored validation sandboxes, some of which symlink to
    // sibling packages. Collecting those runs another package's tests under
    // this config and fails on environment it never opted into.
    exclude: [...configDefaults.exclude, 'build/**'],
  },
})
