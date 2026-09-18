import Peer, { type DataConnection } from 'peerjs'
import {
  createConnectionLog, describeIceFailure, describeIceServers, observePeerConnection, readIceStats,
  type ConnectionLog, type DiagnosticRole,
} from './connectionDiagnostics'
import { resolveIceServers } from './iceConfig'

const FRAME_BYTES = 2048
const SETUP_TIMEOUT_MS = 15_000
const REGISTRATION_TIMEOUT_MS = 10_000
const PENDING_MAX_AGE_MS = 100
/** Fast enough that a failure report is current, slow enough to be free. */
const STATS_INTERVAL_MS = 1000
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

/**
 * PeerJS error types that end this attempt outright. Everything else — a
 * signaling blip in particular — leaves an established direct connection
 * alone, because the data channel does not depend on the server once open.
 */
const FATAL_PEER_ERRORS = new Set(['browser-incompatible', 'invalid-id', 'invalid-key', 'ssl-unavailable', 'unavailable-id'])

const PEER_ERROR_DETAIL: Record<string, string> = {
  'browser-incompatible': 'This browser does not support the WebRTC features the controller needs.',
  'peer-unavailable': 'The pairing service has no computer registered under this QR code. The QR expired, or the computer’s tab was closed or reloaded after it was shown.',
  'invalid-id': 'The pairing ID was rejected by the service.',
  'invalid-key': 'The pairing service rejected this application key.',
  'network': 'Lost the connection to the pairing service.',
  'server-error': 'The pairing service returned an error.',
  'socket-error': 'The connection to the pairing service failed.',
  'socket-closed': 'The pairing service closed the connection unexpectedly.',
  'ssl-unavailable': 'The pairing service is not reachable over HTTPS.',
  'unavailable-id': 'The pairing ID is already taken.',
  'webrtc': 'The browser reported a WebRTC error while negotiating.',
}

export interface TransportDiagnostics {
  path: 'direct' | 'relay' | 'unknown'
  iceRttMs: number | null
  ordered: boolean | null
  maxRetransmits: number | null
  bufferedAmount: number
}

export interface SessionTransport {
  readonly id: string
  /** Initial reliable channel only; the application separately authenticates and exchanges native-ready messages. */
  readonly ready: Promise<void>
  readonly nativeOpen: boolean
  readonly nativeStreamId: number | null
  readonly nativeBufferedAmount: number
  /** Everything this connection observed, for display and bug reports. */
  readonly log: ConnectionLog
  onReliable(handler: (value: unknown) => void): () => void
  onNative(handler: (value: unknown) => void): () => void
  onClose(handler: (reason: string) => void): () => void
  sendReliable(value: unknown): boolean
  /** Called after reliable open. The selected stream ID is available synchronously. */
  openNative(streamId?: number): Promise<number>
  sendNative(value: unknown, priority?: boolean): boolean
  /**
   * Measurement only: a native message that was queued but never reached the
   * channel, because a newer one replaced it or it went stale in the queue.
   */
  onNativeDiscarded?(handler: (value: unknown, reason: 'replaced' | 'expired') => void): () => void
  diagnostics(): Promise<TransportDiagnostics>
  /** Ends the connection and records `code` as the cause. */
  fail(code: string, reason: string): void
  close(): void
}

function encode(value: unknown): Uint8Array<ArrayBuffer> | null {
  try {
    const json = JSON.stringify(value)
    if (!json || json.length > FRAME_BYTES) return null
    const bytes = encoder.encode(json)
    return bytes.byteLength <= FRAME_BYTES ? bytes : null
  } catch {
    return null
  }
}

function subscribe<T>(handlers: Set<(value: T) => void>, handler: (value: T) => void): () => void {
  handlers.add(handler)
  return () => { handlers.delete(handler) }
}

function wrapConnection(connection: DataConnection, log: ConnectionLog): SessionTransport {
  const reliableHandlers = new Set<(value: unknown) => void>()
  const nativeHandlers = new Set<(value: unknown) => void>()
  const closeHandlers = new Set<(reason: string) => void>()
  let closedReason: string | null = null
  let native: RTCDataChannel | null = null
  let nativeReady: Promise<number> | null = null
  let rejectNative: ((reason: Error) => void) | null = null
  let nativeTimer: ReturnType<typeof setTimeout> | undefined
  let drainTimer: ReturnType<typeof setTimeout> | undefined
  type Pending = { bytes: Uint8Array<ArrayBuffer>; queuedAt: number; value: unknown }
  const discardHandlers = new Set<(value: unknown, reason: 'replaced' | 'expired') => void>()
  const discard = (pending: Pending | null, reason: 'replaced' | 'expired') => {
    if (pending) for (const handler of discardHandlers) handler(pending.value, reason)
  }
  let pendingPriority: Pending | null = null
  let pendingNormal: Pending | null = null
  let reliablePendingCount = 0
  let resolveReady!: () => void
  let rejectReady!: (reason: Error) => void
  const started = performance.now()
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  // Incoming connections can close before the application starts awaiting them.
  void ready.catch(() => {})

  log.update(facts => { facts.remotePeerId = connection.peer })
  log.record('channel', 'connection-created', `Session connection to ${connection.peer} (${connection.connectionId})`)

  const pc: RTCPeerConnection | null = connection.peerConnection ?? null
  const detachObserver = pc && typeof pc.addEventListener === 'function' ? observePeerConnection(pc, log) : () => {}
  const statsTimer = setInterval(() => { void readIceStats(pc, log) }, STATS_INTERVAL_MS)

  /** The setup deadline reports what was actually reached, not a guess. */
  function setupFailure(stage: 'session' | 'controls'): string {
    const facts = log.facts()
    if (!facts.signaling.registered) return 'Could not connect directly. The pairing service never confirmed this device.'
    const reached = stage === 'controls'
      ? 'The session channel opened but the low-latency control channel never did.'
      : `ICE state reached "${facts.ice.connectionState ?? 'new'}" before the ${SETUP_TIMEOUT_MS / 1000}s deadline.`
    return `Could not connect directly. ${reached} ${describeIceFailure(facts)}`
  }

  const readyTimer = setTimeout(() => {
    finish('setup-timeout', setupFailure('session'))
  }, SETUP_TIMEOUT_MS)

  // PeerJS 1.5.5 exposes Json.parse. Bound and catch decoding before its dispatcher
  // dereferences the decoded object; do not replace its native channel handlers.
  const invalidJson = Object.freeze({ invalidFlightJson: true })
  const jsonConnection = connection as DataConnection & { parse?: (json: string) => unknown }
  jsonConnection.parse = (json) => {
    try {
      if (json.length > FRAME_BYTES || encoder.encode(json).byteLength > FRAME_BYTES) return invalidJson
      const parsed: unknown = JSON.parse(json)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : invalidJson
    } catch {
      return invalidJson
    }
  }

  function finish(code: string, reason: string): void {
    if (closedReason !== null) return
    closedReason = reason
    log.recordFailure('channel', code, reason)
    // The peer connection is about to close; capture the final path first.
    void readIceStats(pc, log)
    clearTimeout(readyTimer)
    clearTimeout(nativeTimer)
    clearTimeout(drainTimer)
    clearInterval(statsTimer)
    detachObserver()
    pendingPriority = pendingNormal = null
    rejectReady(new Error(reason))
    rejectNative?.(new Error(reason))
    connection.off('open', handleOpen)
    connection.off('data', handleData)
    connection.off('close', handleClose)
    connection.off('error', handleError)
    if (native) {
      native.onopen = native.onmessage = native.onclose = native.onerror = native.onbufferedamountlow = null
      native.close()
    }
    connection.close()
    for (const handler of closeHandlers) handler(reason)
    reliableHandlers.clear()
    nativeHandlers.clear()
    closeHandlers.clear()
    discardHandlers.clear()
  }

  function handleOpen(): void {
    if (closedReason !== null) return
    const channel = connection.dataChannel
    if (connection.label !== 'flight-session-v1' || connection.serialization !== 'json' ||
        !connection.reliable || !channel || !channel.ordered || channel.maxRetransmits !== null || channel.maxPacketLifeTime !== null) {
      finish('channel-unsupported', 'Unsupported phone connection. Reload both devices.')
      return
    }
    clearTimeout(readyTimer)
    const openedAt = Math.round(performance.now() - started)
    log.update(facts => { facts.channels.reliableOpenMs = openedAt })
    log.record('channel', 'session-open', `Session channel open after ${openedAt} ms`)
    void readIceStats(pc, log)
    resolveReady()
  }

  function handleData(value: unknown): void {
    if (closedReason !== null) return
    if (value === invalidJson || !encode(value)) {
      finish('invalid-message', 'Invalid or oversized phone message.')
      return
    }
    for (const handler of reliableHandlers) handler(value)
  }

  function handleClose(): void { finish('connection-closed', 'Phone connection closed. Scan a new QR to reconnect.') }

  function handleError(error?: unknown): void {
    const type = typeof (error as { type?: unknown } | undefined)?.type === 'string' ? (error as { type: string }).type : 'unknown'
    const message = typeof (error as { message?: unknown } | undefined)?.message === 'string'
      ? (error as { message: string }).message : ''
    // `negotiation-failed` is PeerJS reporting ICE failure: say what failed.
    const detail = type === 'negotiation-failed'
      ? `Could not connect directly. ${describeIceFailure(log.facts())}`
      : `Phone connection error (${type}).${message ? ` ${message}` : ''}`
    finish(`connection-${type}`, detail)
  }

  connection.on('open', handleOpen)
  connection.on('data', handleData)
  connection.on('close', handleClose)
  connection.on('error', handleError)
  if (connection.open) handleOpen()

  function drain(): void {
    clearTimeout(drainTimer)
    drainTimer = undefined
    if (!native || native.readyState !== 'open' || closedReason !== null) return
    const now = performance.now()
    if (pendingPriority && now - pendingPriority.queuedAt > PENDING_MAX_AGE_MS) { discard(pendingPriority, 'expired'); pendingPriority = null }
    if (pendingNormal && now - pendingNormal.queuedAt > PENDING_MAX_AGE_MS) { discard(pendingNormal, 'expired'); pendingNormal = null }
    for (const priority of [true, false]) {
      const next = priority ? pendingPriority : pendingNormal
      if (!next) continue
      if (native.bufferedAmount + next.bytes.byteLength > FRAME_BYTES) break
      if (priority) pendingPriority = null
      else pendingNormal = null
      try { native.send(next.bytes) } catch { finish('control-send-failed', 'Phone control channel failed.'); return }
    }
    // Some browsers delay bufferedamountlow; one bounded latest-value slot per
    // class plus this short retry also expires queued state during congestion.
    if (pendingPriority || pendingNormal) drainTimer = setTimeout(drain, 10)
  }

  const transport: SessionTransport = {
    id: connection.connectionId,
    ready,
    log,
    get nativeOpen() { return closedReason === null && native?.readyState === 'open' },
    get nativeStreamId() { return native?.id ?? null },
    get nativeBufferedAmount() { return native?.bufferedAmount ?? 0 },
    onReliable: handler => subscribe(reliableHandlers, handler),
    onNative: handler => subscribe(nativeHandlers, handler),
    onNativeDiscarded(handler) { discardHandlers.add(handler); return () => { discardHandlers.delete(handler) } },
    onClose(handler) {
      if (closedReason !== null) { handler(closedReason); return () => {} }
      return subscribe(closeHandlers, handler)
    },
    sendReliable(value) {
      const channel = connection.dataChannel
      const bytes = encode(value)
      if (closedReason !== null || !connection.open || channel?.readyState !== 'open' || !bytes) return false
      if (channel.bufferedAmount === 0) reliablePendingCount = 0
      if (reliablePendingCount >= 8 || channel.bufferedAmount + bytes.byteLength > 8 * FRAME_BYTES) return false
      // PeerJS's JSON wire format is UTF-8 bytes. Sending them directly avoids
      // its unbounded retry queue while leaving its receive/lifecycle intact.
      try { channel.send(bytes); reliablePendingCount++; return true } catch { finish('session-send-failed', 'Phone session channel failed.'); return false }
    },
    openNative(streamId) {
      if (nativeReady) {
        if (streamId !== undefined && streamId !== native?.id) return Promise.reject(new Error('Control stream ID changed.'))
        return nativeReady
      }
      const peerConnection = connection.peerConnection
      const sessionId = connection.dataChannel?.id
      const selected = streamId ?? (sessionId === 0 ? 1 : 0)
      const streamCount = peerConnection?.sctp?.maxChannels
      if (closedReason !== null || !connection.open || !peerConnection || sessionId === null || sessionId === undefined ||
          !Number.isInteger(selected) || selected < 0 || selected > 65534 || selected === sessionId ||
          (typeof streamCount === 'number' && selected >= streamCount)) {
        log.record('channel', 'control-stream-rejected',
          `Requested stream ${String(selected)} beside session stream ${String(sessionId)} (max ${String(streamCount ?? 'unknown')})`, 'error')
        return Promise.reject(new Error('Unsupported phone control stream. Reload both devices.'))
      }
      try {
        // No additional in-band channel: PeerJS's ondatachannel callback must
        // keep referring to its original reliable DataConnection.
        native = peerConnection.createDataChannel('flight-controls-v1', {
          negotiated: true, id: selected, ordered: false, maxRetransmits: 0,
        })
      } catch {
        finish('control-channel-unsupported', 'This browser could not create the phone control channel.')
        return Promise.reject(new Error('This browser could not create the phone control channel.'))
      }
      log.update(facts => { facts.channels.controlStreamId = selected })
      log.record('channel', 'control-stream-created', `Negotiated control stream ${selected}`)
      native.binaryType = 'arraybuffer'
      native.bufferedAmountLowThreshold = 0
      nativeReady = new Promise<number>((resolve, reject) => {
        rejectNative = reject
        const handleNativeOpen = () => {
          if (closedReason !== null || !native) return
          if (native.ordered || native.maxRetransmits !== 0 || !native.negotiated || native.id !== selected) {
            finish('control-channel-misconfigured', 'This browser does not support low-latency phone controls.')
            return
          }
          clearTimeout(nativeTimer)
          rejectNative = null
          const openedAt = Math.round(performance.now() - started)
          log.update(facts => { facts.channels.controlOpenMs = openedAt })
          log.record('channel', 'control-open', `Control channel open after ${openedAt} ms`)
          resolve(selected)
        }
        native!.onopen = handleNativeOpen
        native!.onclose = () => finish('control-channel-closed', 'Phone control channel closed. Scan a new QR to reconnect.')
        native!.onerror = () => finish('control-channel-error', 'Phone control channel failed.')
        native!.onbufferedamountlow = drain
        native!.onmessage = (event: MessageEvent<unknown>) => {
          if (closedReason !== null) return
          try {
            const wire = event.data
            let json: string
            if (typeof wire === 'string') {
              if (wire.length > FRAME_BYTES || encoder.encode(wire).byteLength > FRAME_BYTES) throw new Error()
              json = wire
            } else if (wire instanceof ArrayBuffer && wire.byteLength <= FRAME_BYTES) json = decoder.decode(wire)
            else throw new Error()
            const value: unknown = JSON.parse(json)
            for (const handler of nativeHandlers) handler(value)
          } catch {
            finish('invalid-control-message', 'Invalid or oversized phone control message.')
          }
        }
        nativeTimer = setTimeout(() => finish('control-setup-timeout', setupFailure('controls')), SETUP_TIMEOUT_MS)
        if (native!.readyState === 'open') handleNativeOpen()
      })
      void nativeReady.catch(() => {})
      return nativeReady
    },
    sendNative(value, priority = false) {
      const bytes = encode(value)
      if (closedReason !== null || native?.readyState !== 'open' || !bytes) return false
      const pending = { bytes, queuedAt: performance.now(), value }
      discard(priority ? pendingPriority : pendingNormal, 'replaced')
      if (priority) pendingPriority = pending
      else pendingNormal = pending
      drain()
      return closedReason === null
    },
    async diagnostics() {
      const result: TransportDiagnostics = {
        path: 'unknown', iceRttMs: null, ordered: native?.ordered ?? null,
        maxRetransmits: native?.maxRetransmits ?? null, bufferedAmount: native?.bufferedAmount ?? 0,
      }
      try {
        const stats = await connection.peerConnection?.getStats()
        if (!stats) return result
        let selectedPairId: string | undefined
        stats.forEach(stat => { if (stat.type === 'transport' && stat.selectedCandidatePairId) selectedPairId = stat.selectedCandidatePairId })
        let pair: RTCIceCandidatePairStats | undefined
        stats.forEach(stat => {
          if (stat.type === 'candidate-pair' && (stat.id === selectedPairId ||
              (!selectedPairId && stat.state === 'succeeded' && stat.nominated))) pair = stat as RTCIceCandidatePairStats
        })
        if (pair) {
          const local = stats.get(pair.localCandidateId) as { candidateType?: string } | undefined
          const remote = stats.get(pair.remoteCandidateId) as { candidateType?: string } | undefined
          if (local?.candidateType === 'relay' || remote?.candidateType === 'relay') result.path = 'relay'
          else if (local?.candidateType && remote?.candidateType) result.path = 'direct'
          if (typeof pair.currentRoundTripTime === 'number' && Number.isFinite(pair.currentRoundTripTime)) result.iceRttMs = pair.currentRoundTripTime * 1000
        }
      } catch { /* Stats are optional; failure does not invalidate a healthy channel. */ }
      return result
    },
    fail: (code, reason) => finish(code, reason),
    close: () => finish('closed-locally', 'Phone disconnected.'),
  }
  return transport
}

export function createPeerEndpoint(options: {
  onConnection?: (transport: SessionTransport) => void
  onSignalingState?: (available: boolean) => void
  /** Shared so one report covers pairing and the connection that follows. */
  log?: ConnectionLog
  role?: DiagnosticRole
  iceServers?: RTCIceServer[]
} = {}) {
  const log = options.log ?? createConnectionLog(options.role ?? 'phone')
  const ice = options.iceServers ? { servers: options.iceServers, origin: 'explicit' as const } : resolveIceServers()
  const startedAt = performance.now()
  log.update(facts => { facts.ice.servers = describeIceServers(ice.servers) })
  log.record('signaling', 'endpoint-starting', `Registering with the pairing service; ICE servers from ${ice.origin}`)
  const peer = new Peer({
    secure: true, port: 443, debug: 0, referrerPolicy: 'no-referrer',
    config: { iceServers: ice.servers },
  })
  const sessions = new Set<SessionTransport>()
  /** Transports this endpoint dialled, so a `peer-unavailable` can name one. */
  const outgoing = new Map<string, SessionTransport>()
  let destroyed = false
  let registered = false
  let reconnectAttempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let resolveReady!: (id: string) => void
  let rejectReady!: (error: Error) => void
  const ready = new Promise<string>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  void ready.catch(() => {})
  const registrationTimer = setTimeout(() => {
    const detail = `Pairing service unavailable. No response from the signaling server in ${REGISTRATION_TIMEOUT_MS / 1000} seconds.`
    log.recordFailure('signaling', 'registration-timeout', detail)
    rejectReady(new Error(detail))
    destroy()
  }, REGISTRATION_TIMEOUT_MS)

  function track(connection: DataConnection): SessionTransport {
    const transport = wrapConnection(connection, log)
    sessions.add(transport)
    transport.onClose(() => { sessions.delete(transport); outgoing.delete(connection.peer) })
    return transport
  }

  function scheduleReconnect(): void {
    options.onSignalingState?.(false)
    log.update(facts => { facts.signaling.connected = false })
    log.record('signaling', 'disconnected', 'Lost the pairing service connection; an open flight link keeps working', 'warn')
    if (destroyed || !registered || reconnectAttempts >= 3 || reconnectTimer !== undefined) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined
      if (destroyed || peer.destroyed || peer.open) return
      reconnectAttempts++
      log.record('signaling', 'reconnect-attempt', `Reconnect attempt ${reconnectAttempts} of 3`)
      try { if (peer.disconnected) peer.reconnect() } catch { /* Try again within the same fixed attempt budget. */ }
      scheduleReconnect()
    }, 1000 * 2 ** reconnectAttempts)
  }

  function destroy(): void {
    if (destroyed) return
    destroyed = true
    clearTimeout(registrationTimer)
    clearTimeout(reconnectTimer)
    rejectReady(new Error('Phone pairing closed.'))
    for (const session of sessions) session.close()
    sessions.clear()
    outgoing.clear()
    peer.destroy()
    peer.removeAllListeners()
  }

  peer.on('open', (id) => {
    if (destroyed) return
    registered = true
    reconnectAttempts = 0
    clearTimeout(registrationTimer)
    clearTimeout(reconnectTimer)
    reconnectTimer = undefined
    const elapsed = Math.round(performance.now() - startedAt)
    log.update(facts => {
      facts.peerId = id
      facts.signaling.registered = true
      facts.signaling.registeredAtMs = elapsed
      facts.signaling.connected = true
    })
    log.record('signaling', 'registered', `Registered as ${id} in ${elapsed} ms`)
    options.onSignalingState?.(true)
    resolveReady(id)
  })
  peer.on('connection', (connection) => {
    log.record('signaling', 'incoming-connection', `Incoming connection from ${connection.peer}`)
    if (destroyed || !options.onConnection) { connection.close(); return }
    options.onConnection(track(connection))
  })
  peer.on('disconnected', scheduleReconnect)
  peer.on('error', (error: unknown) => {
    const type = typeof (error as { type?: unknown })?.type === 'string' ? (error as { type: string }).type : 'unknown'
    const message = typeof (error as { message?: unknown })?.message === 'string' ? (error as { message: string }).message : ''
    const detail = PEER_ERROR_DETAIL[type] ?? (message || 'The pairing service reported an error.')
    log.update(facts => {
      facts.signaling.lastErrorType = type
      facts.signaling.lastErrorDetail = detail
    })
    log.record('signaling', `peer-error-${type}`, `${detail}${message && PEER_ERROR_DETAIL[type] ? ` (${message})` : ''}`, 'error')
    if (!registered) {
      const failure = `Pairing service unavailable (${type}). ${detail}`
      log.recordFailure('signaling', `registration-${type}`, failure)
      rejectReady(new Error(failure))
      destroy()
      return
    }
    // The destination peer is not registered. Nothing will ever arrive on that
    // connection, so end it now with the real reason instead of letting the
    // 15 second setup deadline report it as a Wi-Fi problem.
    if (type === 'peer-unavailable') {
      // PeerJS puts the unreachable ID in the message; fall back to every dial.
      const targets = [...outgoing].filter(([peerId]) => message.includes(peerId))
      for (const [, transport] of targets.length ? targets : [...outgoing]) {
        transport.fail('peer-unavailable', detail)
      }
      outgoing.clear()
      return
    }
    if (FATAL_PEER_ERRORS.has(type)) {
      log.recordFailure('signaling', `fatal-${type}`, detail)
      for (const session of [...sessions]) session.fail(`signaling-${type}`, detail)
      destroy()
    }
    // Registration already succeeded and the error is recoverable: the direct
    // connection owns its own health. A signaling outage must not close it or
    // revoke flight controls.
  })
  peer.on('close', () => {
    log.record('signaling', 'closed', 'Pairing service connection closed')
    options.onSignalingState?.(false)
    destroy()
  })

  return {
    ready,
    log,
    connect(peerId: string): SessionTransport {
      if (destroyed || !registered || !peer.open) {
        const detail = 'Pairing service unavailable. Retry.'
        log.recordFailure('signaling', 'connect-without-registration', detail)
        throw new Error(detail)
      }
      log.record('signaling', 'dialing', `Offering a session to ${peerId}`)
      const connection = peer.connect(peerId, {
        label: 'flight-session-v1', reliable: true, serialization: 'json',
        metadata: { v: 1, protocol: 'flight-session' },
      })
      const transport = track(connection)
      outgoing.set(peerId, transport)
      return transport
    },
    destroy,
  }
}

export type PeerEndpoint = ReturnType<typeof createPeerEndpoint>
