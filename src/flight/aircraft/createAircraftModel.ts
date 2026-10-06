import "@babylonjs/loaders/glTF";

import {
  LoadAssetContainerAsync,
  Quaternion,
  TransformNode,
  type AbstractMesh,
  type AssetContainer,
  type ISceneLoaderProgressEvent,
  type Scene,
} from "@babylonjs/core";
import { whenMeshesReady } from "foss-earth/runtime";
import { bindAircraftRig, disposeAircraftRig, type AircraftRig } from "./aircraftAnimation";
import {
  getAircraftDefinition,
  resolveLod,
  type AircraftId,
  type AircraftLodId,
  type AircraftLodMeshId,
} from "./aircraftCatalog";

export type AircraftModelStatus = "placeholder" | "loading" | "ready" | "error";

/** A mesh being fetched: bytes so far, and the total when the server gives one. */
export interface AircraftModelDownload {
  lodId: AircraftLodMeshId;
  loaded: number;
  total: number | null;
  /**
   * A level or aircraft the user chose, which nothing stands in for until it
   * is ready; false for one "Auto" picked, while the old mesh stays in view.
   */
  chosen: boolean;
}

export interface AircraftModelState {
  aircraftId: AircraftId;
  lodId: AircraftLodId;
  /** The mesh actually in the scene, which differs from lodId under "auto". */
  activeLodId: AircraftLodId | null;
  status: AircraftModelStatus;
  triangles: number | null;
  error: string | null;
  /** The mesh being loaded to replace or follow the one shown, or null. */
  download: AircraftModelDownload | null;
}

export interface AircraftModelOptions {
  aircraftId: AircraftId;
  lodId: AircraftLodId;
  /** Debug override: draw wheel/arm geometry even with the native gear fully stowed. */
  renderStowedGear?: boolean;
  /** Chase distance drives "auto" level selection. */
  getChaseDistanceMeters?(): number;
  onStateChange?(state: AircraftModelState): void;
  /** The loaded model's hierarchy for inspection; cleared before those nodes are disposed. */
  onMeshRootsChange?(roots: readonly TransformNode[]): void;
  /**
   * Asked once each time what the model shows changes: a mesh shown, or one
   * taken away. Nothing else here needs a frame - a download's progress is
   * text, and a mesh getting ready is hidden until it is.
   */
  requestRender?(): void;
  /** Overridable so tests can avoid a real network fetch. */
  loadContainer?(url: string, scene: Scene, onProgress: (event: ISceneLoaderProgressEvent) => void): Promise<AssetContainer>;
  /** Overridable so tests need no compiled materials: resolves when the meshes can be drawn. */
  whenReady?(meshes: readonly AbstractMesh[], signal: AbortSignal): Promise<void>;
}

export interface AircraftModelHandle {
  root: TransformNode;
  getState(): AircraftModelState;
  /** Moving parts of the loaded mesh, or null while none is in the scene. */
  getRig(): AircraftRig | null;
  setAircraft(id: AircraftId): void;
  setLod(id: AircraftLodId): void;
  /** Re-evaluate "auto" against the current chase distance. Cheap to call. */
  refreshAutoLod(): void;
  /** Apply a live debug override using the most recent physical gear observation. */
  setRenderStowedGear(enabled: boolean): void;
  /** Cache physical travel, including during loading. Unknown observations preserve the last state. */
  updateGearVisibility(actualGearDownNorm: number, withinScheduledFrame?: boolean): void;
  dispose(): void;
}

function resolveAssetUrl(path: string): string {
  const base = (import.meta.env?.BASE_URL ?? "/") as string;
  return `${base.endsWith("/") ? base : `${base}/`}${path}`;
}

/** A mesh in the scene, under a node of its own that shows or hides all of it. */
interface LoadedModel {
  key: string;
  lodId: AircraftLodMeshId;
  triangles: number;
  container: AssetContainer;
  holder: TransformNode;
  stowedGearMeshes: { mesh: AbstractMesh; originalVisibility: boolean }[];
}

/**
 * The aircraft's visual mesh, at the level of detail chosen or picked by
 * distance.
 *
 * The scene renders on demand, so a model change is drawn in as few frames as
 * it can be and never in one that shows nothing new. A mesh is fetched, added
 * to the scene hidden, and shown only once every material in it has compiled
 * and every texture has loaded, so the frame that shows it draws all of it:
 *
 * - A level the user chooses, or another aircraft, takes the old mesh away at
 *   once - one frame, with the download's progress in `download` meanwhile -
 *   and shows the new one in a second frame when it is ready.
 * - A level "Auto" picks as the camera moves keeps the old mesh in view until
 *   the new one is ready, and swaps them in one frame.
 */
export function createAircraftModel(
  scene: Scene,
  parent: TransformNode,
  options: AircraftModelOptions,
): AircraftModelHandle {
  const root = new TransformNode("aircraft-model", scene);
  root.parent = parent;

  const loadContainer = options.loadContainer
    ?? ((url, target, onProgress) => LoadAssetContainerAsync(url, target, { onProgress }));
  const whenReady = options.whenReady ?? ((meshes, signal) => whenMeshesReady(meshes, { signal }));
  const getChaseDistance = options.getChaseDistanceMeters ?? (() => 0);
  const requestRender = (): void => options.requestRender?.();

  let shown: LoadedModel | null = null;
  let rig: AircraftRig | null = null;
  let pending: { key: string; controller: AbortController } | null = null;
  let disposed = false;
  let renderStowedGear = options.renderStowedGear ?? false;
  let actualGearDownNorm: number | null = null;
  let state: AircraftModelState = {
    aircraftId: options.aircraftId,
    lodId: options.lodId,
    activeLodId: null,
    status: "placeholder",
    triangles: null,
    error: null,
    download: null,
  };

  const publish = (partial: Partial<AircraftModelState>): void => {
    state = { ...state, ...partial };
    options.onStateChange?.(state);
  };

  const disposeModel = (model: LoadedModel): void => {
    model.container.dispose();
    model.holder.dispose();
  };

  /** Takes the shown mesh away. The caller asks for the frame. */
  const clearShown = (): void => {
    if (shown) options.onMeshRootsChange?.([]);
    if (rig) disposeAircraftRig(rig);
    rig = null;
    if (shown) disposeModel(shown);
    shown = null;
  };

  const cancelPending = (): void => {
    pending?.controller.abort();
    pending = null;
  };

  /** Hide only selected geometry; changing a parent would also hide any bay door beneath it. */
  const applyGearVisibility = (model: LoadedModel): boolean => {
    const hidden = !renderStowedGear && actualGearDownNorm === 0;
    let changed = false;
    for (const { mesh, originalVisibility } of model.stowedGearMeshes) {
      const visible = !hidden && originalVisibility;
      if (mesh.isVisible === visible) continue;
      mesh.isVisible = visible;
      changed = true;
    }
    return changed;
  };

  const load = (key: string, lodId: AircraftLodMeshId, path: string, triangles: number, chosen: boolean): void => {
    const controller = new AbortController();
    const current = { key, controller };
    pending = current;
    const isCurrent = (): boolean => pending === current && !disposed;
    const definition = getAircraftDefinition(state.aircraftId);
    publish({ status: "loading", error: null, download: { lodId, loaded: 0, total: null, chosen } });

    let loaded: LoadedModel | null = null;
    void (async () => {
      try {
        const container = await loadContainer(resolveAssetUrl(path), scene, (event) => {
          if (!isCurrent()) return;
          publish({ download: { lodId, loaded: event.loaded, total: event.lengthComputable ? event.total : null, chosen } });
        });
        if (!isCurrent()) {
          container.dispose();
          return;
        }
        // Into the scene hidden, so its materials compile for the lights that
        // will shine on it while nothing is drawn.
        const holder = new TransformNode(`aircraft-model-${lodId}`, scene);
        holder.parent = root;
        holder.setEnabled(false);
        const stowedGearNames = new Set(definition.stowedGearNodeNames ?? []);
        loaded = {
          key, lodId, triangles, container, holder,
          stowedGearMeshes: container.meshes
            .filter(mesh => stowedGearNames.has(mesh.name) || stowedGearNames.has(mesh.name.replace(/_primitive\d+$/, "")))
            .map(mesh => ({ mesh, originalVisibility: mesh.isVisible })),
        };
        for (const node of container.rootNodes) node.parent = holder;
        container.addAllToScene();
        // The aircraft is never a pick or collision target; the sim raycasts
        // terrain only, and leaving these pickable would let the chase camera
        // and the visible-mesh collision probe hit the aircraft itself.
        for (const mesh of container.meshes) mesh.isPickable = false;
        await whenReady(container.meshes, controller.signal);
        if (!isCurrent()) {
          disposeModel(loaded);
          return;
        }
        // One frame: the mesh it replaces goes and this one shows, whole.
        clearShown();
        shown = loaded;
        root.rotationQuaternion = Quaternion.RotationYawPitchRoll(definition.modelYawRad, 0, 0);
        root.position.set(definition.modelOffset.x, definition.modelOffset.y, definition.modelOffset.z);
        // Cached physics/debug state is applied before reveal; a loaded model
        // never flashes extended geometry while the native gear is stowed.
        applyGearVisibility(loaded);
        loaded.holder.setEnabled(true);
        rig = bindAircraftRig(container.transformNodes.concat(container.meshes), {
          scene,
          propellerBlades: definition.propellerBlades,
          aircraftId: definition.id,
        });
        options.onMeshRootsChange?.(container.rootNodes.filter((node): node is TransformNode => node instanceof TransformNode));
        pending = null;
        publish({ activeLodId: lodId, status: "ready", triangles, error: null, download: null });
        requestRender();
      } catch (error: unknown) {
        if (loaded && shown !== loaded) disposeModel(loaded);
        if (!isCurrent()) return;
        pending = null;
        const message = error instanceof Error ? error.message : String(error);
        // A level Auto was moving to failed: the one shown stays, and says why.
        if (shown) publish({ activeLodId: shown.lodId, status: "ready", triangles: shown.triangles, error: message, download: null });
        else publish({ activeLodId: null, status: "error", triangles: null, error: message, download: null });
      }
    })();
  };

  /**
   * Shows the level the state asks for. `chosen` is a choice the user made: it
   * takes the shown mesh away at once rather than leaving the old choice on
   * screen while the new one loads.
   */
  const apply = (chosen: boolean): void => {
    if (disposed) return;
    const definition = getAircraftDefinition(state.aircraftId);
    const lod = resolveLod(definition, state.lodId, getChaseDistance());

    if (!lod) {
      cancelPending();
      const hadModel = shown !== null;
      clearShown();
      publish({ activeLodId: null, status: "placeholder", triangles: null, error: null, download: null });
      if (hadModel) requestRender();
      return;
    }

    const key = `${definition.id}:${lod.id}`;
    if (pending?.key === key) return;
    if (shown?.key === key) {
      // Back to what is on screen while something else was loading.
      if (pending) {
        cancelPending();
        publish({ activeLodId: shown.lodId, status: "ready", triangles: shown.triangles, error: null, download: null });
      }
      return;
    }
    cancelPending();
    if (chosen && shown) {
      clearShown();
      publish({ activeLodId: null, triangles: null });
      requestRender();
    }
    load(key, lod.id, lod.path, lod.triangles, chosen || !shown);
  };

  apply(true);

  return {
    root,
    getState: () => state,
    getRig: () => rig,
    setAircraft(id): void {
      if (id === state.aircraftId) return;
      state = { ...state, aircraftId: id };
      apply(true);
    },
    setLod(id): void {
      if (id === state.lodId) return;
      state = { ...state, lodId: id };
      apply(true);
    },
    refreshAutoLod(): void {
      if (state.lodId !== "auto") return;
      apply(false);
    },
    setRenderStowedGear(enabled): void {
      if (disposed || enabled === renderStowedGear) return;
      renderStowedGear = enabled;
      if (shown && applyGearVisibility(shown)) requestRender();
    },
    updateGearVisibility(position, withinScheduledFrame = false): void {
      if (disposed || !Number.isFinite(position) || position < 0 || position > 1 || position === actualGearDownNorm) return;
      actualGearDownNorm = position;
      if (shown && applyGearVisibility(shown) && !withinScheduledFrame) requestRender();
    },
    dispose(): void {
      disposed = true;
      cancelPending();
      clearShown();
      root.dispose();
    },
  };
}
