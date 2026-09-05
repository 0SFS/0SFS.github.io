import type { GlobeLayer, GlobeLayerContext, GlobeLayerState } from "../engine/types";
import type { BabylonLayerState, PoiDescriptor } from "./types";
import type { PoiTrackingHandle } from "./poiTracking";
import type { CullablePrimitive, HemisphereCullingHandle } from "../perf/culling";
import type { AnchorHeightResolver, AnchorHeightSample } from "../terrain/anchorHeight";

export interface LayerRegistryHandle {
  addLayer(layer: GlobeLayer): void;
  removeLayer(layerId: string): void;
  /** Tear down all layers and clear the POI set. */
  destroy(): void;
}

function collectPois(state: BabylonLayerState): PoiDescriptor[] {
  return state.pois ?? [];
}

function collectCullables(state: BabylonLayerState): CullablePrimitive[] {
  return state.cullables ?? [];
}

function collectAnchorHeightSamples(state: BabylonLayerState): AnchorHeightSample[] {
  return state.anchorHeightSamples ?? [];
}

/**
 * Manages the lifecycle of GlobeLayer instances and keeps the POI tracking
 * module in sync with the registered layer states.
 *
 * Calling `addLayer` captures the `GlobeLayerState` returned by `setup()` and
 * immediately rebuilds the active POI set so tracking stays consistent.
 */
export function createLayerRegistry(
  context: GlobeLayerContext,
  poiTracking: PoiTrackingHandle,
  culling?: HemisphereCullingHandle,
  anchorHeights?: AnchorHeightResolver,
): LayerRegistryHandle {
  const layers = new Map<string, { layer: GlobeLayer; state: BabylonLayerState }>();

  function rebuildPois(): void {
    const allPois: PoiDescriptor[] = [];
    for (const { state } of layers.values()) {
      allPois.push(...collectPois(state));
    }
    poiTracking.setPois(allPois);
  }

  function rebuildCullables(): void {
    if (!culling) return;
    const allCullables: CullablePrimitive[] = [];
    for (const { state } of layers.values()) {
      allCullables.push(...collectCullables(state));
    }
    culling.setCullables(allCullables);
  }

  function rebuildAnchorHeightSamples(): void {
    if (!anchorHeights) return;
    anchorHeights.clear();
    for (const { state } of layers.values()) {
      for (const sample of collectAnchorHeightSamples(state)) {
        anchorHeights.setSample(sample);
      }
    }
  }

  function addLayer(layer: GlobeLayer): void {
    if (layers.has(layer.id)) {
      removeLayer(layer.id);
    }
    const rawState: GlobeLayerState = layer.setup(context);
    const state = rawState as BabylonLayerState;
    layers.set(layer.id, { layer, state });
    rebuildPois();
    rebuildCullables();
    rebuildAnchorHeightSamples();
  }

  function removeLayer(layerId: string): void {
    const entry = layers.get(layerId);
    if (!entry) return;
    entry.layer.destroy(context);
    layers.delete(layerId);
    rebuildPois();
    rebuildCullables();
    rebuildAnchorHeightSamples();
  }

  function destroy(): void {
    for (const { layer } of layers.values()) {
      layer.destroy(context);
    }
    layers.clear();
    poiTracking.setPois([]);
    culling?.setCullables([]);
    anchorHeights?.clear();
  }

  return { addLayer, removeLayer, destroy };
}
