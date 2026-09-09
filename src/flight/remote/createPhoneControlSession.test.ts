import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPhoneControlSession } from './createPhoneControlSession'
import { parsePairingUrl } from '../../remote/pairing'
import type { AircraftStatus, ControlSurfaceState, RemoteMessage } from '../../remote/protocol'
import type { createPeerEndpoint, SessionTransport } from '../../remote/peerTransport'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

class Transport implements SessionTransport {
  id = crypto.randomUUID()
  ready = Promise.resolve()
  nativeOpen = false
  nativeStreamId: number | null = null
  nativeBufferedAmount = 0
  nativeReady = deferred<number>()
  reliable: RemoteMessage[] = []
  native: RemoteMessage[] = []
  reliableListeners = new Set<(value: unknown) => void>()
  nativeListeners = new Set<(value: unknown) => void>()
  closeListeners = new Set<(reason: string) => void>()
  closed = false
  onReliable(handler: (value: unknown) => void) { this.reliableListeners.add(handler); return () => { this.reliableListeners.delete(handler) } }
  onNative(handler: (value: unknown) => void) { this.nativeListeners.add(handler); return () => { this.nativeListeners.delete(handler) } }
  onClose(handler: (reason: string) => void) { this.closeListeners.add(handler); return () => { this.closeListeners.delete(handler) } }
  sendReliable = vi.fn((value: unknown) => { this.reliable.push(value as RemoteMessage); return !this.closed })
  sendNative = vi.fn((value: unknown) => { this.native.push(value as RemoteMessage); return !this.closed })
  openNative = vi.fn((id = 1) => { this.nativeStreamId = id; return this.nativeReady.promise })
  diagnostics = async () => ({ path: 'direct' as const, iceRttMs: 5, ordered: false, maxRetransmits: 0, bufferedAmount: 0 })
  close = vi.fn(() => {
    if (this.closed) return
    this.closed = true
    this.nativeOpen = false
    for (const handler of this.closeListeners) handler('closed')
  })
  receive(message: unknown) { for (const handler of this.reliableListeners) handler(message) }
  receiveNative(message: unknown) { for (const handler of this.nativeListeners) handler(message) }
  openedNative() { this.nativeOpen = true; this.nativeReady.resolve(this.nativeStreamId!) }
  last<T extends RemoteMessage['type']>(type: T): Extract<RemoteMessage, { type: T }> {
    const messages = [...this.reliable, ...this.native]
    const result = messages.findLast(value => value.type === type)
    if (!result) throw new Error(`No ${type} message`)
    return result as Extract<RemoteMessage, { type: T }>
  }
}

class SlowReliableTransport extends Transport {
  readonly reliableReady = deferred<void>()
  override ready = this.reliableReady.promise
  openReliable() { this.reliableReady.resolve() }
}

const allSessions: ReturnType<typeof createPhoneControlSession>[] = []
function setup() {
  let time = 0
  let localActive = false
  let pageVisible = true
  const state: AircraftStatus = {
    owner: 'local', paused: false, viewMode: 'third', airspeedKts: 100, altitudeFt: 4000, headingDeg: 90,
    controls: { elevator: 0, aileron: 0, rudder: 0, throttle: .67, pitchTrim: -.12, flaps: 1 / 3, brake: 0 },
  }
  type EndpointOptions = Parameters<typeof createPeerEndpoint>[0]
  const endpoints: { callbacks: NonNullable<EndpointOptions>; destroy: ReturnType<typeof vi.fn> }[] = []
  const createEndpoint: typeof createPeerEndpoint = (callbacks = {}) => {
    const endpoint = { callbacks, ready: Promise.resolve(`desktop-${endpoints.length}`), connect: () => new Transport(), destroy: vi.fn() }
    endpoints.push(endpoint)
    return endpoint
  }
  const ownership = vi.fn((owner: 'local' | 'phone', controls: ControlSurfaceState) => { state.owner = owner; state.controls = { ...controls } })
  const pause = vi.fn((paused: boolean) => { state.paused = paused })
  const view = vi.fn((mode: 'first' | 'third') => { state.viewMode = mode })
  const session = createPhoneControlSession({
    getStatus: () => ({ ...state, controls: { ...state.controls } }), hasActiveLocalInput: () => localActive,
    isPageVisible: () => pageVisible,
    onOwnershipChange: ownership, setPaused: pause, setViewMode: view, createEndpoint, now: () => time,
  })
  allSessions.push(session)
  const advance = async (ms: number) => { time += ms; await vi.advanceTimersByTimeAsync(ms) }
  const pair = async () => {
    await session.startPairing()
    const invitation = parsePairingUrl(session.getSnapshot().invitationUrl!)!
    const transport = new Transport()
    endpoints.at(-1)!.callbacks.onConnection!(transport)
    transport.receive({ v: 1, type: 'hello', secret: invitation.secret })
    transport.openedNative()
    await Promise.resolve()
    const welcome = transport.last('welcome')
    transport.receive({ v: 1, type: 'ready', session: welcome.session, epoch: welcome.epoch })
    await advance(50)
    return transport
  }
  const requestControl = (transport: Transport, id = 1) => {
    const heartbeat = transport.last('heartbeat')
    transport.receive({ v: 1, type: 'action', session: heartbeat.session, epoch: heartbeat.epoch, lease: heartbeat.lease, id, action: 'requestControl' })
    return transport.last('handoff')
  }
  const grant = (transport: Transport, id = 1) => {
    const handoff = requestControl(transport, id)
    transport.receive({ v: 1, type: 'handoffAck', session: handoff.session, epoch: handoff.epoch, requestId: id })
    transport.receiveNative({ v: 1, type: 'controls', session: handoff.session, epoch: handoff.epoch, seq: 0, lease: handoff.lease, controls: handoff.controls })
    return handoff
  }
  return { session, state, endpoints, ownership, pause, view, advance, pair, requestControl, grant,
    setVisible(value: boolean) { pageVisible = value },
    setLocalActive(value: boolean) { localActive = value }, jump(ms: number) { time += ms } }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => { for (const session of allSessions.splice(0)) session.destroy(); vi.useRealTimers() })

describe('desktop phone control session', () => {
  it('pairs without changing flight and requires both native readiness confirmations', async () => {
    const h = setup()
    await h.session.startPairing()
    expect(h.session.getSnapshot().phase).toBe('invitation')
    const secret = parsePairingUrl(h.session.getSnapshot().invitationUrl!)!.secret
    const transport = new Transport()
    h.endpoints[0].callbacks.onConnection!(transport)
    transport.receive({ v: 1, type: 'hello', secret })
    expect(h.session.getSnapshot().phase).toBe('authenticating')
    expect(h.session.getSnapshot().invitationUrl).toBeNull()
    const welcome = transport.last('welcome')
    transport.receive({ v: 1, type: 'ready', session: welcome.session, epoch: welcome.epoch })
    expect(h.session.getSnapshot().phase).toBe('authenticating')
    transport.openedNative()
    await Promise.resolve()
    expect(h.session.getSnapshot()).toMatchObject({ phase: 'paired', owner: 'local' })
    expect(h.ownership).not.toHaveBeenCalled()
    expect(h.pause).not.toHaveBeenCalled()
  })

  it('claims exactly one phone synchronously and rejects stale endpoint callbacks', async () => {
    const h = setup()
    await h.session.startPairing()
    const oldCallbacks = h.endpoints[0].callbacks
    const secret = parsePairingUrl(h.session.getSnapshot().invitationUrl!)!.secret
    const winner = new Transport()
    const loser = new Transport()
    oldCallbacks.onConnection!(winner)
    oldCallbacks.onConnection!(loser)
    winner.receive({ v: 1, type: 'hello', secret })
    loser.receive({ v: 1, type: 'hello', secret })
    expect(winner.openNative).toHaveBeenCalledOnce()
    expect(loser.closed).toBe(true)
    expect(loser.openNative).not.toHaveBeenCalled()
    await h.session.startPairing()
    const stale = new Transport()
    oldCallbacks.onConnection!(stale)
    oldCallbacks.onSignalingState!(false)
    expect(stale.closed).toBe(true)
    expect(h.session.getSnapshot()).toMatchObject({ phase: 'invitation', signalingAvailable: true })
  })

  it('bounds pending unauthenticated connections and the hello deadline', async () => {
    const h = setup()
    await h.session.startPairing()
    const pending = Array.from({ length: 5 }, () => new Transport())
    for (const transport of pending) h.endpoints[0].callbacks.onConnection!(transport)
    expect(pending[4].closed).toBe(true)
    expect(pending[0].closed).toBe(false)
    await h.advance(5000)
    expect(pending.every(transport => transport.closed)).toBe(true)
    expect(h.session.getSnapshot().phase).toBe('invitation')
  })

  it('starts the unauthenticated hello deadline only after PeerJS opens the reliable channel', async () => {
    const h = setup()
    await h.session.startPairing()
    const transport = new SlowReliableTransport()
    h.endpoints[0].callbacks.onConnection!(transport)
    await h.advance(5_100)
    expect(transport.closed).toBe(false)
    transport.openReliable()
    await Promise.resolve()
    await h.advance(4_999)
    expect(transport.closed).toBe(false)
    await h.advance(1)
    expect(transport.closed).toBe(true)
    expect(h.session.getSnapshot().phase).toBe('invitation')
  })

  it('expires invitations and ignores callbacks from the expired generation', async () => {
    const h = setup()
    await h.session.startPairing()
    const callbacks = h.endpoints[0].callbacks
    await h.advance(120_000)
    expect(h.session.getSnapshot()).toMatchObject({ phase: 'expired', invitationUrl: null, expiresAt: null })
    callbacks.onSignalingState!(false)
    const incoming = new Transport()
    callbacks.onConnection!(incoming)
    expect(incoming.closed).toBe(true)
    expect(h.session.getSnapshot().signalingAvailable).toBe(true)
    expect(h.endpoints[0].destroy).toHaveBeenCalledOnce()
  })

  it('bounds native ready exchange even when the native channel opened but phone never confirms', async () => {
    const h = setup()
    await h.session.startPairing()
    const secret = parsePairingUrl(h.session.getSnapshot().invitationUrl!)!.secret
    const transport = new Transport()
    h.endpoints[0].callbacks.onConnection!(transport)
    transport.receive({ v: 1, type: 'hello', secret })
    transport.openedNative()
    await Promise.resolve()
    await h.advance(15_000)
    expect(h.session.getSnapshot().phase).toBe('error')
    expect(transport.closed).toBe(true)
    expect(h.pause).not.toHaveBeenCalled()
  })

  it.each([{ v: 1, type: 'hello', secret: 'x'.repeat(43) }, { v: 2, type: 'hello', secret: 'x'.repeat(43) }, { type: 'unknown' }])('rejects invalid authentication without modifying local flight', async (message) => {
    const h = setup()
    await h.session.startPairing()
    const transport = new Transport()
    h.endpoints[0].callbacks.onConnection!(transport)
    transport.receive(message)
    expect(transport.closed).toBe(true)
    expect(h.session.getSnapshot()).toMatchObject({ phase: 'invitation', owner: 'local' })
    expect(h.ownership).not.toHaveBeenCalled()
    expect(h.pause).not.toHaveBeenCalled()
  })

  it('requires a centered fresh snapshot and handoff acknowledgement, preserving persistent controls and pause', async () => {
    const h = setup()
    h.state.paused = true
    const transport = await h.pair()
    const baseline = { ...h.state.controls }
    const handoff = h.requestControl(transport)
    transport.receiveNative({ v: 1, type: 'controls', session: handoff.session, epoch: handoff.epoch, seq: 0, lease: handoff.lease, controls: { ...baseline, throttle: 0 } })
    transport.receive({ v: 1, type: 'handoffAck', session: handoff.session, epoch: handoff.epoch, requestId: handoff.requestId })
    expect(h.session.getSnapshot().owner).toBe('local')
    transport.receiveNative({ v: 1, type: 'controls', session: handoff.session, epoch: handoff.epoch, seq: 1, lease: handoff.lease, controls: baseline })
    expect(h.session.getSnapshot().owner).toBe('phone')
    expect(h.ownership).toHaveBeenCalledWith('phone', baseline)
    expect(h.state.paused).toBe(true)
    expect(h.pause).not.toHaveBeenCalled()
  })

  it.each(['throttle', 'pause', 'local', 'timeout'] as const)('cancels handoff on %s changes before ownership', async (change) => {
    const h = setup()
    const transport = await h.pair()
    const handoff = h.requestControl(transport)
    if (change === 'throttle') h.state.controls.throttle = .2
    if (change === 'pause') h.state.paused = true
    if (change === 'local') h.setLocalActive(true)
    await h.advance(change === 'timeout' ? 2000 : 50)
    transport.receive({ v: 1, type: 'handoffAck', session: handoff.session, epoch: handoff.epoch, requestId: handoff.requestId })
    transport.receiveNative({ v: 1, type: 'controls', session: handoff.session, epoch: handoff.epoch, seq: 0, lease: handoff.lease, controls: handoff.controls })
    expect(h.session.getSnapshot().owner).toBe('local')
    expect(h.ownership).not.toHaveBeenCalled()
    expect(transport.last('ack').ok).toBe(false)
  })

  it('rejects reordered, duplicate, malformed and old-epoch controls before replacing the mailbox', async () => {
    const h = setup()
    const transport = await h.pair()
    const handoff = h.grant(transport)
    const frame = { v: 1, type: 'controls', session: handoff.session, epoch: handoff.epoch, seq: 2, lease: handoff.lease, controls: { ...handoff.controls, elevator: .8 } }
    transport.receiveNative(frame)
    for (const bad of [
      { ...frame, seq: 1, controls: { ...frame.controls, elevator: -.8 } },
      { ...frame, controls: { ...frame.controls, elevator: -.8 } },
      { ...frame, seq: 3, epoch: handoff.epoch - 1, controls: { ...frame.controls, elevator: -.8 } },
      { ...frame, seq: 3, controls: { ...frame.controls, elevator: 2 } },
      { ...frame, seq: 3, lease: 999999, controls: { ...frame.controls, elevator: -.8 } },
    ]) transport.receiveNative(bad)
    expect(h.session.beforeStep(h.state.controls)).toMatchObject({ elevator: .8 })
    h.session.takeControl()
    transport.receiveNative({ ...frame, seq: 100 })
    expect(h.session.getSnapshot().owner).toBe('local')
    expect(h.state.controls).toMatchObject({ elevator: 0, throttle: .67, pitchTrim: -.12, flaps: 1 / 3 })
    expect(h.pause).not.toHaveBeenCalled()
  })

  it('cancels a pending handoff on phone release without pausing local flight', async () => {
    const h = setup()
    const transport = await h.pair()
    const handoff = h.requestControl(transport)
    transport.receive({ v: 1, type: 'action', session: handoff.session, epoch: handoff.epoch, lease: handoff.lease, id: 2, action: 'releaseControl' })
    transport.receive({ v: 1, type: 'handoffAck', session: handoff.session, epoch: handoff.epoch, requestId: handoff.requestId })
    transport.receiveNative({ v: 1, type: 'controls', session: handoff.session, epoch: handoff.epoch, seq: 0, lease: handoff.lease, controls: handoff.controls })
    expect(h.session.getSnapshot().owner).toBe('local')
    expect(h.ownership).not.toHaveBeenCalled()
    expect(h.pause).not.toHaveBeenCalled()
    expect(transport.last('ack')).toMatchObject({ id: 2, ok: true })
  })

  it('bounds accepted control traffic at 120 frames per rolling second', async () => {
    const h = setup()
    const transport = await h.pair()
    const handoff = h.grant(transport)
    for (let seq = 1; seq < 121; seq++) {
      transport.receiveNative({ v: 1, type: 'controls', session: handoff.session, epoch: handoff.epoch, seq, lease: handoff.lease, controls: { ...handoff.controls, elevator: seq / 200 } })
    }
    // The centered handoff snapshot is the first of the 120 allowed frames.
    expect(h.session.beforeStep(h.state.controls)).toMatchObject({ elevator: 119 / 200 })
  })

  it('detects continuously delayed input using the echoed host lease, independently of receive time', async () => {
    const h = setup()
    const transport = await h.pair()
    const handoff = h.grant(transport)
    for (let seq = 1; seq <= 5; seq++) {
      await h.advance(50)
      transport.receiveNative({ v: 1, type: 'controls', session: handoff.session, epoch: handoff.epoch, seq, lease: handoff.lease, controls: handoff.controls })
    }
    expect(h.session.getSnapshot().owner).toBe('phone')
    await h.advance(50)
    expect(h.session.getSnapshot()).toMatchObject({ phase: 'paired', owner: 'local' })
    expect(h.state.paused).toBe(true)
    expect(h.pause).toHaveBeenCalledOnce()
    transport.receiveNative({ v: 1, type: 'controls', session: handoff.session, epoch: handoff.epoch, seq: 100, lease: handoff.lease, controls: handoff.controls })
    expect(h.session.getSnapshot().owner).toBe('local')
  })

  it('rejects a hidden desktop handoff and checks visibility before physics even before the visibility event', async () => {
    const h = setup()
    const transport = await h.pair()
    h.setVisible(false)
    const heartbeat = transport.last('heartbeat')
    transport.receive({ v: 1, type: 'action', session: heartbeat.session, epoch: heartbeat.epoch, lease: heartbeat.lease, id: 1, action: 'requestControl' })
    expect(transport.last('ack').ok).toBe(false)
    expect(h.session.getSnapshot().owner).toBe('local')
    h.setVisible(true)
    h.grant(transport, 2)
    h.setVisible(false)
    expect(h.session.beforeStep(h.state.controls)).toBe(false)
    expect(h.pause).toHaveBeenCalledWith(true)
    expect(h.session.getSnapshot().owner).toBe('local')
  })

  it('aborts physics after a main-thread stall before any watchdog callback can run', async () => {
    const h = setup()
    const transport = await h.pair()
    h.grant(transport)
    h.jump(251)
    expect(h.pause).not.toHaveBeenCalled()
    expect(h.session.beforeStep(h.state.controls)).toBe(false)
    expect(h.pause).toHaveBeenCalledWith(true)
    expect(h.session.getSnapshot().owner).toBe('local')
  })

  it('applies reliable actions once and rejects a delayed resume without fresh controls', async () => {
    const h = setup()
    const transport = await h.pair()
    const handoff = h.grant(transport)
    const action = { v: 1, type: 'action', session: handoff.session, epoch: handoff.epoch, lease: handoff.lease, id: 2, action: 'setPaused', value: true }
    transport.receive(action)
    transport.receive(action)
    expect(h.pause).toHaveBeenCalledTimes(1)
    expect(transport.reliable.filter(message => message.type === 'ack' && message.id === 2)).toHaveLength(2)
    h.jump(251)
    transport.receive({ ...action, id: 3, value: false })
    expect(h.state.paused).toBe(true)
    expect(transport.last('ack').ok).toBe(false)
  })

  it.each(['disconnect', 'close', 'hide', 'reset', 'release'] as const)('revokes phone control on %s and retains applied persistent settings', async (kind) => {
    const h = setup()
    const transport = await h.pair()
    const handoff = h.grant(transport)
    h.state.controls = { ...h.state.controls, throttle: .83, pitchTrim: .24, flaps: 2 / 3, elevator: .4, brake: 1 }
    if (kind === 'disconnect') h.session.disconnect()
    if (kind === 'close') transport.close()
    if (kind === 'hide') h.session.onHidden()
    if (kind === 'reset') h.session.reset()
    if (kind === 'release') transport.receive({ v: 1, type: 'action', session: handoff.session, epoch: handoff.epoch, lease: handoff.lease, id: 2, action: 'releaseControl' })
    expect(h.session.getSnapshot().owner).toBe('local')
    expect(h.state.controls).toMatchObject({ throttle: .83, pitchTrim: .24, flaps: 2 / 3, elevator: 0, brake: 0 })
    expect(h.state.paused).toBe(kind !== 'reset')
  })

  it('preserves local flight on disconnect and clears listeners/timers on destroy', async () => {
    const h = setup()
    const transport = await h.pair()
    const updates = vi.fn()
    h.session.subscribe(updates)
    h.session.destroy()
    const updateCount = updates.mock.calls.length
    expect(h.pause).not.toHaveBeenCalled()
    expect(transport.reliableListeners.size + transport.nativeListeners.size + transport.closeListeners.size).toBe(0)
    const sent = transport.native.length
    await h.advance(30_000)
    h.endpoints[0].callbacks.onSignalingState!(false)
    expect(transport.native.length).toBe(sent)
    expect(updates).toHaveBeenCalledTimes(updateCount)
  })
})
