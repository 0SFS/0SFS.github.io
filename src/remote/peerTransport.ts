import Peer, { type DataConnection } from 'peerjs'

const FRAME_BYTES = 2048
const SETUP_TIMEOUT_MS = 15_000
const REGISTRATION_TIMEOUT_MS = 10_000
const PENDING_MAX_AGE_MS = 100
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

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
  onReliable(handler: (value: unknown) => void): () => void
  onNative(handler: (value: unknown) => void): () => void
  onClose(handler: (reason: string) => void): () => void
  sendReliable(value: unknown): boolean
  /** Called after reliable open. The selected stream ID is available synchronously. */
  openNative(streamId?: number): Promise<number>
  sendNative(value: unknown, priority?: boolean): boolean
  diagnostics(): Promise<TransportDiagnostics>
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

function wrapConnection(connection: DataConnection): SessionTransport {
  const reliableHandlers = new Set<(value: unknown) => void>()
  const nativeHandlers = new Set<(value: unknown) => void>()
  const closeHandlers = new Set<(reason: string) => void>()
  let closedReason: string | null = null
  let native: RTCDataChannel | null = null
  let nativeReady: Promise<number> | null = null
  let rejectNative: ((reason: Error) => void) | null = null
  let nativeTimer: ReturnType<typeof setTimeout> | undefined
  let drainTimer: ReturnType<typeof setTimeout> | undefined
  type Pending = { bytes: Uint8Array<ArrayBuffer>; queuedAt: number }
  let pendingPriority: Pending | null = null
  let pendingNormal: Pending | null = null
  let reliablePendingCount = 0
  let resolveReady!: () => void
  let rejectReady!: (reason: Error) => void
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  // Incoming connections can close before the application starts awaiting them.
  void ready.catch(() => {})
  const readyTimer = setTimeout(() => finish('Could not connect directly. Try the same non-guest Wi-Fi network.'), SETUP_TIMEOUT_MS)

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

  function finish(reason: string): void {
    if (closedReason !== null) return
    closedReason = reason
    clearTimeout(readyTimer)
    clearTimeout(nativeTimer)
    clearTimeout(drainTimer)
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
  }

  function handleOpen(): void {
    if (closedReason !== null) return
    const channel = connection.dataChannel
    if (connection.label !== 'flight-session-v1' || connection.serialization !== 'json' ||
        !connection.reliable || !channel || !channel.ordered || channel.maxRetransmits !== null || channel.maxPacketLifeTime !== null) {
      finish('Unsupported phone connection. Reload both devices.')
      return
    }
    clearTimeout(readyTimer)
    resolveReady()
  }

  function handleData(value: unknown): void {
    if (closedReason !== null) return
    if (value === invalidJson || !encode(value)) {
      finish('Invalid or oversized phone message.')
      return
    }
    for (const handler of reliableHandlers) handler(value)
  }

  function handleClose(): void { finish('Phone connection closed. Scan a new QR to reconnect.') }
  function handleError(): void { finish('Could not connect directly. Try the same non-guest Wi-Fi network.') }

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
    if (pendingPriority && now - pendingPriority.queuedAt > PENDING_MAX_AGE_MS) pendingPriority = null
    if (pendingNormal && now - pendingNormal.queuedAt > PENDING_MAX_AGE_MS) pendingNormal = null
    for (const priority of [true, false]) {
      const next = priority ? pendingPriority : pendingNormal
      if (!next) continue
      if (native.bufferedAmount + next.bytes.byteLength > FRAME_BYTES) break
      if (priority) pendingPriority = null
      else pendingNormal = null
      try { native.send(next.bytes) } catch { finish('Phone control channel failed.'); return }
    }
    // Some browsers delay bufferedamountlow; one bounded latest-value slot per
    // class plus this short retry also expires queued state during congestion.
    if (pendingPriority || pendingNormal) drainTimer = setTimeout(drain, 10)
  }

  const transport: SessionTransport = {
    id: connection.connectionId,
    ready,
    get nativeOpen() { return closedReason === null && native?.readyState === 'open' },
    get nativeStreamId() { return native?.id ?? null },
    get nativeBufferedAmount() { return native?.bufferedAmount ?? 0 },
    onReliable: handler => subscribe(reliableHandlers, handler),
    onNative: handler => subscribe(nativeHandlers, handler),
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
      try { channel.send(bytes); reliablePendingCount++; return true } catch { finish('Phone session channel failed.'); return false }
    },
    openNative(streamId) {
      if (nativeReady) {
        if (streamId !== undefined && streamId !== native?.id) return Promise.reject(new Error('Control stream ID changed.'))
        return nativeReady
      }
      const pc = connection.peerConnection
      const sessionId = connection.dataChannel?.id
      const selected = streamId ?? (sessionId === 0 ? 1 : 0)
      const streamCount = pc?.sctp?.maxChannels
      if (closedReason !== null || !connection.open || !pc || sessionId === null || sessionId === undefined ||
          !Number.isInteger(selected) || selected < 0 || selected > 65534 || selected === sessionId ||
          (typeof streamCount === 'number' && selected >= streamCount)) {
        return Promise.reject(new Error('Unsupported phone control stream. Reload both devices.'))
      }
      try {
        // No additional in-band channel: PeerJS's ondatachannel callback must
        // keep referring to its original reliable DataConnection.
        native = pc.createDataChannel('flight-controls-v1', {
          negotiated: true, id: selected, ordered: false, maxRetransmits: 0,
        })
      } catch {
        finish('This browser could not create the phone control channel.')
        return Promise.reject(new Error('This browser could not create the phone control channel.'))
      }
      native.binaryType = 'arraybuffer'
      native.bufferedAmountLowThreshold = 0
      nativeReady = new Promise<number>((resolve, reject) => {
        rejectNative = reject
        const handleNativeOpen = () => {
          if (closedReason !== null || !native) return
          if (native.ordered || native.maxRetransmits !== 0 || !native.negotiated || native.id !== selected) {
            finish('This browser does not support low-latency phone controls.')
            return
          }
          clearTimeout(nativeTimer)
          rejectNative = null
          resolve(selected)
        }
        native!.onopen = handleNativeOpen
        native!.onclose = () => finish('Phone control channel closed. Scan a new QR to reconnect.')
        native!.onerror = () => finish('Phone control channel failed.')
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
            finish('Invalid or oversized phone control message.')
          }
        }
        nativeTimer = setTimeout(() => finish('Could not connect directly. Try the same non-guest Wi-Fi network.'), SETUP_TIMEOUT_MS)
        if (native!.readyState === 'open') handleNativeOpen()
      })
      void nativeReady.catch(() => {})
      return nativeReady
    },
    sendNative(value, priority = false) {
      const bytes = encode(value)
      if (closedReason !== null || native?.readyState !== 'open' || !bytes) return false
      const pending = { bytes, queuedAt: performance.now() }
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
    close: () => finish('Phone disconnected.'),
  }
  return transport
}

export function createPeerEndpoint(options: {
  onConnection?: (transport: SessionTransport) => void
  onSignalingState?: (available: boolean) => void
} = {}) {
  const peer = new Peer({
    secure: true, port: 443, debug: 0, referrerPolicy: 'no-referrer',
    config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
  })
  const sessions = new Set<SessionTransport>()
  let destroyed = false
  let registered = false
  let reconnectAttempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let resolveReady!: (id: string) => void
  let rejectReady!: (error: Error) => void
  const ready = new Promise<string>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  void ready.catch(() => {})
  const registrationTimer = setTimeout(() => {
    rejectReady(new Error('Pairing service unavailable. Retry.'))
    destroy()
  }, REGISTRATION_TIMEOUT_MS)

  function track(connection: DataConnection): SessionTransport {
    const transport = wrapConnection(connection)
    sessions.add(transport)
    transport.onClose(() => sessions.delete(transport))
    return transport
  }

  function scheduleReconnect(): void {
    options.onSignalingState?.(false)
    if (destroyed || !registered || reconnectAttempts >= 3 || reconnectTimer !== undefined) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined
      if (destroyed || peer.destroyed || peer.open) return
      reconnectAttempts++
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
    options.onSignalingState?.(true)
    resolveReady(id)
  })
  peer.on('connection', (connection) => {
    if (destroyed || !options.onConnection) { connection.close(); return }
    options.onConnection(track(connection))
  })
  peer.on('disconnected', scheduleReconnect)
  peer.on('error', () => {
    if (!registered) {
      rejectReady(new Error('Pairing service unavailable. Retry.'))
      destroy()
    }
    // Registration already succeeded: the direct connection owns its own
    // health. A signaling outage must not close it or revoke flight controls.
  })
  peer.on('close', () => {
    options.onSignalingState?.(false)
    destroy()
  })

  return {
    ready,
    connect(peerId: string): SessionTransport {
      if (destroyed || !registered || !peer.open) throw new Error('Pairing service unavailable. Retry.')
      const connection = peer.connect(peerId, {
        label: 'flight-session-v1', reliable: true, serialization: 'json',
        metadata: { v: 1, protocol: 'flight-session' },
      })
      return track(connection)
    },
    destroy,
  }
}

export type PeerEndpoint = ReturnType<typeof createPeerEndpoint>
