import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_ICE_SERVERS } from './iceConfig'

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
      iceConnectionState: 'new',
      iceGatheringState: 'new',
      connectionState: 'new',
      signalingState: 'stable',
      listeners: new Map<string, Set<(event: unknown) => void>>(),
      addEventListener: vi.fn(function (this: { listeners: Map<string, Set<(event: unknown) => void>> }, name: string, handler: (event: unknown) => void) {
        const set = this.listeners.get(name) ?? new Set()
        set.add(handler)
        this.listeners.set(name, set)
      }),
      removeEventListener: vi.fn(function (this: { listeners: Map<string, Set<(event: unknown) => void>> }, name: string, handler: (event: unknown) => void) {
        this.listeners.get(name)?.delete(handler)
      }),
      getConfiguration: vi.fn(() => ({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })),
      getStats: vi.fn(async () => new Map<string, unknown>()),
      createDataChannel: vi.fn((_label: string, options: RTCDataChannelInit) => {
        this.native = new Channel(options)
        return this.native
      }),
    }
    close = vi.fn(() => { this.open = false; this.emit('close') })
    send = vi.fn()
    fire(name: string, event: unknown) { for (const handler of this.peerConnection.listeners.get(name) ?? []) handler(event) }
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
  it('uses secure cloud signaling, the configured STUN list, public metadata, and pre-open subscriptions', async () => {
    const { endpoint, peer, transport, connection } = setup()
    expect(await endpoint.ready).toBe('test-peer')
    expect(peer.options).toEqual({
      secure: true, port: 443, debug: 0, referrerPolicy: 'no-referrer',
      config: { iceServers: DEFAULT_ICE_SERVERS },
    })
    // Several independent STUN hosts and no relay by default: one blocked
    // server costs gathering time instead of the whole connection.
    expect(DEFAULT_ICE_SERVERS.flatMap(server => (typeof server.urls === 'string' ? [server.urls] : server.urls)))
      .not.toContain(expect.stringContaining('turn:'))
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

  it('ends a dial to an unregistered computer at once, naming the real cause', async () => {
    const { endpoint, peer, transport } = setup()
    const closed = vi.fn()
    transport.onClose(closed)
    const rejected = expect(transport.ready).rejects.toThrow(/no computer registered/i)
    peer.emit('error', { type: 'peer-unavailable', message: 'Could not connect to peer target-peer' })
    await rejected
    // No waiting out the 15 second setup deadline for an answer that cannot come.
    expect(closed).toHaveBeenCalledOnce()
    expect(closed.mock.calls[0][0]).not.toContain('Wi-Fi')
    expect(endpoint.log.facts().failure?.code).toBe('peer-unavailable')
    expect(endpoint.log.facts().signaling.lastErrorType).toBe('peer-unavailable')
  })

  it('keeps an open flight link through a recoverable signaling error but records it', async () => {
    const { endpoint, peer, transport, connection } = setup()
    connection.opened()
    await transport.ready
    peer.emit('error', { type: 'network', message: 'Lost connection to server.' })
    expect(connection.close).not.toHaveBeenCalled()
    expect(transport.sendReliable({ type: 'still-connected' })).toBe(true)
    expect(endpoint.log.facts().signaling.lastErrorType).toBe('network')
    // Recoverable: recorded for the report, but not promoted to the failure cause.
    expect(endpoint.log.facts().failure).toBeNull()
  })

  it('explains an ICE negotiation failure instead of guessing at the network', async () => {
    const { transport, connection, endpoint } = setup()
    const rejected = expect(transport.ready).rejects.toThrow('Could not connect directly')
    connection.fire('icecandidate', { candidate: { candidate: 'a', type: 'host', protocol: 'udp', address: '192.168.1.44', port: 5000 } })
    connection.emit('error', { type: 'negotiation-failed', message: 'Negotiation of connection to target-peer failed.' })
    await rejected
    const facts = endpoint.log.facts()
    expect(facts.ice.local.host).toBe(1)
    expect(facts.failure?.code).toBe('connection-negotiation-failed')
    // The local candidate was recorded, but never at full address.
    expect(endpoint.log.report()).toContain('192.168.1.x')
    expect(endpoint.log.report()).not.toContain('192.168.1.44')
  })

  it('records ICE state changes and STUN server errors for the report', async () => {
    const { connection, endpoint } = setup()
    connection.peerConnection.iceGatheringState = 'gathering'
    connection.fire('icegatheringstatechange', {})
    connection.fire('icecandidateerror', { url: 'stun:stun.l.google.com:19302', errorCode: 701, errorText: 'STUN host lookup received error.' })
    connection.fire('icecandidateerror', { url: 'stun:stun.l.google.com:19302', errorCode: 701, errorText: 'STUN host lookup received error.' })
    connection.peerConnection.iceConnectionState = 'failed'
    connection.fire('iceconnectionstatechange', {})
    const facts = endpoint.log.facts()
    expect(facts.ice.gatheringState).toBe('gathering')
    expect(facts.ice.connectionState).toBe('failed')
    // Repeated reports from one server collapse into a count.
    expect(facts.ice.serverErrors).toEqual([{ url: 'stun:stun.l.google.com:19302', code: 701, text: 'STUN host lookup received error.', count: 2 }])
  })

  it('counts remote candidates from stats so a silent far end is visible', async () => {
    const { transport, connection, endpoint } = setup()
    connection.peerConnection.getStats.mockResolvedValue(new Map<string, unknown>([
      ['r1', { type: 'remote-candidate', candidateType: 'host', address: 'abc.local' }],
      ['r2', { type: 'remote-candidate', candidateType: 'srflx', address: '203.0.113.9' }],
    ]))
    connection.opened()
    await transport.ready
    await vi.advanceTimersByTimeAsync(1000)
    const facts = endpoint.log.facts()
    expect(facts.ice.remote).toMatchObject({ host: 1, srflx: 1, mdns: 1 })
    expect(facts.channels.reliableOpenMs).not.toBeNull()
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
