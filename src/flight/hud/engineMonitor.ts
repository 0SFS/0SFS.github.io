import "./engineMonitor.css";
import { closeHelpTooltipWithin, createHelpTooltip } from "foss-earth/shell";
import type { FlightAudioStatus } from "../audio/createFlightAudio";
import {
  createTransitionLog, deriveEnginePhase, discoverReadableProperties, discreteEngineState, readEngineSample,
  type EngineMonitorDefinition, type EnginePhaseReading, type EngineReader, type EngineSample,
} from "./engineMonitorModel";
import { createEngineSummary, engineRotorDescription, engineRotorMotionDescription, engineRotorSpeeds, engineSummaryView, type EngineSummaryView, type FuelFlowUnit } from "./engineSummary";
import { flightParameterDefaults, type FlightParameterStore } from "../settings/flightParameters";
import { DEFAULT_MAX_PATTERN_STEP, engineSpoolDisplayRate } from "./engineSpoolMotion";
import { createEngineSpoolAnimation } from "./engineSpoolAnimation";
import { createEngineSpoolRenderer, type EngineSpoolRendererStatus } from "./engineSpoolRenderer";
import type { EngineOrbSettings } from "../../remote/protocol";
import { discoverEngineVariables } from "./engineVariables";
import { createEngineLiveData, type EngineLiveData } from "./engineLiveData";
import { readEngineMonitorLayout, writeEngineMonitorLayout } from "./engineMonitorLayout";
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
  /** Aircraft, running model and semantic capability scope for presentation preferences. */
  layoutScope?: string;
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
  attachDetails(host: HTMLElement, settingsContent?: HTMLElement): () => void;
  destroy(): void;
}

function defaultStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try { return window.localStorage; } catch { return null; }
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
  const scope = options.layoutScope ?? options.definition?.kind ?? "unknown-engine";
  const layout = readEngineMonitorLayout(storage, scope);
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
  let sourceReader: EngineReader | null = null;
  let held = false;
  let available: Set<string> | null = null;
  let properties: string[] = [];
  let lastRender = Number.NEGATIVE_INFINITY;
  let logDirty = true;
  let detailLine: HTMLElement | null = null;
  let phaseHelp: HTMLElement | null = null;
  let rotorHelp: HTMLElement | null = null;
  const detailHelpControls: { destroy(): void; close(): void }[] = [];
  let soundGrid: HTMLElement | null = null;
  let lastSoundRows: [string, string][] | null = null;
  let logList: HTMLOListElement | null = null;

  let liveData: EngineLiveData | null = null;
  let settingsContent: HTMLElement | null = null;
  const settingsSection = element("details", "flight-engine__section");
  const liveSection = element("details", "flight-engine__section");
  for (const [details, id, title] of [[settingsSection, "settings", "Settings"], [liveSection, "live", "Live data"]] as const) {
    details.dataset.engineTopSection = id;
    details.dataset.section = id;
    details.open = layout.top[id];
    const label = element("summary", undefined, title);
    label.setAttribute("aria-expanded", String(details.open));
    details.append(label);
    details.addEventListener("toggle", () => {
      layout.top[id] = details.open;
      label.setAttribute("aria-expanded", String(details.open));
      if (!details.open) closeHelp();
      save(); refreshNow();
    });
  }
  panel.replaceChildren(settingsSection, liveSection);

  const save = (): void => {
    writeEngineMonitorLayout(storage, scope, layout);
  };

  const refreshNow = (): void => {
    lastRender = Number.NEGATIVE_INFINITY;
    if (lastReader) handle.update(lastReader, held);
  };

  const closeHelp = (): void => {
    closeHelpTooltipWithin(panel);
    liveData?.closeHelp();
    for (const help of detailHelpControls) help.close();
  };

  const detachDetails = (): void => {
    if (!detailsHost) return;
    closeHelp();
    panel.remove();
    detailsHost = null;
    toggle.setAttribute("aria-expanded", "false");
  };

  const addSection = (id: string, title: string): HTMLDetailsElement => {
    const details = element("details", "flight-engine__section");
    details.dataset.section = id;
    details.open = layout.supplementary[id] ?? false;
    details.append(element("summary", undefined, title));
    details.addEventListener("toggle", () => {
      layout.supplementary[id] = details.open;
      save();
      refreshNow();
    });
    liveSection.append(details);
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

  const build = (reader: EngineReader): void => {
    liveData?.destroy();
    for (const help of detailHelpControls.splice(0)) help.destroy();
    liveSection.replaceChildren(liveSection.firstElementChild!);
    settingsSection.replaceChildren(settingsSection.firstElementChild!);
    if (settingsContent) settingsSection.append(settingsContent);
    if (options.testStand) {
      const section = element("section", "flight-engine__section");
      section.dataset.section = "test-stand";
      const heading = element("h4", "flight-engine__trace-heading", "Engine test stand");
      const standHelpContent = element("div");
      standHelpContent.append(element("p", undefined, options.testStand.description));
      const standHelp = createHelpTooltip({ label: "Engine test stand help", content: standHelpContent });
      detailHelpControls.push(standHelp); heading.append(standHelp.element);
      section.append(heading);
      settingsSection.append(section);
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
        if (options.testStand.active) standHelpContent.append(element("p", undefined,
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
    const engineState = element("div", "flight-engine__grid flight-engine__state-row");
    detailLine = element("span", "flight-engine__detail");
    phaseHelp = element("div"); rotorHelp = element("div");
    const phaseTooltip = createHelpTooltip({ label: "Engine phase help", content: phaseHelp });
    const rotorTooltip = createHelpTooltip({ label: "Shaft indicator help", content: rotorHelp });
    detailHelpControls.push(phaseTooltip, rotorTooltip);
    const phaseState = element("span", "flight-engine__trace-heading"); phaseState.append(detailLine, phaseTooltip.element);
    const rotorState = element("span", "flight-engine__trace-heading", "Shaft indicator"); rotorState.append(rotorTooltip.element);
    engineState.append(phaseState, rotorState); liveSection.append(engineState);
    const variables = discoverEngineVariables(available!, options.definition, reader);
    liveData = createEngineLiveData(variables, parameters, layout, save, () => liveSection.open, refreshNow, id => {
      settingsSection.open = true;
      const control = settingsSection.querySelector<HTMLElement>(`[data-parameter="${id}"] input, [data-parameter="${id}"] select, [data-parameter="${id}"] button`);
      (control ?? settingsSection.querySelector<HTMLElement>("summary"))?.focus();
    });
    liveSection.append(liveData.element);
    if (!variables.length) liveSection.append(element("p", "flight-engine__muted", "This flight model publishes no engine properties."));
    if (options.soundStatus) {
      soundGrid = addGrid(addSection("sound", "Audio-source diagnostics"));
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
    if (!panel.isConnected || !liveSection.open || document.hidden) return;
    if (detailLine) {
      setText(detailLine, phase.label);
      if (phaseHelp) setText(phaseHelp, `${phase.label}${phase.derived ? " (derived from JSBSim's turbine rules)" : ""}: ${phase.detail}`);
    }
    if (rotorHelp) {
      const rate = engineSpoolDisplayRate(orbSettings.turnsPerSecond, orbSettings.fps, view.rotorBlades);
      setText(rotorHelp, engineRotorDescription(view)
        + ` Requested maximum: ${rate.toFixed(2)} rev/s of simulation time. ${view.rotorMotionDescription ?? ""}`);
    }
    liveData?.render(reader, held);
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

  };

  let reading: EngineReading | null = null;
  const handle: EngineMonitorHandle = {
    getReading: () => reading,
    update(reader, nextHeld = false) {
      if (destroyed) return;
      held = nextHeld;
      lastReader = reader;
      // Curated rows, history and the HUD share each property read this update.
      const values = new Map<string, number>();
      const cached: EngineReader = { getPropertyValue(path) {
        if (!values.has(path)) values.set(path, reader.getPropertyValue(path));
        return values.get(path)!;
      } };
      if (!available || sourceReader !== reader) {
        sourceReader = reader;
        properties = discoverReadableProperties(reader);
        available = new Set(properties);
        build(cached);
      }
      const sample = readEngineSample(cached, available, options.definition);
      liveData?.capture(cached, sample.simTimeS, held);
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
    attachDetails(host, nextSettingsContent) {
      if (destroyed) return () => {};
      if (nextSettingsContent && settingsContent !== nextSettingsContent) {
        settingsContent?.remove();
        settingsContent = nextSettingsContent;
        settingsSection.insertBefore(settingsContent, settingsSection.children[1] ?? null);
      }
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
      liveData?.destroy();
      for (const help of detailHelpControls.splice(0)) help.destroy();
      detachDetails();
      container.remove();
    },
  };
  // The HUD click and the Engine tab both change the unit; either redraws at once.
  const stopFlowUnit = parameters.watch("osfs.engineMonitor.fuelFlowUnit", refreshNow);
  const syncHistory = () => { liveData?.configure(); };
  const stopHistory = [
    parameters.watch("osfs.engineMonitor.historySeconds", syncHistory),
    parameters.watch("osfs.engineMonitor.historyHz", syncHistory),
    parameters.watch("osfs.engineMonitor.historyMetrics", syncHistory),
    parameters.watch("osfs.engineMonitor.historyMemoryKiB", syncHistory),
    parameters.watch("osfs.engineMonitor.hiddenHistory", syncHistory),
    parameters.watch("osfs.engineMonitor.thermalHistory", syncHistory),
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
