import { useEffect, useRef, useState } from 'react'
import { createEngineSummary, engineRotorMotionDescription, engineRotorSpeeds, type EngineSummary, type FuelFlowUnit } from '../flight/hud/engineSummary'
import { DEFAULT_MAX_PATTERN_STEP, engineSpoolDisplayRate } from '../flight/hud/engineSpoolMotion'
import { createEngineSpoolAnimation } from '../flight/hud/engineSpoolAnimation'
import { createEngineSpoolRenderer } from '../flight/hud/engineSpoolRenderer'
import { engineSummaryFromStatus } from './engineSummaryFromStatus'
import { HEARTBEAT_MS, type EngineOrbSettings, type EngineStatus } from './protocol'

// A host without this capability authorizes no GPU work. Active budgets always
// arrive from the desktop; the phone does not duplicate its settings catalog.
const DISABLED_ORBS: EngineOrbSettings = {
  fps: 0, turnsPerSecond: 0, pixelRatio: 1, renderer: 'off',
}

const FLOW_UNIT_PREFERENCE_KEY = 'osfs.phone-fuel-flow-unit'
function readFlowUnit(): FuelFlowUnit {
  try { return window.localStorage.getItem(FLOW_UNIT_PREFERENCE_KEY) === 'gal/h' ? 'gal/h' : 'lb/h' } catch { return 'lb/h' }
}

/**
 * The desktop HUD's engine widget — the same DOM, drawn by the same code from
 * `engineSummary.ts` with the same stylesheet — fed from the status frame
 * rather than from JSBSim. Tapping the fuel flow switches pounds and gallons,
 * as clicking it does on the desktop. There is no Engine tab to open here, so
 * the rest of the widget is a readout, not a button.
 */
export function PhoneEngine({ engine, paused = false }: { engine: EngineStatus; paused?: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const summary = useRef<EngineSummary | null>(null)
  const renderer = useRef<ReturnType<typeof createEngineSpoolRenderer> | null>(null)
  const animation = useRef<ReturnType<typeof createEngineSpoolAnimation> | null>(null)
  const initialOrbSettings = useRef(engine.orbs ?? DISABLED_ORBS)
  const initialRotorBlades = useRef(engine.rotorBlades)
  const [unit, setUnit] = useState(readFlowUnit)
  useEffect(() => {
    const created = createEngineSummary()
    const target = host.current!
    target.replaceChildren(created.diagram, created.values)
    summary.current = created
    const initial = initialOrbSettings.current
    renderer.current = createEngineSpoolRenderer(created.spools, {
      preference: initial.renderer, maxFps: initial.fps, pixelRatio: initial.pixelRatio,
      maxPatternStep: initial.maxPatternStep ?? DEFAULT_MAX_PATTERN_STEP,
      outerBlades: initialRotorBlades.current?.outer ?? 0,
      innerBlades: initialRotorBlades.current?.inner ?? 0,
    })
    animation.current = createEngineSpoolAnimation({
      draw: (frame, now) => renderer.current?.draw(frame, now),
      canDraw: () => renderer.current?.canDraw() ?? false,
    })
    const toggle = (): void => setUnit(current => {
      const next = current === 'gal/h' ? 'lb/h' : 'gal/h'
      try { window.localStorage.setItem(FLOW_UNIT_PREFERENCE_KEY, next) } catch { /* This visit only. */ }
      return next
    })
    created.flow.addEventListener('click', toggle)
    return () => {
      created.flow.removeEventListener('click', toggle)
      animation.current?.destroy()
      animation.current = null
      renderer.current?.destroy()
      renderer.current = null
      target.replaceChildren()
      summary.current = null
    }
  }, [])
  // Declared after the effect that creates the widget, so it runs after it.
  useEffect(() => {
    const view = engineSummaryFromStatus(engine)
    if (renderer.current) view.rotorMotionDescription = engineRotorMotionDescription(
      renderer.current.getMotionStatus(), engine.orbs?.maxPatternStep ?? DEFAULT_MAX_PATTERN_STEP)
    summary.current?.render(view, unit)
  }, [engine, unit])
  useEffect(() => {
    const orbs = renderer.current!
    orbs.setAccentColor(engine.afterburnerColor ?? null)
    const settings = engine.orbs ?? DISABLED_ORBS
    orbs.configure({ preference: settings.renderer, maxFps: settings.fps, pixelRatio: settings.pixelRatio,
      maxPatternStep: settings.maxPatternStep ?? DEFAULT_MAX_PATTERN_STEP,
      outerBlades: engine.rotorBlades?.outer ?? 0, innerBlades: engine.rotorBlades?.inner ?? 0 })
    const view = engineSummaryFromStatus(engine)
    const speeds = engineRotorSpeeds(view)
    const displayRate = engineSpoolDisplayRate(settings.turnsPerSecond, settings.fps, engine.rotorBlades)
    animation.current!.update({
      simTimeS: view.simTimeS ?? null,
      speeds,
      turnsPerSecond: displayRate,
      enabled: settings.fps > 0 && settings.renderer !== 'off' && engine.rotorBlades !== undefined,
      held: paused,
      interpolationMs: HEARTBEAT_MS,
    })
  }, [engine, paused])
  return <section className="flight-engine phone-engine" aria-label="Engine monitor">
    <div ref={host} className="flight-engine__summary" />
  </section>
}
