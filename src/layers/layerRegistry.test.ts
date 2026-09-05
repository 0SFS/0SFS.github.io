import { describe, expect, it, vi } from "vitest";
import { createLayerRegistry } from "./layerRegistry";
import type { GlobeLayerContext } from "../engine/types";
import type { PoiTrackingHandle } from "./poiTracking";
import type { HemisphereCullingHandle } from "../perf/culling";
import type { AnchorHeightResolver } from "../terrain/anchorHeight";

function createPoiTrackingMock(): PoiTrackingHandle {
  return {
    setPois: vi.fn(),
    enterTracking: vi.fn(),
    exitTracking: vi.fn(),
    isTracking: vi.fn(() => false),
    getOrbitTarget: vi.fn(() => null),
    destroy: vi.fn(),
  };
}

function createCullingMock(): HemisphereCullingHandle {
  return {
    setCullables: vi.fn(),
    update: vi.fn(() => ({ total: 0, visible: 0, hidden: 0 })),
    getStats: vi.fn(() => ({ total: 0, visible: 0, hidden: 0 })),
    destroy: vi.fn(),
  };
}

function createAnchorHeightsMock(): AnchorHeightResolver {
  return {
    resolve: vi.fn(() => null),
    resolveHeight: vi.fn(() => 0),
    setSample: vi.fn(),
    getCachedHeight: vi.fn(() => null),
    clear: vi.fn(),
    setHeightOffset: vi.fn(),
  };
}

describe("createLayerRegistry", () => {
  it("captures layer state and syncs POIs and cullables", () => {
    const context: GlobeLayerContext = { scene: {}, engine: {} };
    const poiTracking = createPoiTrackingMock();
    const culling = createCullingMock();
    const anchorHeights = createAnchorHeightsMock();
    const poi = { mesh: { name: "poi" }, getPosition: () => null };
    const heightSample = { latDeg: 44.977753, lonDeg: -93.265011, heightMeters: 264 };
    const cullable = {
      kind: "point" as const,
      target: { setVisible: vi.fn() },
      getPosition: () => null,
    };
    const layer = {
      id: "layer-a",
      setup: vi.fn(() => ({ pois: [poi], cullables: [cullable], anchorHeightSamples: [heightSample] })),
      destroy: vi.fn(),
    };

    const registry = createLayerRegistry(context, poiTracking, culling, anchorHeights);
    registry.addLayer(layer);

    expect(layer.setup).toHaveBeenCalledWith(context);
    expect(poiTracking.setPois).toHaveBeenLastCalledWith([poi]);
    expect(culling.setCullables).toHaveBeenLastCalledWith([cullable]);
    expect(anchorHeights.clear).toHaveBeenCalledTimes(1);
    expect(anchorHeights.setSample).toHaveBeenCalledWith(heightSample);
  });

  it("destroys replaced and removed layers and clears registered state", () => {
    const context: GlobeLayerContext = { scene: {}, engine: {} };
    const poiTracking = createPoiTrackingMock();
    const culling = createCullingMock();
    const firstLayer = { id: "same-id", setup: vi.fn(() => ({})), destroy: vi.fn() };
    const replacementLayer = { id: "same-id", setup: vi.fn(() => ({})), destroy: vi.fn() };

    const registry = createLayerRegistry(context, poiTracking, culling);
    registry.addLayer(firstLayer);
    registry.addLayer(replacementLayer);
    registry.removeLayer("same-id");

    expect(firstLayer.destroy).toHaveBeenCalledWith(context);
    expect(replacementLayer.destroy).toHaveBeenCalledWith(context);
    expect(poiTracking.setPois).toHaveBeenLastCalledWith([]);
    expect(culling.setCullables).toHaveBeenLastCalledWith([]);
  });
});