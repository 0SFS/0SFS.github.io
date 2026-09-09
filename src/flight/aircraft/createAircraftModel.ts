import "@babylonjs/loaders/glTF";

import {
  LoadAssetContainerAsync,
  Quaternion,
  TransformNode,
  type AssetContainer,
  type Scene,
} from "@babylonjs/core";
import { bindAircraftRig, disposeAircraftRig, type AircraftRig } from "./aircraftAnimation";
import {
  getAircraftDefinition,
  resolveLod,
  type AircraftId,
  type AircraftLodId,
} from "./aircraftCatalog";

export type AircraftModelStatus = "placeholder" | "loading" | "ready" | "error";

export interface AircraftModelState {
  aircraftId: AircraftId;
  lodId: AircraftLodId;
  /** The mesh actually in the scene, which differs from lodId under "auto". */
  activeLodId: AircraftLodId | null;
  /** Whether opt-in levels are switched on. See `optIn` in the catalog. */
  optInEnabled: boolean;
  status: AircraftModelStatus;
  triangles: number | null;
  error: string | null;
}

export interface AircraftModelOptions {
  aircraftId: AircraftId;
  lodId: AircraftLodId;
  optInEnabled?: boolean;
  /** Chase distance drives "auto" level selection. */
  getChaseDistanceMeters?(): number;
  onStateChange?(state: AircraftModelState): void;
  /** Overridable so tests can avoid a real network fetch. */
  loadContainer?(url: string, scene: Scene): Promise<AssetContainer>;
}

export interface AircraftModelHandle {
  root: TransformNode;
  getState(): AircraftModelState;
  /** Moving parts of the loaded mesh, or null while none is in the scene. */
  getRig(): AircraftRig | null;
  setAircraft(id: AircraftId): void;
  setLod(id: AircraftLodId): void;
  setOptInEnabled(enabled: boolean): void;
  /** Re-evaluate "auto" against the current chase distance. Cheap to call. */
  refreshAutoLod(): void;
  dispose(): void;
}

function resolveAssetUrl(path: string): string {
  const base = (import.meta.env?.BASE_URL ?? "/") as string;
  return `${base.endsWith("/") ? base : `${base}/`}${path}`;
}

export function createAircraftModel(
  scene: Scene,
  parent: TransformNode,
  options: AircraftModelOptions,
): AircraftModelHandle {
  const root = new TransformNode("aircraft-model", scene);
  root.parent = parent;

  const loadContainer = options.loadContainer ?? ((url, target) => LoadAssetContainerAsync(url, target));
  const getChaseDistance = options.getChaseDistanceMeters ?? (() => 0);

  let container: AssetContainer | null = null;
  let rig: AircraftRig | null = null;
  let loadToken = 0;
  let activeKey: string | null = null;
  let state: AircraftModelState = {
    aircraftId: options.aircraftId,
    lodId: options.lodId,
    activeLodId: null,
    optInEnabled: options.optInEnabled ?? false,
    status: "placeholder",
    triangles: null,
    error: null,
  };

  const publish = (partial: Partial<AircraftModelState>): void => {
    state = { ...state, ...partial };
    options.onStateChange?.(state);
  };

  const clearContainer = (): void => {
    if (rig) disposeAircraftRig(rig);
    container?.dispose();
    container = null;
    rig = null;
  };

  const apply = (): void => {
    const definition = getAircraftDefinition(state.aircraftId);
    const lod = resolveLod(definition, state.lodId, getChaseDistance(), state.optInEnabled);

    if (!lod) {
      loadToken += 1;
      clearContainer();
      activeKey = null;
      publish({ activeLodId: null, status: "placeholder", triangles: null, error: null });
      return;
    }

    const key = `${definition.id}:${lod.id}`;
    if (key === activeKey && state.status === "ready") return;

    const token = ++loadToken;
    publish({ status: "loading", error: null });

    loadContainer(resolveAssetUrl(lod.path), scene)
      .then((next) => {
        if (token !== loadToken) {
          next.dispose();
          return;
        }
        clearContainer();
        container = next;
        next.addAllToScene();
        for (const node of next.rootNodes) node.parent = root;
        // The aircraft is never a pick or collision target; the sim raycasts
        // terrain only, and leaving these pickable would let the chase camera
        // and the visible-mesh collision probe hit the aircraft itself.
        for (const mesh of next.meshes) mesh.isPickable = false;
        rig = bindAircraftRig(next.transformNodes.concat(next.meshes), {
          scene,
          propellerBlades: definition.propellerBlades,
        });
        root.rotationQuaternion = Quaternion.RotationYawPitchRoll(definition.modelYawRad, 0, 0);
        root.position.set(definition.modelOffset.x, definition.modelOffset.y, definition.modelOffset.z);
        activeKey = key;
        publish({ activeLodId: lod.id, status: "ready", triangles: lod.triangles, error: null });
      })
      .catch((error: unknown) => {
        if (token !== loadToken) return;
        activeKey = null;
        publish({
          activeLodId: null,
          status: "error",
          triangles: null,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  };

  apply();

  return {
    root,
    getState: () => state,
    getRig: () => rig,
    setAircraft(id): void {
      if (id === state.aircraftId) return;
      state = { ...state, aircraftId: id };
      activeKey = null;
      clearContainer();
      apply();
    },
    setLod(id): void {
      if (id === state.lodId) return;
      state = { ...state, lodId: id };
      apply();
    },
    setOptInEnabled(enabled): void {
      if (enabled === state.optInEnabled) return;
      state = { ...state, optInEnabled: enabled };
      apply();
    },
    refreshAutoLod(): void {
      if (state.lodId !== "auto") return;
      apply();
    },
    dispose(): void {
      loadToken += 1;
      clearContainer();
      root.dispose();
    },
  };
}
