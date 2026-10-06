import "./engineMonitor.css";
import type { FlightAudioStatus } from "../audio/createFlightAudio";
import {
  createTransitionLog, deriveEnginePhase, discoverReadableProperties, discoverThermalBalanceRows, discreteEngineState, ENGINE_SECTIONS,
  enginePropertyApplies, formatRowValue, formatValue, readEngineSample, tankRows,
  type EngineMonitorDefinition, type EnginePhaseReading, type EngineReader, type EngineRow, type EngineSample,
} from "./engineMonitorModel";
import { createEngineSummary, engineRotorDescription, engineRotorMotionDescription, engineRotorSpeeds, engineSummaryView, type EngineSummaryView, type FuelFlowUnit } from "./engineSummary";
import { flightParameterDefaults, type FlightParameterStore } from "../settings/flightParameters";
import { DEFAULT_MAX_PATTERN_STEP, engineSpoolDisplayRate } from "./engineSpoolMotion";
import { createEngineSpoolAnimation } from "./engineSpoolAnimation";
import { createEngineSpoolRenderer, type EngineSpoolRendererStatus } from "./engineSpoolRenderer";
import type { EngineOrbSettings } from "../../remote/protocol";
import { createEngineHistory, discoverEngineHistoryMetrics, engineHistoryCsv, engineHistoryPlot,
  readEngineHistoryValues, type EngineHistoryMetric } from "./engineHistory";
import type { EngineTestStandInitialState } from "../engineTestStand";

export { closestUprightRingAngle } from "./engineSummary";

/**
 * Live engine monitor. The HUD keeps a compact spool diagram (N1 around N2)
 * plus fuel flow. Clicking it opens the Engine tab, which shows every
 * engine property the model publishes, a log of each discrete change with its
 * simulation time, and what the audio core is hearing.
 */

export interface EngineMonitorOptions {
  definition?: EngineMonitorDefinition;
  gpuDevice?: GPUDevice | null;
  onOrbStatus?: (status: EngineSpoolRendererStatus) => void;
  soundStatus?: () => FlightAudioStatus | null;
  /** Shares the aircraft's cached native afterburner state and existing visual accent. */
  afterburner?: { accentColor: string; getActive(): boolean | null };
  /** Explicit same-page navigation into/out of the native engine test stand. */
  testStand?: {
    active: boolean;
    description: string;
    onChange(active: boolean): void;
    initialization?: { state: EngineTestStandInitialState; onStart(state: EngineTestStandInitialState): void };
  };
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
export interface EngineReading {
  sample: EngineSample;
  phase: EnginePhaseReading;
  orbSettings?: EngineOrbSettings;
  /** Present only while the native afterburner is confirmed active. */
  afterburnerColor?: string;
}

export interface EngineMonitorHandle {
  /** Supplies model samples; shaft animation has its own display-paced loop. DOM checks are throttled. */
  update(reader: EngineReader, held?: boolean): void;
  /** What `update` last read, or null before the first frame. Never re-reads the model. */
  getReading(): EngineReading | null;
  /** Move the detail view into a tab host. Detach with the returned function. */
  attachDetails(host: HTMLElement): () => void;
  destroy(): void;
}

const STORAGE_KEY = "osfs.engineMonitor.v1";
/** Sections closed until opened; everything else starts open. */
const CLOSED_BY_DEFAULT: ReadonlySet<string> = new Set(["all", "heat-balance"]);

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

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
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
  const historySettings = () => ({ seconds: parameters.get("osfs.engineMonitor.historySeconds"),
    hz: parameters.get("osfs.engineMonitor.historyHz") });
  const history = createEngineHistory(historySettings());

  const container = element("section", "flight-engine");
  container.setAttribute("aria-label", "Engine monitor");
  const toggle = element("button", "flight-engine__summary");
  toggle.type = "button";
  toggle.title = "Open engine details";
  toggle.setAttribute("aria-expanded", "false");
  const summary = createEngineSummary();
  const readOrbSettings = (): EngineOrbSettings => ({
    fps: parameters.get("osfs.engineMonitor.orbFps"),
    turnsPerSecond: parameters.get("osfs.engineMonitor.orbTurnsPerSecond"),
    maxPatternStep: parameters.get("osfs.engineMonitor.orbMaxPatternStep"),
    pixelRatio: parameters.get("osfs.engineMonitor.orbPixelRatio"),
    renderer: parameters.get("osfs.renderer.engineOrbs"),
  });
  let orbSettings = readOrbSettings();
  const orbs = createEngineSpoolRenderer(summary.spools, {
    device: options.gpuDevice ?? null,
    preference: orbSettings.renderer, maxFps: orbSettings.fps, pixelRatio: orbSettings.pixelRatio,
    maxPatternStep: orbSettings.maxPatternStep,
    outerBlades: options.definition?.rotorBlades?.outer ?? 0,
    innerBlades: options.definition?.rotorBlades?.inner ?? 0,
    onStatus: options.onOrbStatus,
  });
  const animation = createEngineSpoolAnimation({
    draw: (frame, time) => orbs.draw(frame, time), canDraw: () => orbs.canDraw(), now,
  });
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
  let held = false;
  let available: Set<string> | null = null;
  let properties: string[] = [];
  let lastRender = Number.NEGATIVE_INFINITY;
  let logDirty = true;
  let detailLine: HTMLElement | null = null;
  let rotorLine: HTMLElement | null = null;
  let soundGrid: HTMLElement | null = null;
  let lastSoundRows: [string, string][] | null = null;
  let logList: HTMLOListElement | null = null;
  let allSection: HTMLDetailsElement | null = null;
  let historySection: HTMLDetailsElement | null = null;
  let historyStatus: HTMLElement | null = null;
  let historyExport: HTMLButtonElement | null = null;
  let historyRendered = -1;
  let historyMetrics: EngineHistoryMetric[] = [];
  const historyPlots: { metric: EngineHistoryMetric; path: SVGPathElement; range: HTMLElement; times: HTMLElement }[] = [];
  const rowCells: { row: EngineRow; cell: HTMLElement }[] = [];
  const allCells: { path: string; cell: HTMLElement }[] = [];

  const save = (): void => {
    try { storage?.setItem(STORAGE_KEY, JSON.stringify({ open: layout.open })); } catch { /* A convenience only. */ }
  };

  const refreshNow = (): void => {
    lastRender = Number.NEGATIVE_INFINITY;
    if (lastReader) handle.update(lastReader, held);
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
    historyPlots.length = 0;
    if (options.testStand) {
      const section = addSection("test-stand", "Engine test stand");
      section.append(element("p", "flight-engine__muted", options.testStand.description));
      const controls = addGrid(section);
      const initialization = options.testStand.initialization;
      if (initialization) {
        const label = element("label", "flight-engine__pair", "Initial engine state ");
        const select = element("select");
        select.setAttribute("aria-label", "Initial engine state");
        for (const [value, text] of [["cold", "Cold-soaked and stopped"], ["running", "Already-running idle"]]) {
          const choice = element("option", undefined, text);
          choice.value = value;
          select.append(choice);
        }
        select.value = initialization.state;
        label.append(select);
        controls.append(label);
        const start = element("button", "flight-engine__button", options.testStand.active ? "Reinitialize engine" : "Open engine test stand");
        start.type = "button";
        start.title = "Reload the stand with the selected initial state. This clears its current engine heat and history.";
        start.addEventListener("click", () => {
          if (!destroyed) initialization.onStart(select.value === "running" ? "running" : "cold");
        });
        controls.append(start);
        if (options.testStand.active) section.append(element("p", "flight-engine__muted",
          initialization.state === "cold"
            ? "This run began cold-soaked and stopped. Use the normal start/stop control for a start or hot restart; reinitializing clears retained heat."
            : "This run began with an already-running idle initialization. Its initial stored heat was assigned by the native initialization; this is not a cold-start experiment."));
      }
      if (!initialization || options.testStand.active) {
        const open = element("button", "flight-engine__button",
          options.testStand.active ? "Return to flight" : "Open engine test stand");
        open.type = "button";
        open.addEventListener("click", () => { if (!destroyed) options.testStand!.onChange(!options.testStand!.active); });
        controls.append(open);
      }
    }
    if (properties.length === 0) {
      panel.append(element("p", "flight-engine__muted", "This flight model publishes no engine properties."));
    } else {
      detailLine = element("p", "flight-engine__detail");
      rotorLine = element("p", "flight-engine__muted");
      panel.append(detailLine, rotorLine);
      for (const spec of [...ENGINE_SECTIONS, { id: "heat-balance", title: "Solid heat balances",
        rows: discoverThermalBalanceRows(available!, options.definition) }]) {
        const rows = [
          ...spec.rows.filter((row) => available!.has(row.path) && enginePropertyApplies(row.path, options.definition)
            && (row.validityProperties?.every(path => available!.has(path)) ?? true)),
          ...(spec.id === "fuel" ? tankRows(properties) : []),
        ];
        if (rows.length === 0) continue;
        const grid = addGrid(addSection(spec.id, spec.title));
        for (const row of rows) rowCells.push({
          row, cell: addPair(grid, row.label, row.description ? `${row.path}\n${row.description}` : row.path),
        });
      }
    }
    historyMetrics = discoverEngineHistoryMetrics(available!, options.definition, parameters.get("osfs.engineMonitor.thermalHistory"));
    if (historyMetrics.length) {
      historySection = addSection("history", "Engine history");
      historyStatus = element("p", "flight-engine__muted");
      historySection.append(historyStatus, element("p", "flight-engine__muted",
        "Native samples against simulation time. Each trace has its own measured range; unavailable values leave gaps. Gas and metal are different temperatures."));
      const controls = addGrid(historySection);
      const clear = element("button", "flight-engine__button", "Clear history");
      clear.type = "button";
      clear.addEventListener("click", () => { history.clear(); refreshNow(); });
      historyExport = element("button", "flight-engine__button", "Download CSV");
      historyExport.type = "button";
      historyExport.addEventListener("click", () => {
        if (destroyed) return;
        const url = URL.createObjectURL(new Blob([engineHistoryCsv(historyMetrics, history.frames())], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "engine-history.csv";
        try { link.click(); } finally { URL.revokeObjectURL(url); }
      });
      controls.append(clear, historyExport);
      const plots = element("div", "flight-engine__plots");
      historySection.append(plots);
      for (const metric of historyMetrics) {
        const figure = element("figure", "flight-engine__plot");
        figure.dataset.property = metric.path;
        const caption = element("figcaption", undefined, `${metric.title}${metric.unit ? ` (${metric.unit})` : ""}`);
        caption.title = metric.description ? `${metric.path}\n${metric.description}` : metric.path;
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 300 64");
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", `${metric.title} history${metric.unit ? ` in ${metric.unit}` : ""}`);
        const path = document.createElementNS(svg.namespaceURI, "path") as SVGPathElement;
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "currentColor");
        path.setAttribute("stroke-width", "1.5");
        path.setAttribute("vector-effect", "non-scaling-stroke");
        svg.append(path);
        const range = element("p", "flight-engine__plot-range");
        const times = element("p", "flight-engine__plot-times");
        figure.append(caption, svg, range, times);
        plots.append(figure);
        historyPlots.push({ metric, path, range, times });
      }
    }
    if (options.soundStatus) {
      soundGrid = addGrid(addSection("sound", "Sound: what the audio core hears"));
      lastSoundRows = null;
    }

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

  const soundRows = (status: FlightAudioStatus | null): [string, string][] => {
    if (!status) return [["Sound", "n/a"]];
    const percent = (value: number): string => Number.isFinite(value) ? `${value.toFixed(1)}%` : "n/a";
    const heard = status.engine;
    const rows: [string, string][] = [
      ["Mode", status.mode],
      ["Quality", `requested ${status.requested} · effective ${status.effective}`],
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
    reader: EngineReader, view: EngineSummaryView, phase: EnginePhaseReading, status: FlightAudioStatus | null,
  ): void => {
    summary.render(view, flowUnit());
    if (!panel.isConnected) return;
    if (detailLine) {
      setText(detailLine, `${phase.label}${phase.derived ? " (derived from JSBSim's turbine rules)" : ""}: ${phase.detail}`);
    }
    if (rotorLine) {
      const rate = engineSpoolDisplayRate(orbSettings.turnsPerSecond, orbSettings.fps, view.rotorBlades);
      setText(rotorLine, engineRotorDescription(view)
        + ` Requested maximum: ${rate.toFixed(2)} rev/s of simulation time. ${view.rotorMotionDescription ?? ""}`);
    }
    const validity = new Map<string, boolean>();
    for (const { row, cell } of rowCells) {
      const valid = row.validityProperties?.every(path => {
        if (!validity.has(path)) {
          const value = reader.getPropertyValue(path);
          validity.set(path, Number.isFinite(value) && value > 0.5);
        }
        return validity.get(path);
      }) ?? true;
      setText(cell, formatRowValue(row, valid ? reader.getPropertyValue(row.path) : Number.NaN));
    }
    if (soundGrid) {
      const rows = soundRows(status);
      if (!lastSoundRows || rows.length !== lastSoundRows.length
        || rows.some(([label, value], index) => label !== lastSoundRows![index][0] || value !== lastSoundRows![index][1])) {
        lastSoundRows = rows;
        soundGrid.replaceChildren();
        for (const [label, value] of rows) {
          const wide = value.length > 24;
          addPair(soundGrid, label, undefined, wide).textContent = value;
        }
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
    if (allSection?.open) for (const { path, cell } of allCells) setText(cell, formatValue(reader.getPropertyValue(path)));
    if (historySection?.open && !document.hidden && historyRendered !== history.revision()) {
      historyRendered = history.revision();
      const frames = history.frames();
      const settings = historySettings();
      setText(historyStatus!, settings.hz === 0 ? "History capture is off."
        : `${frames.length} samples · up to ${settings.hz} Hz · ${settings.seconds} s history. The available monitor updates limit the actual sample rate.`);
      historyExport!.disabled = frames.length === 0;
      historyPlots.forEach(({ metric, path, range, times }, index) => {
        const plot = engineHistoryPlot(frames, index, metric.flag);
        path.setAttribute("d", plot.path);
        const value = (number: number | null) => number === null ? "n/a" : metric.flag
          ? number > .5 ? "on" : "off" : `${number.toFixed(metric.digits ?? 2)}${metric.unit ? ` ${metric.unit}` : ""}`;
        setText(range, `Latest ${value(plot.latest)} · min ${value(plot.minimum)} · max ${value(plot.maximum)}`);
        setText(times, plot.firstTime === null ? "Waiting for native simulation time…"
          : `t=${plot.firstTime.toFixed(2)}–${plot.lastTime!.toFixed(2)} s`);
      });
    }
  };

  let reading: EngineReading | null = null;
  const handle: EngineMonitorHandle = {
    getReading: () => reading,
    update(reader, nextHeld = false) {
      if (destroyed) return;
      held = nextHeld;
      lastReader = reader;
      if (!available) {
        properties = discoverReadableProperties(reader);
        available = new Set(properties);
        build();
      }
      // Curated rows, history and the HUD share each property read this update.
      const values = new Map<string, number>();
      const cached: EngineReader = { getPropertyValue(path) {
        if (!values.has(path)) values.set(path, reader.getPropertyValue(path));
        return values.get(path)!;
      } };
      const sample = readEngineSample(cached, available, options.definition);
      history.observe(sample.simTimeS, held, () => readEngineHistoryValues(cached, historyMetrics));
      const phase = deriveEnginePhase(sample);
      const afterburnerColor = options.afterburner?.getActive() === true ? options.afterburner.accentColor : undefined;
      orbs.setAccentColor(afterburnerColor ?? null);
      reading = { sample, phase, orbSettings, ...(afterburnerColor ? { afterburnerColor } : {}) };
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
      const view = engineSummaryView(sample, phase);
      if (due) {
        view.rotorMotionDescription = engineRotorMotionDescription(orbs.getMotionStatus(), orbSettings.maxPatternStep ?? DEFAULT_MAX_PATTERN_STEP);
        lastRender = time;
        render(cached, view, phase, status);
      }
      animation.update({ simTimeS: sample.simTimeS, speeds: engineRotorSpeeds(view), held,
        turnsPerSecond: engineSpoolDisplayRate(orbSettings.turnsPerSecond, orbSettings.fps, view.rotorBlades),
        enabled: orbSettings.fps > 0 && orbSettings.renderer !== "off" && view.rotorBlades !== undefined });
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
      for (const stop of stopOrbs) stop();
      for (const stop of stopHistory) stop();
      animation.destroy();
      orbs.destroy();
      reading = null;
      history.clear();
      detachDetails();
      container.remove();
    },
  };
  // The HUD click and the Engine tab both change the unit; either redraws at once.
  const stopFlowUnit = parameters.watch("osfs.engineMonitor.fuelFlowUnit", refreshNow);
  const syncHistory = () => { history.configure(historySettings()); refreshNow(); };
  const stopHistory = [
    parameters.watch("osfs.engineMonitor.historySeconds", syncHistory),
    parameters.watch("osfs.engineMonitor.historyHz", syncHistory),
    parameters.watch("osfs.engineMonitor.thermalHistory", () => {
      history.clear();
      if (available) build();
      refreshNow();
    }),
  ];
  const syncOrbs = (): void => {
    orbSettings = readOrbSettings();
    orbs.configure({ preference: orbSettings.renderer, maxFps: orbSettings.fps, pixelRatio: orbSettings.pixelRatio,
      maxPatternStep: orbSettings.maxPatternStep,
      outerBlades: options.definition?.rotorBlades?.outer ?? 0,
      innerBlades: options.definition?.rotorBlades?.inner ?? 0 });
    refreshNow();
  };
  const stopOrbs = [
    parameters.watch("osfs.engineMonitor.orbFps", syncOrbs),
    parameters.watch("osfs.engineMonitor.orbTurnsPerSecond", syncOrbs),
    parameters.watch("osfs.engineMonitor.orbMaxPatternStep", syncOrbs),
    parameters.watch("osfs.engineMonitor.orbPixelRatio", syncOrbs),
    parameters.watch("osfs.renderer.engineOrbs", syncOrbs),
  ];

  toggle.addEventListener("click", () => { if (!destroyed) options.onOpen?.(); });
  summary.flow.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    parameters.set("osfs.engineMonitor.fuelFlowUnit", flowUnit() === "gal/h" ? "lb/h" : "gal/h");
  });
  return handle;
}
