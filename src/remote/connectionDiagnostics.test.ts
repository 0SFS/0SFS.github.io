import { describe, expect, it } from 'vitest'
import {
  createConnectionLog, describeIceFailure, describeIceServers, maskAddress,
  type DiagnosticFacts,
} from './connectionDiagnostics'
import { DEFAULT_ICE_SERVERS, parseIceServers, resolveIceServers } from './iceConfig'

function facts(patch: (value: DiagnosticFacts) => void): DiagnosticFacts {
  const log = createConnectionLog('phone', () => 0)
  log.update(patch)
  return log.facts()
}

describe('address masking', () => {
  it('keeps the subnet and drops the host part', () => {
    expect(maskAddress('192.168.1.47')).toBe('192.168.1.x')
    expect(maskAddress('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2:3:4:5:xxxx')
  })

  it('names an mDNS candidate instead of pretending it is an address', () => {
    expect(maskAddress('9b36eb1c-4f2e-4b6f-9c8f-2f0a1b2c3d4e.local')).toBe('mDNS .local')
  })

  it('never returns a full address for unknown input', () => {
    expect(maskAddress(null)).toBe('unknown')
    expect(maskAddress('')).toBe('unknown')
  })
})

describe('ICE server description', () => {
  it('lists URLs and marks credentials without printing them', () => {
    const described = describeIceServers([
      { urls: ['stun:a:3478', 'stun:b:3478'] },
      { urls: 'turn:relay:3478', username: 'flight', credential: 'super-secret' },
    ])
    expect(described).toEqual(['stun:a:3478', 'stun:b:3478', 'turn:relay:3478 (with credentials)'])
    expect(described.join(' ')).not.toContain('super-secret')
  })
})

describe('ICE failure explanations', () => {
  it('blames the local device when it gathered nothing', () => {
    expect(describeIceFailure(facts(() => {})))
      .toContain('gathered no network candidates')
  })

  it('quotes a STUN server error when gathering produced nothing', () => {
    const detail = describeIceFailure(facts(value => {
      value.ice.serverErrors.push({ url: 'stun:example:3478', code: 701, text: 'Address not associated', count: 2 })
    }))
    expect(detail).toContain('Address not associated')
  })

  it('says the other device never answered when no remote candidates arrived', () => {
    const detail = describeIceFailure(facts(value => { value.ice.local.host = 2; value.ice.local.srflx = 1 }))
    expect(detail).toContain('No candidates ever arrived from the other device')
  })

  it('names the Local Network permission when both ends only offered mDNS', () => {
    const detail = describeIceFailure(facts(value => {
      value.ice.local.host = 2
      value.ice.local.mdns = 2
      value.ice.remote.host = 2
      value.ice.remote.mdns = 2
    }))
    expect(detail).toContain('Local Network permission')
  })

  it('names client isolation and the missing relay when candidates existed on both sides', () => {
    const detail = describeIceFailure(facts(value => {
      value.ice.local.host = 1
      value.ice.local.srflx = 1
      value.ice.remote.srflx = 2
    }))
    expect(detail).toContain('isolation')
    expect(detail).toContain('TURN')
  })
})

describe('connection log', () => {
  it('keeps the first failure as the cause and records later noise as events', () => {
    const log = createConnectionLog('phone', () => 0)
    log.recordFailure('ice', 'ice-failed', 'The real cause')
    log.recordFailure('channel', 'teardown', 'Consequential noise')
    expect(log.facts().failure).toEqual({ code: 'ice-failed', detail: 'The real cause' })
    expect(log.entries().map(entry => entry.code)).toContain('teardown')
  })

  it('advances a version on every change so subscribers can compare snapshots', () => {
    const log = createConnectionLog('desktop', () => 0)
    const before = log.version()
    log.record('signaling', 'registered', 'ok')
    log.update(value => { value.peerId = 'abc' })
    expect(log.version()).toBe(before + 2)
  })

  it('resets per-attempt facts but keeps the timeline across pairing attempts', () => {
    const log = createConnectionLog('desktop', () => 0)
    log.update(value => { value.peerId = 'first'; value.ice.local.host = 3; value.ice.servers = ['stun:a:3478'] })
    log.recordFailure('ice', 'ice-failed', 'first attempt failed')
    log.reset('Creating a new QR')
    expect(log.facts().peerId).toBeNull()
    expect(log.facts().failure).toBeNull()
    expect(log.facts().ice.local.host).toBe(0)
    // The configured servers are not per-attempt state.
    expect(log.facts().ice.servers).toEqual(['stun:a:3478'])
    expect(log.entries().map(entry => entry.code)).toEqual(['log-started', 'ice-failed', 'attempt-reset'])
  })

  it('reports the facts a bug report needs and no unmasked address', () => {
    const log = createConnectionLog('phone', () => 0)
    log.update(value => {
      value.peerId = 'phone-1'
      value.remotePeerId = 'desktop-1'
      value.signaling.registered = true
      value.signaling.registeredAtMs = 412
      value.ice.local.srflx = 1
      value.ice.selected = { local: '192.168.1.x', remote: '192.168.1.x', localType: 'host', remoteType: 'host', protocol: 'udp', rttMs: 8 }
    })
    log.recordFailure('channel', 'setup-timeout', 'Could not connect directly.')
    const report = log.report()
    expect(report).toContain('OSFS phone controller diagnostics (phone)')
    expect(report).toContain('registered in 412 ms')
    expect(report).toContain('srflx=1')
    expect(report).toContain('setup-timeout')
    expect(report).toContain('timeline:')
    expect(report).not.toMatch(/\d+\.\d+\.\d+\.\d+(?!x)\b/)
  })

  it('stops recording once destroyed', () => {
    const log = createConnectionLog('phone', () => 0)
    const count = log.entries().length
    log.destroy()
    log.record('session', 'late', 'ignored')
    expect(log.entries()).toHaveLength(count)
  })
})

describe('ICE configuration', () => {
  it('defaults to several independent STUN hosts and no relay', () => {
    expect(resolveIceServers(null)).toEqual({ servers: DEFAULT_ICE_SERVERS, origin: 'default' })
    expect(JSON.stringify(DEFAULT_ICE_SERVERS)).not.toContain('turn:')
  })

  it('accepts a device override so a relay can be tried without rebuilding', () => {
    const stored = JSON.stringify([{ urls: 'turn:relay.example:3478', username: 'u', credential: 'p' }])
    expect(resolveIceServers({ getItem: () => stored })).toEqual({
      servers: [{ urls: 'turn:relay.example:3478', username: 'u', credential: 'p' }],
      origin: 'device',
    })
  })

  it('rejects a malformed or partly invalid override rather than half-applying it', () => {
    expect(parseIceServers('not json')).toBeNull()
    expect(parseIceServers('[{"urls":"https://example.com"}]')).toBeNull()
    expect(parseIceServers('[{"urls":"stun:a:3478"},{"urls":5}]')).toBeNull()
    expect(resolveIceServers({ getItem: () => '[]' })).toEqual({ servers: DEFAULT_ICE_SERVERS, origin: 'default' })
  })

  it('falls back to the defaults when storage throws', () => {
    expect(resolveIceServers({ getItem: () => { throw new Error('blocked') } }).origin).toBe('default')
  })
})
