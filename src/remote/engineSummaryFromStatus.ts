import { ENGINE_PHASE_LABELS, type EnginePhase } from '../flight/hud/engineMonitorModel'
import type { EngineSummaryView } from '../flight/hud/engineSummary'
import type { EngineStatus } from './protocol'

const PHASE_FOR_LABEL = new Map(Object.entries(ENGINE_PHASE_LABELS).map(([phase, label]) => [label, phase as EnginePhase]))

/** A status frame, as the widget reads a JSBSim sample. Absent stays absent. */
export function engineSummaryFromStatus(engine: EngineStatus): EngineSummaryView {
  return {
    kind: engine.kind,
    rotorBlades: engine.rotorBlades,
    simTimeS: engine.simTimeS ?? null,
    maxN1Pct: engine.maxN1 ?? null,
    maxN2Pct: engine.maxN2 ?? null,
    maxRpm: engine.maxRpm ?? null,
    phase: PHASE_FOR_LABEL.get(engine.phase) ?? null,
    label: engine.phase,
    n1Pct: engine.n1 ?? null,
    n2Pct: engine.n2 ?? null,
    rpm: engine.rpm ?? null,
    thrustLbf: engine.thrustLbf ?? null,
    fuelFlowPph: engine.fuelFlowPph ?? null,
    fuelFlowGph: engine.fuelFlowGph ?? null,
  }
}
