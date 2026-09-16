import "./engineMonitor.css";
import type { FlightAudioStatus } from "../audio/createFlightAudio";
import {
  createTransitionLog, deriveEnginePhase, discoverReadableProperties, discreteEngineState, ENGINE_SECTIONS,
  formatRowValue, formatValue, readEngineSample, tankRows,
  type EnginePhaseReading, type EngineReader, type EngineRow, type EngineSample,
} from "./engineMonitorModel";

/**
 * Live engine monitor. The HUD keeps one line: phase, spools, fuel flow, thrust
 * and what sound is doing. Clicking that line opens the Engine tab, which shows
 * every engine property the model publishes, a log of each discrete change with
 * its simulation time, and what the audio core is hearing, so an odd sound can
 * be traced back to what JSBSim actually did.
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
  /** Move the detail tables into a tab host. Detach with the returned function. */
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
  const log = createTransitionLog();

  const container = element("section", "flight-engine");
  container.setAttribute("aria-label", "Engine monitor");
  const toggle = element("button", "flight-engine__summary");
  toggle.type = "button";
  toggle.title = "Open engine details";
  toggle.setAttribute("aria-expanded", "false");
  const phaseChip = element("span", "flight-engine__phase", "…");
  const summaryValues = element("span", "flight-engine__values");
  toggle.append(element("span", "flight-engine__title", "ENGINE"), phaseChip, summaryValues);
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
  let soundBody: HTMLTableSectionElement | null = null;
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

  const addTable = (parent: HTMLElement, wrap = false): HTMLTableSectionElement => {
    const table = element("table", wrap ? "flight-engine__table flight-engine__table--wrap" : "flight-engine__table");
    const body = element("tbody");
    table.append(body);
    parent.append(table);
    return body;
  };

  const addRow = (body: HTMLTableSectionElement, label: string, title?: string): HTMLElement => {
    const row = element("tr");
    const name = element("td", "flight-engine__label", label);
    if (title) name.title = title;
    const value = element("td", "flight-engine__value", "—");
    row.append(name, value);
    body.append(row);
    return value;
  };

  const build = (): void => {
    panel.replaceChildren();
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
        const body = addTable(addSection(spec.id, spec.title));
        for (const row of rows) rowCells.push({ row, cell: addRow(body, row.label, row.path) });
      }
    }
    if (options.soundStatus) soundBody = addTable(addSection("sound", "Sound: what the audio core hears"), true);

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
      const body = addTable(allSection);
      let group = "";
      for (const path of properties) {
        const parent = path.slice(0, path.lastIndexOf("/"));
        if (parent !== group) {
          group = parent;
          const header = element("tr", "flight-engine__group");
          const cell = element("th", undefined, parent);
          cell.colSpan = 2;
          header.append(cell);
          body.append(header);
        }
        allCells.push({ path, cell: addRow(body, path.slice(path.lastIndexOf("/") + 1), path) });
      }
    }
  };

  const summarize = (sample: EngineSample, phase: EnginePhaseReading, status: FlightAudioStatus | null): void => {
    phaseChip.textContent = phase.label;
    phaseChip.dataset.phase = phase.phase;
    const parts: string[] = [];
    if (sample.n1Pct !== null) parts.push(`N1 ${sample.n1Pct.toFixed(1)}%`);
    if (sample.n2Pct !== null) parts.push(`N2 ${sample.n2Pct.toFixed(1)}%`);
    if (sample.n1Pct === null && sample.rpm !== null) parts.push(`RPM ${sample.rpm.toFixed(0)}`);
    if (sample.fuelFlowPps !== null) parts.push(`FF ${Math.round(sample.fuelFlowPps * 3600)} lb/h`);
    if (sample.thrustLbf !== null) parts.push(`THR ${Math.round(sample.thrustLbf)} lbf`);
    if (status) parts.push(`SND ${status.mode === "off" ? "off" : status.effective}${status.held ? " held" : ""}`);
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
    summarize(sample, phase, status);
    if (!panel.isConnected) return;
    if (detailLine) {
      detailLine.textContent = `${phase.label}${phase.derived ? " (derived from JSBSim's turbine rules)" : ""}: ${phase.detail}`;
    }
    for (const { row, cell } of rowCells) cell.textContent = formatRowValue(row, reader.getPropertyValue(row.path));
    if (soundBody) {
      soundBody.replaceChildren();
      for (const [label, value] of soundRows(status)) addRow(soundBody, label).textContent = value;
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
  return handle;
}
