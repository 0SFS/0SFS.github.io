import "./engineMonitor.css";
import type { EnginePhase, EnginePhaseReading, EngineSample } from "./engineMonitorModel";

/**
 * The engine monitor's compact face — fuel flow, the N1 ring around the N2
 * core with thrust, and the phase — as a piece of DOM with no model behind it.
 * The desktop HUD feeds it from JSBSim through the monitor; the phone
 * controller feeds it from a status frame. One widget, one stylesheet, so the
 * two screens cannot drift into showing the engine two different ways.
 */

export type FuelFlowUnit = "lb/h" | "gal/h";

/** What the summary draws. `null` is "the model does not publish this", never zero. */
export interface EngineSummaryView {
  /** Drives the phase colour. Null for a label this build does not know, which stays neutral. */
  phase: EnginePhase | null;
  label: string;
  n1Pct: number | null;
  n2Pct: number | null;
  rpm: number | null;
  thrustLbf: number | null;
  fuelFlowPph: number | null;
  fuelFlowGph: number | null;
}

export interface EngineSummary {
  /** Fuel flow over the spool ring over the phase. */
  diagram: HTMLElement;
  /** The piston engine's RPM and thrust line, beside the diagram. */
  values: HTMLElement;
  /** The fuel flow readout. The host decides what a tap on it does. */
  flow: HTMLElement;
  render(view: EngineSummaryView, flowUnit: FuelFlowUnit): void;
}

/** JSBSim publishes mass flow per second; the summary reads it per hour. */
const SECONDS_PER_HOUR = 3600;
/** Used only when JSBSim has mass flow but no volume flow. */
const LB_PER_US_GAL = 6.7;

export function engineSummaryView(sample: EngineSample, phase: EnginePhaseReading): EngineSummaryView {
  return {
    phase: phase.phase,
    label: phase.label,
    n1Pct: sample.n1Pct,
    n2Pct: sample.n2Pct,
    rpm: sample.rpm,
    thrustLbf: sample.thrustLbf,
    fuelFlowPph: sample.fuelFlowPps === null ? null : sample.fuelFlowPps * SECONDS_PER_HOUR,
    fuelFlowGph: sample.fuelFlowGph,
  };
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatSpoolPct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded === 100 ? "100" : rounded.toFixed(1);
}

function formatThrustLbf(value: number): string {
  return Math.round(Math.abs(value)).toString().padStart(4, "0");
}

function padFuelFlow(value: number): string {
  return Math.round(Math.abs(value)).toString().padStart(4, "0");
}

const SPOOL_RING_FRAC = 0.39;
const SPOOL_N1_VALUE_ANGLE = 180;
const SPOOL_THRUST_VALUE_ANGLE = 0;
const SPOOL_RING_PAD_PX = 2;

function ringCenter(radius: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: radius * Math.sin(rad), y: -radius * Math.cos(rad) };
}

function uprightBoxesOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
  pad: number,
): boolean {
  return Math.abs(ax - bx) < (aw + bw) / 2 + pad && Math.abs(ay - by) < (ah + bh) / 2 + pad;
}

/** Smallest angle from `fromDeg` along `dir` where an upright mark on the ring clears the value. */
export function closestUprightRingAngle(
  radius: number,
  value: { w: number; h: number },
  mark: { w: number; h: number },
  fromDeg: number,
  dir: 1 | -1,
  pad = SPOOL_RING_PAD_PX,
): number {
  const origin = ringCenter(radius, fromDeg);
  let lo = 0;
  let hi = 80;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const point = ringCenter(radius, fromDeg + dir * mid);
    if (uprightBoxesOverlap(origin.x, origin.y, value.w, value.h, point.x, point.y, mark.w, mark.h, pad)) lo = mid;
    else hi = mid;
  }
  return fromDeg + dir * hi;
}

function placeOnRing(node: HTMLElement, radiusPx: number, angleDeg: number): void {
  node.style.transform =
    `translate(-50%, -50%) rotate(${angleDeg}deg) translateY(${-radiusPx}px) rotate(${-angleDeg}deg)`;
}

function ringRadiusPx(spools: HTMLElement): number {
  const measured = spools.clientWidth * SPOOL_RING_FRAC;
  if (measured > 0) return measured;
  const width = parseFloat(getComputedStyle(spools).width);
  if (Number.isFinite(width) && width > 0) return width * SPOOL_RING_FRAC;
  return 4.25 * 16 * SPOOL_RING_FRAC;
}

function measureBox(node: HTMLElement, fallbackFontPx: number, fallbackChars = 1): { w: number; h: number } {
  if (node.offsetWidth > 0 && node.offsetHeight > 0) {
    return { w: node.offsetWidth, h: node.offsetHeight };
  }
  const font = parseFloat(getComputedStyle(node).fontSize);
  const px = Number.isFinite(font) && font > 0 ? font : fallbackFontPx;
  const chars = Math.max(fallbackChars, (node.textContent ?? "").length || 1);
  return { w: px * 0.62 * chars, h: px * 1.15 };
}

export function createEngineSummary(): EngineSummary {
  const phaseChip = element("span", "flight-engine__phase", "…");
  const spools = element("span", "flight-engine__spools");
  spools.hidden = true;
  const n1Ring = element("span", "flight-engine__spool flight-engine__spool--n1");
  const thrustValue = element("span", "flight-engine__spool-value", "—");
  const thrustLabel = element("span", "flight-engine__spool-label", "T");
  const thrustUnit = element("span", "flight-engine__spool-unit", "lbf");
  const thrustReadout = element("span", "flight-engine__spool-thrust");
  thrustReadout.append(thrustLabel, thrustValue, thrustUnit);
  const n2Core = element("span", "flight-engine__spool flight-engine__spool--n2");
  const n2Value = element("span", "flight-engine__spool-value", "—");
  n2Core.append(
    element("span", "flight-engine__spool-label", "N2"),
    n2Value,
    element("span", "flight-engine__spool-unit", "%"),
  );
  const n1Value = element("span", "flight-engine__spool-value", "—");
  const n1Label = element("span", "flight-engine__spool-label", "N1");
  const n1Unit = element("span", "flight-engine__spool-unit", "%");
  const n1Readout = element("span", "flight-engine__spool-n1");
  n1Readout.append(n1Label, n1Value, n1Unit);
  n1Ring.append(thrustReadout, n2Core, n1Readout);
  spools.append(n1Ring);
  const diagram = element("span", "flight-engine__diagram");
  const flow = element("span", "flight-engine__flow");
  flow.hidden = true;
  flow.title = "Fuel flow. Click to switch pounds and gallons per hour.";
  const flowValue = element("span", "flight-engine__flow-value");
  const flowUnit = element("span", "flight-engine__flow-unit", "lb/h");
  flow.append(
    element("span", "flight-engine__flow-label", "⛽"),
    flowValue,
    flowUnit,
  );
  diagram.append(flow, spools, phaseChip);
  const values = element("span", "flight-engine__values");

  let spoolRingPacked = false;
  const packRingTriplet = (
    radius: number,
    valueNode: HTMLElement,
    labelNode: HTMLElement,
    unitNode: HTMLElement,
    valueAngle: number,
    labelDir: 1 | -1,
    unitDir: 1 | -1,
  ): void => {
    const value = measureBox(valueNode, 10, 4);
    placeOnRing(valueNode, radius, valueAngle);
    placeOnRing(labelNode, radius, closestUprightRingAngle(
      radius, value, measureBox(labelNode, 8), valueAngle, labelDir,
    ));
    placeOnRing(unitNode, radius, closestUprightRingAngle(
      radius, value, measureBox(unitNode, 8), valueAngle, unitDir,
    ));
  };
  const packSpoolRingOnce = (): void => {
    if (spoolRingPacked) return;
    spoolRingPacked = true;
    const radius = ringRadiusPx(spools);
    packRingTriplet(radius, n1Value, n1Label, n1Unit, SPOOL_N1_VALUE_ANGLE, 1, -1);
    packRingTriplet(radius, thrustValue, thrustLabel, thrustUnit, SPOOL_THRUST_VALUE_ANGLE, -1, 1);
  };

  return {
    diagram,
    values,
    flow,
    render(view, unit) {
      phaseChip.textContent = view.label;
      if (view.phase === null) delete phaseChip.dataset.phase;
      else phaseChip.dataset.phase = view.phase;
      const turbine = view.n1Pct !== null && view.n2Pct !== null;
      spools.hidden = !turbine;
      if (turbine) {
        n1Value.textContent = formatSpoolPct(view.n1Pct!);
        n2Value.textContent = formatSpoolPct(view.n2Pct!);
        thrustValue.textContent = view.thrustLbf === null ? "0000" : formatThrustLbf(view.thrustLbf);
        spools.title = `N1 ${formatSpoolPct(view.n1Pct!)}% · N2 ${formatSpoolPct(view.n2Pct!)}%`
          + (view.thrustLbf === null ? "" : ` · thrust ${Math.round(view.thrustLbf)} lbf`);
        packSpoolRingOnce();
      }
      const hasFlow = view.fuelFlowPph !== null || view.fuelFlowGph !== null;
      flow.hidden = !hasFlow;
      if (hasFlow) {
        if (unit === "gal/h") {
          const gph = view.fuelFlowGph ?? (view.fuelFlowPph !== null ? view.fuelFlowPph / LB_PER_US_GAL : 0);
          flowValue.textContent = padFuelFlow(gph);
          flowUnit.textContent = "gal/h";
        } else {
          const pph = view.fuelFlowPph ?? (view.fuelFlowGph !== null ? view.fuelFlowGph * LB_PER_US_GAL : 0);
          flowValue.textContent = padFuelFlow(pph);
          flowUnit.textContent = "lb/h";
        }
      }
      const parts: string[] = [];
      if (!turbine && view.rpm !== null) parts.push(`RPM ${view.rpm.toFixed(0)}`);
      if (!turbine && view.thrustLbf !== null) parts.push(`THR ${Math.round(view.thrustLbf)} lbf`);
      values.hidden = parts.length === 0;
      values.textContent = parts.join("  ");
    },
  };
}
