// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { FlightAudioStatus } from "../audio/createFlightAudio";
import type { FlightRecorderPropertyReader } from "../diagnostics/flightRecorder";
import { createEngineMonitor, type EngineMonitorOptions } from "./engineMonitor";

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
  const text = (selector: string) => root.querySelector(selector)?.textContent?.trim();
  const rows = () => Object.fromEntries([...root.querySelectorAll("tr")]
    .filter((row) => row.children.length === 2)
    .map((row) => [row.children[0].textContent, row.children[1].textContent]));

  it("starts collapsed to one line with the phase, spools, fuel flow, thrust and sound", () => {
    root = document.createElement("div");
    const monitor = mount({ soundStatus: () => status() });
    monitor.update(fakeReader(sf50Values(), WRITE_ONLY));
    expect(text(".flight-engine__phase")).toBe("RUNNING");
    expect(text(".flight-engine__values")).toBe("N1 50.8%  N2 69.7%  FF 171 lb/h  THR 213 lbf  SND low");
    expect(root.querySelector(".flight-engine__summary")?.getAttribute("aria-expanded")).toBe("false");
    expect(root.querySelector<HTMLElement>(".flight-engine__details")?.hidden).toBe(true);
  });

  it("expands on click and remembers that", () => {
    root = document.createElement("div");
    const storage = memoryStorage();
    const reader = fakeReader(sf50Values(), WRITE_ONLY);
    const first = mount({ storage });
    first.update(reader);
    root.querySelector<HTMLButtonElement>(".flight-engine__summary")?.click();
    expect(root.querySelector(".flight-engine__summary")?.getAttribute("aria-expanded")).toBe("true");
    expect(root.querySelector<HTMLElement>(".flight-engine__details")?.hidden).toBe(false);
    first.destroy();
    expect(root.querySelector(".flight-engine")).toBeNull();
    const second = mount({ storage });
    second.update(reader);
    expect(root.querySelector(".flight-engine__summary")?.getAttribute("aria-expanded")).toBe("true");
  });

  it("shows the curated rows the model publishes, and lists every readable property", () => {
    root = document.createElement("div");
    const values = sf50Values();
    const monitor = mount();
    monitor.setExpanded(true);
    monitor.update(fakeReader(values, WRITE_ONLY));
    const shown = rows();
    expect(shown.N1).toBe("50.8 %");
    expect(shown["Fuel flow"]).toBe("171 lb/h");
    expect(shown["Cutoff command"]).toBe("off");
    expect(shown["Tank 1 contents"]).toBe("1000.0 lb");
    expect(shown["Dynamic pressure"]).toBe("48.0 psf");
    // A turbine has no crankshaft speed, so that row is simply absent.
    expect(shown["Engine RPM"]).toBeUndefined();
    const readable = Object.keys(values).filter((path) => path !== "propulsion/set-running").length;
    expect(root.querySelector('details[data-section="all"] > summary')?.textContent)
      .toBe(`All engine properties (${readable})`);
    expect(root.querySelector('details[data-section="all"] [title="propulsion/set-running"]')).toBeNull();
  });

  it("logs a shutdown with its simulation time and explains the windmilling that follows", () => {
    root = document.createElement("div");
    const reader = fakeReader(sf50Values(), WRITE_ONLY);
    const monitor = mount();
    monitor.setExpanded(true);
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
    monitor.setExpanded(true);
    const reader = fakeReader(sf50Values(), WRITE_ONLY);
    monitor.update(reader);
    expect(text(".flight-engine__values")).toMatch(/SND low held$/);
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
    monitor.setExpanded(true);
    expect(() => monitor.update({ getPropertyValue: () => 0 })).not.toThrow();
    expect(text(".flight-engine__phase")).toBe("UNKNOWN");
    expect(root.textContent).toMatch(/publishes no engine properties/);
  });
});
