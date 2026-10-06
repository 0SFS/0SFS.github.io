import { useEffect, useRef, useState } from 'react'
import { createEngineSummary, engineRotorSpeeds, type EngineSummary, type FuelFlowUnit } from '../flight/hud/engineSummary'
import { createEngineSpoolMotion, engineSpoolDisplayRate } from '../flight/hud/engineSpoolMotion'
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
  const motion = useRef<ReturnType<typeof createEngineSpoolMotion> | null>(null)
  const displayedSimTime = useRef<number | null>(null)
  const receivedSimTime = useRef<number | null>(null)
  const hadInnerRing = useRef<boolean | null>(null)
  const initialOrbSettings = useRef(engine.orbs ?? DISABLED_ORBS)
  const initialRotorBlades = useRef(engine.rotorBlades)
  const [unit, setUnit] = useState(readFlowUnit)
  useEffect(() => {
    const created = createEngineSummary()
    const target = host.current!
    target.replaceChildren(created.diagram, created.values)
    summary.current = created
    motion.current = createEngineSpoolMotion()
    const initial = initialOrbSettings.current
    renderer.current = createEngineSpoolRenderer(created.spools, {
      preference: initial.renderer, maxFps: initial.fps, pixelRatio: initial.pixelRatio,
      outerBlades: initialRotorBlades.current?.outer ?? 0,
      innerBlades: initialRotorBlades.current?.inner ?? 0,
    })
    const toggle = (): void => setUnit(current => {
      const next = current === 'gal/h' ? 'lb/h' : 'gal/h'
      try { window.localStorage.setItem(FLOW_UNIT_PREFERENCE_KEY, next) } catch { /* This visit only. */ }
      return next
    })
    created.flow.addEventListener('click', toggle)
    return () => {
      created.flow.removeEventListener('click', toggle)
      renderer.current?.destroy()
      renderer.current = null
      motion.current = null
      displayedSimTime.current = receivedSimTime.current = null
      hadInnerRing.current = null
      target.replaceChildren()
      summary.current = null
    }
  }, [])
  // Declared after the effect that creates the widget, so it runs after it.
  useEffect(() => { summary.current?.render(engineSummaryFromStatus(engine), unit) }, [engine, unit])
  useEffect(() => {
    const orbs = renderer.current!
    const spin = motion.current!
    const settings = engine.orbs ?? DISABLED_ORBS
    orbs.configure({ preference: settings.renderer, maxFps: settings.fps, pixelRatio: settings.pixelRatio,
      outerBlades: engine.rotorBlades?.outer ?? 0, innerBlades: engine.rotorBlades?.inner ?? 0 })
    const view = engineSummaryFromStatus(engine)
    const speeds = engineRotorSpeeds(view)
    const displayRate = engineSpoolDisplayRate(settings.turnsPerSecond, settings.fps, engine.rotorBlades)
    const hasInnerRing = speeds.inner !== null
    if (hadInnerRing.current !== null && hadInnerRing.current !== hasInnerRing) {
      spin.reset()
      displayedSimTime.current = receivedSimTime.current = null
    }
    hadInnerRing.current = hasInnerRing
    const target = view.simTimeS ?? null
    const start = displayedSimTime.current
    const previous = receivedSimTime.current
    receivedSimTime.current = target
    const drawAt = (time: number | null, now: number): void => {
      displayedSimTime.current = time
      orbs.draw(spin.update(time, speeds, displayRate), now)
    }
    const now = performance.now()
    // Smooth only the interval the host has already simulated, with at most
    // one heartbeat of display delay. Never predict future spool motion: a
    // paused, disconnected or stale host cannot leave an endless RAF running.
    const canAnimate = !paused && document.visibilityState !== 'hidden'
      && settings.fps > 0 && displayRate > 0 && settings.renderer !== 'off'
      && engine.rotorBlades !== undefined
      && (speeds.outer > 0 || (speeds.inner ?? 0) > 0)
      && target !== null && start !== null && previous !== null && target > previous && target > start
    if (!canAnimate) {
      drawAt(target, now)
      return
    }
    let frame = 0
    const tick = (timestamp: number): void => {
      const fraction = document.visibilityState === 'hidden' ? 1 : Math.min(1, Math.max(0, (timestamp - now) / HEARTBEAT_MS))
      drawAt(start + (target - start) * fraction, timestamp)
      if (fraction < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [engine, paused])
  return <section className="flight-engine phone-engine" aria-label="Engine monitor">
    <div ref={host} className="flight-engine__summary" />
  </section>
}
