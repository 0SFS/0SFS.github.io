import { describe, expect, it, vi } from "vitest";
import type { JSBSimSdk } from "@felipegalind0/jsbsim";
import type { Scene, TransformNode } from "@babylonjs/core";
import type { AircraftRig } from "./aircraftAnimation";
import { getAircraftDefinition } from "./aircraftCatalog";
import { createAircraftEngineVisuals } from "./createAircraftEngineVisuals";
import { createEngineExhaust } from "./createEngineExhaust";
import { createEngineSmoke } from "./createEngineSmoke";

vi.mock("./createEngineExhaust", () => ({ createEngineExhaust: vi.fn(() => ({
  ready: Promise.resolve(), update: vi.fn(), dispose: vi.fn(),
})) }));
vi.mock("./createEngineSmoke", () => ({ createEngineSmoke: vi.fn(() => ({
  ready: Promise.resolve(), update: vi.fn(), resetEpoch: vi.fn(), dispose: vi.fn(),
})) }));

const settings = { enabled: true, sampleCount: 8, maxDistanceMeters: 2000, intensity: 1 };

function fixture(smokeEnabled = false) {
  vi.mocked(createEngineExhaust).mockClear();
  vi.mocked(createEngineSmoke).mockClear();
  const values = new Map<string, number>([
    ["propulsion/engine[0]/augmentation", 0], ["propulsion/engine[0]/nozzle-pos-norm", 0.2],
    ["propulsion/engine[0]/n2", 98], ["propulsion/engine[0]/fuel-flow-rate-pps", 4],
    ["simulation/sim-time-sec", 42],
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
  const visual = createAircraftEngineVisuals(sdk, {} as Scene, getAircraftDefinition("f-35b"), options);
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
        nozzlePositionNorm: 0.2, simulationTimeSeconds: 42,
      }, settings);
      t.values.set("propulsion/engine[0]/augmentation", 1);
      t.visual.read(); t.visual.updateRig(t.rig);
      expect(t.visual.afterburnerActive()).toBe(true);
      expect(t.plume().update).toHaveBeenLastCalledWith(expect.objectContaining({ augmentation: true }), settings);
      expect(t.getNode).toHaveBeenCalledOnce();
      expect(createEngineExhaust).toHaveBeenCalledOnce();
      // Camera/requested frames during pause use the same native clock.
      t.visual.read(); t.visual.updateRig(t.rig);
      expect(t.plume().update).toHaveBeenLastCalledWith(expect.objectContaining({ simulationTimeSeconds: 42 }), settings);
    } finally { t.visual.dispose(); }
    expect(t.batch.dispose).toHaveBeenCalledOnce();
    expect(t.plume().dispose).toHaveBeenCalledOnce();
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
      expect(t.options.onError).toHaveBeenCalledExactlyOnceWith("Exhaust main-exhaust: missing attachment vtol");
    } finally { t.visual.dispose(); }
  });

  it("shares observations/attachment with independent smoke, forwards live budgets and resets relocation", () => {
    const t = fixture(true);
    try {
      t.visual.read(); t.visual.updateRig(t.rig);
      const trail = t.smoke();
      expect(t.getNode).toHaveBeenCalledOnce();
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
      expect(t.getNode).toHaveBeenCalledOnce();
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
