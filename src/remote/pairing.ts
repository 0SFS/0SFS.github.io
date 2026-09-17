export const INVITATION_TTL_MS = 120_000

/** Only reached when there is no page to take an origin from, such as in tests. */
const DEFAULT_CONTROLLER_URL = 'https://0sfs.github.io/'
const PEER_ID = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,126}[A-Za-z0-9])?$/
const JOIN_SECRET = /^[A-Za-z0-9_-]{43}$/

/** The invitation is a one-use bearer credential, retained only in memory. */
export function createJoinSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * `crypto.randomUUID` exists only in a secure context, and local development
 * over plain HTTP on a LAN is not one. `getRandomValues` is available
 * everywhere and carries the same 128 bits.
 */
export function createSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function stripBrackets(hostname: string): string {
  return hostname.replace(/^\[/, '').replace(/\]$/, '')
}

export function isLoopbackHost(hostname: string): boolean {
  const host = stripBrackets(hostname).toLowerCase()
  return host === 'localhost' || host.endsWith('.localhost')
    || host === '::1' || host === '0:0:0:0:0:0:0:1' || /^127\./.test(host)
}

/** Loopback plus the ranges a laptop and a phone share on a home network. */
export function isPrivateHost(hostname: string): boolean {
  const host = stripBrackets(hostname).toLowerCase()
  if (isLoopbackHost(host)) return true
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true
  // Unique-local and link-local IPv6.
  return /^(fc|fd|fe80:)/.test(host)
}

/**
 * HTTPS everywhere, except plain HTTP on a private address. A deployed site is
 * never on one of those hosts, so a published QR is always HTTPS; a laptop
 * serving `http://192.168.x.x:5173` during development is, and requiring TLS
 * there would mean no local testing without a certificate.
 */
function isUsableControllerOrigin(url: URL): boolean {
  if (url.username || url.password) return false
  if (url.protocol === 'https:') return true
  return url.protocol === 'http:' && isPrivateHost(url.hostname)
}

/** Set by the dev server when it is reachable from other devices. */
function injectedLanOrigin(): string | null {
  const value = (globalThis as { __OSFS_LAN_ORIGIN__?: unknown }).__OSFS_LAN_ORIGIN__
  return typeof value === 'string' && value ? value : null
}

/**
 * The phone should load the site the desktop is already on. An explicit
 * `VITE_PHONE_CONTROLLER_URL` still wins, for a deployment whose QR must point
 * somewhere else.
 */
export function defaultControllerUrl(): string {
  const configured = import.meta.env.VITE_PHONE_CONTROLLER_URL
  if (configured) return configured
  const here = typeof window === 'undefined' ? null : window.location
  if (!here) return DEFAULT_CONTROLLER_URL
  const base = import.meta.env.BASE_URL || '/'
  // A phone cannot reach the laptop's loopback address, so swap in the LAN
  // origin the dev server reported. Without one there is nothing to point at.
  if (isLoopbackHost(here.hostname)) {
    const lan = injectedLanOrigin()
    if (!lan) {
      throw new Error(
        'The phone cannot reach this computer at ' + here.host + '. '
        + 'Serve the site on your network first: run `npm run dev:lan`, or `npm run dev -- --host`.',
      )
    }
    return new URL(base, lan).href
  }
  return new URL(base, here.origin).href
}

function isRemoteControllerPath(pathname: string): boolean {
  const trimmed = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  return trimmed === '/rc' || trimmed.endsWith('/rc')
}

export function createPairingUrl(peerId: string, secret: string, baseUrl?: string): string {
  if (!PEER_ID.test(peerId) || !JOIN_SECRET.test(secret)) throw new Error('Invalid phone invitation.')
  const url = new URL(baseUrl || defaultControllerUrl())
  if (!isUsableControllerOrigin(url)) {
    throw new Error('Phone controller URL must use HTTPS without credentials, or plain HTTP on a private network.')
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  url.pathname += 'rc/'
  // Never copy simulator map credentials or arbitrary desktop parameters to the phone.
  url.search = ''
  url.hash = new URLSearchParams({ v: '1', peer: peerId, join: secret }).toString()
  return url.href
}

export function parsePairingUrl(value: string): { peerId: string; secret: string } | null {
  if (value.length > 2048) return null
  try {
    const url = new URL(value)
    if (!isUsableControllerOrigin(url)) return null
    const modes = url.searchParams.getAll('mode')
    if (modes.length > 1) return null
    const mode = modes[0]
    if (mode === 'remote') {
      // Legacy QR: https://0sfs.github.io/?mode=remote#…
    } else if (mode != null) {
      return null
    } else if (!isRemoteControllerPath(url.pathname)) {
      return null
    }
    const fragment = new URLSearchParams(url.hash.slice(1))
    if ([...fragment.keys()].length !== 3 || fragment.get('v') !== '1') return null
    const peerId = fragment.get('peer') ?? ''
    const secret = fragment.get('join') ?? ''
    if (!PEER_ID.test(peerId) || !JOIN_SECRET.test(secret)) return null
    return { peerId, secret }
  } catch {
    return null
  }
}
