import { describe, expect, it, vi } from 'vitest'
import { createJoinSecret, createPairingUrl, INVITATION_TTL_MS, parsePairingUrl } from './pairing'

describe('phone invitation URLs', () => {
  it('generates 256 random bits and places the credential only in the fragment', () => {
    const secret = createJoinSecret()
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(createJoinSecret()).not.toBe(secret)
    const value = createPairingUrl('desktop-1', secret)
    const url = new URL(value)
    expect(url.origin).toBe('https://0sfs.github.io')
    expect(url.pathname).toBe('/')
    expect(url.search).toBe('?mode=remote')
    expect(url.search).not.toContain(secret)
    expect(parsePairingUrl(value)).toEqual({ peerId: 'desktop-1', secret })
    expect(INVITATION_TTL_MS).toBe(120_000)
  })

  it('cleans all simulator credentials and supports a configured public base', () => {
    const secret = createJoinSecret()
    vi.stubEnv('VITE_PHONE_CONTROLLER_URL', 'https://example.test/app?mapKey=private&mode=flight#old')
    try {
      const url = new URL(createPairingUrl('desktop', secret))
      expect(url.href).toBe(`https://example.test/app/?mode=remote#v=1&peer=desktop&join=${secret}`)
    } finally { vi.unstubAllEnvs() }
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
    for (const bad of [
      good.replace('https:', 'http:'), good.replace('mode=remote', 'mode=flight'),
      good.replace('mode=remote', 'mode=remote&mode=remote'), good.replace('v=1', 'v=2'),
      `${good}&v=1`, `${good}&unexpected=value`, good.replace('peer=desktop', 'peer=bad%2Fid'),
      good.replace(/join=.*/, 'join=short'), 'not a URL', `${good}${'x'.repeat(2048)}`,
    ]) expect(parsePairingUrl(bad)).toBeNull()
  })
})
