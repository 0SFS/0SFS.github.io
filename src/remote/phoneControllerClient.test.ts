import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPhoneControlSession } from '../flight/remote/createPhoneControlSession'
import { createPhoneControllerClient, type PhoneControllerClient } from './phoneControllerClient'
import { parsePairingUrl } from './pairing'
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
    if (this.holdHandoff && message.type === 'handoff') this.held.push(message)
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

async function setup() {
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
  const host = createPhoneControlSession({
    getStatus: () => ({ ...state, controls: { ...state.controls } }), hasActiveLocalInput: () => false,
    onOwnershipChange: (owner, controls) => { state.owner = owner; state.controls = { ...controls } },
    setPaused: paused => { state.paused = paused }, setViewMode: view => { state.viewMode = view },
    createEndpoint: hostEndpoint, now: () => Date.now(),
  })
  await host.startPairing()
  const invitation = parsePairingUrl(host.getSnapshot().invitationUrl!)!
  const client = createPhoneControllerClient(invitation, { endpointFactory: clientEndpoint, now: () => Date.now(), document: doc, window: win })
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
  return { host, client, hostLink, phoneLink, state, invitation, doc, win, endpointDestroy, clientEndpoint, envelope, fly, signal: (available: boolean) => signaling!(available) }
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
})
