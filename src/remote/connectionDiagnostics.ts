/**
 * Observable pairing: every step of a phone connection is recorded here, on
 * both endpoints, so a failure names its own cause instead of guessing at
 * Wi-Fi. Nothing in this module changes connection behaviour — it only
 * watches — so a diagnostic gap can never break a working flight link.
 *
 * Addresses are masked (last IPv4 octet / last IPv6 group) before they reach
 * the log. The part that matters for a local-network diagnosis — subnet,
 * candidate type, and whether a host candidate is an mDNS `.local` name — is
 * preserved, but a full public IP never lands in a report the user pastes
 * into an issue.
 */

export type DiagnosticLevel = 'info' | 'warn' | 'error'
export type DiagnosticRole = 'desktop' | 'phone'
export type DiagnosticScope = 'signaling' | 'ice' | 'channel' | 'session'

export interface DiagnosticEvent {
  /** Milliseconds since this log was created. */
  at: number
  scope: DiagnosticScope
  /** Stable machine-readable identifier; safe to match on in tests and issues. */
  code: string
  detail: string
  level: DiagnosticLevel
}

export interface CandidateTally {
  host: number
  srflx: number
  prflx: number
  relay: number
  /** Host candidates hidden behind an mDNS `.local` name rather than a real address. */
  mdns: number
}

export interface IceCandidateFailure {
  code: number | null
  url: string
  text: string
  count: number
}

export interface SelectedPair {
  local: string
  remote: string
  localType: string
  remoteType: string
  protocol: string
  rttMs: number | null
}

export interface DiagnosticFacts {
  role: DiagnosticRole
  peerId: string | null
  remotePeerId: string | null
  signaling: {
    registered: boolean
    registeredAtMs: number | null
    connected: boolean
    /** PeerJS error type, e.g. `peer-unavailable`, `network`, `server-error`. */
    lastErrorType: string | null
    lastErrorDetail: string | null
  }
  ice: {
    gatheringState: string | null
    connectionState: string | null
    peerConnectionState: string | null
    signalingState: string | null
    local: CandidateTally
    remote: CandidateTally
    /** STUN/TURN server errors reported while gathering. */
    serverErrors: IceCandidateFailure[]
    selected: SelectedPair | null
    /** Configured ICE servers, credentials stripped. */
    servers: string[]
  }
  channels: {
    reliableOpenMs: number | null
    controlOpenMs: number | null
    controlStreamId: number | null
  }
  failure: { code: string; detail: string } | null
}

export interface ConnectionLog {
  readonly role: DiagnosticRole
  record(scope: DiagnosticScope, code: string, detail: string, level?: DiagnosticLevel): void
  /** Records an event and marks it as the cause the user is shown. */
  recordFailure(scope: DiagnosticScope, code: string, detail: string): void
  update(patch: (facts: DiagnosticFacts) => void): void
  /** Clears the per-attempt facts and keeps the timeline, so one report can
   *  cover several pairing attempts. */
  reset(reason: string): void
  entries(): readonly DiagnosticEvent[]
  facts(): DiagnosticFacts
  /** Monotonic change counter. Facts and entries are mutated in place, so this
   *  is the stable snapshot a `useSyncExternalStore` subscriber can compare. */
  version(): number
  subscribe(listener: () => void): () => void
  /** Plain-text transcript, safe to paste into a bug report. */
  report(): string
  destroy(): void
}

const MAX_EVENTS = 300
const MAX_SERVER_ERRORS = 12

function emptyTally(): CandidateTally {
  return { host: 0, srflx: 0, prflx: 0, relay: 0, mdns: 0 }
}

/** Keeps the subnet — the part that answers "same network?" — and drops the host part. */
export function maskAddress(address: string | null | undefined): string {
  if (!address) return 'unknown'
  if (address.endsWith('.local')) return 'mDNS .local'
  if (address.includes(':')) {
    const groups = address.split(':')
    return groups.length > 1 ? `${groups.slice(0, -1).join(':')}:xxxx` : 'ipv6'
  }
  const octets = address.split('.')
  return octets.length === 4 ? `${octets.slice(0, 3).join('.')}.x` : 'address'
}

/** Strips credentials so a report can quote which servers were tried. */
export function describeIceServers(servers: RTCIceServer[] | undefined): string[] {
  if (!servers) return []
  return servers.flatMap(server => {
    const urls = typeof server.urls === 'string' ? [server.urls] : server.urls ?? []
    return urls.map(url => (server.credential ? `${url} (with credentials)` : url))
  })
}

export function createConnectionLog(role: DiagnosticRole, now: () => number = () => performance.now()): ConnectionLog {
  const started = now()
  const events: DiagnosticEvent[] = []
  const listeners = new Set<() => void>()
  let destroyed = false
  let version = 0
  const facts: DiagnosticFacts = {
    role,
    peerId: null,
    remotePeerId: null,
    signaling: { registered: false, registeredAtMs: null, connected: false, lastErrorType: null, lastErrorDetail: null },
    ice: {
      gatheringState: null, connectionState: null, peerConnectionState: null, signalingState: null,
      local: emptyTally(), remote: emptyTally(), serverErrors: [], selected: null, servers: [],
    },
    channels: { reliableOpenMs: null, controlOpenMs: null, controlStreamId: null },
    failure: null,
  }

  const notify = () => {
    version += 1
    for (const listener of [...listeners]) listener()
  }

  const log: ConnectionLog = {
    role,
    record(scope, code, detail, level = 'info') {
      if (destroyed) return
      events.push({ at: Math.round(now() - started), scope, code, detail, level })
      // Bound the transcript: a long flight must not grow this without limit.
      if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS)
      notify()
    },
    recordFailure(scope, code, detail) {
      if (destroyed) return
      // The first cause is the useful one; later teardown noise must not bury it.
      if (!facts.failure) facts.failure = { code, detail }
      this.record(scope, code, detail, 'error')
    },
    update(patch) {
      if (destroyed) return
      patch(facts)
      notify()
    },
    reset(reason) {
      if (destroyed) return
      facts.peerId = null
      facts.remotePeerId = null
      facts.signaling = { registered: false, registeredAtMs: null, connected: false, lastErrorType: null, lastErrorDetail: null }
      facts.ice = {
        gatheringState: null, connectionState: null, peerConnectionState: null, signalingState: null,
        local: emptyTally(), remote: emptyTally(), serverErrors: [], selected: null, servers: facts.ice.servers,
      }
      facts.channels = { reliableOpenMs: null, controlOpenMs: null, controlStreamId: null }
      facts.failure = null
      this.record('session', 'attempt-reset', reason)
    },
    entries: () => events,
    facts: () => facts,
    version: () => version,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    report: () => formatReport(facts, events),
    destroy() {
      destroyed = true
      listeners.clear()
    },
  }
  log.record('session', 'log-started', `${role} diagnostics started`)
  return log
}

function formatTally(tally: CandidateTally): string {
  const parts = (['host', 'srflx', 'prflx', 'relay'] as const)
    .filter(key => tally[key] > 0)
    .map(key => `${key}=${tally[key]}`)
  if (tally.mdns > 0) parts.push(`mdns=${tally.mdns}`)
  return parts.length ? parts.join(' ') : 'none'
}

export function formatReport(facts: DiagnosticFacts, events: readonly DiagnosticEvent[]): string {
  const lines: string[] = []
  lines.push(`OSFS phone controller diagnostics (${facts.role})`)
  lines.push(`user agent: ${typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent}`)
  lines.push(`peer id: ${facts.peerId ?? '—'}${facts.remotePeerId ? ` → ${facts.remotePeerId}` : ''}`)
  lines.push(`signaling: ${facts.signaling.registered ? 'registered' : 'not registered'}`
    + `${facts.signaling.registeredAtMs === null ? '' : ` in ${facts.signaling.registeredAtMs} ms`}`
    + `, ${facts.signaling.connected ? 'connected' : 'disconnected'}`
    + `${facts.signaling.lastErrorType ? `, last error ${facts.signaling.lastErrorType}: ${facts.signaling.lastErrorDetail ?? ''}` : ''}`)
  lines.push(`ice: gathering=${facts.ice.gatheringState ?? '—'} connection=${facts.ice.connectionState ?? '—'}`
    + ` peer=${facts.ice.peerConnectionState ?? '—'} signaling=${facts.ice.signalingState ?? '—'}`)
  lines.push(`ice servers: ${facts.ice.servers.length ? facts.ice.servers.join(', ') : 'none'}`)
  lines.push(`local candidates: ${formatTally(facts.ice.local)}`)
  lines.push(`remote candidates: ${formatTally(facts.ice.remote)}`)
  for (const error of facts.ice.serverErrors) {
    lines.push(`ice server error: ${error.url} code=${error.code ?? '—'} ${error.text}${error.count > 1 ? ` (x${error.count})` : ''}`)
  }
  lines.push(facts.ice.selected
    ? `selected pair: ${facts.ice.selected.localType} ${facts.ice.selected.local} → ${facts.ice.selected.remoteType} ${facts.ice.selected.remote}`
      + ` over ${facts.ice.selected.protocol}${facts.ice.selected.rttMs === null ? '' : `, rtt ${facts.ice.selected.rttMs.toFixed(1)} ms`}`
    : 'selected pair: none')
  lines.push(`channels: session=${facts.channels.reliableOpenMs === null ? 'never opened' : `${facts.channels.reliableOpenMs} ms`}`
    + `, controls=${facts.channels.controlOpenMs === null ? 'never opened' : `${facts.channels.controlOpenMs} ms`}`
    + `${facts.channels.controlStreamId === null ? '' : ` (stream ${facts.channels.controlStreamId})`}`)
  lines.push(`failure: ${facts.failure ? `${facts.failure.code} — ${facts.failure.detail}` : 'none'}`)
  lines.push('', 'timeline:')
  for (const event of events) {
    lines.push(`${String(event.at).padStart(6)} ms  ${event.level === 'info' ? ' ' : event.level === 'warn' ? '!' : 'X'} `
      + `[${event.scope}] ${event.code}: ${event.detail}`)
  }
  return lines.join('\n')
}

/**
 * Explains an ICE failure from what was actually gathered, rather than
 * repeating one catch-all sentence about guest Wi-Fi.
 */
export function describeIceFailure(facts: DiagnosticFacts): string {
  const { local, remote, serverErrors, connectionState } = facts.ice
  const localTotal = local.host + local.srflx + local.prflx + local.relay
  const remoteTotal = remote.host + remote.srflx + remote.prflx + remote.relay
  if (localTotal === 0) {
    return serverErrors.length
      ? `This device gathered no network candidates; the STUN server returned ${serverErrors[0].text}. A firewall or VPN is likely blocking UDP.`
      : 'This device gathered no network candidates at all. A VPN, firewall, or browser privacy setting is blocking WebRTC.'
  }
  if (remoteTotal === 0) {
    return 'No candidates ever arrived from the other device, so the two never had a path to try.'
      + ' The other end is still gathering, was closed, or its signaling dropped before it answered.'
  }
  if (local.host > 0 && local.mdns === local.host && remote.mdns > 0) {
    return `Both devices only offered mDNS (.local) host candidates and could not resolve each other's names.`
      + ` On macOS and iOS this is the Local Network permission: allow it for this browser, then pair again.`
  }
  if (local.relay === 0 && remote.relay === 0) {
    return `Tried ${localTotal} local and ${remoteTotal} remote candidates with no working pair, and no TURN relay is configured.`
      + ' Devices on the same Wi-Fi hit this when the access point blocks client-to-client traffic (AP/client isolation)'
      + ' or when the router cannot loop a connection back to itself. Add a TURN server to get through it.'
  }
  return `ICE reached "${connectionState ?? 'failed'}" after trying ${localTotal} local and ${remoteTotal} remote candidates.`
}

/** Attaches read-only listeners to a peer connection. Returns a detach function. */
export function observePeerConnection(pc: RTCPeerConnection, log: ConnectionLog): () => void {
  const tally = (candidate: RTCIceCandidate | null, side: 'local' | 'remote') => {
    if (!candidate || !candidate.candidate) return
    const type = candidate.type ?? 'unknown'
    const isMdns = (candidate.address ?? '').endsWith('.local')
    log.update(facts => {
      const bucket = facts.ice[side]
      if (type === 'host' || type === 'srflx' || type === 'prflx' || type === 'relay') bucket[type] += 1
      if (isMdns) bucket.mdns += 1
    })
    log.record('ice', `${side}-candidate`,
      `${type} ${candidate.protocol ?? '?'} ${maskAddress(candidate.address)}${isMdns ? '' : `:${candidate.port ?? '?'}`}`)
  }

  const onCandidate = (event: RTCPeerConnectionIceEvent) => {
    if (!event.candidate) { log.record('ice', 'local-gathering-complete', 'Finished gathering local candidates'); return }
    tally(event.candidate, 'local')
  }
  const onCandidateError = (event: Event) => {
    const error = event as RTCPeerConnectionIceErrorEvent
    const url = error.url ?? 'unknown server'
    const text = error.errorText ?? 'no detail'
    const code = typeof error.errorCode === 'number' ? error.errorCode : null
    log.update(facts => {
      const existing = facts.ice.serverErrors.find(entry => entry.url === url && entry.code === code)
      if (existing) existing.count += 1
      else if (facts.ice.serverErrors.length < MAX_SERVER_ERRORS) facts.ice.serverErrors.push({ url, code, text, count: 1 })
    })
    // 701 is the routine "this server was unreachable" report; only a total
    // gathering failure is fatal, so this stays a warning.
    log.record('ice', 'server-error', `${url} returned ${code ?? '—'}: ${text}`, 'warn')
  }
  const onIceState = () => {
    log.update(facts => { facts.ice.connectionState = pc.iceConnectionState })
    log.record('ice', 'connection-state', pc.iceConnectionState,
      pc.iceConnectionState === 'failed' ? 'error' : pc.iceConnectionState === 'disconnected' ? 'warn' : 'info')
  }
  const onGatheringState = () => {
    log.update(facts => { facts.ice.gatheringState = pc.iceGatheringState })
    log.record('ice', 'gathering-state', pc.iceGatheringState)
  }
  const onConnectionState = () => {
    log.update(facts => { facts.ice.peerConnectionState = pc.connectionState })
    log.record('ice', 'peer-state', pc.connectionState, pc.connectionState === 'failed' ? 'error' : 'info')
  }
  const onSignalingState = () => {
    log.update(facts => { facts.ice.signalingState = pc.signalingState })
    log.record('ice', 'signaling-state', pc.signalingState)
  }

  // Remote candidates are not exposed as an event; the initial state and the
  // configured servers are, and the rest arrives through `readSelectedPair`.
  log.update(facts => {
    facts.ice.servers = describeIceServers(pc.getConfiguration().iceServers)
    facts.ice.gatheringState = pc.iceGatheringState
    facts.ice.connectionState = pc.iceConnectionState
    facts.ice.peerConnectionState = pc.connectionState
    facts.ice.signalingState = pc.signalingState
  })

  pc.addEventListener('icecandidate', onCandidate)
  pc.addEventListener('icecandidateerror', onCandidateError)
  pc.addEventListener('iceconnectionstatechange', onIceState)
  pc.addEventListener('icegatheringstatechange', onGatheringState)
  pc.addEventListener('connectionstatechange', onConnectionState)
  pc.addEventListener('signalingstatechange', onSignalingState)
  return () => {
    pc.removeEventListener('icecandidate', onCandidate)
    pc.removeEventListener('icecandidateerror', onCandidateError)
    pc.removeEventListener('iceconnectionstatechange', onIceState)
    pc.removeEventListener('icegatheringstatechange', onGatheringState)
    pc.removeEventListener('connectionstatechange', onConnectionState)
    pc.removeEventListener('signalingstatechange', onSignalingState)
  }
}

/**
 * Reads the negotiated path and the remote candidate mix out of `getStats`.
 * Remote candidates have no event, so this is the only way to learn whether
 * the other device ever offered anything to connect to.
 */
export async function readIceStats(pc: RTCPeerConnection | null | undefined, log: ConnectionLog): Promise<void> {
  if (!pc) return
  let stats: RTCStatsReport
  try {
    stats = await pc.getStats()
  } catch {
    return
  }
  const remote = emptyTally()
  let selectedPairId: string | undefined
  let pair: RTCIceCandidatePairStats | undefined
  stats.forEach(stat => {
    if (stat.type === 'transport' && (stat as { selectedCandidatePairId?: string }).selectedCandidatePairId) {
      selectedPairId = (stat as { selectedCandidatePairId?: string }).selectedCandidatePairId
    }
    if (stat.type === 'remote-candidate') {
      const candidate = stat as { candidateType?: string; address?: string }
      const type = candidate.candidateType
      if (type === 'host' || type === 'srflx' || type === 'prflx' || type === 'relay') remote[type] += 1
      if ((candidate.address ?? '').endsWith('.local')) remote.mdns += 1
    }
  })
  stats.forEach(stat => {
    if (stat.type === 'candidate-pair' && (stat.id === selectedPairId
      || (!selectedPairId && (stat as RTCIceCandidatePairStats).state === 'succeeded' && (stat as RTCIceCandidatePairStats).nominated))) {
      pair = stat as RTCIceCandidatePairStats
    }
  })
  const local = pair ? stats.get(pair.localCandidateId) as { candidateType?: string; address?: string; protocol?: string } | undefined : undefined
  const far = pair ? stats.get(pair.remoteCandidateId) as { candidateType?: string; address?: string } | undefined : undefined
  log.update(facts => {
    facts.ice.remote = remote
    facts.ice.selected = pair && local && far
      ? {
        local: maskAddress(local.address), remote: maskAddress(far.address),
        localType: local.candidateType ?? 'unknown', remoteType: far.candidateType ?? 'unknown',
        protocol: local.protocol ?? 'unknown',
        rttMs: typeof pair.currentRoundTripTime === 'number' && Number.isFinite(pair.currentRoundTripTime)
          ? pair.currentRoundTripTime * 1000 : null,
      }
      : null
  })
}
