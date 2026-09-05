import type { AbstractMesh, Engine, Scene, Vector3, WebGPUEngine } from "@babylonjs/core";
import type { CullablePrimitive } from "../perf/culling";
import type { AnchorHeightSample } from "../terrain/anchorHeight";
import type { GlobeLayer, GlobeLayerContext, GlobeLayerState } from "../engine/types";

// ─── Babylon-typed context ────────────────────────────────────────────────────

/**
 * Babylon-typed layer context.
 * Use `asBabylonContext(ctx)` inside your `GlobeLayer.setup()` to access
 * properly-typed Babylon scene and engine references.
 */
export interface BabylonLayerContext {
  scene: Scene;
  engine: Engine | WebGPUEngine;
}

/**
 * Cast an engine-neutral `GlobeLayerContext` to a Babylon-typed one.
 * Call this at the top of your `GlobeLayer.setup()` or `destroy()` method.
 */
export function asBabylonContext(context: GlobeLayerContext): BabylonLayerContext {
  return context as unknown as BabylonLayerContext;
}

// ─── POI types ────────────────────────────────────────────────────────────────

/**
 * A registered point of interest backed by a Babylon mesh.
 * When the user clicks the mesh the camera enters tracking mode, keeping the
 * POI at the orbit center until the user clicks elsewhere or resets north-up.
 */
export interface PoiDescriptor {
  /** The mesh the user clicks to enter tracking mode. */
  mesh: AbstractMesh;
  /** Returns the ECEF orbit target position (may change each frame). */
  getPosition(): Vector3 | null;
  /** Called once when tracking this POI begins. */
  onTrackingEnter?(): void;
  /** Called once when tracking this POI ends. */
  onTrackingExit?(): void;
}

/**
 * Babylon-typed layer state.
 * Return this from your `GlobeLayer.setup()` — the registry will extract POIs
 * automatically.
 */
export interface BabylonLayerState extends GlobeLayerState {
  /** Meshes that act as points of interest for camera tracking. */
  pois?: PoiDescriptor[];
  /** Optional orbit anchor override while a POI from this layer is tracked. */
  getPoiOrbitTarget?(): Vector3 | null;
  /** Meshes or polylines that can be horizon-culled by the globe runtime. */
  cullables?: CullablePrimitive[];
  /** Cheap precomputed local height samples for compass anchor placement. */
  anchorHeightSamples?: AnchorHeightSample[];
}

export function createMeshCullable(mesh: AbstractMesh, getPosition = (): Vector3 | null => mesh.getAbsolutePosition()): CullablePrimitive {
  return {
    kind: "point",
    target: { setVisible: (visible) => mesh.setEnabled(visible) },
    getPosition,
  };
}

// ─── Compatibility adapter ────────────────────────────────────────────────────

/**
 * Compatibility adapter: build a `GlobeLayer` with Babylon-typed callbacks,
 * handling the engine-neutral → Babylon cast automatically.
 *
 * Use this when migrating layer code from the Cesium globe implementation.
 *
 * @example
 * ```ts
 * const layer = createBabylonLayer({
 *   id: "my-layer",
 *   setup(ctx) {
 *     const mesh = MeshBuilder.CreateSphere("poi", { diameter: 50 }, ctx.scene);
 *     return {
 *       pois: [{ mesh, getPosition: () => mesh.getAbsolutePosition() }],
 *       cullables: [createMeshCullable(mesh)],
 *     };
 *   },
 *   destroy(ctx) {
 *     ctx.scene.getMeshByName("poi")?.dispose();
 *   },
 * });
 * ```
 */
export function createBabylonLayer(opts: {
  id: string;
  setup(context: BabylonLayerContext): BabylonLayerState;
  destroy(context: BabylonLayerContext): void;
}): GlobeLayer {
  return {
    id: opts.id,
    setup(context: GlobeLayerContext): GlobeLayerState {
      return opts.setup(asBabylonContext(context));
    },
    destroy(context: GlobeLayerContext): void {
      opts.destroy(asBabylonContext(context));
    },
  };
}
