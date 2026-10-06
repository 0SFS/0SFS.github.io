import type { EngineReading } from "../hud/engineMonitor";
import type { EngineControlReading } from "../jsbsim/engineControl";
import type { EngineStatus } from "../../remote/protocol";

/** JSBSim publishes mass flow per second; both HUD and phone read it per hour. */
const SECONDS_PER_HOUR = 3600;

/**
 * The HUD's engine widget, reduced to what a status frame carries: the phase
 * label plus every number the widget draws. A value the flight model does not
 * publish stays absent rather than becoming a zero the phone would print as a
 * reading.
 *
 * Rounded here, not on the phone: these travel 20 times a second, and a spool
 * speed to a tenth of a percent is already finer than the chip can show.
 */
export function toEngineStatus(reading: EngineReading | null, control?: EngineControlReading): EngineStatus | undefined {
  if (!reading) return undefined;
  const { sample, phase } = reading;
  const round = (value: number | null, places = 0): number | undefined => {
    if (value === null || !Number.isFinite(value)) return undefined;
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
  };
  const positive = (value: number | null | undefined): number | undefined => {
    const rounded = round(value ?? null, 3);
    return rounded !== undefined && rounded > 0 ? rounded : undefined;
  };
  return {
    phase: phase.label,
    kind: sample.kind ?? undefined,
    rotorBlades: sample.rotorBlades,
    simTimeS: round(sample.simTimeS, 4),
    maxN1: positive(sample.maxN1Pct),
    maxN2: positive(sample.maxN2Pct),
    maxRpm: positive(sample.maxRpm),
    orbs: reading.orbSettings,
    n1: round(sample.n1Pct, 1),
    n2: round(sample.n2Pct, 1),
    rpm: round(sample.rpm),
    thrustLbf: round(sample.thrustLbf),
    fuelFlowPph: round(sample.fuelFlowPps === null ? null : sample.fuelFlowPps * SECONDS_PER_HOUR),
    fuelFlowGph: round(sample.fuelFlowGph, 1),
    // What the phone's throttle lever lets the pilot do; see throttleLever.ts.
    ...(control ? {
      state: control.state,
      start: Math.round(control.startProgress * 100) / 100,
      ...(control.blocked ? { blocked: control.blocked } : {}),
    } : {}),
  };
}
