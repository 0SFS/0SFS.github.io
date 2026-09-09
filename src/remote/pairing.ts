export const INVITATION_TTL_MS = 120_000

const DEFAULT_CONTROLLER_URL = 'https://felipegalind0.io/flight-sim/'
const PEER_ID = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,126}[A-Za-z0-9])?$/
const JOIN_SECRET = /^[A-Za-z0-9_-]{43}$/

/** The invitation is a one-use bearer credential, retained only in memory. */
export function createJoinSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function createPairingUrl(peerId: string, secret: string, baseUrl?: string): string {
  if (!PEER_ID.test(peerId) || !JOIN_SECRET.test(secret)) throw new Error('Invalid phone invitation.')
  const url = new URL(baseUrl || import.meta.env.VITE_PHONE_CONTROLLER_URL || DEFAULT_CONTROLLER_URL)
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Phone controller URL must use HTTPS without credentials.')
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  // Never copy simulator map credentials or arbitrary desktop parameters to the phone.
  url.search = '?mode=remote'
  url.hash = new URLSearchParams({ v: '1', peer: peerId, join: secret }).toString()
  return url.href
}

export function parsePairingUrl(value: string): { peerId: string; secret: string } | null {
  if (value.length > 2048) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.searchParams.get('mode') !== 'remote') return null
    if (url.searchParams.getAll('mode').length !== 1) return null
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
