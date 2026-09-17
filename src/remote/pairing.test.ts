import { describe, expect, it, vi } from 'vitest'
import { appRouteFrom } from '../appRoute'
import {
  createJoinSecret, createPairingUrl, createSessionId, isLoopbackHost, isPrivateHost,
  INVITATION_TTL_MS, parsePairingUrl,
} from './pairing'

/** Stands in for the browser the desktop dialog runs in. */
function onPage<T>(href: string, lanOrigin: string | null, run: () => T): T {
  const scope = globalThis as { window?: unknown; __OSFS_LAN_ORIGIN__?: unknown }
  const hadWindow = 'window' in scope
  const previousWindow = scope.window
  scope.window = { location: new URL(href) }
  if (lanOrigin === null) delete scope.__OSFS_LAN_ORIGIN__
  else scope.__OSFS_LAN_ORIGIN__ = lanOrigin
  try {
    return run()
  } finally {
    if (hadWindow) scope.window = previousWindow
    else delete scope.window
    delete scope.__OSFS_LAN_ORIGIN__
  }
}

describe('phone invitation URLs', () => {
  it('generates 256 random bits and places the credential only in the fragment', () => {
    const secret = createJoinSecret()
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(createJoinSecret()).not.toBe(secret)
    const value = createPairingUrl('desktop-1', secret)
    const url = new URL(value)
    expect(url.origin).toBe('https://0sfs.github.io')
    expect(url.pathname).toBe('/rc/')
    expect(url.search).toBe('')
    expect(url.search).not.toContain(secret)
    expect(parsePairingUrl(value)).toEqual({ peerId: 'desktop-1', secret })
    expect(appRouteFrom(url)).toBe('remote')
    expect(INVITATION_TTL_MS).toBe(120_000)
  })

  it('points the QR at the site the desktop is already on', () => {
    const secret = createJoinSecret()
    const url = onPage('https://fly.example.test/fly/?mapKey=private', null,
      () => new URL(createPairingUrl('desktop', secret)))
    expect(url.href).toBe(`https://fly.example.test/rc/#v=1&peer=desktop&join=${secret}`)
    // The deployed default is a fallback, not the answer whenever a page exists.
    expect(url.origin).not.toBe('https://0sfs.github.io')
  })

  it('swaps a loopback origin for the address the dev server reported', () => {
    const secret = createJoinSecret()
    const url = onPage('http://localhost:5173/fly/', 'http://192.168.0.112:5173',
      () => new URL(createPairingUrl('desktop', secret)))
    // A phone cannot reach the laptop's loopback, so the QR must not offer it.
    expect(url.host).toBe('192.168.0.112:5173')
    expect(url.pathname).toBe('/rc/')
    expect(parsePairingUrl(url.href)).toEqual({ peerId: 'desktop', secret })
  })

  it('explains what to run when loopback has no reachable address', () => {
    expect(() => onPage('http://localhost:5173/fly/', null,
      () => createPairingUrl('desktop', createJoinSecret()))).toThrow(/npm run dev:lan/)
  })

  it('serves plain HTTP only on a private network, never on a public host', () => {
    const secret = createJoinSecret()
    const lan = onPage('http://192.168.0.112:5173/fly/', null,
      () => createPairingUrl('desktop', secret))
    expect(new URL(lan).protocol).toBe('http:')
    expect(parsePairingUrl(lan)).toEqual({ peerId: 'desktop', secret })
    // The same shape on a routable host stays rejected on both sides.
    expect(() => createPairingUrl('desktop', secret, 'http://fly.example.test/')).toThrow()
    expect(parsePairingUrl(lan.replace('192.168.0.112', 'fly.example.test'))).toBeNull()
  })

  it('classifies hosts the way the origin rule depends on', () => {
    for (const host of ['localhost', '127.0.0.1', '::1', 'dev.localhost']) {
      expect(isLoopbackHost(host)).toBe(true)
      expect(isPrivateHost(host)).toBe(true)
    }
    for (const host of ['192.168.0.112', '10.1.2.3', '172.16.0.9', '172.31.255.1', 'fd00::1']) {
      expect(isLoopbackHost(host)).toBe(false)
      expect(isPrivateHost(host)).toBe(true)
    }
    for (const host of ['0sfs.github.io', '8.8.8.8', '172.32.0.1', '11.0.0.1']) {
      expect(isPrivateHost(host)).toBe(false)
    }
  })

  it('generates a session id without needing a secure context', () => {
    const id = createSessionId()
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    expect(createSessionId()).not.toBe(id)
  })

  it('cleans all simulator credentials and supports a configured public base', () => {
    const secret = createJoinSecret()
    vi.stubEnv('VITE_PHONE_CONTROLLER_URL', 'https://example.test/app?mapKey=private&mode=flight#old')
    try {
      const url = new URL(createPairingUrl('desktop', secret))
      expect(url.href).toBe(`https://example.test/app/rc/#v=1&peer=desktop&join=${secret}`)
      expect(appRouteFrom(url, '/app/')).toBe('remote')
    } finally { vi.unstubAllEnvs() }
  })

  it('still parses a legacy ?mode=remote QR', () => {
    const secret = createJoinSecret()
    const legacy = `https://0sfs.github.io/?mode=remote#v=1&peer=desktop-1&join=${secret}`
    expect(parsePairingUrl(legacy)).toEqual({ peerId: 'desktop-1', secret })
    expect(appRouteFrom(new URL(legacy))).toBe('remote')
  })

  it('rejects insecure or malformed bases and credentials', () => {
    const secret = createJoinSecret()
    for (const base of ['http://example.test/', 'https://user:pass@example.test/', 'javascript:alert(1)']) {
      expect(() => createPairingUrl('desktop', secret, base)).toThrow()
    }
    expect(() => createPairingUrl('bad/id', secret)).toThrow()
    expect(() => createPairingUrl('desktop', 'short')).toThrow()
  })

  it('rejects malformed, duplicate, unsupported and oversized invitations', () => {
    const good = createPairingUrl('desktop', createJoinSecret())
    const hash = new URL(good).hash.slice(1)
    for (const bad of [
      good.replace('https:', 'http:'),
      good.replace('/rc/', '/fly/'),
      good.replace('/rc/', '/'),
      `https://0sfs.github.io/?mode=flight#${hash}`,
      `https://0sfs.github.io/?mode=remote&mode=remote#${hash}`,
      good.replace('v=1', 'v=2'),
      `${good}&v=1`, `${good}&unexpected=value`, good.replace('peer=desktop', 'peer=bad%2Fid'),
      good.replace(/join=.*/, 'join=short'), 'not a URL', `${good}${'x'.repeat(2048)}`,
    ]) expect(parsePairingUrl(bad)).toBeNull()
  })
})
