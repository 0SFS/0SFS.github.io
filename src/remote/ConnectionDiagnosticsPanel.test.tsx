// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ConnectionDiagnosticsPanel } from './ConnectionDiagnosticsPanel'
import { createConnectionLog, type ConnectionLog } from './connectionDiagnostics'

let root: Root
let container: HTMLDivElement
let log: ConnectionLog

const props = {
  transport: null, rttMs: null, receiveToApplyMs: null, appliedSeq: null, signalingAvailable: true,
}

function render(overrides: Partial<typeof props> = {}) {
  act(() => { root.render(<ConnectionDiagnosticsPanel log={log} {...props} {...overrides} />) })
}
function row(term: string): string {
  const entry = [...container.querySelectorAll('dt')].find(node => node.textContent === term)
  return entry?.nextElementSibling?.textContent ?? ''
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  log = createConnectionLog('phone', () => 0)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('connection diagnostics panel', () => {
  it('stays collapsed while nothing has failed, as a globe and the round trip', () => {
    render({ rttMs: 23.4 })
    expect(container.querySelector('details')!.open).toBe(false)
    expect(container.querySelector('.phone-diagnostics__cause')).toBeNull()
    expect(container.querySelector('.phone-sheet__chip')?.textContent).toBe('🌐 23ms')
    // The words are still there for assistive tech, and head the sheet when open.
    expect(container.querySelector('.phone-sheet__title')?.textContent).toBe('Connection details · 23 ms round trip')
    render()
    expect(container.querySelector('.phone-sheet__chip')?.textContent).toBe('🌐 —')
  })

  it('opens itself and shows the recorded cause when the connection fails', () => {
    log.recordFailure('channel', 'setup-timeout', 'Could not connect directly. No working pair.')
    render()
    expect(container.querySelector('details')!.open).toBe(true)
    const cause = container.querySelector('.phone-diagnostics__cause')!
    expect(cause.textContent).toContain('setup-timeout')
    expect(cause.textContent).toContain('No working pair')
    expect(cause.querySelector('small')).toBeNull()
  })

  it('says what to do about a failure under its cause', () => {
    log.recordFailure('session', 'disconnected', 'The computer closed the session.')
    act(() => { root.render(<ConnectionDiagnosticsPanel log={log} {...props} recovery="Create a new QR, then scan it." />) })
    expect(container.querySelector('.phone-diagnostics__cause small')?.textContent).toBe('Create a new QR, then scan it.')
  })

  it('never claims a path the ICE facts contradict', () => {
    log.update(facts => {
      facts.ice.selected = { local: '192.168.1.x', remote: '192.168.1.x', localType: 'host', remoteType: 'host', protocol: 'udp', rttMs: 9 }
    })
    log.recordFailure('channel', 'control-setup-timeout', 'Control channel never opened.')
    // A stale "direct" reading from the transport must not survive the failure.
    render({ transport: { path: 'direct', iceRttMs: 9, ordered: false, maxRetransmits: 0, bufferedAmount: 0 } })
    expect(row('Connection')).toBe('Not established')
  })

  it('reports a live relayed session as relayed', () => {
    log.update(facts => {
      facts.ice.selected = { local: '10.0.0.x', remote: '203.0.113.x', localType: 'relay', remoteType: 'srflx', protocol: 'udp', rttMs: 31 }
      facts.channels.controlOpenMs = 820
    })
    render({ transport: { path: 'relay', iceRttMs: 31, ordered: false, maxRetransmits: 0, bufferedAmount: 0 } })
    expect(row('Connection')).toBe('Relayed through TURN')
    expect(row('Control channel')).toBe('open after 820 ms')
  })

  it('summarizes candidate counts on both sides', () => {
    log.update(facts => {
      facts.ice.local = { host: 2, srflx: 1, prflx: 0, relay: 0, mdns: 2 }
      facts.ice.remote = { host: 0, srflx: 0, prflx: 0, relay: 0, mdns: 0 }
    })
    render()
    expect(row('This device offered')).toBe('2 host, 1 srflx, 2 mDNS')
    expect(row('Computer offered')).toBe('none yet')
  })

  it('renders the timeline and re-renders as new events arrive', () => {
    render()
    const lines = () => container.querySelectorAll('.phone-log__line').length
    const before = lines()
    act(() => { log.record('ice', 'connection-state', 'checking') })
    expect(lines()).toBe(before + 1)
    expect(container.querySelector('.phone-log')!.textContent).toContain('connection-state')
  })
})
