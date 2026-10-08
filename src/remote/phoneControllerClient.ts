import { createPeerEndpoint, type PeerEndpoint, type SessionTransport, type TransportDiagnostics } from './peerTransport'
import { createConnectionLog, describeIceFailure, type ConnectionLog } from './connectionDiagnostics'
import {
  CONTROL_INTERVAL_MS, HANDOFF_MS, MAX_CAMERA_ZOOM_STEP, MAX_HAPTIC_PULSE_MS, MAX_TRACE_EVENTS, MIN_CAMERA_ZOOM_STEP,
  NEUTRAL_CAMERA_AIM, NEUTRAL_CONTROLS, STALE_MS, isAiming,
  isCameraAim, isCentered, isControls, neutralize, parseMessage, isProtocolVersionMismatch, PROTOCOL_MISMATCH_MESSAGE,
  isPhoneControllerSettings,
  type ActionName, type AircraftStatus, type CameraAim, type CameraTotal, type ControlFrame, type ControlSendMode, type ControlSurfaceState, type ControlTrace, type HapticFeedbackFrame, type PhoneControllerSettings, type PhoneSettingsMessage, type RemoteMessage,
} from './protocol'
import { loadPhoneSettings, savePhoneSettings } from './phoneSettingsStore'

/**
 * When the input event behind a control change happened, for the opt-in
 * camera trace only. `at` is the event's `timeStamp`; `coalesced` counts the
 * touch samples the browser folded into it, and is only asked for while a
 * trace is running.
 */
export interface InputTiming { at: number; coalesced?(): number }

export interface PhoneControllerSnapshot {
  phase: 'connecting' | 'authenticating' | 'ready' | 'disconnected' | 'error'
  message: string
  status: AircraftStatus | null
  controls: ControlSurfaceState
  canFly: boolean
  canControl: boolean
  requestingControl: boolean
  hostFresh: boolean
  /**
   * How long the computer has gone unheard once that is past the stale limit,
   * in whole tenths of a second, for the 🌐 chip; null while it is heard.
   * The controls stay live meanwhile: the computer holds the last command.
   */
  lostMs: number | null
  signalingAvailable: boolean
  pendingActions: number
  rttMs: number | null
  /**
   * Control frames this phone sent over the last second, for the Hz chip: the
   * touch rate while a finger moves, the 60 Hz timer while none does, and 0
   * while the computer flies. Null until paired.
   */
  sendHz: number | null
  diagnostics: TransportDiagnostics | null
  appliedSeq: number | null
  receiveToApplyMs: number | null
  /** navigator.vibrate exists; coarse on/off pulses only, no intensity. */
  hapticsSupported: boolean
  /** The Haptics setting, where this phone can vibrate. */
  hapticsEnabled: boolean
  /** This controller's own settings, as the computer last confirmed them or as this phone last kept them. */
  settings: PhoneControllerSettings
}

export interface PhoneControllerClient {
  /** Everything this pairing attempt observed. Subscribe to it separately: a
   *  log line must not re-render the flight controls. */
  readonly log: ConnectionLog
  subscribe(listener: () => void): () => void
  getSnapshot(): PhoneControllerSnapshot
  updateControls(controls: Partial<ControlSurfaceState>, input?: InputTiming): void
  /**
   * Adds a camera trackpad gesture — a swipe as a fraction of the pad, a pinch
   * as a spread ratio — to the next control frame. Deltas accumulate until one
   * is actually sent, so a gesture is never lost to a frame that never left.
   */
  nudgeCamera(delta: CameraAim, input?: InputTiming): void
  cancelTransientControls(): void
  requestControl(): boolean
  setPaused(paused: boolean): boolean
  setViewMode(mode: 'first' | 'third'): boolean
  /** Only offered when the host advertises `gearDown`; older hosts cannot move it. */
  setGearDown(down: boolean): boolean
  /**
   * Holding the throttle lever to start the engine. Carried on every control
   * frame while held, like the brake, so it ends when the phone does.
   */
  setStarterHeld(held: boolean): void
  /** The throttle ring filled at idle. Only offered when the host reports an engine `state`. */
  shutdownEngine(): boolean
  releaseControl(): boolean
  setHapticsEnabled(enabled: boolean): void
  /**
   * Changes this controller's settings: kept on this phone at once, and sent
   * to the computer, which keeps them with its own and confirms them.
   */
  updateSettings(patch: Partial<PhoneControllerSettings>): void
  destroy(): void
}

// A new pulse may replace the running one, but not faster than the host heartbeat.
const MIN_PULSE_INTERVAL_MS = 45
/** Between automatic requests for control the computer offers back, so a refusal is not repeated at heartbeat rate. */
export const ASK_BACK_INTERVAL_MS = 500
/** A longer gap between control-timer ticks is this phone too busy to listen, not the computer going quiet. */
const BUSY_GAP_MS = 6 * CONTROL_INTERVAL_MS
const LOST_MESSAGE = 'Connection lost · Waiting for the computer'
/**
 * The controls the screen draws a number for. Each of these has to reach the
 * snapshot, because its slider is React-controlled: a value that only moves in
 * the mailbox is painted back to the snapshot's on the next render, so the
 * thumb sits still while the aircraft answers the finger. The pitch/roll pad
 * and the brake draw themselves from the pointer and are deliberately absent —
 * stick motion must never wait on a render.
 */
const RENDERED_CONTROLS = ['throttle', 'pitchTrim', 'rollTrim', 'flaps', 'rudder'] as const
/** The controls that stay where they are put, which blending with the computer shares. */
const LEVERS = ['throttle', 'pitchTrim', 'rollTrim', 'flaps'] as const

interface ClientOptions {
  endpointFactory?: typeof createPeerEndpoint
  now?: () => number
  /** Injectable lifecycle targets keep protocol tests independent of a browser. */
  document?: Document
  window?: Window
  /** Injectable Vibration API; null means unsupported. */
  vibrate?: ((durationMs: number) => boolean) | null
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null
  log?: ConnectionLog
  /**
   * Runs a task after the current one, which is how batch sending waits for
   * the rest of a touch frame's pointer events. Defaults to a MessageChannel:
   * a task without `setTimeout`'s clamping, and not a microtask, which would
   * run between two pointers' events.
   */
  postTask?: (task: () => void) => void
}

function createPostTask(): { post(task: () => void): void; close(): void } {
  if (typeof MessageChannel !== 'function') return { post: task => { setTimeout(task, 0) }, close() {} }
  const channel = new MessageChannel()
  let queued: (() => void) | null = null
  channel.port1.onmessage = () => { const task = queued; queued = null; task?.() }
  return {
    post(task) { queued = task; channel.port2.postMessage(0) },
    close() { channel.port1.onmessage = null; channel.port1.close(); channel.port2.close() },
  }
}

/** The control mailbox changes synchronously in pointer handlers, outside React. */
export function createPhoneControllerClient(
  invitation: { peerId: string; secret: string },
  options: ClientOptions = {},
): PhoneControllerClient {
  const now = options.now ?? (() => performance.now())
  const log = options.log ?? createConnectionLog('phone', now)
  const doc = options.document ?? (typeof document === 'undefined' ? undefined : document)
  const win = options.window ?? (typeof window === 'undefined' ? undefined : window)
  const listeners = new Set<() => void>()
  const subscriptions: Array<() => void> = []
  const pending = new Map<number, { action: ActionName; epoch: number; timer: ReturnType<typeof setTimeout> }>()
  let snapshot: PhoneControllerSnapshot = {
    phase: 'connecting', message: 'Connecting to pairing service…', status: null,
    controls: { ...NEUTRAL_CONTROLS }, canFly: false, canControl: false,
    requestingControl: false, hostFresh: false, lostMs: null, signalingAvailable: true,
    pendingActions: 0, rttMs: null, sendHz: null, diagnostics: null, appliedSeq: null, receiveToApplyMs: null,
    hapticsSupported: false, hapticsEnabled: false, settings: loadPhoneSettings(null),
  }
  let controls = { ...NEUTRAL_CONTROLS }
  // Held like the brake, but not a flight surface, so it travels beside them.
  let starterHeld = false
  // Gesture movement not yet on the wire. It clears when a frame carrying it is
  // actually sent, and on a blur, so an abandoned swipe never arrives late.
  let camera: CameraAim = { ...NEUTRAL_CAMERA_AIM }
  // The same gesture as a running total for this epoch (`CameraTotal`), so a
  // host that reads it loses nothing to a lost frame. `aimSent` is the total the
  // last frame carried, which a blur rewinds to, as it discards `camera`.
  let aimTotal = { yaw: 0, pitch: 0, zoom: 0 }
  let aimSent = { ...aimTotal }
  let aimUsed = false
  let aimStamp = -Infinity
  let aimMovedAt: number | null = null
  // When frames leave: chosen by the computer on its heartbeat.
  let sendMode: ControlSendMode = 'timer'
  let lastInputAt = -Infinity
  let batchQueued = false
  let batchTimer: ReturnType<typeof setTimeout> | undefined
  // Made on first use, so a controller that never batches holds no open port.
  let ownTask: ReturnType<typeof createPostTask> | null = null
  const postTask = options.postTask ?? ((task: () => void) => (ownTask ??= createPostTask()).post(task))
  // The opt-in camera trace (`?phoneCameraTrace=1` on the desktop): what the
  // next frame will report about how it came to be sent. Measurement only.
  let traceRequested = false
  let traceCam: number[][] = []
  let traceCtl: number[][] = []
  let traceGated = 0
  let traceDrop = [0, 0, 0]
  const tenth = (value: number) => Math.round(value * 10) / 10
  /** A millionth of a pad is a thousandth of a pixel; the total stays exact where it matters. */
  const micro = (value: number) => Math.round(value * 1e6) / 1e6
  function traceInput(list: number[][], entry: number[]): void {
    if (list.length < MAX_TRACE_EVENTS) list.push(entry)
  }
  /** Event times become ages before the frame, which stay short on the wire. */
  const aged = (list: number[][], time: number) => list.map(([at, handled, ...rest]) => [time - at, time - handled, ...rest].map(tenth))
  let endpoint: PeerEndpoint | undefined
  let transport: SessionTransport | undefined
  let secret = invitation.secret
  const peerId = invitation.peerId
  let session = ''
  let epoch = -1
  let authorityEpoch = -1
  let blockedAuthorityEpoch = -1
  let lease = -1
  let sequence = 0
  let actionId = 0
  let requestId: number | null = null
  let handoffEpoch: number | null = null
  let lastHeartbeatAt = -Infinity
  // The last heartbeat of any epoch, for how long the link has been lost.
  // Both move on by this phone's own stalls (see the control timer).
  let heardAt = -Infinity
  let frameTickAt = now()
  // When the computer went quiet, and what the status said before it did.
  let quietFrom = -Infinity
  let messageBeforeLoss = ''
  let lastControlAt = -Infinity
  let pingId = 0
  let outstandingPing: { id: number; sentAt: number } | null = null
  // Control frames that left since `framesCountedFrom`, for `sendHz`.
  let framesSent = 0
  let framesCountedFrom = now()
  let localReady = false
  let hostReady = false
  let destroyed = false
  let finished = false
  let suspended = doc?.hidden ?? false
  let wakeLock: WakeLockSentinel | null = null
  let wakeLockPending = false
  let setupTimer: ReturnType<typeof setTimeout> | undefined
  const browserNavigator = win?.navigator as (Navigator & { vibrate?: (pattern: number) => boolean }) | undefined
  const vibrate = options.vibrate !== undefined ? options.vibrate
    : typeof browserNavigator?.vibrate === 'function' ? (ms: number) => browserNavigator.vibrate!(ms) : null
  const storage = options.storage !== undefined ? options.storage : (() => {
    try { return win?.localStorage ?? null } catch { return null }
  })()
  let settings = loadPhoneSettings(storage)
  // How many times this phone has sent its settings; the computer's answers carry the newest it has taken.
  let settingsRev = 0
  let hapticsEnabled = vibrate !== null && settings.haptics
  let lastFeedbackId = -1
  let lastPulseAt = -Infinity
  let vibratingUntil = -Infinity
  let lastAskedBackAt = -Infinity
  // Centred frames a hidden page still owes the computer (see `hide`).
  let lettingGo = 0
  // Blending: the first frame to carry this pilot's latest lever move. The
  // levers follow the computer's only once it has applied that frame, so a
  // status from before the move cannot drag a lever back under the finger.
  let leverMoveSeq = -1
  snapshot = { ...snapshot, hapticsSupported: vibrate !== null, hapticsEnabled, settings }

  function stopVibration(): void {
    if (!vibrate || now() >= vibratingUntil) return
    vibratingUntil = -Infinity
    try { vibrate(0) } catch { /* Nothing else to cancel. */ }
  }

  function ownsControl(): boolean {
    return snapshot.status?.owner === 'phone' && authorityEpoch === epoch && !snapshot.status.paused
  }

  /** Latest value only: an older or duplicate id, or any lost authority, never vibrates. */
  function applyFeedback(frame: HapticFeedbackFrame): void {
    if (!vibrate || frame.id <= lastFeedbackId) return
    lastFeedbackId = frame.id
    if (!hapticsEnabled || suspended || finished || !ownsControl() || frame.pulseMs === 0) { stopVibration(); return }
    const time = now()
    if (time - lastPulseAt < MIN_PULSE_INTERVAL_MS) return
    const duration = Math.min(frame.pulseMs, frame.ttlMs, MAX_HAPTIC_PULSE_MS)
    try {
      if (vibrate(duration)) { lastPulseAt = time; vibratingUntil = time + duration }
    } catch { /* Optional: control continues without vibration. */ }
  }

  /** How long the computer has gone unheard, in tenths, once past the stale limit; null while heard. */
  function lostFor(phase: PhoneControllerSnapshot['phase']): number | null {
    const quiet = now() - heardAt
    return phase === 'ready' && Number.isFinite(quiet) && quiet >= STALE_MS ? Math.floor(quiet / 100) * 100 : null
  }

  function emit(patch: Partial<PhoneControllerSnapshot> = {}): void {
    if (destroyed) return
    const next = { ...snapshot, ...patch }
    next.hostFresh = now() - lastHeartbeatAt < STALE_MS
    next.lostMs = lostFor(next.phase)
    next.requestingControl = requestId !== null
    next.pendingActions = pending.size
    next.canFly = next.phase === 'ready' && next.hostFresh && !suspended && requestId === null && next.status?.owner === 'local'
    // Not waiting on a fresh computer: through a lost link the computer holds
    // this phone's last command, and the pilot keeps flying for when it is back.
    next.canControl = next.phase === 'ready' && !suspended && requestId === null && next.status?.owner === 'phone' && authorityEpoch === epoch
    if (next.lostMs !== null && snapshot.lostMs === null) {
      quietFrom = heardAt
      messageBeforeLoss = next.message
      next.message = LOST_MESSAGE
      stopVibration()
    } else if (next.lostMs === null && snapshot.lostMs !== null) {
      // Heard again: the timeline keeps how long it was, for a report.
      if (heardAt > quietFrom) log.record('channel', 'host-silent', `Nothing from the computer for ${((heardAt - quietFrom) / 1000).toFixed(1)} s`, 'warn')
      if (next.message === LOST_MESSAGE) next.message = messageBeforeLoss
    }
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
    starterHeld = false
    snapshot = { ...snapshot, controls: { ...controls } }
  }

  function advanceEpoch(nextEpoch: number, preserveRequest = false): void {
    if (nextEpoch <= epoch) return
    epoch = nextEpoch
    sequence = 0
    leverMoveSeq = -1
    lease = -1
    authorityEpoch = -1
    lastHeartbeatAt = -Infinity
    outstandingPing = null
    stopVibration()
    clearPending(preserveRequest)
    adoptControls(controls)
    // A running total belongs to its epoch; the host starts from zero with it.
    aimTotal = { yaw: 0, pitch: 0, zoom: 0 }
    aimSent = { ...aimTotal }
    aimUsed = false
    aimStamp = -Infinity
    aimMovedAt = null
  }

  /** `by` is for the opt-in trace only: 0 an input event, 1 the control timer, 2 anything else. */
  function sendControls(by: ControlTrace['by'] = 2): void {
    if (finished || !session || !transport?.nativeOpen || lease < 0 || (suspended && lettingGo === 0)) return
    if (handoffEpoch !== epoch && !(snapshot.status?.owner === 'phone' && authorityEpoch === epoch)) return
    const time = now()
    // An interval plus immediate contacts/releases can never exceed 120 frames/s.
    if (time - lastControlAt < 1000 / 120) { if (traceRequested) traceGated++; return }
    if (sequence >= Number.MAX_SAFE_INTEGER) { fail('Controller session ended. Scan a new QR.'); return }
    lastControlAt = time
    // An unmoved camera is the absence of the key, which is exactly how a host
    // that predates this field reads every frame.
    const gesture = isAiming(camera) ? { camera: { ...camera } } : null
    // As of the newest touch it includes, or of now if the finger has not moved
    // since; always later than the previous frame's, so the timeline only runs forward.
    const stamp = Math.round(Math.max(aimStamp + .01, aimMovedAt ?? time) * 100) / 100
    const total: { aim: CameraTotal } | null = aimUsed ? { aim: {
      yaw: micro(aimTotal.yaw), pitch: micro(aimTotal.pitch), zoom: micro(aimTotal.zoom), t: stamp,
    } } : null
    const trace: { trace: ControlTrace } | null = traceRequested ? { trace: {
      at: tenth(time), by, gated: traceGated, buf: transport.nativeBufferedAmount,
      cam: aged(traceCam, time), ctl: aged(traceCtl, time), drop: traceDrop.map(tenth),
    } } : null
    const starter = starterHeld ? { starter: 1 as const } : null
    const sent = transport.sendNative({ ...envelope(), type: 'controls', seq: sequence++, lease, controls: { ...controls }, ...gesture, ...total, ...trace, ...starter })
    if (sent) framesSent++
    // Only a delta that left the device has been spent.
    if (sent && gesture) camera = { ...NEUTRAL_CAMERA_AIM }
    if (sent && total) { aimSent = { ...aimTotal }; aimStamp = stamp; aimMovedAt = null }
    if (sent && trace) { traceCam = []; traceCtl = []; traceGated = 0; traceDrop = [0, 0, 0] }
    if (sent && suspended) lettingGo--
  }

  /** Blending: the levers go where the computer has them. True when one moved. */
  function followLevers(from: ControlSurfaceState): boolean {
    if (LEVERS.every(key => controls[key] === from[key])) return false
    controls = { ...controls, throttle: from.throttle, pitchTrim: from.pitchTrim, rollTrim: from.rollTrim, flaps: from.flaps }
    return true
  }

  function cancelTransientControls(): void {
    // Through `adoptControls`, so a rudder the screen is drawing goes back to
    // centre on the screen too, not just on the wire.
    adoptControls(controls)
    camera = { ...NEUTRAL_CAMERA_AIM }
    aimTotal = { ...aimSent }
    aimMovedAt = null
    sendControls()
    emit()
  }

  /**
   * An input event changed what the next frame carries. `timer` sends now,
   * within the 120/s cap, and leaves anything the cap turned away to the next
   * event or the 60 Hz timer. `batch` waits for the rest of this touch frame's
   * events, then sends once — and if the cap is still closed, when it opens.
   */
  function inputChanged(): void {
    lastInputAt = now()
    if (sendMode === 'timer') { sendControls(0); return }
    if (batchQueued) return
    batchQueued = true
    postTask(sendBatch)
  }
  function sendBatch(): void {
    clearTimeout(batchTimer)
    batchTimer = undefined
    batchQueued = false
    if (finished || destroyed) return
    const wait = lastControlAt + 1000 / 120 - now()
    if (wait > 0) { batchQueued = true; batchTimer = setTimeout(sendBatch, Math.ceil(wait)); return }
    sendControls(0)
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

  /** Prefers the cause the transport already recorded over a generic guess. */
  function recordedReason(fallback: string): string {
    return log.facts().failure?.detail ?? fallback
  }

  function fail(message: string, disconnected = false, code = 'client-failure'): void {
    if (finished || destroyed) return
    log.recordFailure('session', code, message)
    finished = true
    secret = ''
    clearTimeout(setupTimer)
    clearPending()
    authorityEpoch = -1
    stopVibration()
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
    sendSettings(true)
    void acquireWakeLock()
  }

  /** `initial`: the computer keeps its own where it has any, and takes these where it still has its defaults. */
  function sendSettings(initial: boolean): void {
    if (finished || snapshot.phase !== 'ready' || !session) return
    settingsRev++
    transport?.sendReliable({ ...envelope(), type: 'settings', settings: { ...settings }, rev: settingsRev, ...(initial ? { initial: true as const } : {}) })
  }

  function keepSettings(next: PhoneControllerSettings): boolean {
    if ((Object.keys(next) as (keyof PhoneControllerSettings)[]).every(key => next[key] === settings[key])) return false
    settings = { ...next }
    hapticsEnabled = vibrate !== null && settings.haptics
    if (!hapticsEnabled) stopVibration()
    savePhoneSettings(storage, settings)
    emit({ settings, hapticsEnabled })
    return true
  }

  function updateSettings(patch: Partial<PhoneControllerSettings>): void {
    if (destroyed) return
    const next = { ...settings, ...patch }
    if (isPhoneControllerSettings(next) && keepSettings(next)) sendSettings(false)
  }

  /** What the computer holds, unless this phone has changed them since the change the computer last took. */
  function adoptSettings(message: PhoneSettingsMessage): void {
    if (message.rev < settingsRev) return
    keepSettings(message.settings)
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
      if (requestId === id) {
        blockedAuthorityEpoch = Math.max(blockedAuthorityEpoch, epoch)
        requestId = null; handoffEpoch = null; cancelTransientControls()
      }
      emit({ message: 'Request timed out. Check the computer before trying again.' })
    }, HANDOFF_MS)
    pending.set(id, { action, epoch, timer })
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
    // Hiding/abandoning a handoff revokes this epoch locally. An in-flight
    // status cannot reinstate it; the host must issue a new Fly handoff.
    if (authoritative) authorityEpoch = status.owner === 'phone' && epoch > blockedAuthorityEpoch ? epoch : -1
    // A pre-grant heartbeat may arrive after granted on the other channel.
    // Only reliable messages transfer ownership; telemetry cannot undo a grant.
    if (!authoritative && snapshot.status) status = { ...status, owner: snapshot.status.owner }
    // Telemetry must never drag a live slider/stick back to the previous frame.
    if (status.owner === 'local' && handoffEpoch === null) adoptControls(status.controls)
    snapshot = { ...snapshot, status }
    if (!ownsControl()) stopVibration()
  }

  function receiveReliable(value: unknown): void {
    if (finished || destroyed) return
    const message = parseMessage(value)
    if (!message) {
      if (isProtocolVersionMismatch(value)) fail(PROTOCOL_MISMATCH_MESSAGE)
      return
    }
    if (message.type === 'reject') { fail(message.reason); return }
    if (message.type === 'hello') return
    if (message.type === 'settings') {
      if (session && message.session === session) adoptSettings(message)
      return
    }
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
      }).catch(() => fail(recordedReason(
        `Could not open the direct control channel. ${describeIceFailure(log.facts())}`), false, 'control-channel-failed'))
      return
    }
    if (!session || message.session !== session || message.epoch < epoch) return
    const previousEpoch = epoch
    if (message.type === 'handoff') {
      if (!hostReady || !localReady || requestId !== message.requestId || !isCentered(message.controls)) return
      advanceEpoch(message.epoch, true)
      handoffEpoch = epoch
      lease = Math.max(lease, message.lease)
      lastHeartbeatAt = heardAt = now()
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
      // Losing control paused the flight; now that it is back, lift that pause.
      if (message.resume === true && message.status.paused) sendAction('setPaused', false)
      return
    }
    if (message.type === 'ack' && !pending.has(message.id)) return
    advanceEpoch(message.epoch, message.type === 'ready')
    if (message.type === 'ready') {
      hostReady = true
      checkReady()
    } else if (message.type === 'status') {
      const request = requestId === null ? undefined : pending.get(requestId)
      // Camera/telemetry status is not an ownership cancellation. Preserve an
      // in-progress handoff unless a later host epoch has superseded it.
      if (request && message.status.owner === 'local' && message.epoch !== (handoffEpoch ?? request.epoch)) clearPending()
      updateStatus(message.status, true)
      emit({ message: message.message, controls: { ...controls } })
      askBack()
    } else if (message.type === 'ack') {
      // Successful requestControl is complete only when the centered handoff is granted.
      if (message.id === requestId && message.ok) return
      clearAction(message.id)
      if (message.id === requestId || message.epoch > previousEpoch) { requestId = null; handoffEpoch = null }
      updateStatus(message.status, true)
      emit({ message: message.message, controls: { ...controls } })
      askBack()
    }
  }

  function receiveNative(value: unknown): void {
    if (finished || destroyed) return
    const message: RemoteMessage | null = parseMessage(value)
    if (!message) {
      if (isProtocolVersionMismatch(value)) fail(PROTOCOL_MISMATCH_MESSAGE)
      return
    }
    if (!('session' in message) || message.session !== session || message.epoch < epoch) return
    if (message.type === 'heartbeat') {
      // New-epoch native packets can arrive before the reliable handoff; keep its request alive.
      advanceEpoch(message.epoch, true)
      if (message.lease <= lease) return
      lease = message.lease
      lastHeartbeatAt = heardAt = now()
      traceRequested = message.trace === 1
      sendMode = message.controlSend === 'batch' ? 'batch' : 'timer'
      if (message.status) updateStatus(message.status, false)
      if (message.feedback) applyFeedback(message.feedback)
      const followed = message.status?.blend !== undefined && ownsControl()
        && (message.appliedSeq ?? -1) >= leverMoveSeq && followLevers(message.status.controls)
      emit({
        appliedSeq: message.appliedSeq ?? snapshot.appliedSeq,
        receiveToApplyMs: message.receiveToApplyMs ?? snapshot.receiveToApplyMs,
        ...(followed ? { controls: { ...controls } } : {}),
      })
      askBack()
    } else if (message.epoch === epoch && message.type === 'ping') {
      transport?.sendNative({ ...envelope(), type: 'pong', id: message.id, sentAt: message.sentAt })
    } else if (message.epoch === epoch && message.type === 'pong' && outstandingPing?.id === message.id && message.sentAt === outstandingPing.sentAt) {
      const rttMs = Math.max(0, now() - outstandingPing.sentAt)
      outstandingPing = null
      emit({ rttMs })
    }
  }

  function hide(): void {
    // A centred last frame, then silence. Hiding is not Release, and it gives
    // nothing up: the computer holds that centred frame through its hold, so a
    // page back within it flies on in the same epoch; after it, control comes
    // back to the computer, which hands it back once this phone is heard again.
    // A handoff in progress is abandoned, though, and a grant or status
    // arriving later cannot finish it.
    cancelTransientControls()
    if (requestId !== null) {
      blockedAuthorityEpoch = Math.max(blockedAuthorityEpoch, epoch)
      authorityEpoch = -1
    }
    stopVibration()
    clearPending()
    suspended = true
    // Whatever the computer heard last, it holds. So the centred frame goes
    // twice more as the frame timer allows — past the rate cap that may have
    // held back the one just now, and past a packet the link drops — or a
    // hidden phone could leave a deflected stick, brake or starter held.
    lettingGo = 2
    releaseWakeLock()
    emit()
  }
  function visibilityChange(): void {
    if (doc?.hidden) hide()
    else { suspended = false; lettingGo = 0; emit(); if (snapshot.phase === 'ready') void acquireWakeLock(); askBack() }
  }

  /**
   * The computer offers back control this phone flew and never let go of:
   * ask for it, as if the pilot had tapped Take control. The request runs the
   * same centred handoff a tap does. A refused or timed-out one is asked again
   * no sooner than `ASK_BACK_INTERVAL_MS`, while the offer stands.
   */
  function askBack(): void {
    if (finished || snapshot.status?.handBack !== 'now' || !snapshot.canFly || now() - lastAskedBackAt < ASK_BACK_INTERVAL_MS) return
    lastAskedBackAt = now()
    sendAction('requestControl')
  }

  doc?.addEventListener('visibilitychange', visibilityChange)
  win?.addEventListener('pagehide', hide)
  win?.addEventListener('blur', cancelTransientControls)
  win?.addEventListener('orientationchange', cancelTransientControls)
  const frameTimer = setInterval(() => {
    if (finished || destroyed) return
    const time = now()
    const gap = time - frameTickAt
    frameTickAt = time
    // This phone too busy to run its own timer — a long render, a throttled
    // tab — is not the computer going quiet: the heartbeats are waiting in the
    // queue behind it.
    if (gap > BUSY_GAP_MS) {
      heardAt = Math.min(time, heardAt + gap - CONTROL_INTERVAL_MS)
      lastHeartbeatAt = Math.min(time, lastHeartbeatAt + gap - CONTROL_INTERVAL_MS)
    }
    // A link going quiet leaves the controls alone: the computer holds their
    // last command, and what the pilot does meanwhile is sent for when it is back.
    const fresh = time - lastHeartbeatAt < STALE_MS
    if (fresh !== snapshot.hostFresh || lostFor(snapshot.phase) !== snapshot.lostMs) {
      if (!fresh) stopVibration()
      emit()
      askBack()
    }
    // Batch sending keeps the stream alive from here only while no input is:
    // a timer frame just before a touch frame would hold that frame back.
    if (sendMode === 'batch' && (batchQueued || now() - lastInputAt < 2 * CONTROL_INTERVAL_MS)) return
    sendControls(1)
  }, CONTROL_INTERVAL_MS)
  const pingTimer = setInterval(() => {
    if (finished || destroyed) return
    // The rate over the time actually elapsed, which a busy phone stretches past a second.
    const time = now()
    const sendHz = snapshot.phase === 'ready' ? Math.round(framesSent * 1000 / Math.max(1, time - framesCountedFrom)) : null
    framesSent = 0
    framesCountedFrom = time
    if (sendHz !== snapshot.sendHz) emit({ sendHz })
    if (snapshot.phase !== 'ready' || !transport?.nativeOpen) return
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
    clearTimeout(batchTimer)
    ownTask?.close()
    clearInterval(frameTimer)
    clearInterval(pingTimer)
    clearInterval(diagnosticsTimer)
    doc?.removeEventListener('visibilitychange', visibilityChange)
    win?.removeEventListener('pagehide', hide)
    win?.removeEventListener('blur', cancelTransientControls)
    win?.removeEventListener('orientationchange', cancelTransientControls)
  }

  setupTimer = setTimeout(() => fail(recordedReason(
    'Pairing service unavailable. This phone never finished registering with the signaling server, so it could not call the computer.',
  ), false, 'phone-registration-timeout'), 10_000)
  try {
    endpoint = (options.endpointFactory ?? createPeerEndpoint)({
      log,
      role: 'phone',
      onConnection: incoming => incoming.close(),
      onSignalingState: available => { if (!finished) emit({ signalingAvailable: available }) },
    })
    void endpoint.ready.then(() => {
      if (finished || destroyed) return
      clearTimeout(setupTimer)
      setupTimer = setTimeout(() => fail(recordedReason(
        `Could not connect directly. ${describeIceFailure(log.facts())}`), false, 'phone-setup-timeout'), 15_000)
      transport = endpoint!.connect(peerId)
      subscriptions.push(transport.onReliable(receiveReliable), transport.onNative(receiveNative), transport.onClose(reason => fail(reason, true, 'transport-closed')))
      const discarded = transport.onNativeDiscarded?.(value => {
        const frame = value as Partial<ControlFrame>
        if (!traceRequested || frame.type !== 'controls') return
        traceDrop[0]++
        traceDrop[1] += (frame.camera?.yaw ?? 0) * 1000
        traceDrop[2] += (frame.camera?.pitch ?? 0) * 1000
      })
      if (discarded) subscriptions.push(discarded)
      // onClose may report an already-closed transport synchronously.
      if (finished || destroyed) { for (const unsubscribe of subscriptions.splice(0)) unsubscribe(); return }
      emit({ phase: 'authenticating', message: 'Connecting to your computer…' })
      return transport.ready.then(() => {
        if (finished || destroyed) return
        if (!transport?.sendReliable({ v: 1, type: 'hello', secret })) fail('Could not finish pairing. Scan a new QR.')
      })
    }).catch((error: unknown) => fail(recordedReason(
      error instanceof Error && error.message ? error.message
        : 'Could not reach the computer or pairing service. Open a new QR and try again.'), false, 'endpoint-failed'))
  } catch (error: unknown) {
    log.record('session', 'peer-construction-failed', error instanceof Error ? error.message : String(error), 'error')
    fail('This browser could not start phone control. Try a current Safari or Chrome browser.', false, 'peer-unsupported')
  }

  return {
    log,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => snapshot,
    updateControls(partial, input) {
      if (!snapshot.canControl || finished) return
      const next = { ...controls, ...partial }
      if (!isControls(next)) return
      if (LEVERS.some(key => next[key] !== controls[key])) leverMoveSeq = sequence
      controls = next
      if (traceRequested && input) traceInput(traceCtl, [input.at, now()])
      if (RENDERED_CONTROLS.some(key => partial[key] !== undefined)) emit({ controls: { ...controls } })
      inputChanged()
    },
    nudgeCamera(delta, input) {
      if (!snapshot.canControl || finished || !isCameraAim(delta) || !isAiming(delta)) return
      if (traceRequested && input) traceInput(traceCam, [input.at, now(), delta.yaw * 1000, delta.pitch * 1000, input.coalesced?.() ?? 1])
      const bound = (value: number) => Math.max(-1, Math.min(1, value))
      const zoom = Math.max(MIN_CAMERA_ZOOM_STEP,
        Math.min(MAX_CAMERA_ZOOM_STEP, (camera.zoom ?? 1) * (delta.zoom ?? 1)))
      camera = {
        yaw: bound(camera.yaw + delta.yaw), pitch: bound(camera.pitch + delta.pitch),
        ...(zoom === 1 ? {} : { zoom }),
      }
      aimTotal = {
        yaw: aimTotal.yaw + delta.yaw, pitch: aimTotal.pitch + delta.pitch,
        zoom: aimTotal.zoom + Math.log(delta.zoom ?? 1),
      }
      aimUsed = true
      aimMovedAt = Math.max(aimMovedAt ?? -Infinity, input?.at ?? now())
      // The camera never renders a value, so this never needs a re-render.
      inputChanged()
    },
    cancelTransientControls,
    requestControl: () => sendAction('requestControl'),
    setPaused: value => sendAction('setPaused', value),
    setViewMode: value => sendAction('setViewMode', value),
    setGearDown: value => (snapshot.status?.gearDown === undefined ? false : sendAction('setGearDown', value)),
    setStarterHeld(held) {
      const next = held && snapshot.canControl && !finished
      if (next === starterHeld) return
      starterHeld = next
      inputChanged()
    },
    shutdownEngine: () => (snapshot.status?.engine?.state === undefined ? false : sendAction('shutdownEngine')),
    releaseControl() { cancelTransientControls(); return sendAction('releaseControl') },
    setHapticsEnabled: enabled => updateSettings({ haptics: enabled }),
    updateSettings,
    destroy() {
      if (destroyed) return
      if (!finished) { cancelTransientControls(); sendAction('releaseControl') }
      stopVibration()
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
