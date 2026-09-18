// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FlightRecorderPropertyReader } from '../flight/diagnostics/flightRecorder'
import { createEngineMonitor } from '../flight/hud/engineMonitor'
import { ENGINE_PHASE_LABELS } from '../flight/hud/engineMonitorModel'
import { toEngineStatus } from '../flight/remote/engineStatus'
import { engineSummaryFromStatus } from './engineSummaryFromStatus'
import { PhoneEngine } from './PhoneEngine'
import { parseMessage } from './protocol'

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })

function reader(values: Record<string, number>): FlightRecorderPropertyReader {
  return {
    getPropertyValue: path => values[path] ?? 0,
    queryPropertyCatalog: query => {
      const hits = Object.keys(values).filter(path => path.startsWith(query))
      return hits.length ? `${hits.map(path => `${path} (RW)`).join('\n')}\n` : 'No matches found\n'
    },
  }
}

describe('phone engine widget', () => {
  it('draws exactly what the desktop HUD draws, from what the status frame carries', () => {
    const desktop = document.createElement('div')
    document.body.append(desktop)
    const monitor = createEngineMonitor(desktop, { storage: null, refreshIntervalMs: 0 })
    monitor.update(reader({
      'simulation/sim-time-sec': 12,
      'propulsion/engine/n1': 50.83,
      'propulsion/engine/n2': 69.71,
      'propulsion/engine/thrust-lbs': 212.6,
      'propulsion/engine/fuel-flow-rate-pps': 0.0474,
      'propulsion/engine/fuel-flow-rate-gph': 25.4,
      'propulsion/engine/set-running': 1,
    }))
    // Through the wire, parsed as the phone parses it.
    const envelope = { v: 1, session: 's', epoch: 1 }
    const status = {
      owner: 'phone', paused: false, viewMode: 'third', controls: { aileron: 0, elevator: 0, rudder: 0, throttle: 0, flaps: 0, pitchTrim: 0, rollTrim: 0, brake: 0 },
      airspeedKts: 0, altitudeFt: 0, headingDeg: 0, engine: toEngineStatus(monitor.getReading()),
    }
    const parsed = parseMessage(JSON.parse(JSON.stringify({ ...envelope, type: 'status', message: 'x', status })))
    expect(parsed?.type).toBe('status')
    const engine = parsed && 'status' in parsed && parsed.status ? parsed.status.engine : undefined
    act(() => root.render(<PhoneEngine engine={engine!} />))

    const face = (host: Element) => [...host.querySelectorAll(
      '.flight-engine__flow, .flight-engine__spools, .flight-engine__phase, .flight-engine__values')]
      .map(node => [node.className, (node as HTMLElement).hidden, node.textContent, (node as HTMLElement).dataset.phase])
    expect(face(container)).toEqual(face(desktop))
    expect(container.querySelector('.flight-engine__phase')?.textContent).toBe('RUNNING')
    monitor.destroy()
    desktop.remove()
  })

  it('recovers every phase colour from its label', () => {
    for (const [phase, label] of Object.entries(ENGINE_PHASE_LABELS)) {
      expect(engineSummaryFromStatus({ phase: label }).phase).toBe(phase)
    }
  })
})
