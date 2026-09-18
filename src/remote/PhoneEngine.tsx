import { useEffect, useRef, useState } from 'react'
import { createEngineSummary, type EngineSummary, type FuelFlowUnit } from '../flight/hud/engineSummary'
import { engineSummaryFromStatus } from './engineSummaryFromStatus'
import type { EngineStatus } from './protocol'

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
export function PhoneEngine({ engine }: { engine: EngineStatus }) {
  const host = useRef<HTMLDivElement>(null)
  const summary = useRef<EngineSummary | null>(null)
  const [unit, setUnit] = useState(readFlowUnit)
  useEffect(() => {
    const created = createEngineSummary()
    const target = host.current!
    target.replaceChildren(created.diagram, created.values)
    summary.current = created
    const toggle = (): void => setUnit(current => {
      const next = current === 'gal/h' ? 'lb/h' : 'gal/h'
      try { window.localStorage.setItem(FLOW_UNIT_PREFERENCE_KEY, next) } catch { /* This visit only. */ }
      return next
    })
    created.flow.addEventListener('click', toggle)
    return () => {
      created.flow.removeEventListener('click', toggle)
      target.replaceChildren()
      summary.current = null
    }
  }, [])
  // Declared after the effect that creates the widget, so it runs after it.
  useEffect(() => { summary.current?.render(engineSummaryFromStatus(engine), unit) }, [engine, unit])
  return <section className="flight-engine phone-engine" aria-label="Engine monitor">
    <div ref={host} className="flight-engine__summary" />
  </section>
}
