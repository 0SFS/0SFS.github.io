import { describe, expect, it, vi } from "vitest";
import type { JSBSimSdk } from "@felipegalind0/jsbsim";
import type { Scene, TransformNode } from "@babylonjs/core";
import type { AircraftRig } from "./aircraftAnimation";
import { getAircraftDefinition, type AircraftDefinition } from "./aircraftCatalog";
import { createAircraftEngineVisuals } from "./createAircraftEngineVisuals";
import { createEngineExhaust } from "./createEngineExhaust";
import { createEngineSmoke } from "./createEngineSmoke";

vi.mock("./engineGasSupport", async (original) => ({
  ...await original<typeof import("./engineGasSupport")>(),
  bindEngineGasSupport: vi.fn((root: TransformNode) => ({ root, update: vi.fn() })),
}));
vi.mock("./createEngineExhaust", () => ({ createEngineExhaust: vi.fn(() => ({
  ready: Promise.resolve(), update: vi.fn(), dispose: vi.fn(),
})) }));
vi.mock("./createEngineSmoke", () => ({ createEngineSmoke: vi.fn(() => ({
  ready: Promise.resolve(), update: vi.fn(), resetEpoch: vi.fn(), dispose: vi.fn(),
})) }));

const settings = { enabled: true, sampleCount: 8, maxDistanceMeters: 2000, intensity: 1, surfaceReferenceNits: 1 };

function fixture(smokeEnabled = false, definition: AircraftDefinition = getAircraftDefinition("f-35b")) {
  vi.mocked(createEngineExhaust).mockClear();
  vi.mocked(createEngineSmoke).mockClear();
  const values = new Map<string, number>([
    ["propulsion/engine[0]/augmentation", 0], ["propulsion/engine[0]/nozzle-pos-norm", 0.2],
    ["propulsion/engine[0]/n2", 98], ["propulsion/engine[0]/fuel-flow-rate-pps", 4],
    ["propulsion/engine[0]/thermal/metal-temperature-k", 973.15],
    ["propulsion/engine[0]/thermal/nozzle-gas-temperature-k", 1600],
    ["propulsion/engine[0]/thermal/core/metal-temperature-k", 1123.15],
    ["propulsion/engine[0]/thermal/core/initialized", 1],
    ["propulsion/engine[0]/thermal/afterburner-burned-fuel-flow-kg-sec", 0],
    ["propulsion/engine[0]/thermal/initialized", 1], ["propulsion/engine[0]/thermal/valid", 1],
    ["simulation/sim-time-sec", 42],
    ["atmosphere/T-R", 518.67],
    ["atmosphere/P-psf", 2116.22],
    ["propulsion/engine[0]/egt-degc", 730],
  ]);
  const batch = { read: vi.fn(), dispose: vi.fn() };
  const createPropertyBatch = vi.fn((paths: readonly string[]) => {
    batch.read.mockImplementation((target: Float64Array) => {
      paths.forEach((path, index) => { target[index] = values.get(path) ?? Number.NaN; });
      return target;
    });
    return batch;
  });
  const sdk = { createPropertyBatch } as unknown as JSBSimSdk;
  const smokeSettings = { enabled: true, maxParticles: 64, emissionPerSecond: 8, lifetimeSeconds: 2, maxDistanceMeters: 1000, opacity: 0.025 };
  const options = { settings, requestRender: vi.fn(), onError: vi.fn(),
    ...(smokeEnabled ? { smokeSettings, getWorldFromEcef: () => null } : {}) };
  const visual = createAircraftEngineVisuals(sdk, {} as Scene, definition, options);
  const attachment = {} as TransformNode;
  const getNode = vi.fn(() => attachment);
  const rig = { getNode } as unknown as AircraftRig;
  const plume = () => vi.mocked(createEngineExhaust).mock.results.at(-1)!.value;
  const smoke = () => vi.mocked(createEngineSmoke).mock.results.at(-1)!.value;
  return { values, batch, createPropertyBatch, options, visual, attachment, getNode, rig, plume, smoke, smokeSettings };
}

describe("aircraft engine visual observations", () => {
  it("shares one noncreating native read between indicator, petals and plume", () => {
    const t = fixture();
    try {
      expect(t.visual.afterburnerActive()).toBeNull();
      t.visual.read();
      t.visual.updateRig(t.rig);
      expect(t.createPropertyBatch).toHaveBeenCalledOnce();
      const paths = t.createPropertyBatch.mock.calls[0][0];
      expect(new Set(paths).size).toBe(paths.length);
      expect(t.createPropertyBatch).toHaveBeenCalledWith(paths, { create: false });
      expect(t.batch.read).toHaveBeenCalledOnce();
      expect(t.visual.afterburnerActive()).toBe(false);
      expect(t.visual.nozzlePositionNorm()).toBe(0.2);
      expect(t.plume().update).toHaveBeenLastCalledWith({
        running: true, augmentation: false, powerNorm: 0.98,
        nozzlePositionNorm: 0.2, simulationTimeSeconds: 42, metalTemperatureKelvin: 973.15, gasTemperatureKelvin: 1600,
        hotSurfaceTemperaturesKelvin: [1123.15, 973.15],
        fuelFlowKgPerSecond: 4 * 0.45359237, afterburnerBurnedFuelFlowKgPerSecond: 0,
        exitRadiusMeters: undefined,
        ambientTemperatureKelvin: 518.67 * 5 / 9,
        upstreamGasTemperatureKelvin: 1003.15,
        ambientPressurePascal: 2116.22 * 47.88025898033584,
      }, settings);
      t.values.set("propulsion/engine[0]/augmentation", 1);
      t.visual.read(); t.visual.updateRig(t.rig);
      expect(t.visual.afterburnerActive()).toBe(true);
      expect(t.plume().update).toHaveBeenLastCalledWith(expect.objectContaining({ augmentation: true }), settings);
      expect(t.getNode).toHaveBeenCalledTimes(3);
      expect(createEngineExhaust).toHaveBeenCalledOnce();
      // Camera/requested frames during pause use the same native clock.
      t.visual.read(); t.visual.updateRig(t.rig);
      expect(t.plume().update).toHaveBeenLastCalledWith(expect.objectContaining({ simulationTimeSeconds: 42 }), settings);
    } finally { t.visual.dispose(); }
    expect(t.batch.dispose).toHaveBeenCalledOnce();
    expect(t.plume().dispose).toHaveBeenCalledOnce();
  });

  it("passes supplied and burned fuel independently in SI units without inventing absent energy sources", () => {
    const t = fixture();
    try {
      t.values.set("propulsion/engine[0]/augmentation", 1);
      t.values.set("propulsion/engine[0]/thermal/afterburner-burned-fuel-flow-kg-sec", .6);
      t.visual.read(); t.visual.updateRig(t.rig);
      expect(t.plume().update).toHaveBeenLastCalledWith(expect.objectContaining({
        augmentation: true, fuelFlowKgPerSecond: 1.81436948, afterburnerBurnedFuelFlowKgPerSecond: .6,
      }), settings);
      for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
        t.values.set("propulsion/engine[0]/fuel-flow-rate-pps", invalid);
        t.values.set("propulsion/engine[0]/thermal/afterburner-burned-fuel-flow-kg-sec", invalid);
        t.visual.read(); t.visual.updateRig(t.rig);
        expect(t.plume().update).toHaveBeenLastCalledWith(expect.objectContaining({
          running: false, fuelFlowKgPerSecond: undefined, afterburnerBurnedFuelFlowKgPerSecond: undefined,
        }), settings);
      }
    } finally { t.visual.dispose(); }
  });

  it("converts native ambient Rankine once and leaves unavailable mixing temperatures absent", () => {
    const t = fixture();
    try {
      t.visual.read(); t.visual.updateRig(t.rig);
      expect(vi.mocked(t.plume().update).mock.lastCall![0].ambientTemperatureKelvin).toBeCloseTo(288.15);
      expect(vi.mocked(t.plume().update).mock.lastCall![0].upstreamGasTemperatureKelvin).toBeCloseTo(1003.15);
      expect(vi.mocked(t.plume().update).mock.lastCall![0].ambientPressurePascal).toBeCloseTo(101325, -1);
      for (const invalid of [Number.NaN, Infinity, 0, -1]) {
        t.values.set("atmosphere/T-R", invalid);
        t.values.set("atmosphere/P-psf", invalid);
        t.visual.read(); t.visual.updateRig(t.rig);
        expect(vi.mocked(t.plume().update).mock.lastCall![0].ambientTemperatureKelvin).toBeUndefined();
        expect(vi.mocked(t.plume().update).mock.lastCall![0].ambientPressurePascal).toBeUndefined();
      }
    } finally { t.visual.dispose(); }
  });

  it("preserves observed heat after fuel cutoff and rejects unavailable or impossible temperatures", () => {
    const t = fixture();
    try {
      t.values.set("propulsion/engine[0]/fuel-flow-rate-pps", 0);
      t.values.set("propulsion/engine[0]/n2", 0);
      t.visual.read(); t.visual.updateRig(t.rig);
      expect(t.plume().update).toHaveBeenLastCalledWith(expect.objectContaining({
        running: false, powerNorm: 0, metalTemperatureKelvin: 973.15,
      }), settings);
      t.values.set("propulsion/engine[0]/thermal/metal-temperature-k", 723.15);
      t.visual.read(); t.visual.updateRig(t.rig);
      expect(t.plume().update).toHaveBeenLastCalledWith(expect.objectContaining({
        running: false, metalTemperatureKelvin: 723.15,
      }), settings);
      for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, -300]) {
        t.values.set("propulsion/engine[0]/thermal/metal-temperature-k", invalid);
        t.visual.read(); t.visual.updateRig(t.rig);
        expect(t.plume().update).toHaveBeenLastCalledWith(expect.objectContaining({ metalTemperatureKelvin: undefined }), settings);
      }
      t.values.delete("propulsion/engine[0]/thermal/metal-temperature-k");
      t.visual.read(); t.visual.updateRig(t.rig);
      expect(t.plume().update).toHaveBeenLastCalledWith(expect.objectContaining({ metalTemperatureKelvin: undefined }), settings);
    } finally { t.visual.dispose(); }
  });

  it.each([["K", 1000], ["degC", 726.85], ["degF", 1340.33]] as const)("uses declared %s units and property paths without aircraft-name assumptions", (unit, value) => {
    const aircraft = getAircraftDefinition("f-35b");
    const temperatureProperty = "propulsion/engine[0]/test-temperature";
    const t = fixture(false, { ...aircraft, exhaustSources: aircraft.exhaustSources!.map(source => ({
      ...source, hotSurfaceRegions: undefined, hotSurfaceTemperature: { property: temperatureProperty, unit },
    })) });
    try {
      t.values.set(temperatureProperty, value);
      t.visual.read(); t.visual.updateRig(t.rig);
      const temperature = vi.mocked(t.plume().update).mock.calls.at(-1)![0].metalTemperatureKelvin;
      expect(temperature).toBeCloseTo(1000, 8);
      expect(t.createPropertyBatch.mock.calls[0][0]).toContain(temperatureProperty);
      expect(t.createPropertyBatch.mock.calls[0][0]).not.toContain("propulsion/engine[0]/thermal/metal-temperature-k");
    } finally { t.visual.dispose(); }
  });

  it("does not substitute high power for missing augmentation and hides missing/cutoff fuel", () => {
    const t = fixture();
    try {
      t.values.delete("propulsion/engine[0]/augmentation");
      t.values.delete("propulsion/engine[0]/nozzle-pos-norm");
      t.values.set("propulsion/engine[0]/n2", 110);
      t.visual.read(); t.visual.updateRig(t.rig);
      expect(t.visual.afterburnerActive()).toBeNull();
      expect(t.visual.nozzlePositionNorm()).toBeUndefined();
      expect(t.plume().update).toHaveBeenLastCalledWith(expect.objectContaining({
        augmentation: false, powerNorm: 1, nozzlePositionNorm: undefined,
      }), settings);
      for (const fuel of [0, Number.NaN]) {
        t.values.set("propulsion/engine[0]/fuel-flow-rate-pps", fuel);
        t.visual.read(); t.visual.updateRig(t.rig);
        expect(t.plume().update).toHaveBeenLastCalledWith(expect.objectContaining({ running: false }), settings);
      }
    } finally { t.visual.dispose(); }
  });

  it("observes gas and metal independently and requires declared native validity flags", () => {
    const t = fixture();
    try {
      t.values.set("propulsion/engine[0]/thermal/initialized", 0);
      t.visual.read(); t.visual.updateRig(t.rig);
      expect(t.plume().update).toHaveBeenLastCalledWith(expect.objectContaining({
        metalTemperatureKelvin: undefined, gasTemperatureKelvin: 1600,
        hotSurfaceTemperaturesKelvin: [1123.15, undefined],
      }), settings);
      t.values.set("propulsion/engine[0]/thermal/initialized", 1);
      t.values.set("propulsion/engine[0]/thermal/nozzle-gas-temperature-k", 2200);
      t.visual.read(); t.visual.updateRig(t.rig);
      expect(t.plume().update).toHaveBeenLastCalledWith(expect.objectContaining({
        metalTemperatureKelvin: 973.15, gasTemperatureKelvin: 2200,
      }), settings);
      for (const valid of [0, Number.NaN]) {
        t.values.set("propulsion/engine[0]/thermal/valid", valid);
        t.visual.read(); t.visual.updateRig(t.rig);
        expect(t.plume().update).toHaveBeenLastCalledWith(expect.objectContaining({
          metalTemperatureKelvin: undefined, gasTemperatureKelvin: undefined,
        }), settings);
      }
    } finally { t.visual.dispose(); }
  });

  it("releases disabled and replaced rigs, keeps the indicator independent, and rebinds once", () => {
    const t = fixture();
    try {
      t.values.set("propulsion/engine[0]/augmentation", 1);
      t.visual.read(); t.visual.updateRig(t.rig);
      const first = t.plume();
      t.visual.setSettings({ ...settings, enabled: false });
      expect(first.dispose).toHaveBeenCalledOnce();
      t.visual.updateRig(t.rig);
      expect(createEngineExhaust).toHaveBeenCalledOnce();
      expect(t.visual.afterburnerActive()).toBe(true);
      t.visual.setSettings({ ...settings, sampleCount: 16 });
      expect(createEngineExhaust).toHaveBeenCalledTimes(2);
      const second = t.plume();
      const next = { getNode: vi.fn(() => ({} as TransformNode)) } as unknown as AircraftRig;
      t.visual.updateRig(next);
      expect(second.dispose).toHaveBeenCalledOnce();
      expect(createEngineExhaust).toHaveBeenCalledTimes(3);
      t.visual.updateRig(null);
      expect(t.plume().dispose).toHaveBeenCalledOnce();
    } finally { t.visual.dispose(); }
  });

  it("reports a missing installation attachment once instead of silently creating a fallback", () => {
    const t = fixture();
    try {
      const getNode = vi.fn(() => null);
      const missing = { getNode } as unknown as AircraftRig;
      t.visual.read();
      t.visual.updateRig(missing);
      expect(getNode).toHaveBeenCalledOnce();
      t.visual.updateRig(missing);
      t.visual.updateRig(null);
      t.visual.updateRig(missing);
      expect(createEngineExhaust).not.toHaveBeenCalled();
      expect(t.options.onError).toHaveBeenCalledExactlyOnceWith("Exhaust main-exhaust: missing attachment F135_Exhaust");
    } finally { t.visual.dispose(); }
  });

  it("shares observations/attachment with independent smoke, forwards live budgets and resets relocation", () => {
    const t = fixture(true);
    try {
      t.visual.read(); t.visual.updateRig(t.rig);
      const trail = t.smoke();
      expect(t.getNode).toHaveBeenCalledTimes(3);
      expect(trail.update).toHaveBeenLastCalledWith(expect.objectContaining({ running: true, simulationTimeSeconds: 42 }), t.smokeSettings);
      t.visual.setSettings({ ...settings, enabled: false });
      expect(t.plume().dispose).toHaveBeenCalledOnce();
      expect(trail.dispose).not.toHaveBeenCalled();
      const next = { ...t.smokeSettings, maxParticles: 128 };
      t.visual.setSmokeSettings(next);
      expect(trail.update).toHaveBeenLastCalledWith(expect.objectContaining({ powerNorm: 0.98 }), next);
      expect(createEngineSmoke).toHaveBeenCalledOnce();
      t.visual.resetSmoke();
      expect(trail.resetEpoch).toHaveBeenCalledOnce();
      t.visual.setSmokeSettings({ ...next, enabled: false });
      expect(trail.dispose).toHaveBeenCalledOnce();
    } finally { t.visual.dispose(); }
  });

  it("reports a malformed setup once and does not retry it every view frame", () => {
    const t = fixture();
    vi.mocked(createEngineExhaust).mockImplementationOnce(() => { throw new Error("invalid declared dimensions"); });
    try {
      t.visual.read(); t.visual.updateRig(t.rig); t.visual.updateRig(t.rig);
      expect(createEngineExhaust).toHaveBeenCalledOnce();
      expect(t.getNode).toHaveBeenCalledTimes(3);
      expect(t.options.onError).toHaveBeenCalledExactlyOnceWith("Exhaust main-exhaust: invalid declared dimensions");
    } finally { t.visual.dispose(); }
  });

  it("draws changes in the pending frame once and still wakes for out-of-frame changes", () => {
    const t = fixture();
    try {
      t.visual.read(); t.visual.updateRig(t.rig);
      const request = vi.mocked(createEngineExhaust).mock.calls.at(-1)![1].requestRender!;
      vi.mocked(t.plume().update).mockImplementation(() => request());
      t.options.requestRender.mockClear();
      t.visual.updateRig(t.rig, true);
      expect(t.options.requestRender).not.toHaveBeenCalled();
      t.visual.setSettings({ ...settings, intensity: 2 });
      expect(t.options.requestRender).toHaveBeenCalledOnce();
      request(); // e.g. asynchronous shader/texture readiness, after the frame.
      expect(t.options.requestRender).toHaveBeenCalledTimes(2);
    } finally { t.visual.dispose(); }
  });
});
