import "./engineMonitor.css";
import type { FlightAudioStatus } from "../audio/createFlightAudio";
import {
  createTransitionLog, deriveEnginePhase, discoverReadableProperties, discreteEngineState, ENGINE_SECTIONS,
  formatRowValue, formatValue, readEngineSample, tankRows,
  type EnginePhaseReading, type EngineReader, type EngineRow, type EngineSample,
} from "./engineMonitorModel";
import { createEngineSummary, engineSummaryView, type FuelFlowUnit } from "./engineSummary";
import { flightParameterDefaults, type FlightParameterStore } from "../settings/flightParameters";

export { closestUprightRingAngle } from "./engineSummary";

/**
 * Live engine monitor. The HUD keeps a compact spool diagram (N1 around N2)
 * plus fuel flow. Clicking it opens the Engine tab, which shows every
 * engine property the model publishes, a log of each discrete change with its
 * simulation time, and what the audio core is hearing.
 */

export interface EngineMonitorOptions {
  soundStatus?: () => FlightAudioStatus | null;
  /** Remembers which detail sections are open: the panel's memory, not a setting. Defaults to localStorage. */
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  /** Holds osfs.engineMonitor.fuelFlowUnit. The catalogue's defaults, in memory, when absent. */
  parameters?: FlightParameterStore;
  now?: () => number;
  /** DOM refresh period. The transition log still samples on every update. */
  refreshIntervalMs?: number;
  /** Opens the Engine tab. The HUD line never expands in place. */
  onOpen?: () => void;
}

/** The latest reading, for a second surface that shows the engine — the phone controller. */
export interface EngineReading { sample: EngineSample; phase: EnginePhaseReading }

export interface EngineMonitorHandle {
  /** Call every rendered frame; readings are cheap and the DOM refreshes at `refreshIntervalMs`. */
  update(reader: EngineReader): void;
  /** What `update` last read, or null before the first frame. Never re-reads the model. */
  getReading(): EngineReading | null;
  /** Move the detail view into a tab host. Detach with the returned function. */
  attachDetails(host: HTMLElement): () => void;
  destroy(): void;
}

const STORAGE_KEY = "osfs.engineMonitor.v1";
/** Sections closed until opened; everything else starts open. */
const CLOSED_BY_DEFAULT: ReadonlySet<string> = new Set(["all"]);

interface Layout { open: Record<string, boolean> }

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
    return { open };
  } catch {
    return { open: {} };
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

let instanceCount = 0;

export function createEngineMonitor(root: HTMLElement, options: EngineMonitorOptions = {}): EngineMonitorHandle {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const now = options.now ?? (() => performance.now());
  const refreshMs = options.refreshIntervalMs ?? 100;
  const layout = readLayout(storage);
  const parameters = options.parameters ?? flightParameterDefaults();
  const flowUnit = (): FuelFlowUnit => parameters.get("osfs.engineMonitor.fuelFlowUnit");
  const log = createTransitionLog();

  const container = element("section", "flight-engine");
  container.setAttribute("aria-label", "Engine monitor");
  const toggle = element("button", "flight-engine__summary");
  toggle.type = "button";
  toggle.title = "Open engine details";
  toggle.setAttribute("aria-expanded", "false");
  const summary = createEngineSummary();
  toggle.append(summary.diagram, summary.values);
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
    try { storage?.setItem(STORAGE_KEY, JSON.stringify({ open: layout.open })); } catch { /* A convenience only. */ }
  };

  const refreshNow = (): void => {
    lastRender = Number.NEGATIVE_INFINITY;
    if (lastReader) handle.update(lastReader);
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
    summary.render(engineSummaryView(sample, phase), flowUnit());
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

  let reading: EngineReading | null = null;
  const handle: EngineMonitorHandle = {
    getReading: () => reading,
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
      reading = { sample, phase };
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
      stopFlowUnit();
      reading = null;
      detachDetails();
      container.remove();
    },
  };
  // The HUD click and the Engine tab both change the unit; either redraws at once.
  const stopFlowUnit = parameters.watch("osfs.engineMonitor.fuelFlowUnit", refreshNow);

  toggle.addEventListener("click", () => { if (!destroyed) options.onOpen?.(); });
  summary.flow.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    parameters.set("osfs.engineMonitor.fuelFlowUnit", flowUnit() === "gal/h" ? "lb/h" : "gal/h");
  });
  return handle;
}
