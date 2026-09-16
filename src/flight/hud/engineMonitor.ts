import "./engineMonitor.css";
import type { FlightAudioStatus } from "../audio/createFlightAudio";
import {
  createTransitionLog, deriveEnginePhase, discoverReadableProperties, discreteEngineState, ENGINE_SECTIONS,
  formatRowValue, formatValue, readEngineSample, tankRows,
  type EnginePhaseReading, type EngineReader, type EngineRow, type EngineSample,
} from "./engineMonitorModel";

/**
 * Live engine monitor. The HUD keeps a compact spool diagram (N1 around N2)
 * plus fuel flow. Clicking it opens the Engine tab, which shows every
 * engine property the model publishes, a log of each discrete change with its
 * simulation time, and what the audio core is hearing.
 */

export interface EngineMonitorOptions {
  soundStatus?: () => FlightAudioStatus | null;
  /** Remembers which detail sections are open. Defaults to localStorage. */
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  now?: () => number;
  /** DOM refresh period. The transition log still samples on every update. */
  refreshIntervalMs?: number;
  /** Opens the Engine tab. The HUD line never expands in place. */
  onOpen?: () => void;
}

export interface EngineMonitorHandle {
  /** Call every rendered frame; readings are cheap and the DOM refreshes at `refreshIntervalMs`. */
  update(reader: EngineReader): void;
  /** Move the detail view into a tab host. Detach with the returned function. */
  attachDetails(host: HTMLElement): () => void;
  destroy(): void;
}

const STORAGE_KEY = "osfs.engineMonitor.v1";
/** Sections closed until opened; everything else starts open. */
const CLOSED_BY_DEFAULT: ReadonlySet<string> = new Set(["all"]);

interface Layout { open: Record<string, boolean>; flowUnit: "lb/h" | "gal/h" }

function defaultStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try { return window.localStorage; } catch { return null; }
}

function readLayout(storage: Pick<Storage, "getItem" | "setItem"> | null): Layout {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null") as Partial<Layout> | null;
    const open: Record<string, boolean> = {};
    if (parsed?.open && typeof parsed.open === "object") {
      for (const [id, value] of Object.entries(parsed.open)) if (typeof value === "boolean") open[id] = value;
    }
    return { open, flowUnit: parsed?.flowUnit === "gal/h" ? "gal/h" : "lb/h" };
  } catch {
    return { open: {}, flowUnit: "lb/h" };
  }
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

/** Used only when JSBSim has mass flow but no volume flow. */
const LB_PER_US_GAL = 6.7;

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

let instanceCount = 0;

export function createEngineMonitor(root: HTMLElement, options: EngineMonitorOptions = {}): EngineMonitorHandle {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const now = options.now ?? (() => performance.now());
  const refreshMs = options.refreshIntervalMs ?? 100;
  const layout = readLayout(storage);
  const log = createTransitionLog();

  const container = element("section", "flight-engine");
  container.setAttribute("aria-label", "Engine monitor");
  const toggle = element("button", "flight-engine__summary");
  toggle.type = "button";
  toggle.title = "Open engine details";
  toggle.setAttribute("aria-expanded", "false");
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
  const summaryValues = element("span", "flight-engine__values");
  toggle.append(diagram, summaryValues);
  const panel = element("div", "flight-engine__details");
  panel.id = `flight-engine-details-${++instanceCount}`;
  toggle.setAttribute("aria-controls", panel.id);
  panel.append(element("p", "flight-engine__muted", "Waiting for the flight model…"));
  container.append(toggle);
  root.appendChild(container);

  let detailsHost: HTMLElement | null = null;
  let destroyed = false;
  let lastReader: EngineReader | null = null;
  let available: Set<string> | null = null;
  let properties: string[] = [];
  let lastRender = Number.NEGATIVE_INFINITY;
  let logDirty = true;
  let detailLine: HTMLElement | null = null;
  let soundGrid: HTMLElement | null = null;
  let logList: HTMLOListElement | null = null;
  let allSection: HTMLDetailsElement | null = null;
  const rowCells: { row: EngineRow; cell: HTMLElement }[] = [];
  const allCells: { path: string; cell: HTMLElement }[] = [];

  const save = (): void => {
    try { storage?.setItem(STORAGE_KEY, JSON.stringify({ open: layout.open, flowUnit: layout.flowUnit })); } catch { /* A convenience only. */ }
  };

  const refreshNow = (): void => {
    lastRender = Number.NEGATIVE_INFINITY;
    if (lastReader) handle.update(lastReader);
  };

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

  const detachDetails = (): void => {
    if (!detailsHost) return;
    panel.remove();
    detailsHost = null;
    toggle.setAttribute("aria-expanded", "false");
  };

  const addSection = (id: string, title: string): HTMLDetailsElement => {
    const details = element("details", "flight-engine__section");
    details.dataset.section = id;
    details.open = layout.open[id] ?? !CLOSED_BY_DEFAULT.has(id);
    details.append(element("summary", undefined, title));
    details.addEventListener("toggle", () => {
      layout.open[id] = details.open;
      save();
      refreshNow();
    });
    panel.append(details);
    return details;
  };

  const addGrid = (parent: HTMLElement): HTMLElement => {
    const grid = element("div", "flight-engine__grid");
    parent.append(grid);
    return grid;
  };

  const addPair = (grid: HTMLElement, label: string, title?: string, wide = false): HTMLElement => {
    const pair = element("span", wide ? "flight-engine__pair flight-engine__pair--wide" : "flight-engine__pair");
    const name = element("span", "flight-engine__label", label);
    if (title) name.title = title;
    const value = element("span", "flight-engine__value", "—");
    pair.append(name, value);
    grid.append(pair);
    return value;
  };

  const build = (): void => {
    panel.replaceChildren();
    rowCells.length = 0;
    allCells.length = 0;
    if (properties.length === 0) {
      panel.append(element("p", "flight-engine__muted", "This flight model publishes no engine properties."));
    } else {
      detailLine = element("p", "flight-engine__detail");
      panel.append(detailLine);
      for (const spec of ENGINE_SECTIONS) {
        const rows = [
          ...spec.rows.filter((row) => available!.has(row.path)),
          ...(spec.id === "fuel" ? tankRows(properties) : []),
        ];
        if (rows.length === 0) continue;
        const grid = addGrid(addSection(spec.id, spec.title));
        for (const row of rows) rowCells.push({ row, cell: addPair(grid, row.label, row.path) });
      }
    }
    if (options.soundStatus) soundGrid = addGrid(addSection("sound", "Sound: what the audio core hears"));

    const logSection = addSection("log", "Transitions, newest first");
    const clear = element("button", "flight-engine__button", "Clear");
    clear.type = "button";
    clear.addEventListener("click", () => {
      log.clear();
      logDirty = true;
      refreshNow();
    });
    logList = element("ol", "flight-engine__log");
    logSection.append(clear, logList);

    if (properties.length > 0) {
      allSection = addSection("all", `All engine properties (${properties.length})`);
      const grid = addGrid(allSection);
      let group = "";
      for (const path of properties) {
        const parent = path.slice(0, path.lastIndexOf("/"));
        if (parent !== group) {
          group = parent;
          grid.append(element("span", "flight-engine__group", parent));
        }
        allCells.push({ path, cell: addPair(grid, path.slice(path.lastIndexOf("/") + 1), path) });
      }
    }
  };

  const summarize = (sample: EngineSample, phase: EnginePhaseReading): void => {
    phaseChip.textContent = phase.label;
    phaseChip.dataset.phase = phase.phase;
    const turbine = sample.n1Pct !== null && sample.n2Pct !== null;
    spools.hidden = !turbine;
    if (turbine) {
      n1Value.textContent = formatSpoolPct(sample.n1Pct!);
      n2Value.textContent = formatSpoolPct(sample.n2Pct!);
      thrustValue.textContent = sample.thrustLbf === null ? "0000" : formatThrustLbf(sample.thrustLbf);
      spools.title = `N1 ${formatSpoolPct(sample.n1Pct!)}% · N2 ${formatSpoolPct(sample.n2Pct!)}%`
        + (sample.thrustLbf === null ? "" : ` · thrust ${Math.round(sample.thrustLbf)} lbf`);
      packSpoolRingOnce();
    }
    const hasFlow = sample.fuelFlowPps !== null || sample.fuelFlowGph !== null;
    flow.hidden = !hasFlow;
    if (hasFlow) {
      if (layout.flowUnit === "gal/h") {
        const gph = sample.fuelFlowGph ?? (sample.fuelFlowPps !== null ? sample.fuelFlowPps * 3600 / LB_PER_US_GAL : 0);
        flowValue.textContent = padFuelFlow(gph);
        flowUnit.textContent = "gal/h";
      } else {
        const pph = sample.fuelFlowPps !== null
          ? sample.fuelFlowPps * 3600
          : (sample.fuelFlowGph !== null ? sample.fuelFlowGph * LB_PER_US_GAL : 0);
        flowValue.textContent = padFuelFlow(pph);
        flowUnit.textContent = "lb/h";
      }
    }
    const parts: string[] = [];
    if (!turbine && sample.rpm !== null) parts.push(`RPM ${sample.rpm.toFixed(0)}`);
    if (!turbine && sample.thrustLbf !== null) parts.push(`THR ${Math.round(sample.thrustLbf)} lbf`);
    summaryValues.hidden = parts.length === 0;
    summaryValues.textContent = parts.join("  ");
  };

  const soundRows = (status: FlightAudioStatus | null): [string, string][] => {
    if (!status) return [["Sound", "n/a"]];
    const percent = (value: number): string => Number.isFinite(value) ? `${value.toFixed(1)}%` : "n/a";
    const heard = status.engine;
    const rows: [string, string][] = [
      ["Mode", status.mode],
      ["Quality", `requested ${status.requested} · effective ${status.effective}`
        + (status.allowUnvalidated ? " · unvalidated allowed" : "")],
      ["Held", status.held ? "yes" : "no"],
      ["Autoplay lock", status.gestureLocked ? "waiting for a click or key" : "no"],
      ["Engine as heard", heard
        ? `N1 ${percent(heard.n1Pct)} · N2 ${percent(heard.n2Pct)} · ${heard.combustion ? "burning" : "not burning"}`
          + ` · running ${heard.running ? "1" : "0"}`
        : "not receiving (engine sound is off, starting or this aircraft has none)"],
      ["Combustion rule", status.telemetry ? status.telemetry.combustionSource : "no engine adapter"],
    ];
    if (status.telemetry && status.telemetry.missing.length > 0) {
      rows.push(["Not published", status.telemetry.missing.join(", ")]);
    }
    rows.push(["Timeline", status.core
      ? `epoch ${status.core.epoch} · resyncs ${status.core.resyncs} · stale fades ${status.core.staleFades}`
        + ` · dropped ${status.core.snapshotsDropped} snapshots, ${status.core.eventsDropped} events`
      : "n/a until the audio worklet reports"]);
    if (status.message) rows.push(["Message", status.message]);
    rows.push(["Stats", status.stats]);
    return rows;
  };

  const render = (
    reader: EngineReader, sample: EngineSample, phase: EnginePhaseReading, status: FlightAudioStatus | null,
  ): void => {
    summarize(sample, phase);
    if (!panel.isConnected) return;
    if (detailLine) {
      detailLine.textContent = `${phase.label}${phase.derived ? " (derived from JSBSim's turbine rules)" : ""}: ${phase.detail}`;
    }
    for (const { row, cell } of rowCells) cell.textContent = formatRowValue(row, reader.getPropertyValue(row.path));
    if (soundGrid) {
      soundGrid.replaceChildren();
      for (const [label, value] of soundRows(status)) {
        const wide = value.length > 24;
        addPair(soundGrid, label, undefined, wide).textContent = value;
      }
    }
    if (logList && logDirty) {
      logDirty = false;
      const entries = log.entries();
      logList.replaceChildren(...(entries.length === 0
        ? [element("li", "flight-engine__muted", "No transitions yet.")]
        : entries.map((entry) => element("li", undefined,
          `${entry.simTimeS === null ? "t=?" : `t=${entry.simTimeS.toFixed(2)}s`}  ${entry.text}`))));
    }
    // The full list is read only while someone is looking at it.
    if (allSection?.open) for (const { path, cell } of allCells) cell.textContent = formatValue(reader.getPropertyValue(path));
  };

  const handle: EngineMonitorHandle = {
    update(reader) {
      if (destroyed) return;
      lastReader = reader;
      if (!available) {
        properties = discoverReadableProperties(reader);
        available = new Set(properties);
        build();
      }
      const sample = readEngineSample(reader, available);
      const phase = deriveEnginePhase(sample);
      const state = discreteEngineState(sample, phase);
      const time = now();
      const due = time - lastRender >= refreshMs;
      const status = due ? options.soundStatus?.() ?? null : null;
      if (status) {
        state["sound mode"] = status.mode;
        state["sound tier"] = status.effective;
        state["sound held"] = status.held ? "yes" : "no";
        if (status.core) {
          state["sound epoch"] = String(status.core.epoch);
          state["sound resyncs"] = String(status.core.resyncs);
          state["sound stale fades"] = String(status.core.staleFades);
        }
      }
      if (log.observe(sample.simTimeS, state)) logDirty = true;
      if (!due) return;
      lastRender = time;
      render(reader, sample, phase, status);
    },
    attachDetails(host) {
      if (destroyed) return () => {};
      if (detailsHost === host) {
        return () => { if (detailsHost === host) detachDetails(); };
      }
      detachDetails();
      detailsHost = host;
      host.append(panel);
      toggle.setAttribute("aria-expanded", "true");
      logDirty = true;
      refreshNow();
      return () => { if (detailsHost === host) detachDetails(); };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      detachDetails();
      container.remove();
    },
  };

  toggle.addEventListener("click", () => { if (!destroyed) options.onOpen?.(); });
  flow.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    layout.flowUnit = layout.flowUnit === "gal/h" ? "lb/h" : "gal/h";
    save();
    refreshNow();
  });
  return handle;
}
