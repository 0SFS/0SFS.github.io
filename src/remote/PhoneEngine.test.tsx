// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FlightRecorderPropertyReader } from '../flight/diagnostics/flightRecorder'
import { createEngineMonitor } from '../flight/hud/engineMonitor'
import { createEngineSpoolRenderer } from '../flight/hud/engineSpoolRenderer'
import { ENGINE_PHASE_LABELS } from '../flight/hud/engineMonitorModel'
import { toEngineStatus } from '../flight/remote/engineStatus'
import { engineSummaryFromStatus } from './engineSummaryFromStatus'
import { PhoneEngine } from './PhoneEngine'
import { parseMessage, type EngineStatus } from './protocol'

const orbRenderer = vi.hoisted(() => ({ draw: vi.fn(), configure: vi.fn(), setAccentColor: vi.fn(), destroy: vi.fn() }))
vi.mock('../flight/hud/engineSpoolRenderer', () => ({
  createEngineSpoolRenderer: vi.fn(() => ({ ...orbRenderer, canDraw: () => true,
    getMotionStatus: () => ({ fps: null, maxTurnsPerSecond: null, limited: false }), ready: Promise.resolve() })),
}))

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

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
  it('requests no GPU backend or animation for legacy hosts without orb budgets', () => {
    const requestFrame = vi.fn()
    vi.stubGlobal('requestAnimationFrame', requestFrame)
    const engine: EngineStatus = { phase: 'RUNNING', kind: 'piston', rpm: 1350, maxRpm: 2700, simTimeS: 1 }
    act(() => root.render(<PhoneEngine engine={engine} />))
    expect(createEngineSpoolRenderer).toHaveBeenCalledWith(expect.any(HTMLElement), {
      preference: 'off', maxFps: 0, pixelRatio: 1, maxPatternStep: 0.45, outerBlades: 0, innerBlades: 0,
    })
    act(() => root.render(<PhoneEngine engine={{ ...engine, simTimeS: 2 }} />))
    expect(orbRenderer.configure).toHaveBeenLastCalledWith({ preference: 'off', maxFps: 0, pixelRatio: 1, maxPatternStep: 0.45,
      outerBlades: 0, innerBlades: 0 })
    expect(requestFrame).not.toHaveBeenCalled()
    expect(container.querySelector('.flight-engine__rpm .flight-engine__spool-value')?.textContent).toBe('1350')
  })

  it('draws exactly what the desktop HUD draws, from what the status frame carries', () => {
    const desktop = document.createElement('div')
    document.body.append(desktop)
    const rotorBlades = { outer: 20, inner: 40, outerEstimated: true, innerEstimated: true }
    const monitor = createEngineMonitor(desktop, { storage: null, refreshIntervalMs: 0,
      definition: { kind: 'turbine', rotorBlades },
      afterburner: { accentColor: '#ff9450', getActive: () => true } })
    monitor.update(reader({
      'simulation/sim-time-sec': 12,
      'propulsion/engine/n1': 50.83,
      'propulsion/engine/n2': 69.71,
      'propulsion/engine/MaxN1': 100,
      'propulsion/engine/MaxN2': 100,
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
    expect(engine?.rotorBlades).toEqual(rotorBlades)
    expect(engine?.afterburnerColor).toBe('#ff9450')
    expect(engineSummaryFromStatus(engine!).rotorBlades).toEqual(rotorBlades)
    act(() => root.render(<PhoneEngine engine={engine!} />))
    expect(orbRenderer.configure).toHaveBeenLastCalledWith(expect.objectContaining({ outerBlades: 20, innerBlades: 40 }))
    expect(orbRenderer.setAccentColor).toHaveBeenLastCalledWith('#ff9450')

    const face = (host: Element) => [...host.querySelectorAll(
      '.flight-engine__flow, .flight-engine__spools, .flight-engine__phase, .flight-engine__values')]
      .map(node => [node.className, (node as HTMLElement).hidden, node.textContent, (node as HTMLElement).dataset.phase])
    expect(face(container)).toEqual(face(desktop))
    expect(container.querySelector('.flight-engine__phase')?.textContent).toBe('RUNNING')
    monitor.destroy()
    desktop.remove()
  })

  it('restores normal shaft colors when active afterburner color disappears from the status', () => {
    act(() => root.render(<PhoneEngine engine={{ phase: 'RUNNING', afterburnerColor: '#ff9450' }} />))
    expect(orbRenderer.setAccentColor).toHaveBeenLastCalledWith('#ff9450')
    act(() => root.render(<PhoneEngine engine={{ phase: 'RUNNING' }} />))
    expect(orbRenderer.setAccentColor).toHaveBeenLastCalledWith(null)
  })

  it('recovers every phase colour from its label', () => {
    for (const [phase, label] of Object.entries(ENGINE_PHASE_LABELS)) {
      expect(engineSummaryFromStatus({ phase: label }).phase).toBe(phase)
    }
  })

  it('keeps the C172 as a single RPM ring through the status protocol', () => {
    const engine: EngineStatus = { phase: 'RUNNING', kind: 'piston', rpm: 1350, maxRpm: 2700,
      n1: 0, n2: 0, simTimeS: 2,
      rotorBlades: { outer: 2, inner: null, outerEstimated: false, innerEstimated: false } }
    act(() => root.render(<PhoneEngine engine={engine} />))
    expect(container.querySelector<HTMLElement>('.flight-engine__rpm')?.hidden).toBe(false)
    expect(container.querySelector('.flight-engine__rpm .flight-engine__spool-value')?.textContent).toBe('1350')
    expect(container.querySelector<HTMLElement>('.flight-engine__spool--n2')?.hidden).toBe(true)
    expect(container.querySelector<HTMLElement>('.flight-engine__spool-n1')?.hidden).toBe(true)
    expect(orbRenderer.draw.mock.lastCall?.[0].innerAngle).toBeNull()
    expect(createEngineSpoolRenderer).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
      outerBlades: 2, innerBlades: 0,
    }))
    expect(container.querySelector<HTMLElement>('.flight-engine__spools')?.title).toContain('One marker per propeller blade: 2.')
  })

  it('shows no blade markers and schedules no interpolation when a legacy host sends only orb budgets', () => {
    const requestFrame = vi.fn()
    vi.stubGlobal('requestAnimationFrame', requestFrame)
    const engine: EngineStatus = { phase: 'RUNNING', kind: 'piston', rpm: 1350, maxRpm: 2700, simTimeS: 1,
      orbs: { fps: 30, turnsPerSecond: 2, pixelRatio: 1, renderer: 'webgl1' } }
    act(() => root.render(<PhoneEngine engine={engine} />))
    act(() => root.render(<PhoneEngine engine={{ ...engine, simTimeS: 2 }} />))
    expect(orbRenderer.configure).toHaveBeenLastCalledWith(expect.objectContaining({ outerBlades: 0, innerBlades: 0 }))
    expect(requestFrame).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLElement>('.flight-engine__spools')?.title).toContain('Blade counts unavailable; numeric readouts only.')
  })

  it('interpolates only received simulation time, stops after one heartbeat and stays still when paused', () => {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    let nextId = 0
    const callbacks = new Map<number, FrameRequestCallback>()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callbacks.set(++nextId, callback)
      return nextId
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id))
    const tick = (timestamp: number): void => {
      now = timestamp
      const pending = [...callbacks.values()]
      callbacks.clear()
      for (const callback of pending) callback(timestamp)
    }
    const engine: EngineStatus = { phase: 'RUNNING', kind: 'turbine', n1: 50, n2: 75,
      maxN1: 100, maxN2: 100, simTimeS: 1,
      rotorBlades: { outer: 28, inner: 40, outerEstimated: false, innerEstimated: true },
      orbs: { fps: 30, turnsPerSecond: 2, pixelRatio: 1, renderer: 'webgl1' } }
    act(() => root.render(<PhoneEngine engine={engine} />))
    expect(callbacks.size).toBe(0)
    now = 100
    const next = { ...engine, simTimeS: 1.1 }
    act(() => root.render(<PhoneEngine engine={next} />))
    expect(callbacks.size).toBe(1)
    tick(125)
    const halfway = { ...orbRenderer.draw.mock.lastCall![0] }
    const displayRate = 2
    expect(halfway.outerAngle).toBeCloseTo(Math.PI * displayRate * 0.05)
    expect(halfway.innerAngle).toBeCloseTo(Math.PI * displayRate * 0.075)
    // A status heartbeat with the same fixed-step time must not reset playback.
    now = 130
    act(() => root.render(<PhoneEngine engine={{ ...next }} />))
    expect(callbacks.size).toBe(1)
    tick(150)
    expect(callbacks.size).toBe(0)
    const stopped = { ...orbRenderer.draw.mock.lastCall![0] }
    expect(stopped.outerAngle).toBeCloseTo(Math.PI * displayRate * 0.1)
    act(() => root.render(<PhoneEngine engine={next} paused />))
    expect(callbacks.size).toBe(0)
    expect(orbRenderer.draw.mock.lastCall![0]).toEqual(stopped)
    expect(orbRenderer.configure).toHaveBeenLastCalledWith({ preference: 'webgl1', maxFps: 30, pixelRatio: 1, maxPatternStep: 0.45,
      outerBlades: 28, innerBlades: 40 })
  })

  it('cancels phone playback immediately when paused between heartbeat frames', () => {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    let nextId = 0
    const callbacks = new Map<number, FrameRequestCallback>()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callbacks.set(++nextId, callback)
      return nextId
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id))
    const engine: EngineStatus = { phase: 'RUNNING', kind: 'piston', rpm: 2700, maxRpm: 2700, simTimeS: 1,
      rotorBlades: { outer: 2, inner: null, outerEstimated: false, innerEstimated: false },
      orbs: { fps: 120, turnsPerSecond: 2, pixelRatio: 1, renderer: 'webgl1' } }
    act(() => root.render(<PhoneEngine engine={engine} />))
    now = 50
    const next = { ...engine, simTimeS: 1.05 }
    act(() => root.render(<PhoneEngine engine={next} />))
    expect(callbacks.size).toBe(1)
    const beforePause = { ...orbRenderer.draw.mock.lastCall![0] }
    now = 55
    act(() => root.render(<PhoneEngine engine={next} paused />))
    expect(callbacks.size).toBe(0)
    expect(orbRenderer.draw.mock.lastCall![0]).toEqual(beforePause)
  })
})
