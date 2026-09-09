import { createPeerEndpoint, type PeerEndpoint, type SessionTransport, type TransportDiagnostics } from './peerTransport'
import {
  CONTROL_INTERVAL_MS, HANDOFF_MS, NEUTRAL_CONTROLS, STALE_MS, isCentered,
  isControls, neutralize, parseMessage,
  type ActionName, type AircraftStatus, type ControlSurfaceState, type RemoteMessage,
} from './protocol'

export interface PhoneControllerSnapshot {
  phase: 'connecting' | 'authenticating' | 'ready' | 'disconnected' | 'error'
  message: string
  status: AircraftStatus | null
  controls: ControlSurfaceState
  canFly: boolean
  canControl: boolean
  requestingControl: boolean
  hostFresh: boolean
  signalingAvailable: boolean
  pendingActions: number
  rttMs: number | null
  diagnostics: TransportDiagnostics | null
  appliedSeq: number | null
  receiveToApplyMs: number | null
}

export interface PhoneControllerClient {
  subscribe(listener: () => void): () => void
  getSnapshot(): PhoneControllerSnapshot
  updateControls(controls: Partial<ControlSurfaceState>): void
  cancelTransientControls(): void
  requestControl(): boolean
  setPaused(paused: boolean): boolean
  setViewMode(mode: 'first' | 'third'): boolean
  releaseControl(): boolean
  destroy(): void
}

interface ClientOptions {
  endpointFactory?: typeof createPeerEndpoint
  now?: () => number
  /** Injectable lifecycle targets keep protocol tests independent of a browser. */
  document?: Document
  window?: Window
}

/** The control mailbox changes synchronously in pointer handlers, outside React. */
export function createPhoneControllerClient(
  invitation: { peerId: string; secret: string },
  options: ClientOptions = {},
): PhoneControllerClient {
  const now = options.now ?? (() => performance.now())
  const doc = options.document ?? (typeof document === 'undefined' ? undefined : document)
  const win = options.window ?? (typeof window === 'undefined' ? undefined : window)
  const listeners = new Set<() => void>()
  const subscriptions: Array<() => void> = []
  const pending = new Map<number, { action: ActionName; timer: ReturnType<typeof setTimeout> }>()
  let snapshot: PhoneControllerSnapshot = {
    phase: 'connecting', message: 'Connecting to pairing service…', status: null,
    controls: { ...NEUTRAL_CONTROLS }, canFly: false, canControl: false,
    requestingControl: false, hostFresh: false, signalingAvailable: true,
    pendingActions: 0, rttMs: null, diagnostics: null, appliedSeq: null, receiveToApplyMs: null,
  }
  let controls = { ...NEUTRAL_CONTROLS }
  let endpoint: PeerEndpoint | undefined
  let transport: SessionTransport | undefined
  let secret = invitation.secret
  const peerId = invitation.peerId
  let session = ''
  let epoch = -1
  let authorityEpoch = -1
  let lease = -1
  let sequence = 0
  let actionId = 0
  let requestId: number | null = null
  let handoffEpoch: number | null = null
  let lastHeartbeatAt = -Infinity
  let lastControlAt = -Infinity
  let pingId = 0
  let outstandingPing: { id: number; sentAt: number } | null = null
  let localReady = false
  let hostReady = false
  let destroyed = false
  let finished = false
  let suspended = doc?.hidden ?? false
  let wakeLock: WakeLockSentinel | null = null
  let wakeLockPending = false
  let setupTimer: ReturnType<typeof setTimeout> | undefined

  function emit(patch: Partial<PhoneControllerSnapshot> = {}): void {
    if (destroyed) return
    const next = { ...snapshot, ...patch }
    next.hostFresh = now() - lastHeartbeatAt < STALE_MS
    next.requestingControl = requestId !== null
    next.pendingActions = pending.size
    next.canFly = next.phase === 'ready' && next.hostFresh && !suspended && requestId === null && next.status?.owner === 'local'
    next.canControl = next.phase === 'ready' && next.hostFresh && !suspended && requestId === null && next.status?.owner === 'phone' && authorityEpoch === epoch
    snapshot = next
    for (const listener of listeners) listener()
  }

  function envelope() { return { v: 1 as const, session, epoch } }

  function clearAction(id: number): void {
    const entry = pending.get(id)
    if (!entry) return
    clearTimeout(entry.timer)
    pending.delete(id)
  }

  function clearPending(preserveRequest = false): void {
    for (const id of pending.keys()) if (!preserveRequest || id !== requestId) clearAction(id)
    if (!preserveRequest) { requestId = null; handoffEpoch = null }
  }

  function adoptControls(next: ControlSurfaceState): void {
    controls = neutralize(next)
    snapshot = { ...snapshot, controls: { ...controls } }
  }

  function advanceEpoch(nextEpoch: number, preserveRequest = false): void {
    if (nextEpoch <= epoch) return
    epoch = nextEpoch
    sequence = 0
    lease = -1
    authorityEpoch = -1
    lastHeartbeatAt = -Infinity
    outstandingPing = null
    clearPending(preserveRequest)
    adoptControls(controls)
  }

  function sendControls(): void {
    if (finished || !session || !transport?.nativeOpen || lease < 0 || suspended) return
    if (handoffEpoch !== epoch && !(snapshot.status?.owner === 'phone' && authorityEpoch === epoch)) return
    const time = now()
    // An interval plus immediate contacts/releases can never exceed 120 frames/s.
    if (time - lastControlAt < 1000 / 120) return
    if (sequence >= Number.MAX_SAFE_INTEGER) { fail('Controller session ended. Scan a new QR.'); return }
    lastControlAt = time
    transport.sendNative({ ...envelope(), type: 'controls', seq: sequence++, lease, controls: { ...controls } })
  }

  function cancelTransientControls(): void {
    controls = neutralize(controls)
    sendControls()
  }

  function stopTransport(): void {
    for (const unsubscribe of subscriptions.splice(0)) unsubscribe()
    transport?.close()
    endpoint?.destroy()
  }

  function releaseWakeLock(): void {
    void wakeLock?.release().catch(() => {})
    wakeLock = null
  }

  async function acquireWakeLock(): Promise<void> {
    if (wakeLock || wakeLockPending || suspended || finished || !win?.navigator.wakeLock) return
    wakeLockPending = true
    try {
      const acquired = await win.navigator.wakeLock.request('screen')
      if (finished || destroyed || suspended) { await acquired.release(); return }
      wakeLock = acquired
      acquired.addEventListener('release', () => { if (wakeLock === acquired) wakeLock = null }, { once: true })
    } catch { /* Optional: the controller remains usable without wake-lock support. */ }
    finally { wakeLockPending = false }
  }

  function fail(message: string, disconnected = false): void {
    if (finished || destroyed) return
    finished = true
    secret = ''
    clearTimeout(setupTimer)
    clearPending()
    authorityEpoch = -1
    controls = neutralize(controls)
    releaseWakeLock()
    stopRuntime()
    stopTransport()
    emit({ phase: disconnected ? 'disconnected' : 'error', message, controls: { ...controls } })
  }

  function checkReady(): void {
    if (finished || !localReady || !hostReady) return
    clearTimeout(setupTimer)
    emit({ phase: 'ready', message: 'Connected · Desktop controls' })
    void acquireWakeLock()
  }

  function sendAction(action: ActionName, value?: boolean | 'first' | 'third'): boolean {
    if (finished || snapshot.phase !== 'ready' || !session || lease < 0 || !snapshot.hostFresh || pending.size >= 8) return false
    if (action === 'requestControl' && (!snapshot.canFly || !isCentered(controls))) {
      emit({ message: 'Center controls to take over.' }); return false
    }
    if (action !== 'requestControl' && action !== 'releaseControl' && !snapshot.canControl) return false
    if (action === 'releaseControl' && snapshot.status?.owner !== 'phone' && requestId === null) return false
    const id = actionId++
    if (action === 'requestControl') requestId = id
    const timer = setTimeout(() => {
      if (!pending.has(id) || finished) return
      clearAction(id)
      if (requestId === id) { requestId = null; handoffEpoch = null; cancelTransientControls() }
      emit({ message: 'Request timed out. Check the computer before trying again.' })
    }, HANDOFF_MS)
    pending.set(id, { action, timer })
    if (!transport?.sendReliable({ ...envelope(), type: 'action', id, lease, action, ...(value === undefined ? {} : { value }) })) {
      clearAction(id)
      if (requestId === id) requestId = null
      emit({ message: 'Connection busy. Try again.' })
      return false
    }
    emit({ message: action === 'requestControl' ? 'Taking control…' : 'Sending request…' })
    return true
  }

  function updateStatus(status: AircraftStatus, authoritative: boolean): void {
    if (authoritative) authorityEpoch = status.owner === 'phone' ? epoch : -1
    // A pre-grant heartbeat may arrive after granted on the other channel.
    // Only reliable messages transfer ownership; telemetry cannot undo a grant.
    if (!authoritative && snapshot.status) status = { ...status, owner: snapshot.status.owner }
    // Telemetry must never drag a live slider/stick back to the previous frame.
    if (status.owner === 'local' && handoffEpoch === null) adoptControls(status.controls)
    snapshot = { ...snapshot, status }
  }

  function receiveReliable(value: unknown): void {
    if (finished || destroyed) return
    const message = parseMessage(value)
    if (!message) return
    if (message.type === 'reject') { fail(message.reason); return }
    if (message.type === 'hello') return
    if (message.type === 'welcome') {
      if (session) return
      session = message.session
      secret = ''
      advanceEpoch(message.epoch)
      updateStatus(message.status, false)
      emit({ phase: 'authenticating', message: 'Opening direct control channel…', controls: { ...controls } })
      void transport?.openNative(message.streamId).then(() => {
        if (finished || destroyed) return
        localReady = true
        if (!transport?.sendReliable({ ...envelope(), type: 'ready' })) {
          fail('Could not finish pairing. Scan a new QR.'); return
        }
        checkReady()
      }).catch(() => fail('Could not open the direct control channel. Try the same non-guest Wi-Fi network.'))
      return
    }
    if (!session || message.session !== session || message.epoch < epoch) return
    const previousEpoch = epoch
    if (message.type === 'handoff') {
      if (!hostReady || !localReady || requestId !== message.requestId || !isCentered(message.controls)) return
      advanceEpoch(message.epoch, true)
      handoffEpoch = epoch
      lease = Math.max(lease, message.lease)
      lastHeartbeatAt = now()
      adoptControls(message.controls)
      if (!transport?.sendReliable({ ...envelope(), type: 'handoffAck', requestId })) {
        fail('Could not finish taking control. Scan a new QR.'); return
      }
      emit({ message: 'Synchronizing aircraft controls…', controls: { ...controls } })
      sendControls()
      return
    }
    // Only these host messages can advance authority over the reliable channel.
    if (!['ready', 'status', 'granted', 'ack'].includes(message.type)) return
    if (message.type === 'granted') {
      if (message.requestId !== requestId || handoffEpoch !== message.epoch || message.status.owner !== 'phone') return
      advanceEpoch(message.epoch, true)
      clearAction(message.requestId)
      requestId = null
      handoffEpoch = null
      updateStatus(message.status, true)
      emit({ message: message.status.paused ? 'Phone controls · Simulation paused' : 'Phone controls' })
      sendControls()
      return
    }
    if (message.type === 'ack' && !pending.has(message.id)) return
    advanceEpoch(message.epoch, message.type === 'ready')
    if (message.type === 'ready') {
      hostReady = true
      checkReady()
    } else if (message.type === 'status') {
      clearPending()
      updateStatus(message.status, true)
      emit({ message: message.message, controls: { ...controls } })
    } else if (message.type === 'ack') {
      // Successful requestControl is complete only when the centered handoff is granted.
      if (message.id === requestId && message.ok) return
      clearAction(message.id)
      if (message.id === requestId || message.epoch > previousEpoch) { requestId = null; handoffEpoch = null }
      updateStatus(message.status, true)
      emit({ message: message.message, controls: { ...controls } })
    }
  }

  function receiveNative(value: unknown): void {
    if (finished || destroyed) return
    const message: RemoteMessage | null = parseMessage(value)
    if (!message || !('session' in message) || message.session !== session || message.epoch < epoch) return
    if (message.type === 'heartbeat') {
      // New-epoch native packets can arrive before the reliable handoff; keep its request alive.
      advanceEpoch(message.epoch, true)
      if (message.lease <= lease) return
      lease = message.lease
      lastHeartbeatAt = now()
      if (message.status) updateStatus(message.status, false)
      emit({
        appliedSeq: message.appliedSeq ?? snapshot.appliedSeq,
        receiveToApplyMs: message.receiveToApplyMs ?? snapshot.receiveToApplyMs,
      })
    } else if (message.epoch === epoch && message.type === 'ping') {
      transport?.sendNative({ ...envelope(), type: 'pong', id: message.id, sentAt: message.sentAt })
    } else if (message.epoch === epoch && message.type === 'pong' && outstandingPing?.id === message.id && message.sentAt === outstandingPing.sentAt) {
      const rttMs = Math.max(0, now() - outstandingPing.sentAt)
      outstandingPing = null
      emit({ rttMs })
    }
  }

  function hide(): void {
    cancelTransientControls()
    if (snapshot.status?.owner === 'phone' || requestId !== null) sendAction('releaseControl')
    authorityEpoch = -1
    clearPending()
    suspended = true
    releaseWakeLock()
    emit()
  }
  function visibilityChange(): void {
    if (doc?.hidden) hide()
    else { suspended = false; emit(); if (snapshot.phase === 'ready') void acquireWakeLock() }
  }

  doc?.addEventListener('visibilitychange', visibilityChange)
  win?.addEventListener('pagehide', hide)
  win?.addEventListener('blur', cancelTransientControls)
  win?.addEventListener('orientationchange', cancelTransientControls)
  const frameTimer = setInterval(() => {
    if (finished || destroyed) return
    const fresh = now() - lastHeartbeatAt < STALE_MS
    if (fresh !== snapshot.hostFresh) {
      cancelTransientControls()
      emit({ message: fresh ? snapshot.message : 'Connection delayed · Waiting for the computer' })
    }
    sendControls()
  }, CONTROL_INTERVAL_MS)
  const pingTimer = setInterval(() => {
    if (finished || destroyed || snapshot.phase !== 'ready' || !transport?.nativeOpen) return
    outstandingPing = { id: pingId++, sentAt: now() }
    transport.sendNative({ ...envelope(), type: 'ping', ...outstandingPing })
  }, 1000)
  const diagnosticsTimer = setInterval(() => {
    if (finished || destroyed || !transport?.nativeOpen) return
    void transport.diagnostics().then(diagnostics => {
      if (!finished && !destroyed) emit({ diagnostics })
    }).catch(() => {})
  }, 2000)

  function stopRuntime(): void {
    clearTimeout(setupTimer)
    clearInterval(frameTimer)
    clearInterval(pingTimer)
    clearInterval(diagnosticsTimer)
    doc?.removeEventListener('visibilitychange', visibilityChange)
    win?.removeEventListener('pagehide', hide)
    win?.removeEventListener('blur', cancelTransientControls)
    win?.removeEventListener('orientationchange', cancelTransientControls)
  }

  setupTimer = setTimeout(() => fail('Pairing service unavailable. Open a new QR on the computer and try again.'), 10_000)
  try {
    endpoint = (options.endpointFactory ?? createPeerEndpoint)({
      onConnection: incoming => incoming.close(),
      onSignalingState: available => { if (!finished) emit({ signalingAvailable: available }) },
    })
    void endpoint.ready.then(() => {
      if (finished || destroyed) return
      clearTimeout(setupTimer)
      setupTimer = setTimeout(() => fail('Could not connect directly, or the invitation is no longer available. Open a new QR and try the same non-guest Wi-Fi network.'), 15_000)
      transport = endpoint!.connect(peerId)
      subscriptions.push(transport.onReliable(receiveReliable), transport.onNative(receiveNative), transport.onClose(reason => fail(reason, true)))
      // onClose may report an already-closed transport synchronously.
      if (finished || destroyed) { for (const unsubscribe of subscriptions.splice(0)) unsubscribe(); return }
      emit({ phase: 'authenticating', message: 'Connecting to your computer…' })
      return transport.ready.then(() => {
        if (finished || destroyed) return
        if (!transport?.sendReliable({ v: 1, type: 'hello', secret })) fail('Could not finish pairing. Scan a new QR.')
      })
    }).catch(() => fail('Could not reach the computer or pairing service. Open a new QR and try again.'))
  } catch { fail('This browser could not start phone control. Try a current Safari or Chrome browser.') }

  return {
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => snapshot,
    updateControls(partial) {
      if (!snapshot.canControl || finished) return
      const next = { ...controls, ...partial }
      if (!isControls(next)) return
      controls = next
      // Persistent controls render their values; stick motion never waits on a render.
      if (partial.throttle !== undefined || partial.pitchTrim !== undefined || partial.flaps !== undefined) emit({ controls: { ...controls } })
      sendControls()
    },
    cancelTransientControls,
    requestControl: () => sendAction('requestControl'),
    setPaused: value => sendAction('setPaused', value),
    setViewMode: value => sendAction('setViewMode', value),
    releaseControl() { cancelTransientControls(); return sendAction('releaseControl') },
    destroy() {
      if (destroyed) return
      if (!finished) { cancelTransientControls(); sendAction('releaseControl') }
      destroyed = true
      finished = true
      secret = ''
      stopRuntime()
      clearPending()
      releaseWakeLock()
      stopTransport()
      listeners.clear()
    },
  }
}
