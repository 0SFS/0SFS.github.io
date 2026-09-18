/**
 * Which ICE servers the phone link may use.
 *
 * Both ends load the same bundle, so a build-time `VITE_ICE_SERVERS` reaches
 * the desktop and the phone together. `localStorage` is the per-device escape
 * hatch for trying a relay without rebuilding.
 *
 * STUN alone only discovers addresses. When an access point isolates its
 * clients, or a router will not loop a connection back to itself, there is no
 * address that works and only a TURN relay can carry the traffic — so this is
 * configurable rather than hard-coded.
 */

export const ICE_SERVERS_STORAGE_KEY = 'osfs.ice-servers'

/**
 * Several independent STUN hosts: one blocked or rate-limited server then
 * costs a little gathering time instead of the whole connection.
 */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
]

function isIceServer(value: unknown): value is RTCIceServer {
  if (typeof value !== 'object' || value === null) return false
  const server = value as Record<string, unknown>
  const urls = server.urls
  const valid = (url: unknown) => typeof url === 'string' && /^(stun|stuns|turn|turns):/i.test(url) && url.length <= 512
  if (!(typeof urls === 'string' ? valid(urls) : Array.isArray(urls) && urls.length > 0 && urls.every(valid))) return false
  if (server.username !== undefined && typeof server.username !== 'string') return false
  if (server.credential !== undefined && typeof server.credential !== 'string') return false
  return true
}

export function parseIceServers(value: string | null | undefined): RTCIceServer[] | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    const list = Array.isArray(parsed) ? parsed : [parsed]
    const servers = list.filter(isIceServer)
    return servers.length > 0 && servers.length === list.length ? servers : null
  } catch {
    return null
  }
}

export interface IceConfigSource {
  servers: RTCIceServer[]
  /** Where the list came from, for the diagnostics report. */
  origin: 'default' | 'build' | 'device'
}

export function resolveIceServers(storage?: Pick<Storage, 'getItem'> | null): IceConfigSource {
  let store = storage
  if (store === undefined) {
    try { store = typeof localStorage === 'undefined' ? null : localStorage } catch { store = null }
  }
  try {
    const device = parseIceServers(store?.getItem(ICE_SERVERS_STORAGE_KEY))
    if (device) return { servers: device, origin: 'device' }
  } catch { /* Private browsing can throw on read; fall through to the build list. */ }
  const build = parseIceServers(import.meta.env?.VITE_ICE_SERVERS as string | undefined)
  if (build) return { servers: build, origin: 'build' }
  return { servers: DEFAULT_ICE_SERVERS, origin: 'default' }
}
