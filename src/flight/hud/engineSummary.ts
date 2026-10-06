import "./engineMonitor.css";
import type { EngineKind, EnginePhase, EnginePhaseReading, EngineSample } from "./engineMonitorModel";
import type { EngineRotorBladeCounts } from "../aircraft/engineRotorDefinitions";
import type { EngineSpoolMotionStatus } from "./engineSpoolRenderer";

/**
 * The engine monitor's compact face — fuel flow, turbine N1/N2 and thrust or
 * one piston RPM ring, and the phase — as a piece of DOM with no model behind it.
 * The desktop HUD feeds it from JSBSim through the monitor; the phone
 * controller feeds it from a status frame. One widget, one stylesheet, so the
 * two screens cannot drift into showing the engine two different ways.
 */

export type FuelFlowUnit = "lb/h" | "gal/h";

/** What the summary draws. `null` is "the model does not publish this", never zero. */
export interface EngineSummaryView {
  kind?: EngineKind | null;
  rotorBlades?: EngineRotorBladeCounts;
  /** This screen's last submitted animation cadence and adaptive visual speed. */
  rotorMotionDescription?: string;
  simTimeS?: number | null;
  maxN1Pct?: number | null;
  maxN2Pct?: number | null;
  maxRpm?: number | null;
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
  /** Additional values when an engine type is not known. */
  values: HTMLElement;
  /** The fuel flow readout. The host decides what a tap on it does. */
  flow: HTMLElement;
  /** Ring host for the GPU orb renderer; numeric DOM remains independent of it. */
  spools: HTMLElement;
  render(view: EngineSummaryView, flowUnit: FuelFlowUnit): void;
}

/** JSBSim publishes mass flow per second; the summary reads it per hour. */
const SECONDS_PER_HOUR = 3600;
/** Used only when JSBSim has mass flow but no volume flow. */
const LB_PER_US_GAL = 6.7;

export function engineSummaryView(sample: EngineSample, phase: EnginePhaseReading): EngineSummaryView {
  return {
    kind: sample.kind,
    rotorBlades: sample.rotorBlades,
    simTimeS: sample.simTimeS,
    maxN1Pct: sample.maxN1Pct,
    maxN2Pct: sample.maxN2Pct,
    maxRpm: sample.maxRpm,
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

function summaryKind(view: EngineSummaryView): EngineKind | null {
  return view.kind ?? (view.rpm !== null ? "piston"
    : view.n1Pct !== null || view.n2Pct !== null ? "turbine" : null);
}

/** One visible marker per blade in a representative rotating row, never a stage total. */
export function engineRotorDescription(view: EngineSummaryView): string {
  const blades = view.rotorBlades;
  if (!blades) return "Blade counts unavailable; numeric readouts only.";
  const count = (value: number, estimated: boolean): string => `${value}${estimated ? " (estimated)" : ""}`;
  if (summaryKind(view) === "piston") {
    return `One marker per propeller blade: ${count(blades.outer, blades.outerEstimated)}.`;
  }
  return `One marker per blade: N1 fan row ${count(blades.outer, blades.outerEstimated)}`
    + (blades.inner === null ? "." : `; N2 core compressor rotor ${count(blades.inner, blades.innerEstimated)}.`)
    + " Each count represents a single rotor, not all stages.";
}

export function engineRotorMotionDescription(status: EngineSpoolMotionStatus, maxPatternStep: number): string {
  const pattern = "Two opposite brightness hotspots rotate with each shaft. Individual blades can still appear to reverse.";
  if (status.fps === null || status.maxTurnsPerSecond === null) return `${pattern} Waiting for shaft animation cadence.`;
  return `${pattern} Last motion cadence ${status.fps.toFixed(0)} frames/s; full-scale display speed ${status.maxTurnsPerSecond.toFixed(2)} rev/s.`
    + (status.limited ? ` Limited to ${maxPatternStep.toFixed(2)} pattern pitch per drawn frame to preserve the hotspots' forward motion.`
      : " Within the requested speed ceiling and pattern-step limit.");
}

/**
 * A shared maximum for both turbine percentages preserves their displayed
 * ratio. JSBSim's percentages do not provide physical shaft RPM, so the
 * visualization describes the model's percent speed, not true N1:N2 RPM.
 * Without a valid native limit the ring stays still rather than inventing it.
 */
export function engineRotorSpeeds(view: EngineSummaryView): { outer: number; inner: number | null } {
  const ratio = (value: number | null, maximum: number | null | undefined): number =>
    value !== null && Number.isFinite(value) && maximum != null && Number.isFinite(maximum) && maximum > 0
      ? Math.min(1, Math.max(0, value / maximum)) : 0;
  const kind = summaryKind(view);
  if (kind === "piston") return { outer: ratio(view.rpm, view.maxRpm), inner: null };
  if (kind !== "turbine") return { outer: 0, inner: null };
  const { maxN1Pct, maxN2Pct } = view;
  const maximum = maxN1Pct != null && Number.isFinite(maxN1Pct) && maxN1Pct > 0
    && maxN2Pct != null && Number.isFinite(maxN2Pct) && maxN2Pct > 0
    ? Math.max(maxN1Pct, maxN2Pct) : null;
  return { outer: ratio(view.n1Pct, maximum), inner: ratio(view.n2Pct, maximum) };
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
  const transform = `translate(-50%, -50%) rotate(${angleDeg}deg) translateY(${-radiusPx}px) rotate(${-angleDeg}deg)`;
  if (node.style.transform !== transform) node.style.transform = transform;
}

/** Keep unchanged readouts independent of the orb canvas's animation cadence. */
function updateText(node: HTMLElement, text: string): boolean {
  if (node.textContent === text) return false;
  node.textContent = text;
  return true;
}

function updateHidden(node: HTMLElement, hidden: boolean): void {
  if (node.hidden !== hidden) node.hidden = hidden;
}

function updateTitle(node: HTMLElement, title: string): void {
  if (node.title !== title) node.title = title;
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
  const rpmCore = element("span", "flight-engine__rpm");
  const rpmValue = element("span", "flight-engine__spool-value", "—");
  rpmCore.append(rpmValue, element("span", "flight-engine__spool-label", "RPM"));
  rpmCore.hidden = true;
  n1Ring.append(rpmCore);
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
    spools,
    render(view, unit) {
      updateText(phaseChip, view.label);
      if (view.phase === null) {
        if (phaseChip.dataset.phase !== undefined) delete phaseChip.dataset.phase;
      } else if (phaseChip.dataset.phase !== view.phase) phaseChip.dataset.phase = view.phase;
      const kind = summaryKind(view);
      const turbine = kind === "turbine";
      const piston = kind === "piston";
      updateHidden(spools, kind === null);
      if (spools.dataset.kind !== (kind ?? "unknown")) spools.dataset.kind = kind ?? "unknown";
      updateHidden(n1Readout, !turbine);
      updateHidden(n2Core, !turbine);
      updateHidden(thrustReadout, !turbine);
      updateHidden(rpmCore, !piston);
      if (turbine) {
        const n1Changed = updateText(n1Value, view.n1Pct === null ? "—" : formatSpoolPct(view.n1Pct));
        updateText(n2Value, view.n2Pct === null ? "—" : formatSpoolPct(view.n2Pct));
        const thrustChanged = updateText(thrustValue, view.thrustLbf === null ? "0000" : formatThrustLbf(view.thrustLbf));
        updateTitle(spools, `N1 ${n1Value.textContent}% · N2 ${n2Value.textContent}%`
          + (view.thrustLbf === null ? "" : ` · thrust ${Math.round(view.thrustLbf)} lbf`)
          + " · Orb motion: scaled model percent speed, not physical shaft RPM. " + engineRotorDescription(view)
          + (view.rotorMotionDescription ? ` ${view.rotorMotionDescription}` : ""));
        if (n1Changed || thrustChanged) spoolRingPacked = false;
        packSpoolRingOnce();
      } else if (piston) {
        updateText(rpmValue, view.rpm === null ? "—" : Math.round(view.rpm).toString());
        updateTitle(spools, `${rpmValue.textContent} RPM · Orb motion: scaled shaft speed`
          + (view.maxRpm != null && view.maxRpm > 0 ? `, maximum ${view.maxRpm} RPM.` : ", maximum unavailable.")
          + " " + engineRotorDescription(view)
          + (view.rotorMotionDescription ? ` ${view.rotorMotionDescription}` : ""));
      }
      const hasFlow = view.fuelFlowPph !== null || view.fuelFlowGph !== null;
      updateHidden(flow, !hasFlow);
      if (hasFlow) {
        if (unit === "gal/h") {
          const gph = view.fuelFlowGph ?? (view.fuelFlowPph !== null ? view.fuelFlowPph / LB_PER_US_GAL : 0);
          updateText(flowValue, padFuelFlow(gph));
          updateText(flowUnit, "gal/h");
        } else {
          const pph = view.fuelFlowPph ?? (view.fuelFlowGph !== null ? view.fuelFlowGph * LB_PER_US_GAL : 0);
          updateText(flowValue, padFuelFlow(pph));
          updateText(flowUnit, "lb/h");
        }
      }
      const parts: string[] = [];
      if (kind === null && view.thrustLbf !== null) parts.push(`THR ${Math.round(view.thrustLbf)} lbf`);
      updateHidden(values, parts.length === 0);
      updateText(values, parts.join("  "));
    },
  };
}
