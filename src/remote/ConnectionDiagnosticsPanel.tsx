import { useCallback, useState, useSyncExternalStore } from 'react'
import type { ConnectionLog, DiagnosticEvent } from './connectionDiagnostics'
import type { TransportDiagnostics } from './peerTransport'

interface Props {
  log: ConnectionLog
  /** Live channel measurements, absent until the control channel is open. */
  transport: TransportDiagnostics | null
  rttMs: number | null
  receiveToApplyMs: number | null
  appliedSeq: number | null
  signalingAvailable: boolean
  /** What to do about a failure, shown under its cause. */
  recovery?: string
}

function tally(counts: { host: number; srflx: number; prflx: number; relay: number; mdns: number }): string {
  const parts = (['host', 'srflx', 'prflx', 'relay'] as const).filter(key => counts[key] > 0).map(key => `${counts[key]} ${key}`)
  if (counts.mdns > 0) parts.push(`${counts.mdns} mDNS`)
  return parts.length ? parts.join(', ') : 'none yet'
}

function Row({ term, value }: { term: string; value: string }) {
  return <div><dt>{term}</dt><dd>{value}</dd></div>
}

function Line({ event }: { event: DiagnosticEvent }) {
  return <li className={`phone-log__line phone-log__line--${event.level}`}>
    <span className="phone-log__at">{event.at} ms</span>
    <span className="phone-log__scope">{event.scope}</span>
    <span className="phone-log__code">{event.code}</span>
    <span className="phone-log__detail">{event.detail}</span>
  </li>
}

/**
 * The connection explains itself: what the pairing service said, which
 * candidates each side offered, which path was chosen, and the timeline that
 * produced the outcome. Open by default once something has gone wrong.
 */
export function ConnectionDiagnosticsPanel({ log, transport, rttMs, receiveToApplyMs, appliedSeq, signalingAvailable, recovery }: Props) {
  useSyncExternalStore(log.subscribe, log.version, log.version)
  const [copied, setCopied] = useState<string | null>(null)
  const facts = log.facts()
  const events = log.entries()
  const copy = useCallback(() => {
    const text = log.report()
    if (!navigator.clipboard) { setCopied('Clipboard unavailable — select the log text below instead.'); return }
    navigator.clipboard.writeText(text)
      .then(() => setCopied('Diagnostics copied.'))
      .catch(() => setCopied('Could not copy — select the log text below instead.'))
  }, [log])

  // A stale transport reading must never claim a path the ICE facts contradict.
  const established = facts.ice.selected !== null && facts.channels.controlOpenMs !== null && facts.failure === null
  const path = !established ? 'Not established'
    : transport?.path === 'relay' ? 'Relayed through TURN'
      : transport?.path === 'direct' ? 'Direct peer to peer'
        : `${facts.ice.selected!.localType} → ${facts.ice.selected!.remoteType}`

  return <details className="phone-sheet phone-diagnostics" open={facts.failure !== null}>
    {/* Closed, it is one chip in the controller's grid: a globe and the round
        trip. Open, the same summary heads a full-screen sheet in words. */}
    <summary>
      <span className="phone-sheet__chip" aria-hidden="true">🌐 {rttMs === null ? '—' : `${Math.round(rttMs)}ms`}</span>
      <span className="phone-sheet__title">Connection details{rttMs === null ? '' : ` · ${Math.round(rttMs)} ms round trip`}</span>
    </summary>
    {facts.failure && <p className="phone-diagnostics__cause"><strong>{facts.failure.code}</strong> {facts.failure.detail}
      {recovery && <small>{recovery}</small>}</p>}
    <dl>
      <Row term="Connection" value={path} />
      <Row term="Pairing service" value={facts.signaling.registered
        ? `Registered${facts.signaling.registeredAtMs === null ? '' : ` in ${facts.signaling.registeredAtMs} ms`}`
          + `${signalingAvailable ? '' : ' · disconnected (an open flight link keeps working)'}`
        : 'Not registered'} />
      {facts.signaling.lastErrorType && <Row term="Service error" value={`${facts.signaling.lastErrorType} — ${facts.signaling.lastErrorDetail ?? ''}`} />}
      <Row term="This device offered" value={tally(facts.ice.local)} />
      <Row term="Computer offered" value={tally(facts.ice.remote)} />
      <Row term="ICE state" value={`${facts.ice.connectionState ?? '—'} · gathering ${facts.ice.gatheringState ?? '—'}`} />
      <Row term="ICE servers" value={facts.ice.servers.length ? facts.ice.servers.join(', ') : 'none'} />
      {facts.ice.serverErrors.map(error => (
        <Row key={`${error.url}:${error.code}`} term="ICE server error"
          value={`${error.url} → ${error.code ?? '—'} ${error.text}${error.count > 1 ? ` (x${error.count})` : ''}`} />
      ))}
      <Row term="Chosen path" value={facts.ice.selected
        ? `${facts.ice.selected.localType} ${facts.ice.selected.local} → ${facts.ice.selected.remoteType} ${facts.ice.selected.remote} (${facts.ice.selected.protocol})`
        : 'none'} />
      <Row term="Session channel" value={facts.channels.reliableOpenMs === null ? 'never opened' : `open after ${facts.channels.reliableOpenMs} ms`} />
      <Row term="Control channel" value={facts.channels.controlOpenMs === null ? 'never opened' : `open after ${facts.channels.controlOpenMs} ms`} />
      <Row term="Round trip" value={rttMs === null ? '—' : `${rttMs.toFixed(1)} ms`} />
      <Row term="Buffered controls" value={`${transport?.bufferedAmount ?? 0} bytes`} />
      <Row term="Receive to physics" value={receiveToApplyMs === null ? '—' : `${receiveToApplyMs.toFixed(1)} ms`} />
      <Row term="Latest applied frame" value={appliedSeq === null ? '—' : String(appliedSeq)} />
    </dl>
    <div className="phone-diagnostics__actions">
      <button type="button" onClick={copy}>Copy diagnostics</button>
      {copied && <span role="status">{copied}</span>}
    </div>
    <ol className="phone-log" aria-label="Connection timeline">
      {events.map((event, index) => <Line key={`${event.at}-${event.code}-${index}`} event={event} />)}
    </ol>
    <p>Addresses are masked to their subnet. Flight controls use a direct connection where one exists;
      round trip is a network measurement, not touch-to-screen latency.</p>
  </details>
}
