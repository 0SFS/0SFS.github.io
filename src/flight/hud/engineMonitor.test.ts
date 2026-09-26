// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { FlightAudioStatus } from "../audio/createFlightAudio";
import type { FlightRecorderPropertyReader } from "../diagnostics/flightRecorder";
import { flightParameterDefaults } from "../settings/flightParameters";
import { closestUprightRingAngle, createEngineMonitor, type EngineMonitorOptions } from "./engineMonitor";

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
    readOnlyReason: null, allowUnvalidated: false,
    engine: { n1Pct: 50.8, n2Pct: 69.7, fuelFlowPps: 0.0474, combustion: true, running: true },
    core: { epoch: 2, resyncs: 1, staleFades: 0, snapshotsDropped: 0, eventsDropped: 0 },
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
  afterEach(() => root?.remove());

  const mount = (options: EngineMonitorOptions = {}) => {
    root ??= document.createElement("div");
    if (!root.isConnected) document.body.appendChild(root);
    return createEngineMonitor(root, { storage: memoryStorage(), refreshIntervalMs: 0, ...options });
  };
  const showDetails = (monitor: ReturnType<typeof createEngineMonitor>) => monitor.attachDetails(root);
  const text = (selector: string) => root.querySelector(selector)?.textContent?.trim();
  const rows = () => Object.fromEntries([...root.querySelectorAll(".flight-engine__pair")]
    .map((pair) => [
      pair.querySelector(".flight-engine__label")?.textContent,
      pair.querySelector(".flight-engine__value")?.textContent,
    ]));

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
    expect(root.querySelector('details[data-section="all"] > summary')?.textContent)
      .toBe(`All engine properties (${readable})`);
    expect(root.querySelector('details[data-section="all"] [title="propulsion/set-running"]')).toBeNull();
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
    expect(text(".flight-engine__detail")).toMatch(/qbar\/10 ≈ 4\.8%/);
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
