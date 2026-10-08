// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlightAudioStatus } from "../audio/createFlightAudio";
import type { FlightRecorderPropertyReader } from "../diagnostics/flightRecorder";
import { createParameterControl } from "foss-earth/shell";
import { createSettingsRegistry } from "foss-earth/settings";
import { flightParameterDefaults, OSFS_PARAMETERS } from "../settings/flightParameters";
import { closestUprightRingAngle, createEngineMonitor, type EngineMonitorOptions } from "./engineMonitor";
import { createEngineSummary, engineRotorSpeeds, type EngineSummaryView } from "./engineSummary";
import { createEngineSpoolRenderer } from "./engineSpoolRenderer";
import { F135_ROTOR_BLADES } from "../aircraft/engineRotorDefinitions";

const orbRenderer = vi.hoisted(() => ({ draw: vi.fn(), configure: vi.fn(), setAccentColor: vi.fn(), destroy: vi.fn(), canDraw: () => true,
  getMotionStatus: vi.fn(() => ({ fps: null as number | null, maxTurnsPerSecond: null as number | null, limited: false })) }));
vi.mock("./engineSpoolRenderer", () => ({
  createEngineSpoolRenderer: vi.fn(() => ({ ...orbRenderer, ready: Promise.resolve() })),
}));

function fakeReader(values: Record<string, number>, access: Record<string, string> = {}) {
  const reader: FlightRecorderPropertyReader & { values: Record<string, number> } = {
    values,
    getPropertyValue: (path) => values[path] ?? 0,
    queryPropertyCatalog: (query) => {
      const hits = Object.keys(values).filter((path) => path.startsWith(query));
      return hits.length ? `${hits.map((path) => `${path} (${access[path] ?? "RW"})`).join("\n")}\n` : "No matches found\n";
    },
  };
  return reader;
}

const sf50Values = (): Record<string, number> => ({
  "simulation/sim-time-sec": 12,
  "propulsion/engine/n1": 50.8,
  "propulsion/engine/n2": 69.7,
  "propulsion/engine/thrust-lbs": 212.6,
  "propulsion/engine/fuel-flow-rate-pps": 0.0474,
  "propulsion/engine/fuel-flow-rate-gph": 25.4,
  "propulsion/engine/set-running": 1,
  "propulsion/starter_cmd": 0,
  "propulsion/cutoff_cmd": 0,
  "propulsion/engine/seized": 0,
  "propulsion/engine/stalled": 0,
  "propulsion/total-fuel-lbs": 1000,
  "propulsion/tank/contents-lbs": 1000,
  "propulsion/set-running": 0,
  "aero/qbar-psf": 48,
  "fcs/throttle-cmd-norm": 0.35,
  "velocities/vc-kts": 120,
});
const WRITE_ONLY = { "propulsion/set-running": "W" };

function status(overrides: Partial<FlightAudioStatus> = {}): FlightAudioStatus {
  return {
    enabled: true, requested: "auto", effective: "low", mode: "sound", gestureLocked: false, message: null,
    tireMessage: null, availability: {} as FlightAudioStatus["availability"], stats: "Audio: low (requested auto)",
    transport: "port", sampleRateHz: 48_000, held: false, settings: {} as FlightAudioStatus["settings"],
    readOnlyReason: null,
    engine: { n1Pct: 50.8, n2Pct: 69.7, fuelFlowPps: 0.0474, combustion: true, running: true },
    core: { epoch: 2, resyncs: 1, staleFades: 0, snapshotsDropped: 0, eventsDropped: 0 },
    running: null,
    telemetry: { combustionSource: "fuel-flow", missing: [] },
    ...overrides,
  };
}

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}

describe("engine monitor", () => {
  let root: HTMLElement;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    orbRenderer.getMotionStatus.mockReturnValue({ fps: null, maxTurnsPerSecond: null, limited: false });
  });
  afterEach(() => { root?.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  const animationClock = () => {
    let time = 0;
    let id = 0;
    const callbacks = new Map<number, FrameRequestCallback>();
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callbacks.set(++id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (key: number) => callbacks.delete(key));
    return {
      now: () => time,
      set: (value: number) => { time = value; },
      tick(value: number) {
        time = value;
        const pending = [...callbacks.values()];
        callbacks.clear();
        for (const callback of pending) callback(value);
      },
      pending: () => callbacks.size,
    };
  };

  const mount = (options: EngineMonitorOptions = {}) => {
    root ??= document.createElement("div");
    if (!root.isConnected) document.body.appendChild(root);
    return createEngineMonitor(root, { storage: memoryStorage(), refreshIntervalMs: 0, ...options });
  };
  const showDetails = (monitor: ReturnType<typeof createEngineMonitor>) => monitor.attachDetails(root);
  const text = (selector: string) => root.querySelector(selector)?.textContent?.trim();
  const help = (label: string) => {
    const button = root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
    return { button, content: document.getElementById(button.getAttribute("aria-controls")!)! };
  };
  const rows = () => Object.fromEntries([...root.querySelectorAll(".flight-engine__pair")]
    .map((pair) => [
      pair.querySelector(".flight-engine__label")?.textContent,
      pair.querySelector(".flight-engine__value")?.textContent,
    ]));

  it("records bounded cached native histories with separate thermal units and renders them only in the visible Engine tab", () => {
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    root = document.createElement("div");
    const monitor = mount({ definition: { kind: "turbine" } });
    const valid = "propulsion/engine/thermal/valid";
    const gas = "propulsion/engine/thermal/nozzle-gas-temperature-k";
    const metal = "propulsion/engine/thermal/metal-temperature-k";
    const reader = fakeReader({ ...sf50Values(), [gas]: 1800, [metal]: 1000,
      [valid]: 1, "propulsion/engine/thermal/initialized": 1,
      "propulsion/engine/nozzle-pos-norm": .3, "propulsion/engine/augmentation": 0 });
    const read = vi.spyOn(reader, "getPropertyValue");
    monitor.update(reader);
    expect(read.mock.calls.filter(([path]) => path === "propulsion/engine/n1")).toHaveLength(1);
    expect(read.mock.calls.filter(([path]) => path === valid)).toHaveLength(1);
    expect(root.querySelector(".flight-engine__plots")).toBeNull();
    const detach = showDetails(monitor);
    const plot = root.querySelector<HTMLElement>(`[data-property="${metal}"]`)!;
    const path = plot.closest("figure")!.querySelector("path")!;
    expect(plot.closest("figure")?.querySelector("figcaption")?.textContent).toBe("Engine 1 · Nozzle metal temperature");
    expect(plot.querySelector(".flight-engine__value")?.textContent).toBe("727 °C");
    expect(root.querySelector(`[data-property="${gas}"]`)?.textContent).toContain("1527 °C");
    expect(root.querySelector('[data-property="propulsion/engine/nozzle-pos-norm"]')?.textContent).toContain("30.0 %");
    const initialPath = path.getAttribute("d");
    detach();
    reader.values["simulation/sim-time-sec"] = 12.2;
    reader.values[metal] = 1100;
    monitor.update(reader);
    expect(path.getAttribute("d")).toBe(initialPath);
    showDetails(monitor);
    expect(path.getAttribute("d")).not.toBe(initialPath);
    expect(plot.querySelector(".flight-engine__value")?.textContent).toBe("827 °C");
    monitor.destroy();
  });

  it("does not add plot data or redraw unchanged traces while paused and applies zero-Hz immediately", () => {
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    root = document.createElement("div");
    const parameters = flightParameterDefaults();
    const monitor = mount({ parameters });
    const reader = fakeReader(sf50Values());
    monitor.update(reader);
    showDetails(monitor);
    const plots = root.querySelector(".flight-engine__plots")!;
    const observer = new MutationObserver(() => {});
    observer.observe(plots, { subtree: true, attributes: true, childList: true, characterData: true });
    monitor.update(reader, true);
    observer.takeRecords(); // Entering hold changes the explicit current-sample label once.
    for (let i = 0; i < 10; i++) monitor.update(reader, true);
    expect(observer.takeRecords()).toEqual([]);
    expect(root.querySelector('[data-section="live"]')?.textContent).toContain("1 samples");
    const clear = [...root.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Clear history")!;
    clear.click();
    expect(root.querySelector('[data-section="live"]')?.textContent).toContain("0 samples");
    for (let i = 0; i < 5; i++) monitor.update(reader, true);
    expect(plots.querySelector("path")?.getAttribute("d")).toBe("");
    parameters.set("osfs.engineMonitor.historyHz", 0);
    expect(root.querySelector('[data-section="live"]')?.textContent).toContain("Recording off");
    reader.values["simulation/sim-time-sec"] = 20;
    monitor.update(reader, false);
    expect(plots.querySelector("path")?.getAttribute("d")).toBe("");
    observer.disconnect();
    monitor.destroy();
  });

  it.each([false, true])("navigates the Engine test stand only on explicit click (active=%s)", active => {
    root = document.createElement("div");
    const onChange = vi.fn();
    const monitor = mount({ testStand: { active, description: "Native static engine test; hold-down prevents aircraft motion.", onChange } });
    monitor.update(fakeReader(sf50Values()));
    showDetails(monitor);
    expect(onChange).not.toHaveBeenCalled();
    const section = root.querySelector('[data-section="test-stand"]')!;
    const button = [...section.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent === (active ? "Return to flight" : "Open engine test stand"))!;
    expect(button.textContent).toBe(active ? "Return to flight" : "Open engine test stand");
    const standHelp = help("Engine test stand help");
    expect(standHelp.content.hidden).toBe(true);
    standHelp.button.click();
    expect(standHelp.content.hidden).toBe(false);
    expect(standHelp.content.textContent).toContain("hold-down prevents aircraft motion");
    standHelp.button.click();
    button.click();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(!active);
    monitor.destroy();
    button.click();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("labels warm initialization and reinitializes only on a deliberate button click", () => {
    root = document.createElement("div");
    const onStart = vi.fn(), onChange = vi.fn();
    const monitor = mount({ testStand: { active: true, description: "Engine stand",
      onChange, initialization: { state: "running", onStart } } });
    monitor.update(fakeReader(sf50Values(), WRITE_ONLY));
    showDetails(monitor);
    const section = root.querySelector('[data-section="test-stand"]')!;
    const standHelp = help("Engine test stand help");
    expect(standHelp.content.hidden).toBe(true);
    standHelp.button.click();
    expect(standHelp.content.textContent).toContain("not a cold-start experiment");
    standHelp.button.click();
    const select = section.querySelector<HTMLSelectElement>("select")!;
    expect(select.value).toBe("running");
    select.value = "cold";
    select.dispatchEvent(new Event("change"));
    expect(onStart).not.toHaveBeenCalled();
    const buttons = [...section.querySelectorAll<HTMLButtonElement>("button")];
    const reinitialize = buttons.find(button => button.textContent === "Reinitialize engine")!;
    const returnToFlight = buttons.find(button => button.textContent === "Return to flight")!;
    reinitialize.click();
    expect(onStart).toHaveBeenCalledExactlyOnceWith("cold");
    returnToFlight.click();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(false);
    monitor.destroy();
    reinitialize.click();
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("starts as a HUD chip with the diagram, phase under it, and padded fuel flow", () => {
    root = document.createElement("div");
    const monitor = mount({ soundStatus: () => status() });
    monitor.update(fakeReader(sf50Values(), WRITE_ONLY));
    expect(text(".flight-engine__phase")).toBe("RUNNING");
    expect(root.querySelector(".flight-engine__title")).toBeNull();
    expect(root.querySelector(".flight-engine__diagram .flight-engine__flow")).not.toBeNull();
    expect(root.querySelector(".flight-engine__diagram .flight-engine__phase")).not.toBeNull();
    expect(text(".flight-engine__spool--n2 .flight-engine__spool-label")).toBe("N2");
    expect(text(".flight-engine__spool--n2 .flight-engine__spool-value")).toBe("69.7");
    expect(text(".flight-engine__spool--n2 .flight-engine__spool-unit")).toBe("%");
    expect(text(".flight-engine__spool-n1 .flight-engine__spool-label")).toBe("N1");
    expect(text(".flight-engine__spool-n1 .flight-engine__spool-value")).toBe("50.8");
    expect(text(".flight-engine__spool-n1 .flight-engine__spool-unit")).toBe("%");
    expect(text(".flight-engine__spool-thrust .flight-engine__spool-label")).toBe("T");
    expect(text(".flight-engine__spool-thrust .flight-engine__spool-value")).toBe("0213");
    expect(text(".flight-engine__spool-thrust .flight-engine__spool-unit")).toBe("lbf");
    expect(text(".flight-engine__flow-label")).toBe("⛽");
    expect(text(".flight-engine__flow-value")).toBe("0171");
    expect(text(".flight-engine__flow-unit")).toBe("lb/h");
    expect(text(".flight-engine__values")).toBe("");
    expect(root.querySelector(".flight-engine__summary")?.textContent).not.toMatch(/SND|ENGINE|FF /);
    expect(root.querySelector(".flight-engine__spools")?.hidden).toBe(false);
    expect(root.querySelector(".flight-engine__summary")?.getAttribute("aria-expanded")).toBe("false");
    expect(root.querySelector(".flight-engine__details")).toBeNull();
  });

  it("shows native exhaust-gas Celsius in Engine temperatures while the stopped engine cools", () => {
    root = document.createElement("div");
    const monitor = mount({ definition: { kind: "turbine" } });
    showDetails(monitor);
    const reader = fakeReader({
      ...sf50Values(), "propulsion/engine/egt-degc": 720.4,
      "propulsion/engine/set-running": 0, "propulsion/cutoff_cmd": 1,
      "propulsion/engine/fuel-flow-rate-pps": 0,
    }, { ...WRITE_ONLY, "propulsion/engine/egt-degc": "R" });
    monitor.update(reader);
    const section = root.querySelector('[data-section="live"]');
    expect(section?.querySelector("summary")?.textContent).toBe("Live data");
    const exhaustHelp = help("Details for Engine 1 · EGT (exhaust gas)");
    expect(exhaustHelp.content.hidden).toBe(true);
    exhaustHelp.button.click();
    expect(exhaustHelp.content.textContent).toContain("propulsion/engine/egt-degc");
    expect(exhaustHelp.content.textContent).toContain("Modeled exhaust-gas temperature");
    expect(exhaustHelp.content.textContent).toContain("not a nozzle-metal or afterburner-exit measurement");
    expect(rows()["EGT (exhaust gas)"]).toBe("720 °C");
    const summary = text(".flight-engine__summary");
    reader.values["propulsion/engine/egt-degc"] = 660.6;
    monitor.update(reader, true);
    expect(rows()["EGT (exhaust gas)"]).toBe("661 °C");
    expect(text(".flight-engine__summary")).toBe(summary);
    reader.values["propulsion/engine/egt-degc"] = Number.NaN;
    monitor.update(reader, true);
    expect(rows()["EGT (exhaust gas)"]).toBe("n/a");
    monitor.destroy();
  });

  it("keeps legacy Fahrenheit EGT and never reads an unpublished Celsius property", () => {
    root = document.createElement("div");
    const monitor = mount({ definition: { kind: "piston" } });
    showDetails(monitor);
    const reader = fakeReader({
      "propulsion/engine/engine-rpm": 2200,
      "propulsion/engine/egt-degF": 1250,
    });
    const read = vi.spyOn(reader, "getPropertyValue");
    monitor.update(reader);
    expect(rows().EGT).toBe("1250 °F");
    expect(rows()["EGT (exhaust gas)"]).toBeUndefined();
    expect(read).not.toHaveBeenCalledWith("propulsion/engine/egt-degc");
    expect(rows()["Nozzle gas temperature"]).toBeUndefined();
    expect(rows()["Nozzle metal temperature"]).toBeUndefined();
    expect(read).not.toHaveBeenCalledWith("propulsion/engine/thermal/nozzle-gas-temperature-k");
    expect(read).not.toHaveBeenCalledWith("propulsion/engine/thermal/metal-temperature-k");
    monitor.destroy();
  });

  it("shows separate native nozzle gas and metal Celsius only when their thermal states are valid", () => {
    root = document.createElement("div");
    const monitor = mount({ definition: { kind: "turbine" } });
    showDetails(monitor);
    const gas = "propulsion/engine/thermal/nozzle-gas-temperature-k";
    const metal = "propulsion/engine/thermal/metal-temperature-k";
    const valid = "propulsion/engine/thermal/valid";
    const initialized = "propulsion/engine/thermal/initialized";
    const reader = fakeReader({
      ...sf50Values(), "propulsion/engine/egt-degc": 720,
      [gas]: 1800, [metal]: 1000, [valid]: 1, [initialized]: 0,
    }, { [gas]: "R", [metal]: "R", [valid]: "R", [initialized]: "R" });
    const read = vi.spyOn(reader, "getPropertyValue");
    monitor.update(reader);
    expect(rows()["EGT (exhaust gas)"]).toBe("720 °C");
    expect(rows()["Nozzle gas temperature"]).toBe("1527 °C");
    expect(rows()["Nozzle metal temperature"]).toBe("n/a");
    expect(read).not.toHaveBeenCalledWith(metal);

    reader.values[initialized] = 1;
    read.mockClear();
    monitor.update(reader);
    expect(rows()["Nozzle metal temperature"]).toBe("727 °C");
    expect(read.mock.calls.filter(([path]) => path === valid)).toHaveLength(1);

    // A stale finite Kelvin value is not proof of a valid native observation.
    reader.values[valid] = 0;
    read.mockClear();
    monitor.update(reader, true);
    expect(rows()["Nozzle gas temperature"]).toBe("n/a");
    expect(rows()["Nozzle metal temperature"]).toBe("n/a");
    expect(read).not.toHaveBeenCalledWith(gas);
    expect(read).not.toHaveBeenCalledWith(metal);
    reader.values[valid] = 1;
    reader.values[gas] = 700;
    reader.values[metal] = 900;
    monitor.update(reader, true);
    expect(rows()["Nozzle gas temperature"]).toBe("427 °C");
    expect(rows()["Nozzle metal temperature"]).toBe("627 °C");
    expect(rows()["EGT (exhaust gas)"]).toBe("720 °C");
    monitor.destroy();
  });

  it("prints 100 instead of 100.0 on the spool diagram", () => {
    root = document.createElement("div");
    const values = sf50Values();
    values["propulsion/engine/n1"] = 100;
    values["propulsion/engine/n2"] = 99.96;
    const monitor = mount();
    monitor.update(fakeReader(values, WRITE_ONLY));
    expect(text(".flight-engine__spool-n1 .flight-engine__spool-value")).toBe("100");
    expect(text(".flight-engine__spool--n2 .flight-engine__spool-value")).toBe("100");
  });

  it("shows one RPM circle for the C172 even when the property tree has turbine nodes", () => {
    root = document.createElement("div");
    const rotorBlades = { outer: 2, inner: null, outerEstimated: false, innerEstimated: false };
    const monitor = mount({ definition: { kind: "piston", maxRpm: 2700, rotorBlades } });
    showDetails(monitor);
    monitor.update(fakeReader({ ...sf50Values(), "propulsion/engine/engine-rpm": 2415 }));
    expect(root.querySelector<HTMLElement>(".flight-engine__spools")?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>(".flight-engine__rpm")?.hidden).toBe(false);
    expect(text(".flight-engine__rpm .flight-engine__spool-value")).toBe("2415");
    expect(text(".flight-engine__rpm .flight-engine__spool-label")).toBe("RPM");
    expect(root.querySelector<HTMLElement>(".flight-engine__spool--n2")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>(".flight-engine__spool-n1")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>(".flight-engine__spool-thrust")?.hidden).toBe(true);
    expect(text(".flight-engine__values")).toBe("");
    expect(rows().N1).toBeUndefined();
    expect(rows().N2).toBeUndefined();
    expect(monitor.getReading()?.phase.derived).toBe(false);
    expect(monitor.getReading()?.sample.rotorBlades).toEqual(rotorBlades);
    expect(createEngineSpoolRenderer).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
      outerBlades: 2, innerBlades: 0,
    }));
    expect(root.querySelector<HTMLElement>(".flight-engine__spools")?.title).toContain("One marker per propeller blade: 2.");
    const shaftHelp = help("Shaft indicator help");
    expect(shaftHelp.content.hidden).toBe(true);
    shaftHelp.button.click();
    expect(shaftHelp.content.hidden).toBe(false);
    expect(shaftHelp.content.textContent).toContain("One marker per propeller blade: 2.");
    monitor.destroy();
  });

  it("forwards aircraft row counts on creation and settings changes, with estimates explained", () => {
    root = document.createElement("div");
    const parameters = flightParameterDefaults();
    const rotorBlades = { outer: 28, inner: 40, outerEstimated: false, innerEstimated: true };
    const monitor = mount({ parameters, definition: { kind: "turbine", rotorBlades } });
    showDetails(monitor);
    const reader = fakeReader(sf50Values());
    monitor.update(reader);
    expect(createEngineSpoolRenderer).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
      outerBlades: 28, innerBlades: 40,
    }));
    parameters.set("osfs.engineMonitor.orbFps", 24);
    expect(orbRenderer.configure).toHaveBeenLastCalledWith(expect.objectContaining({
      maxFps: 24, outerBlades: 28, innerBlades: 40,
    }));
    const description = "One marker per blade: N1 fan row 28; N2 core compressor rotor 40 (estimated).";
    expect(root.querySelector<HTMLElement>(".flight-engine__spools")?.title).toContain(description);
    const shaftHelp = help("Shaft indicator help");
    expect(shaftHelp.content.hidden).toBe(true);
    shaftHelp.button.click();
    expect(shaftHelp.content.textContent).toContain(description);
    expect(shaftHelp.content.textContent).toContain("Requested maximum: 2.00 rev/s");
    orbRenderer.getMotionStatus.mockReturnValue({ fps: 6, maxTurnsPerSecond: 1.35, limited: true });
    monitor.update(reader);
    expect(shaftHelp.content.textContent).toContain("full-scale display speed 1.35 rev/s");
    expect(shaftHelp.content.textContent).toContain("Limited to 0.45 pattern pitch per drawn frame");
    parameters.set("osfs.engineMonitor.orbMaxPatternStep", 0.4);
    expect(orbRenderer.configure).toHaveBeenLastCalledWith(expect.objectContaining({ maxPatternStep: 0.4 }));
    monitor.destroy();
  });

  it("keeps missing blade counts numeric-only instead of inventing a marker", () => {
    root = document.createElement("div");
    const monitor = mount({ definition: { kind: "turbine" } });
    monitor.update(fakeReader(sf50Values()));
    expect(createEngineSpoolRenderer).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
      outerBlades: 0, innerBlades: 0,
    }));
    expect(text(".flight-engine__spool--n2 .flight-engine__spool-value")).toBe("69.7");
    expect(root.querySelector<HTMLElement>(".flight-engine__spools")?.title).toContain("Blade counts unavailable; numeric readouts only.");
    monitor.destroy();
  });

  it("uses the shared accent only for confirmed native afterburner activity, independently of DOM refresh", () => {
    root = document.createElement("div");
    const getActive = vi.fn<() => boolean | null>(() => false);
    const monitor = mount({ now: () => 0, refreshIntervalMs: 1000,
      afterburner: { accentColor: "#ff9450", getActive } });
    const reader = fakeReader({ ...sf50Values(), "fcs/throttle-cmd-norm": 1 });
    for (const active of [false, true, null, false] as const) {
      getActive.mockReturnValue(active);
      monitor.update(reader);
      expect(orbRenderer.setAccentColor).toHaveBeenLastCalledWith(active === true ? "#ff9450" : null);
      expect(monitor.getReading()?.afterburnerColor).toBe(active === true ? "#ff9450" : undefined);
    }
    expect(getActive).toHaveBeenCalledTimes(4);
    monitor.destroy();
  });

  it("retains normal blade colors when the aircraft has no afterburner", () => {
    root = document.createElement("div");
    const monitor = mount();
    monitor.update(fakeReader({ ...sf50Values(), "fcs/throttle-cmd-norm": 1 }));
    expect(orbRenderer.setAccentColor).toHaveBeenLastCalledWith(null);
    expect(monitor.getReading()).not.toHaveProperty("afterburnerColor");
    monitor.destroy();
  });

  it("normalizes both turbine rings to a shared model-percent maximum, and piston RPM to its XML limit", () => {
    const view: EngineSummaryView = { kind: "turbine", phase: "running", label: "RUNNING",
      n1Pct: 50, n2Pct: 75, maxN1Pct: 100, maxN2Pct: 125, rpm: null, thrustLbf: 1,
      fuelFlowPph: 0, fuelFlowGph: null };
    expect(engineRotorSpeeds(view)).toEqual({ outer: 0.4, inner: 0.6 });
    expect(engineRotorSpeeds({ ...view, kind: "piston", rpm: 1350, maxRpm: 2700 }))
      .toEqual({ outer: 0.5, inner: null });
    expect(engineRotorSpeeds({ ...view, n1Pct: -10, n2Pct: 130 })).toEqual({ outer: 0, inner: 1 });
    expect(engineRotorSpeeds({ ...view, maxN2Pct: null })).toEqual({ outer: 0, inner: 0 });
    expect(engineRotorSpeeds({ ...view, kind: "piston", rpm: 0, maxRpm: 2700 }))
      .toEqual({ outer: 0, inner: null });
    const summary = createEngineSummary();
    summary.render(view, "lb/h");
    expect(summary.spools.title).toContain("scaled model percent speed, not physical shaft RPM");
  });

  it("supplies unwrapped requested motion and a full-scale reference for the client frame limit", () => {
    root = document.createElement("div");
    const parameters = flightParameterDefaults();
    const clock = animationClock();
    const monitor = mount({ parameters, now: clock.now, definition: { kind: "turbine", rotorBlades: F135_ROTOR_BLADES } });
    const reader = fakeReader({ "simulation/sim-time-sec": 0,
      "propulsion/engine/n1": 99, "propulsion/engine/n2": 99,
      "propulsion/engine/MaxN1": 100, "propulsion/engine/MaxN2": 100 });
    monitor.update(reader);
    for (const [index, fps] of [30, 15, 60].entries()) {
      parameters.set("osfs.engineMonitor.orbFps", fps);
      clock.set((index + 1) * 100);
      reader.values["simulation/sim-time-sec"] = (index + 1) * 0.1;
      monitor.update(reader);
      clock.tick((index + 2) * 100);
      const expectedAngle = 2 * Math.PI * 1.98 * (index + 1) * 0.1;
      expect(orbRenderer.draw.mock.lastCall![0].outerAngle).toBeCloseTo(expectedAngle);
      expect(orbRenderer.draw.mock.lastCall![0].innerAngle).toBeCloseTo(expectedAngle);
      expect(orbRenderer.draw.mock.lastCall![0].maxAngle).toBeCloseTo(2 * Math.PI * 2 * (index + 1) * 0.1);
    }
    monitor.destroy();
  });

  it("advances orb phase with simulation time and keeps a paused engine still", () => {
    root = document.createElement("div");
    const clock = animationClock();
    const monitor = mount({ now: clock.now, definition: { kind: "piston", maxRpm: 2700,
      rotorBlades: { outer: 2, inner: null, outerEstimated: false, innerEstimated: false } } });
    const reader = fakeReader({ "simulation/sim-time-sec": 0, "propulsion/engine/engine-rpm": 1350 });
    monitor.update(reader);
    expect(orbRenderer.draw).toHaveBeenLastCalledWith(expect.objectContaining({ outerAngle: 0, innerAngle: null }), expect.any(Number));
    clock.set(250);
    reader.values["simulation/sim-time-sec"] = 0.25;
    monitor.update(reader);
    clock.tick(500);
    const advanced = { ...orbRenderer.draw.mock.lastCall![0] };
    expect(advanced.outerAngle).toBeCloseTo(Math.PI / 2);
    expect(advanced.innerAngle).toBeNull();
    monitor.update(reader, true);
    expect(orbRenderer.draw.mock.lastCall![0]).toEqual(advanced);
    expect(clock.pending()).toBe(0);
    monitor.destroy();
    expect(orbRenderer.destroy).toHaveBeenCalledOnce();
  });

  it("animates only the canvas between source samples and leaves unchanged readouts alone", () => {
    root = document.createElement("div");
    const clock = animationClock();
    const monitor = mount({ now: clock.now, soundStatus: () => status(),
      definition: { kind: "turbine", rotorBlades: F135_ROTOR_BLADES } });
    const reader = fakeReader({ ...sf50Values(), "simulation/sim-time-sec": 0,
      "propulsion/engine/MaxN1": 100, "propulsion/engine/MaxN2": 100 });
    const reads = vi.spyOn(reader, "getPropertyValue");
    monitor.update(reader);
    showDetails(monitor);
    const observer = new MutationObserver(() => {});
    observer.observe(root.querySelector(".flight-engine__summary")!, { subtree: true, childList: true, attributes: true, characterData: true });
    clock.set(100);
    reader.values["simulation/sim-time-sec"] = 0.1;
    monitor.update(reader);
    expect(observer.takeRecords()).toEqual([]);
    const sourceReads = reads.mock.calls.length;
    const draws = orbRenderer.draw.mock.calls.length;
    for (let frame = 1; frame <= 12; frame++) clock.tick(100 + frame * 1000 / 120);
    expect(orbRenderer.draw.mock.calls.length - draws).toBe(12);
    expect(reads.mock.calls.length).toBe(sourceReads);
    expect(observer.takeRecords()).toEqual([]);
    expect(clock.pending()).toBe(0);
    observer.disconnect();
    monitor.destroy();
  });

  it("pads HUD thrust to four digits", () => {
    root = document.createElement("div");
    const values = sf50Values();
    values["propulsion/engine/thrust-lbs"] = 90.4;
    const monitor = mount();
    monitor.update(fakeReader(values, WRITE_ONLY));
    expect(text(".flight-engine__spool-thrust .flight-engine__spool-value")).toBe("0090");
    values["propulsion/engine/thrust-lbs"] = 1213.2;
    monitor.update(fakeReader(values, WRITE_ONLY));
    expect(text(".flight-engine__spool-thrust .flight-engine__spool-value")).toBe("1213");
  });

  it("toggles HUD fuel flow between lb/h and gal/h without opening the Engine tab", () => {
    root = document.createElement("div");
    let opened = 0;
    const storage = memoryStorage();
    const parameters = flightParameterDefaults();
    const monitor = mount({ storage, parameters, onOpen: () => { opened += 1; } });
    monitor.update(fakeReader(sf50Values(), WRITE_ONLY));
    expect(text(".flight-engine__flow-value")).toBe("0171");
    expect(text(".flight-engine__flow-unit")).toBe("lb/h");
    root.querySelector<HTMLElement>(".flight-engine__flow")?.click();
    expect(opened).toBe(0);
    expect(text(".flight-engine__flow-value")).toBe("0025");
    expect(text(".flight-engine__flow-unit")).toBe("gal/h");
    monitor.destroy();
    expect(parameters.get("osfs.engineMonitor.fuelFlowUnit")).toBe("gal/h");
    const again = mount({ storage, parameters });
    again.update(fakeReader(sf50Values(), WRITE_ONLY));
    expect(text(".flight-engine__flow-unit")).toBe("gal/h");
    expect(text(".flight-engine__flow-value")).toBe("0025");
    again.destroy();
  });

  it("packs upright ring marks just clear of the value", () => {
    const radius = 40;
    const value = { w: 22, h: 10 };
    const label = { w: 12, h: 8 };
    const unit = { w: 8, h: 8 };
    const overlap = (
      fromDeg: number, angle: number, mark: { w: number; h: number }, pad: number,
    ) => {
      const originRad = (fromDeg * Math.PI) / 180;
      const rad = (angle * Math.PI) / 180;
      const ox = radius * Math.sin(originRad);
      const oy = -radius * Math.cos(originRad);
      const x = radius * Math.sin(rad);
      const y = -radius * Math.cos(rad);
      return Math.abs(ox - x) < (value.w + mark.w) / 2 + pad
        && Math.abs(oy - y) < (value.h + mark.h) / 2 + pad;
    };
    const n1Left = closestUprightRingAngle(radius, value, label, 180, 1);
    const n1Right = closestUprightRingAngle(radius, value, unit, 180, -1);
    expect(n1Left).toBeGreaterThan(180);
    expect(n1Right).toBeLessThan(180);
    expect(overlap(180, n1Left, label, 2)).toBe(false);
    expect(overlap(180, n1Right, unit, 2)).toBe(false);
    expect(overlap(180, n1Left - 2, label, 2)).toBe(true);
    expect(overlap(180, n1Right + 2, unit, 2)).toBe(true);

    const thrustLeft = closestUprightRingAngle(radius, value, label, 0, -1);
    const thrustRight = closestUprightRingAngle(radius, value, unit, 0, 1);
    expect(thrustLeft).toBeLessThan(0);
    expect(thrustRight).toBeGreaterThan(0);
    expect(overlap(0, thrustLeft, label, 2)).toBe(false);
    expect(overlap(0, thrustRight, unit, 2)).toBe(false);
    expect(overlap(0, thrustLeft + 2, label, 2)).toBe(true);
    expect(overlap(0, thrustRight - 2, unit, 2)).toBe(true);
  });

  it("places HUD N1 and thrust with packed ring transforms", () => {
    root = document.createElement("div");
    const monitor = mount();
    Object.defineProperty(root.querySelector(".flight-engine__spools")!, "clientWidth", {
      configurable: true, get: () => 68,
    });
    const size = (selector: string, w: number, h: number) => {
      const node = root.querySelector<HTMLElement>(selector)!;
      Object.defineProperty(node, "offsetWidth", { configurable: true, get: () => w });
      Object.defineProperty(node, "offsetHeight", { configurable: true, get: () => h });
    };
    size(".flight-engine__spool-n1 .flight-engine__spool-value", 22, 10);
    size(".flight-engine__spool-n1 .flight-engine__spool-label", 12, 8);
    size(".flight-engine__spool-n1 .flight-engine__spool-unit", 8, 8);
    size(".flight-engine__spool-thrust .flight-engine__spool-value", 18, 10);
    size(".flight-engine__spool-thrust .flight-engine__spool-label", 8, 8);
    size(".flight-engine__spool-thrust .flight-engine__spool-unit", 14, 8);
    monitor.update(fakeReader(sf50Values(), WRITE_ONLY));
    const angle = (selector: string) => {
      const transform = root.querySelector<HTMLElement>(selector)?.style.transform ?? "";
      return Number(/rotate\(([-\d.]+)deg\)/.exec(transform)?.[1]);
    };
    expect(angle(".flight-engine__spool-n1 .flight-engine__spool-value")).toBe(180);
    const n1Label = angle(".flight-engine__spool-n1 .flight-engine__spool-label");
    const n1Unit = angle(".flight-engine__spool-n1 .flight-engine__spool-unit");
    expect(n1Label).toBeGreaterThan(180);
    expect(n1Unit).toBeLessThan(180);
    expect(n1Label - 180).toBeGreaterThan(180 - n1Unit);
    expect(angle(".flight-engine__spool-thrust .flight-engine__spool-value")).toBe(0);
    const thrustLabel = angle(".flight-engine__spool-thrust .flight-engine__spool-label");
    const thrustUnit = angle(".flight-engine__spool-thrust .flight-engine__spool-unit");
    expect(thrustLabel).toBeLessThan(0);
    expect(thrustUnit).toBeGreaterThan(0);
    expect(Math.abs(thrustLabel)).toBeLessThan(thrustUnit);
    const reader = fakeReader(sf50Values(), WRITE_ONLY);
    reader.values["propulsion/engine/thrust-lbs"] = 1213;
    reader.values["propulsion/engine/n1"] = 99.9;
    monitor.update(reader);
    expect(angle(".flight-engine__spool-thrust .flight-engine__spool-value")).toBe(0);
    expect(angle(".flight-engine__spool-thrust .flight-engine__spool-label")).toBe(thrustLabel);
    expect(angle(".flight-engine__spool-thrust .flight-engine__spool-unit")).toBe(thrustUnit);
    expect(angle(".flight-engine__spool-n1 .flight-engine__spool-label")).toBe(n1Label);
    expect(angle(".flight-engine__spool-n1 .flight-engine__spool-unit")).toBe(n1Unit);
    monitor.destroy();
  });

  it("asks to open a tab instead of expanding in place", () => {
    root = document.createElement("div");
    let opened = 0;
    const reader = fakeReader(sf50Values(), WRITE_ONLY);
    const monitor = mount({ onOpen: () => { opened += 1; } });
    monitor.update(reader);
    root.querySelector<HTMLButtonElement>(".flight-engine__summary")?.click();
    expect(opened).toBe(1);
    expect(root.querySelector(".flight-engine__details")).toBeNull();
    showDetails(monitor);
    expect(root.querySelector(".flight-engine__summary")?.getAttribute("aria-expanded")).toBe("true");
    expect(root.querySelector(".flight-engine__details")).not.toBeNull();
    monitor.destroy();
    expect(root.querySelector(".flight-engine")).toBeNull();
    expect(root.querySelector(".flight-engine__details")).toBeNull();
  });

  it("closes click help when Live data is collapsed or its host detaches", () => {
    root = document.createElement("div");
    const monitor = mount();
    monitor.update(fakeReader(sf50Values(), WRITE_ONLY));
    let detach = showDetails(monitor);
    const phaseHelp = help("Engine phase help");
    phaseHelp.button.click();
    expect(phaseHelp.content.hidden).toBe(false);
    const live = root.querySelector<HTMLDetailsElement>('[data-engine-top-section="live"]')!;
    live.open = false; live.dispatchEvent(new Event("toggle"));
    expect(phaseHelp.content.hidden).toBe(true);
    expect(phaseHelp.button.getAttribute("aria-expanded")).toBe("false");
    live.open = true; live.dispatchEvent(new Event("toggle"));
    phaseHelp.button.click();
    expect(phaseHelp.content.hidden).toBe(false);
    detach();
    expect(phaseHelp.content.hidden).toBe(true);
    detach = showDetails(monitor);
    phaseHelp.button.click();
    expect(phaseHelp.content.hidden).toBe(false);
    const id = phaseHelp.content.id;
    detach(); monitor.destroy();
    expect(document.getElementById(id)).toBeNull();
  });

  it("closes a shared setting's help when Settings collapses without a pointer event", () => {
    root = document.createElement("div");
    const settings = createSettingsRegistry({ storage: null }); settings.register(OSFS_PARAMETERS);
    const control = createParameterControl(settings, "osfs.engineMonitor.historyHz");
    const monitor = mount();
    monitor.update(fakeReader(sf50Values(), WRITE_ONLY));
    monitor.attachDetails(root, control.element);
    const section = root.querySelector<HTMLDetailsElement>('[data-engine-top-section="settings"]')!;
    section.open = true; section.dispatchEvent(new Event("toggle"));
    const button = control.element.querySelector<HTMLButtonElement>('button[aria-label="Explain Engine history sampling ceiling"]')!;
    button.focus(); button.click();
    const content = document.getElementById(button.getAttribute("aria-controls")!)!;
    expect(content.hidden).toBe(false);
    section.open = false; section.dispatchEvent(new Event("toggle"));
    expect(content.hidden).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    monitor.destroy(); control.destroy();
  });

  it("shows the curated rows the model publishes, and lists every readable property", () => {
    root = document.createElement("div");
    const values = sf50Values();
    const monitor = mount();
    showDetails(monitor);
    monitor.update(fakeReader(values, WRITE_ONLY));
    const shown = rows();
    expect(root.querySelector(".flight-engine__summary .flight-engine__spools")).not.toBeNull();
    expect(root.querySelector(".flight-engine__details .flight-engine__spools")).toBeNull();
    expect(shown.N1).toBe("50.8 %");
    expect(shown.N2).toBe("69.7 %");
    expect(shown["Fuel flow"]).toBe("171 lb/h");
    expect(shown["Cutoff command"]).toBe("off");
    expect(shown["Tank 1 contents"]).toBe("1000.0 lb");
    expect(shown["Dynamic pressure"]).toBe("48.0 psf");
    // A turbine has no crankshaft speed, so that row is simply absent.
    expect(shown["Engine RPM"]).toBeUndefined();
    expect(root.querySelector("table")).toBeNull();
    expect(root.querySelector(".flight-engine__grid")).not.toBeNull();
    const readable = Object.keys(values).filter((path) => path !== "propulsion/set-running").length;
    expect(root.querySelectorAll('[data-variable]')).toHaveLength(readable);
    expect(root.querySelector('details[data-section="all"]')).toBeNull();
    expect(root.querySelector('[data-property="propulsion/set-running"]')).toBeNull();
    expect(root.querySelector('input[aria-label="Find native engine property"]')).not.toBeNull();
  });

  it("logs a shutdown with its simulation time and explains the windmilling that follows", () => {
    root = document.createElement("div");
    const reader = fakeReader(sf50Values(), WRITE_ONLY);
    const monitor = mount();
    showDetails(monitor);
    monitor.update(reader);
    Object.assign(reader.values, {
      "propulsion/engine/set-running": 0, "propulsion/cutoff_cmd": 1,
      "propulsion/engine/fuel-flow-rate-pps": 0, "simulation/sim-time-sec": 14.25,
    });
    monitor.update(reader);
    const log = [...root.querySelectorAll(".flight-engine__log li")].map((item) => item.textContent ?? "");
    expect(log.some((line) => /^t=14\.25s\s+running: 1 → 0$/.test(line))).toBe(true);
    expect(text(".flight-engine__phase")).toBe("WINDMILLING");
    const phaseHelp = help("Engine phase help");
    expect(phaseHelp.content.hidden).toBe(true);
    phaseHelp.button.click();
    expect(phaseHelp.content.textContent).toMatch(/qbar\/10 ≈ 4\.8%/);
    monitor.destroy();
  });

  it("shows what the audio core hears, including when it hears nothing", () => {
    root = document.createElement("div");
    let current = status({ engine: null, held: true, core: null });
    const monitor = mount({ soundStatus: () => current });
    showDetails(monitor);
    const reader = fakeReader(sf50Values(), WRITE_ONLY);
    monitor.update(reader);
    expect(root.querySelector(".flight-engine__summary")?.textContent).not.toMatch(/SND/);
    expect(rows()["Engine as heard"]).toMatch(/not receiving/);
    expect(rows().Held).toBe("yes");
    expect(rows().Timeline).toMatch(/n\/a until/);
    current = status();
    monitor.update(reader);
    expect(rows()["Engine as heard"]).toBe("N1 50.8% · N2 69.7% · burning · running 1");
    expect(rows().Timeline).toMatch(/^epoch 2 · resyncs 1/);
  });

  it("copes with a model, or a mock, that publishes no engine catalog", () => {
    root = document.createElement("div");
    const monitor = mount();
    showDetails(monitor);
    expect(() => monitor.update({ getPropertyValue: () => 0 })).not.toThrow();
    expect(text(".flight-engine__phase")).toBe("UNKNOWN");
    expect(root.querySelector(".flight-engine__spools")?.hidden).toBe(true);
    expect(root.textContent).toMatch(/publishes no engine properties/);
  });
});
