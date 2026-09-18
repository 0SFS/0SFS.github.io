import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPhoneControlSession } from '../flight/remote/createPhoneControlSession'
import { createPhoneControllerClient, type PhoneControllerClient } from './phoneControllerClient'
import { parsePairingUrl } from './pairing'
import { DEFAULT_PHONE_CAMERA_TUNING } from '../flight/remote/phoneCameraTuning'
import { NEUTRAL_CONTROLS, type AircraftStatus, type ControlFrame, type RemoteMessage } from './protocol'
import type { createPeerEndpoint, SessionTransport } from './peerTransport'

type Envelope = { v: 1; session: string; epoch: number }
class Link implements SessionTransport {
  id = crypto.randomUUID()
  ready = Promise.resolve()
  nativeOpen = false
  nativeStreamId: number | null = null
  nativeBufferedAmount = 0
  closed = false
  other!: Link
  reliable: RemoteMessage[] = []
  native: RemoteMessage[] = []
  holdHandoff = false
  holdGranted = false
  holdStatus = false
  held: RemoteMessage[] = []
  dropNative = false
  listeners = { reliable: new Set<(value: unknown) => void>(), native: new Set<(value: unknown) => void>(), close: new Set<(reason: string) => void>() }
  private resolveNative!: (id: number) => void
  private nativeReady = new Promise<number>(resolve => { this.resolveNative = resolve })
  onReliable(handler: (value: unknown) => void) { this.listeners.reliable.add(handler); return () => { this.listeners.reliable.delete(handler) } }
  onNative(handler: (value: unknown) => void) { this.listeners.native.add(handler); return () => { this.listeners.native.delete(handler) } }
  onClose(handler: (reason: string) => void) { this.listeners.close.add(handler); return () => { this.listeners.close.delete(handler) } }
  receiveReliable(value: unknown) { for (const handler of this.listeners.reliable) handler(value) }
  receiveNative(value: unknown) { for (const handler of this.listeners.native) handler(value) }
  sendReliable(value: unknown) {
    if (this.closed) return false
    const message = structuredClone(value) as RemoteMessage
    this.reliable.push(message)
    if ((this.holdHandoff && message.type === 'handoff') || (this.holdGranted && message.type === 'granted') || (this.holdStatus && message.type === 'status')) this.held.push(message)
    else queueMicrotask(() => { if (!this.closed && !this.other.closed) this.other.receiveReliable(message) })
    return true
  }
  flushHeld() { for (const value of this.held.splice(0)) queueMicrotask(() => this.other.receiveReliable(value)) }
  sendNative(value: unknown) {
    if (this.closed || !this.nativeOpen) return false
    const message = structuredClone(value) as RemoteMessage
    this.native.push(message)
    if (!this.dropNative) queueMicrotask(() => { if (!this.closed && !this.other.closed) this.other.receiveNative(message) })
    return true
  }
  openNative(id = 1) {
    this.nativeStreamId = id
    if (this.other.nativeStreamId !== null) {
      if (this.other.nativeStreamId !== id) throw new Error('Mismatched native stream IDs')
      this.nativeOpen = this.other.nativeOpen = true
      this.resolveNative(id)
      this.other.resolveNative(id)
    }
    return this.nativeReady
  }
  diagnostics = async () => ({ path: 'direct' as const, iceRttMs: 4, ordered: false, maxRetransmits: 0, bufferedAmount: 0 })
  close() {
    if (this.closed) return
    this.closed = true
    this.nativeOpen = false
    for (const handler of this.listeners.close) handler('Connection lost. Scan a new QR.')
    this.other.close()
  }
  last<T extends RemoteMessage['type']>(type: T): Extract<RemoteMessage, { type: T }> {
    const message = [...this.reliable, ...this.native].findLast(value => value.type === type)
    if (!message) throw new Error(`Missing ${type}`)
    return message as Extract<RemoteMessage, { type: T }>
  }
}

const cleanup: Array<() => void> = []
beforeEach(() => vi.useFakeTimers())
afterEach(() => { for (const destroy of cleanup.splice(0)) destroy(); vi.useRealTimers() })
const flush = () => vi.advanceTimersByTimeAsync(0)
const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms)

async function setup(clientOptions: Partial<Parameters<typeof createPhoneControllerClient>[1]> = {},
  hostOptions: Partial<Parameters<typeof createPhoneControlSession>[0]> = {}) {
  const hostLink = new Link()
  const phoneLink = new Link()
  hostLink.other = phoneLink
  phoneLink.other = hostLink
  const doc = new EventTarget() as Document
  Object.defineProperty(doc, 'hidden', { value: false, writable: true })
  const win = new EventTarget() as Window
  Object.defineProperty(win, 'navigator', { value: {} })
  const state: AircraftStatus = {
    owner: 'local', paused: false, viewMode: 'third', airspeedKts: 92, altitudeFt: 2500, headingDeg: 83,
    controls: { ...NEUTRAL_CONTROLS, throttle: .67, pitchTrim: -.12, flaps: 1 / 3 },
  }
  let accept: ((transport: SessionTransport) => void) | undefined
  let signaling: ((available: boolean) => void) | undefined
  const hostEndpoint = vi.fn<typeof createPeerEndpoint>((options = {}) => {
    accept = options.onConnection
    return { ready: Promise.resolve('desktop'), connect: () => hostLink, destroy: vi.fn() }
  })
  const endpointDestroy = vi.fn()
  const clientEndpoint = vi.fn<typeof createPeerEndpoint>((options = {}) => {
    signaling = options.onSignalingState
    return { ready: Promise.resolve('phone'), connect: () => { accept!(hostLink); return phoneLink }, destroy: endpointDestroy }
  })
  const aimFrames = vi.fn()
  const host = createPhoneControlSession({
    getStatus: () => ({ ...state, controls: { ...state.controls } }), hasActiveLocalInput: () => false,
    onOwnershipChange: (owner, controls) => { state.owner = owner; state.controls = { ...controls } },
    setPaused: paused => { state.paused = paused }, setViewMode: view => { state.viewMode = view },
    createEndpoint: hostEndpoint, now: () => Date.now(), onCameraAim: aimFrames, ...hostOptions,
  })
  await host.startPairing()
  const invitation = parsePairingUrl(host.getSnapshot().invitationUrl!)!
  const client = createPhoneControllerClient(invitation, { endpointFactory: clientEndpoint, now: () => Date.now(), document: doc, window: win, ...clientOptions })
  cleanup.push(() => client.destroy(), () => host.destroy())
  await flush()
  const envelope = (): Envelope => {
    const message = hostLink.last('welcome')
    return { v: 1, session: message.session, epoch: message.epoch }
  }
  const fly = async () => {
    expect(client.requestControl()).toBe(true)
    await flush()
    expect(client.getSnapshot().canControl).toBe(true)
  }
  return { host, client, hostLink, phoneLink, state, invitation, doc, win, endpointDestroy, clientEndpoint, envelope, fly, aimFrames, signal: (available: boolean) => signaling!(available) }
}

describe('phone controller', () => {
  it('boots with the real host, hands off centered settings, streams input, retakes control, pauses and releases', async () => {
    const h = await setup()
    expect(h.client.getSnapshot()).toMatchObject({ phase: 'ready', canFly: false, canControl: false })
    expect(h.phoneLink.reliable[0]).toEqual({ v: 1, type: 'hello', secret: h.invitation.secret })
    expect(h.phoneLink.native).toHaveLength(0)
    await advance(50)
    expect(h.client.getSnapshot().canFly).toBe(true)
    expect(h.state).toMatchObject({ owner: 'local', paused: false })
    await h.fly()
    const baseline = h.phoneLink.last('controls')
    expect(baseline.controls).toEqual(h.state.controls)
    expect(baseline.seq).toBe(0)
    h.client.updateControls({ aileron: .8, elevator: -.4, throttle: .73, brake: 1 })
    await advance(20)
    const applied = h.host.beforeStep(h.state.controls)
    expect(applied).toMatchObject({ aileron: .8, elevator: -.4, throttle: .73, brake: 1 })
    h.state.controls = applied as ControlFrame['controls']
    h.host.takeControl()
    await advance(50)
    expect(h.client.getSnapshot()).toMatchObject({ canControl: false, canFly: true })
    expect(h.state.controls).toMatchObject({ throttle: .73, pitchTrim: -.12, flaps: 1 / 3, aileron: 0, brake: 0 })
    await h.fly()
    expect(h.client.setPaused(true)).toBe(true)
    await flush()
    expect(h.state.paused).toBe(true)
    expect(h.client.setViewMode('first')).toBe(true)
    await flush()
    expect(h.state.viewMode).toBe('first')
    expect(h.client.setPaused(false)).toBe(true)
    await flush()
    expect(h.state.paused).toBe(false)
    expect(h.client.releaseControl()).toBe(true)
    await advance(50)
    expect(h.state).toMatchObject({ owner: 'local', paused: true })
    expect(h.client.getSnapshot()).toMatchObject({ canFly: true, canControl: false, pendingActions: 0 })
    expect(h.clientEndpoint).toHaveBeenCalledTimes(1)
  })

  it('sums camera gestures until a frame carries them, then hands each one over once', async () => {
    const h = await setup()
    await advance(50)
    await h.fly()
    expect(h.host.takeCameraAim()).toBeNull()
    // Several pointermoves inside one frame are one gesture, not the last one.
    h.client.nudgeCamera({ yaw: .2, pitch: -.1 })
    h.client.nudgeCamera({ yaw: .1, pitch: -.05 })
    h.client.nudgeCamera({ yaw: 0, pitch: 0, zoom: 1.5 })
    await advance(60)
    // A paused desktop renders only on request, so an arriving gesture asks for a frame.
    expect(h.aimFrames).toHaveBeenCalled()
    expect(h.phoneLink.native.filter(message => message.type === 'controls' && message.camera).length).toBeGreaterThan(0)
    // However the gesture was split across frames, the host draws all of it, once.
    const drawn = h.host.takeCameraAim()!
    expect(drawn.yaw).toBeCloseTo(.3)
    expect(drawn.pitch).toBeCloseTo(-.15)
    expect(drawn.zoom).toBeCloseTo(1.5)
    // Drained: the same movement is never drawn twice.
    expect(h.host.takeCameraAim()).toBeNull()
    // A gesture is a view, not a deflection: the surfaces this step applies are untouched.
    expect(h.host.beforeStep(h.state.controls)).toMatchObject({ aileron: 0, elevator: 0, rudder: 0 })
    // A spent delta leaves the next frame, so a still finger sends no camera at all.
    h.aimFrames.mockClear()
    await advance(60)
    expect(h.phoneLink.last('controls').camera).toBeUndefined()
    expect(h.aimFrames).not.toHaveBeenCalled()
    // The desktop taking the aircraft back ends the gesture: a phone that no
    // longer controls anything cannot move the camera either.
    h.host.takeControl()
    await advance(60)
    h.client.nudgeCamera({ yaw: 1, pitch: 0 })
    await advance(60)
    expect(h.phoneLink.last('controls').camera).toBeUndefined()
    expect(h.host.takeCameraAim()).toBeNull()
    expect(h.host.isCameraActive()).toBe(false)
  })

  it('sends once per touch frame when the computer asks, carrying the running total', async () => {
    const tuning = { ...DEFAULT_PHONE_CAMERA_TUNING }
    const h = await setup({ postTask: task => { setTimeout(task, 0) } }, { getCameraTuning: () => tuning })
    await advance(50)
    await h.fly()
    await advance(50)
    // The original timing is what a heartbeat without the field means.
    expect('controlSend' in h.hostLink.last('heartbeat')).toBe(false)
    tuning.send = 'batch'
    await advance(50)
    expect(h.hostLink.last('heartbeat')).toMatchObject({ controlSend: 'batch' })
    const controlFrames = () => h.phoneLink.native.filter((message): message is ControlFrame => message.type === 'controls')
    await advance(40)
    const before = controlFrames().length
    // One touch frame: the stick's and the camera's pointer events, back to back.
    const touchedAt = Date.now() - 1
    h.client.updateControls({ aileron: .3 }, { at: touchedAt })
    h.client.nudgeCamera({ yaw: .01, pitch: 0 }, { at: touchedAt })
    expect(controlFrames()).toHaveLength(before)
    await advance(0)
    expect(controlFrames()).toHaveLength(before + 1)
    expect(controlFrames().at(-1)).toMatchObject({ controls: { aileron: .3 }, camera: { yaw: .01 }, aim: { yaw: .01, t: touchedAt } })
    // While a finger is moving, the 60 Hz timer stays out of its way.
    await advance(30)
    expect(controlFrames()).toHaveLength(before + 1)
    // A touch frame the 120/s cap would turn away waits for the cap instead.
    h.client.nudgeCamera({ yaw: .02, pitch: 0 }, { at: Date.now() })
    await advance(0)
    h.client.nudgeCamera({ yaw: .01, pitch: 0 }, { at: Date.now() + 4 })
    await advance(4)
    expect(controlFrames()).toHaveLength(before + 2)
    await advance(5)
    expect(controlFrames()).toHaveLength(before + 3)
    const [previous, last] = controlFrames().slice(-2)
    // The total carries everything; stamps only move forward.
    expect(last.aim!.yaw).toBeCloseTo(.04)
    expect(last.aim!.t).toBeGreaterThan(previous.aim!.t)
    // A blur discards movement that has not left, from the total as from the delta.
    h.client.nudgeCamera({ yaw: .05, pitch: 0 }, { at: Date.now() })
    h.win.dispatchEvent(new Event('blur'))
    await advance(20)
    expect(controlFrames().at(-1)!.aim!.yaw).toBeCloseTo(.04)
    expect(controlFrames().at(-1)!.camera).toBeUndefined()
    // Once the fingers are still, the timer keeps the stream alive again.
    const quiet = controlFrames().length
    await advance(100)
    expect(controlFrames().length - quiet).toBeGreaterThanOrEqual(4)
  })

  it('attaches its own timings to control frames only while the desktop asks for a trace', async () => {
    const plain = await setup()
    await advance(50)
    await plain.fly()
    plain.client.nudgeCamera({ yaw: .01, pitch: 0 }, { at: 12.34, coalesced: () => 2 })
    await advance(60)
    // No `?phoneCameraTrace=1` on the desktop: frames are exactly what they were.
    expect(plain.hostLink.native.some(message => message.type === 'heartbeat' && 'trace' in message)).toBe(false)
    expect(plain.phoneLink.native.some(message => message.type === 'controls' && 'trace' in message)).toBe(false)

    const controlFrame = vi.fn()
    const h = await setup({}, { trace: { controlFrame } })
    await advance(50)
    await h.fly()
    await advance(20)
    h.client.updateControls({ aileron: .2 }, { at: 100.04 })
    await advance(20)
    h.client.nudgeCamera({ yaw: .012, pitch: -.003 }, { at: 101.25, coalesced: () => 3 })
    await advance(0)
    const traced = h.phoneLink.native.filter((message): message is ControlFrame => message.type === 'controls' && message.trace !== undefined)
    const carrying = traced.find(message => message.camera)!
    // The camera event and when it ran, as ages before the frame that carried it, on the phone's clock.
    const [age, handled, dx, dy, samples] = carrying.trace!.cam[0]
    expect(carrying.trace!.at - age).toBeCloseTo(101.3, 0)
    expect(handled).toBe(0)
    expect([dx, dy, samples]).toEqual([12, -3, 3])
    expect(carrying.trace).toMatchObject({ by: 0, drop: [0, 0, 0] })
    // The stick event since the previous frame rides along too.
    expect(traced.some(message => message.trace!.ctl.some(([stickAge]) => Math.abs(message.trace!.at - stickAge - 100) < .1))).toBe(true)
    // Spent with its frame: the next one reports only what happened after it.
    await advance(40)
    expect(h.phoneLink.last('controls').trace).toMatchObject({ by: 1, cam: [], ctl: [] })
    // Every frame the desktop handled was reported with what became of it.
    expect(controlFrame).toHaveBeenCalledWith(expect.objectContaining({ seq: carrying.seq }), 'accepted', expect.any(Number))
  })

  it('handles a newer heartbeat overtaking handoff and late local telemetry after the grant without replacing live input', async () => {
    const h = await setup()
    await advance(50)
    h.hostLink.holdHandoff = true
    expect(h.client.requestControl()).toBe(true)
    await advance(60)
    expect(h.client.getSnapshot()).toMatchObject({ requestingControl: true, canControl: false })
    const earlyHeartbeat = h.hostLink.last('heartbeat')
    const handoff = h.hostLink.last('handoff')
    expect(earlyHeartbeat.epoch).toBe(handoff.epoch)
    h.hostLink.flushHeld()
    await flush()
    expect(h.client.getSnapshot().canControl).toBe(true)
    h.client.updateControls({ throttle: .91, elevator: -.6 })
    // Another local-owner heartbeat was issued during handoff but arrived after granted.
    h.phoneLink.receiveNative({ ...earlyHeartbeat, lease: earlyHeartbeat.lease + 1, status: { ...h.state, owner: 'local', controls: { ...NEUTRAL_CONTROLS, throttle: .2 } } })
    expect(h.client.getSnapshot()).toMatchObject({ canControl: true, controls: { throttle: .91 } })
    await advance(20)
    expect(h.phoneLink.last('controls').controls).toMatchObject({ throttle: .91, elevator: -.6 })
    h.client.cancelTransientControls()
    await advance(20)
    expect(h.phoneLink.last('controls').controls).toMatchObject({ throttle: .91, elevator: 0 })
  })

  it('rejects malformed/replayed heartbeats, disables stale input, and never regains authority from old epochs', async () => {
    const h = await setup()
    await advance(50)
    await h.fly()
    const old = h.hostLink.last('handoff')
    h.hostLink.dropNative = true
    await advance(240)
    const heartbeat = h.hostLink.last('heartbeat')
    h.phoneLink.receiveNative({ ...heartbeat, lease: -1 })
    h.phoneLink.receiveNative({ ...heartbeat, session: 'wrong-session' })
    h.phoneLink.receiveNative({ ...old, type: 'heartbeat', lease: old.lease })
    await advance(30)
    expect(h.client.getSnapshot().hostFresh).toBe(false)
    expect(h.client.getSnapshot().canControl).toBe(false)
    await advance(80)
    expect(h.state).toMatchObject({ owner: 'local', paused: true })
    h.phoneLink.receiveReliable({ ...old, type: 'granted', status: { ...h.state, owner: 'phone' } })
    expect(h.client.getSnapshot().canControl).toBe(false)
    h.hostLink.dropNative = false
    await advance(60)
    expect(h.client.getSnapshot().canFly).toBe(true)
    expect(h.state.paused).toBe(true)
  })

  it('bounds an incomplete handoff without retrying or accepting its delayed grant', async () => {
    const h = await setup()
    await advance(50)
    h.hostLink.holdHandoff = true
    expect(h.client.requestControl()).toBe(true)
    await advance(2100)
    expect(h.client.getSnapshot()).toMatchObject({ requestingControl: false, pendingActions: 0, canControl: false })
    h.hostLink.flushHeld()
    await flush()
    expect(h.phoneLink.reliable.filter(message => message.type === 'action' && message.action === 'requestControl')).toHaveLength(1)
    expect(h.state.owner).toBe('local')
  })

  it('keeps a pending Fly handoff through a same-epoch camera status update', async () => {
    const h = await setup()
    await advance(50)
    // Keep the centered frame in flight so the host is still transferring authority.
    h.phoneLink.dropNative = true
    expect(h.client.requestControl()).toBe(true)
    await flush()
    expect(h.client.getSnapshot().requestingControl).toBe(true)
    h.state.viewMode = 'first'
    h.host.syncStatus()
    await flush()
    expect(h.client.getSnapshot()).toMatchObject({ requestingControl: true, canControl: false, status: { viewMode: 'first' } })
    h.phoneLink.dropNative = false
    await advance(20)
    expect(h.state.owner).toBe('phone')
    expect(h.client.getSnapshot()).toMatchObject({ requestingControl: false, canControl: true })
  })

  it('does not restore hidden-phone authority from a late status when best-effort release fails', async () => {
    const h = await setup()
    await advance(50)
    await h.fly()
    vi.spyOn(h.phoneLink, 'sendReliable').mockImplementationOnce(() => false)
    h.win.dispatchEvent(new Event('pagehide'))
    h.doc.dispatchEvent(new Event('visibilitychange'))
    // A reliable status already in flight still describes the old phone epoch.
    h.host.syncStatus()
    await flush()
    expect(h.client.getSnapshot().canControl).toBe(false)
    h.client.updateControls({ aileron: 1 })
    await advance(350)
    expect(h.state).toMatchObject({ owner: 'local', paused: true })
    expect(h.client.getSnapshot()).toMatchObject({ canFly: true, canControl: false })
    await h.fly()
    expect(h.state.paused).toBe(true)
  })

  it('does not reactivate a timed-out Fly request from a late granted or status message', async () => {
    const h = await setup()
    await advance(50)
    h.hostLink.holdGranted = true
    expect(h.client.requestControl()).toBe(true)
    await flush()
    expect(h.state.owner).toBe('phone')
    expect(h.client.getSnapshot().requestingControl).toBe(true)
    await advance(2005)
    expect(h.client.getSnapshot()).toMatchObject({ requestingControl: false, canControl: false })
    h.hostLink.flushHeld()
    h.host.syncStatus()
    await flush()
    expect(h.client.getSnapshot().canControl).toBe(false)
    await advance(300)
    expect(h.state).toMatchObject({ owner: 'local', paused: true })
    expect(h.client.getSnapshot().canFly).toBe(true)
  })

  it('recovers Fly after a refused takeover status and a newer heartbeat overtaking its retry', async () => {
    const h = await setup()
    await advance(50)
    await h.fly()
    vi.spyOn(h.hostLink, 'sendReliable').mockImplementationOnce(() => false)
    h.hostLink.holdStatus = true
    h.host.takeControl()
    await advance(60)
    // The new-epoch heartbeat revokes old input, but cannot grant authority.
    expect(h.state.owner).toBe('local')
    expect(h.client.getSnapshot()).toMatchObject({ canControl: false, canFly: false })
    h.hostLink.holdStatus = false
    h.hostLink.flushHeld()
    await flush()
    expect(h.client.getSnapshot()).toMatchObject({ canControl: false, canFly: true, status: { owner: 'local' } })
    await h.fly()
    expect(h.state.paused).toBe(false)
  })

  it('puts a control the screen draws into the snapshot, and centres that drawing too', async () => {
    const h = await setup()
    await advance(50)
    await h.fly()
    // The yaw slider is React-controlled, so a rudder that moved only in the
    // mailbox is painted back to the snapshot's value on the next render: the
    // aircraft answers the finger while the thumb sits still.
    h.client.updateControls({ rudder: -.6 })
    expect(h.client.getSnapshot().controls.rudder).toBe(-.6)
    await advance(20)
    expect(h.host.beforeStep(h.state.controls)).toMatchObject({ rudder: -.6 })
    // The pad and the brake draw themselves from the pointer; making them wait
    // on a render would cost a frame of stick movement for nothing.
    h.client.updateControls({ aileron: .8, brake: 1 })
    expect(h.client.getSnapshot().controls).toMatchObject({ aileron: 0, brake: 0 })
    // Whatever drops the transient controls — a stale link, a blur, a release —
    // returns the slider on screen as well as the rudder on the wire.
    h.client.cancelTransientControls()
    expect(h.client.getSnapshot().controls.rudder).toBe(0)
    await advance(20)
    expect(h.host.beforeStep(h.state.controls)).toMatchObject({ rudder: 0 })
  })

  it('releases on page hide, preserves pause on return, survives signaling-only loss, and tears down after closure', async () => {
    const h = await setup()
    await advance(50)
    await h.fly()
    h.signal(false)
    expect(h.client.getSnapshot()).toMatchObject({ signalingAvailable: false, canControl: true })
    h.client.updateControls({ rudder: 1, brake: 1 })
    await advance(20)
    h.win.dispatchEvent(new Event('pagehide'))
    expect(h.client.getSnapshot().canControl).toBe(false)
    await flush()
    expect(h.state).toMatchObject({ owner: 'local', paused: true })
    h.doc.dispatchEvent(new Event('visibilitychange'))
    await advance(50)
    expect(h.client.getSnapshot().canFly).toBe(true)
    expect(h.client.getSnapshot().canControl).toBe(false)
    h.phoneLink.close()
    expect(h.client.getSnapshot().phase).toBe('disconnected')
    expect(h.endpointDestroy).toHaveBeenCalledTimes(1)
    expect(h.phoneLink.listeners.native.size + h.phoneLink.listeners.reliable.size + h.phoneLink.listeners.close.size).toBe(0)
    h.client.destroy()
    h.host.destroy()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('times out unavailable signaling and ignores late registration after destruction', async () => {
    let resolve!: (id: string) => void
    const ready = new Promise<string>(yes => { resolve = yes })
    const connect = vi.fn()
    const destroy = vi.fn()
    const client: PhoneControllerClient = createPhoneControllerClient({ peerId: 'desktop', secret: 'a'.repeat(43) }, {
      endpointFactory: () => ({ ready, connect, destroy }), now: () => Date.now(),
    })
    cleanup.push(() => client.destroy())
    await advance(10_001)
    expect(client.getSnapshot()).toMatchObject({ phase: 'error', canFly: false })
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    resolve('late-peer')
    await flush()
    expect(connect).not.toHaveBeenCalled()
  })

  it.each(['reliable', 'native'] as const)('closes with an actionable error on an unsupported %s protocol', async channel => {
    const h = await setup()
    await advance(50)
    await h.fly()
    const incompatible = { ...h.envelope(), v: 2, type: 'status', status: h.state, message: 'Newer protocol' }
    if (channel === 'reliable') h.phoneLink.receiveReliable(incompatible)
    else h.phoneLink.receiveNative(incompatible)
    expect(h.client.getSnapshot()).toMatchObject({ phase: 'error', canControl: false, message: 'Unsupported phone protocol. Reload both devices.' })
    expect(h.phoneLink.closed).toBe(true)
    expect(h.state).toMatchObject({ owner: 'local', paused: true })
  })
})

describe('phone haptics', () => {
  const storage = () => { const map = new Map<string, string>(); return { map, getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value) } } }

  it('shows unsupported devices as unavailable and never enables vibration there', async () => {
    const h = await setup()
    expect(h.client.getSnapshot()).toMatchObject({ hapticsSupported: false, hapticsEnabled: false })
    h.client.setHapticsEnabled(true)
    expect(h.client.getSnapshot().hapticsEnabled).toBe(false)
  })

  it('delivers only the latest pulse on the next heartbeat while the phone owns an unpaused flight', async () => {
    const vibrate = vi.fn(() => true)
    const prefs = storage()
    const h = await setup({ vibrate, storage: prefs })
    await advance(50)
    h.host.setHapticFeedback(40)
    await advance(50)
    expect(h.hostLink.native.some(message => message.type === 'heartbeat' && 'feedback' in message && message.feedback)).toBe(false)
    await h.fly()
    await advance(50)
    h.host.setHapticFeedback(40)
    await advance(50)
    expect(vibrate).not.toHaveBeenCalled() // Off by default.
    h.client.setHapticsEnabled(true)
    expect(prefs.map.get('osfs.phone-haptics')).toBe('on')
    h.host.setHapticFeedback(20)
    h.host.setHapticFeedback(30)
    await advance(50)
    const heartbeat = h.hostLink.last('heartbeat')
    expect(heartbeat).toMatchObject({ session: h.envelope().session, feedback: { v: 1, pulseMs: 30 } })
    expect(heartbeat.feedback!.ttlMs).toBeLessThan(100)
    expect(vibrate.mock.calls).toEqual([[30]])
    // Replayed or older packets never vibrate twice.
    h.phoneLink.receiveNative({ ...heartbeat, lease: heartbeat.lease + 1 })
    expect(vibrate).toHaveBeenCalledTimes(1)
    await advance(50)
    expect(h.hostLink.last('heartbeat').feedback).toBeUndefined()
  })

  it('bounds pulses by expiry, ignores malformed or stale feedback without losing the lease', async () => {
    const vibrate = vi.fn(() => true)
    const h = await setup({ vibrate, storage: storage() })
    await advance(50)
    await h.fly()
    h.client.setHapticsEnabled(true)
    await advance(50)
    const beat = h.hostLink.last('heartbeat')
    expect(beat.epoch).toBeGreaterThan(0)
    h.phoneLink.receiveNative({ ...beat, lease: beat.lease + 10, feedback: { v: 1, id: 1_000, pulseMs: 60, ttlMs: 12 } })
    expect(vibrate).toHaveBeenLastCalledWith(12)
    await advance(60)
    h.phoneLink.receiveNative({ ...beat, lease: beat.lease + 11, feedback: { v: 2, id: 1_001, pulseMs: 60, ttlMs: 50, pattern: [1, 2] } })
    h.phoneLink.receiveNative({ ...beat, lease: beat.lease + 12, feedback: { v: 1, id: 1_002, pulseMs: 600, ttlMs: 50 } })
    h.phoneLink.receiveNative({ ...beat, epoch: beat.epoch - 1, lease: beat.lease + 13, feedback: { v: 1, id: 1_003, pulseMs: 60, ttlMs: 50 } })
    h.phoneLink.receiveNative({ ...beat, lease: beat.lease + 1, feedback: { v: 1, id: 1_004, pulseMs: 60, ttlMs: 50 } })
    expect(vibrate).toHaveBeenCalledTimes(1)
    expect(h.client.getSnapshot()).toMatchObject({ hostFresh: true, canControl: true })
  })

  it.each([
    ['disable', async (h: Awaited<ReturnType<typeof setup>>) => { h.client.setHapticsEnabled(false) }],
    ['phone hidden', async (h: Awaited<ReturnType<typeof setup>>) => {
      Object.defineProperty(h.doc, 'hidden', { value: true, writable: true }); h.doc.dispatchEvent(new Event('visibilitychange'))
    }],
    ['desktop retakes control', async (h: Awaited<ReturnType<typeof setup>>) => { h.host.takeControl(); await flush() }],
    ['desktop pause', async (h: Awaited<ReturnType<typeof setup>>) => { h.client.setPaused(true); await flush(); await flush() }],
    ['disconnect', async (h: Awaited<ReturnType<typeof setup>>) => { h.host.disconnect(); await flush() }],
    ['destroy', async (h: Awaited<ReturnType<typeof setup>>) => { h.client.destroy() }],
  ])('cancels a running pulse on %s and ignores later feedback', async (_name, stop) => {
    const vibrate = vi.fn(() => true)
    const h = await setup({ vibrate, storage: storage() })
    await advance(50)
    await h.fly()
    h.client.setHapticsEnabled(true)
    h.host.setHapticFeedback(60)
    await advance(50)
    expect(vibrate.mock.lastCall![0]).toBeGreaterThan(0)
    await stop(h)
    expect(vibrate).toHaveBeenLastCalledWith(0)
    h.host.setHapticFeedback(60)
    await advance(60)
    expect(vibrate.mock.calls.filter(([ms]) => ms > 0)).toHaveLength(1)
  })

  it('lets a pulse self-expire within 60 ms rather than outliving a stale host lease', async () => {
    const vibrate = vi.fn(() => true)
    const h = await setup({ vibrate, storage: storage() })
    await advance(50)
    await h.fly()
    h.client.setHapticsEnabled(true)
    h.host.setHapticFeedback(60)
    await advance(50)
    // Clipped to the remaining validity: never scheduled beyond its expiry.
    const [played] = vibrate.mock.lastCall as unknown as [number]
    expect(played).toBeGreaterThan(0)
    expect(played).toBeLessThanOrEqual(60)
    h.hostLink.dropNative = true
    h.host.setHapticFeedback(60)
    await advance(300)
    expect(h.client.getSnapshot().hostFresh).toBe(false)
    expect(vibrate.mock.calls.every(([ms]) => ms <= 60)).toBe(true)
    expect(vibrate).toHaveBeenCalledTimes(1)
  })
})
