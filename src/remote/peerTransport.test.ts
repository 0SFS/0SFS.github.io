import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class Events {
    listeners = new Map<string, Set<(...args: never[]) => void>>()
    on(name: string, callback: (...args: never[]) => void) {
      const callbacks = this.listeners.get(name) ?? new Set()
      callbacks.add(callback)
      this.listeners.set(name, callbacks)
      return this
    }
    off(name: string, callback: (...args: never[]) => void) { this.listeners.get(name)?.delete(callback); return this }
    emit(name: string, ...args: unknown[]) { for (const callback of this.listeners.get(name) ?? []) callback(...args as never[]) }
    removeAllListeners() { this.listeners.clear() }
  }
  class Channel {
    id: number
    ordered: boolean
    negotiated: boolean
    maxRetransmits: number | null
    maxPacketLifeTime = null
    readyState = 'connecting'
    bufferedAmount = 0
    bufferedAmountLowThreshold = 0
    binaryType = 'arraybuffer'
    onopen: (() => void) | null = null
    onclose: (() => void) | null = null
    onerror: (() => void) | null = null
    onbufferedamountlow: (() => void) | null = null
    onmessage: ((event: { data: unknown }) => void) | null = null
    sent: unknown[] = []
    close = vi.fn(() => { this.readyState = 'closed'; this.onclose?.() })
    constructor(options: RTCDataChannelInit = { id: 0, ordered: true }) {
      this.id = options.id ?? 0
      this.ordered = options.ordered ?? true
      this.negotiated = options.negotiated ?? false
      this.maxRetransmits = options.maxRetransmits ?? null
    }
    send(bytes: Uint8Array) {
      this.sent.push(JSON.parse(new TextDecoder().decode(bytes)))
      this.bufferedAmount += bytes.byteLength
    }
    open() { this.readyState = 'open'; this.onopen?.() }
    drained() { this.bufferedAmount = 0; this.onbufferedamountlow?.() }
    receive(value: unknown) { this.onmessage?.({ data: new TextEncoder().encode(JSON.stringify(value)).buffer }) }
  }
  class Connection extends Events {
    label = 'flight-session-v1'
    serialization = 'json'
    reliable = true
    open = false
    connectionId = 'dc-test'
    dataChannel = new Channel()
    native: Channel | null = null
    parse = JSON.parse as (json: string) => unknown
    peerConnection = {
      ondatachannel: vi.fn(),
      sctp: { maxChannels: 16 },
      getStats: vi.fn(async () => new Map<string, unknown>()),
      createDataChannel: vi.fn((_label: string, options: RTCDataChannelInit) => {
        this.native = new Channel(options)
        return this.native
      }),
    }
    close = vi.fn(() => { this.open = false; this.emit('close') })
    send = vi.fn()
    opened() { this.open = true; this.dataChannel.open(); this.emit('open') }
    receive(json: string) { this.emit('data', this.parse(json)) }
  }
  class MockPeer extends Events {
    static instances: MockPeer[] = []
    options: unknown
    open = false
    disconnected = false
    destroyed = false
    connection = new Connection()
    connect = vi.fn(() => this.connection)
    reconnect = vi.fn(() => { this.disconnected = false })
    destroy = vi.fn(() => { this.destroyed = true; this.emit('close') })
    constructor(options: unknown) { super(); this.options = options; MockPeer.instances.push(this) }
    registered() { this.open = true; this.disconnected = false; this.emit('open', 'test-peer') }
    lostSignaling() { this.open = false; this.disconnected = true; this.emit('disconnected', 'test-peer') }
  }
  return { MockPeer, Connection }
})

vi.mock('peerjs', () => ({ default: mocks.MockPeer }))
import { createPeerEndpoint } from './peerTransport'

const endpoints: ReturnType<typeof createPeerEndpoint>[] = []
function setup() {
  const signaling = vi.fn()
  const endpoint = createPeerEndpoint({ onSignalingState: signaling })
  endpoints.push(endpoint)
  const peer = mocks.MockPeer.instances.at(-1)!
  peer.registered()
  const transport = endpoint.connect('target-peer')
  const connection = peer.connection
  return { endpoint, peer, transport, connection, signaling }
}

beforeEach(() => { vi.useFakeTimers(); mocks.MockPeer.instances.length = 0 })
afterEach(() => { for (const endpoint of endpoints.splice(0)) endpoint.destroy(); vi.useRealTimers() })

describe('PeerJS/native channel adapter', () => {
  it('uses secure cloud signaling, explicit STUN only, public metadata, and pre-open subscriptions', async () => {
    const { endpoint, peer, transport, connection } = setup()
    expect(await endpoint.ready).toBe('test-peer')
    expect(peer.options).toEqual({
      secure: true, port: 443, debug: 0, referrerPolicy: 'no-referrer',
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
    })
    expect(peer.connect).toHaveBeenCalledWith('target-peer', {
      label: 'flight-session-v1', reliable: true, serialization: 'json', metadata: { v: 1, protocol: 'flight-session' },
    })
    const receive = vi.fn()
    transport.onReliable(receive)
    connection.opened()
    connection.receive('{"type":"hello"}')
    await transport.ready
    expect(receive).toHaveBeenCalledWith({ type: 'hello' })
  })

  it('negotiates one zero-retransmit channel without replacing the PeerJS handler', async () => {
    const { transport, connection } = setup()
    connection.opened()
    await transport.ready
    const handler = connection.peerConnection.ondatachannel
    const nativeReady = transport.openNative()
    expect(transport.nativeStreamId).toBe(1)
    expect(connection.peerConnection.createDataChannel).toHaveBeenCalledExactlyOnceWith('flight-controls-v1', {
      negotiated: true, id: 1, ordered: false, maxRetransmits: 0,
    })
    connection.native!.open()
    expect(await nativeReady).toBe(1)
    expect(connection.peerConnection.ondatachannel).toBe(handler)
    expect(handler).not.toHaveBeenCalled()
    expect(transport.nativeOpen).toBe(true)
    const receiveReliable = vi.fn()
    const receiveNative = vi.fn()
    transport.onReliable(receiveReliable)
    transport.onNative(receiveNative)
    connection.receive('{"type":"ack"}')
    connection.native!.receive({ type: 'controls', seq: 2 })
    expect(receiveReliable).toHaveBeenCalledWith({ type: 'ack' })
    expect(receiveNative).toHaveBeenCalledWith({ type: 'controls', seq: 2 })
    expect(transport.sendReliable({ type: 'action' })).toBe(true)
    expect(connection.send).not.toHaveBeenCalled()
    expect(connection.dataChannel.sent).toEqual([{ type: 'action' }])
    expect(await transport.diagnostics()).toMatchObject({ ordered: false, maxRetransmits: 0 })
  })

  it('rejects an occupied or unavailable SCTP stream ID', async () => {
    const { transport, connection } = setup()
    connection.opened()
    await expect(transport.openNative(0)).rejects.toThrow('Unsupported')
    await expect(transport.openNative(16)).rejects.toThrow('Unsupported')
    await expect(transport.openNative(1.1)).rejects.toThrow('Unsupported')
    expect(connection.peerConnection.createDataChannel).not.toHaveBeenCalled()
  })

  it('coalesces only latest state, prioritizes heartbeats and expires congestion queues', async () => {
    const { transport, connection } = setup()
    connection.opened()
    const opened = transport.openNative(1)
    connection.native!.open()
    await opened
    const channel = connection.native!
    channel.bufferedAmount = 2048
    transport.sendNative({ seq: 1 })
    transport.sendNative({ seq: 2 })
    transport.sendNative({ lease: 8 }, true)
    transport.sendNative({ lease: 9 }, true)
    expect(channel.sent).toEqual([])
    channel.drained()
    expect(channel.sent).toEqual([{ lease: 9 }, { seq: 2 }])
    channel.bufferedAmount = 2048
    transport.sendNative({ seq: 3 })
    await vi.advanceTimersByTimeAsync(110)
    channel.drained()
    expect(channel.sent).toHaveLength(2)
    expect(transport.sendNative({ huge: 'x'.repeat(2048) })).toBe(false)
  })

  it('bounds reliable output without ever invoking the PeerJS retry queue', () => {
    const { transport, connection } = setup()
    expect(transport.sendReliable({ action: 0 })).toBe(false)
    connection.opened()
    for (let i = 0; i < 8; i++) expect(transport.sendReliable({ action: i })).toBe(true)
    expect(transport.sendReliable({ action: 9 })).toBe(false)
    expect(transport.sendReliable({ huge: 'x'.repeat(2048) })).toBe(false)
    expect(connection.send).not.toHaveBeenCalled()
    connection.dataChannel.drained()
    expect(transport.sendReliable({ action: 10 })).toBe(true)
  })

  it.each(['null', '{broken', JSON.stringify({ huge: 'x'.repeat(2048) })])('closes malformed reliable input without throwing from PeerJS Json.parse', (input) => {
    const { transport, connection } = setup()
    const close = vi.fn()
    transport.onClose(close)
    connection.opened()
    expect(() => connection.receive(input)).not.toThrow()
    expect(close).toHaveBeenCalledWith('Invalid or oversized phone message.')
  })

  it('invalid native input closes both channels and pending setup/timers settle', async () => {
    const { transport, connection } = setup()
    connection.opened()
    const nativeReady = transport.openNative()
    connection.native!.open()
    await nativeReady
    const close = vi.fn()
    transport.onClose(close)
    connection.native!.onmessage!({ data: 'not json' })
    expect(transport.nativeOpen).toBe(false)
    expect(connection.native!.close).toHaveBeenCalledOnce()
    expect(connection.close).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    transport.close()
    expect(close).toHaveBeenCalledOnce()
  })

  it('preserves a direct session through signaling loss and bounds reconnection attempts', async () => {
    const { transport, connection, peer, signaling } = setup()
    connection.opened()
    await transport.ready
    peer.lostSignaling()
    for (const wait of [1000, 2000, 4000]) {
      await vi.advanceTimersByTimeAsync(wait)
      peer.disconnected = true
    }
    await vi.advanceTimersByTimeAsync(60_000)
    expect(peer.reconnect).toHaveBeenCalledTimes(3)
    expect(connection.close).not.toHaveBeenCalled()
    expect(transport.sendReliable({ type: 'still-connected' })).toBe(true)
    expect(signaling).toHaveBeenLastCalledWith(false)
  })

  it('bounds registration, connection and native setup time', async () => {
    const endpoint = createPeerEndpoint()
    endpoints.push(endpoint)
    const registration = expect(endpoint.ready).rejects.toThrow('Pairing service unavailable')
    await vi.advanceTimersByTimeAsync(10_000)
    await registration
    const first = setup()
    const reliable = expect(first.transport.ready).rejects.toThrow('Could not connect directly')
    await vi.advanceTimersByTimeAsync(15_000)
    await reliable
    const second = setup()
    second.connection.opened()
    const native = expect(second.transport.openNative()).rejects.toThrow('Could not connect directly')
    await vi.advanceTimersByTimeAsync(15_000)
    await native
    expect(second.connection.close).toHaveBeenCalledOnce()
  })

  it('reports selected direct/relay candidate path and ICE RTT without exposing addresses', async () => {
    const { transport, connection } = setup()
    connection.peerConnection.getStats.mockResolvedValue(new Map([
      ['transport', { type: 'transport', selectedCandidatePairId: 'pair' }],
      ['pair', { id: 'pair', type: 'candidate-pair', localCandidateId: 'local', remoteCandidateId: 'remote', currentRoundTripTime: .012 }],
      ['local', { candidateType: 'host' }], ['remote', { candidateType: 'srflx' }],
    ]))
    expect(await transport.diagnostics()).toMatchObject({ path: 'direct', iceRttMs: 12 })
    connection.peerConnection.getStats.mockResolvedValue(new Map([
      ['transport', { type: 'transport', selectedCandidatePairId: 'pair' }],
      ['pair', { id: 'pair', type: 'candidate-pair', localCandidateId: 'local', remoteCandidateId: 'remote' }],
      ['local', { candidateType: 'relay' }], ['remote', { candidateType: 'host' }],
    ]))
    expect(await transport.diagnostics()).toMatchObject({ path: 'relay' })
  })
})
