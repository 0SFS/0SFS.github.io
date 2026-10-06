import "@babylonjs/loaders/glTF";
import {
  LoadAssetContainerAsync, Matrix, Quaternion, TransformNode, Vector3,
  type AbstractMesh, type AssetContainer, type InstantiatedEntries, type Scene,
} from "@babylonjs/core";
import { whenMeshesReady } from "foss-earth/runtime";
import { F35B_STRUCTURAL_REFERENCE_IN, type ExternalTankDefinition } from "./externalTankDefinitions";

export interface ExternalTankVisualOptions {
  requestRender?(): void;
  /** Double-precision ECEF -> scene east/up/south frame from the floating origin. */
  getWorldFromEcef(): { readonly m: ArrayLike<number> } | null;
  lifetimeSeconds: number;
  maxDetachedTanks: number;
  loadContainer?(url: string, scene: Scene): Promise<AssetContainer>;
  whenReady?(meshes: readonly AbstractMesh[], signal: AbortSignal): Promise<void>;
}

export interface ExternalTankVisualHandle {
  readonly ready: Promise<void>;
  sync(tanks: readonly { index: number; attached: boolean }[]): void;
  /** Scene east/up/south ground velocity, metres per second. Tank and pylon leave together. */
  jettison(index: number, worldVelocity: Vector3): void;
  /** Accepted simulation time only; zero rebases existing debris without advancing it. */
  update(dtSeconds: number): void;
  setLifetimeSeconds(seconds: number): void;
  setMaxDetachedTanks(count: number): void;
  resetDetached(): void;
  dispose(): void;
}

interface ReleasedTank {
  position: Float64Array;
  velocity: Float64Array;
  /** Three ECEF basis vectors, preserving release attitude across rebases. */
  axes: Float64Array;
  age: number;
  serial: number;
}
interface TankSlot {
  definition: ExternalTankDefinition;
  attached: boolean;
  installation: TransformNode;
  detached: TransformNode;
  released: ReleasedTank | null;
}

const GRAVITY_METERS_PER_SECOND_SQUARED = 9.80665;
const ASSET = "aircraft/f-35b/ExternalTank_FlightGear.glb";

/** Inverse of the floating origin's orthonormal rotation, kept in doubles. */
function toEcefVector(m: ArrayLike<number>, x: number, y: number, z: number, target: Float64Array, offset = 0): void {
  target[offset] = m[0] * x + m[1] * y + m[2] * z;
  target[offset + 1] = m[4] * x + m[5] * y + m[6] * z;
  target[offset + 2] = m[8] * x + m[9] * y + m[10] * z;
}

/**
 * 0sfs owns the external aircraft equipment. The retained FlightGear asset is
 * prepared once, hidden; clones share its geometry and materials. Each station
 * has one reusable release slot, so repeated respawning cannot accumulate debris.
 * Released stores have visual-only ballistic motion, without collision or aerodynamics.
 */
export function createExternalTankVisuals(
  scene: Scene,
  parent: TransformNode,
  definitions: readonly ExternalTankDefinition[],
  options: ExternalTankVisualOptions,
): ExternalTankVisualHandle {
  const abort = new AbortController();
  let disposed = false, ready = false, serial = 0;
  let container: AssetContainer | null = null;
  const entries: InstantiatedEntries[] = [];
  let lifetime = Math.max(0, options.lifetimeSeconds);
  let maximum = Math.max(0, Math.min(definitions.length, Math.floor(options.maxDetachedTanks)));
  const slots: TankSlot[] = definitions.map(definition => {
    const installation = new TransformNode(`external-tank-${definition.index}-attached`, scene);
    installation.parent = parent;
    // The parent is the flight body frame: +X left,+Y up,+Z forward.
    const cg = F35B_STRUCTURAL_REFERENCE_IN;
    installation.position.set(-definition.locationIn.y * 0.0254,
      (definition.locationIn.z - cg.z) * 0.0254, (cg.x - definition.locationIn.x) * 0.0254);
    installation.setEnabled(false);
    const detached = new TransformNode(`external-tank-${definition.index}-detached`, scene);
    detached.rotationQuaternion = Quaternion.Identity();
    detached.setEnabled(false);
    return { definition, installation, detached, attached: false, released: null };
  });
  const requestRender = (): void => options.requestRender?.();
  const hideReleased = (slot: TankSlot): boolean => {
    const visible = slot.detached.isEnabled();
    slot.released = null;
    slot.detached.setEnabled(false);
    return visible;
  };
  const enforceBudget = (): boolean => {
    let changed = false;
    const released = slots.filter(slot => slot.released !== null).sort((a, b) => b.released!.serial - a.released!.serial);
    for (const [i, slot] of released.entries()) {
      if (i >= maximum || slot.released!.age >= lifetime) changed = hideReleased(slot) || changed;
    }
    return changed;
  };
  const matrix = Matrix.Identity();
  const projectReleased = (slot: TankSlot, m: ArrayLike<number>): boolean => {
    const released = slot.released!;
    const p = released.position;
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
    const changed = slot.detached.position.x !== x || slot.detached.position.y !== y || slot.detached.position.z !== z;
    slot.detached.position.set(x, y, z);
    const a = released.axes;
    Matrix.FromValuesToRef(
      m[0] * a[0] + m[4] * a[1] + m[8] * a[2], m[1] * a[0] + m[5] * a[1] + m[9] * a[2], m[2] * a[0] + m[6] * a[1] + m[10] * a[2], 0,
      m[0] * a[3] + m[4] * a[4] + m[8] * a[5], m[1] * a[3] + m[5] * a[4] + m[9] * a[5], m[2] * a[3] + m[6] * a[4] + m[10] * a[5], 0,
      m[0] * a[6] + m[4] * a[7] + m[8] * a[8], m[1] * a[6] + m[5] * a[7] + m[9] * a[8], m[2] * a[6] + m[6] * a[7] + m[10] * a[8], 0,
      0, 0, 0, 1, matrix,
    );
    const q = slot.detached.rotationQuaternion!;
    const previousX = q.x, previousY = q.y, previousZ = q.z, previousW = q.w;
    Quaternion.FromRotationMatrixToRef(matrix, q);
    return changed || q.x !== previousX || q.y !== previousY || q.z !== previousZ || q.w !== previousW;
  };
  const releaseResources = (): void => {
    for (const entry of entries.splice(0)) entry.dispose();
    for (const slot of slots) { slot.installation.dispose(); slot.detached.dispose(); }
    container?.dispose();
    container = null;
  };
  const prepare = async (): Promise<void> => {
    if (definitions.length === 0) { ready = true; return; }
    const base = (import.meta.env?.BASE_URL ?? "/") as string;
    const url = `${base.endsWith("/") ? base : base + "/"}${ASSET}`;
    try {
      const loaded = await (options.loadContainer ?? LoadAssetContainerAsync)(url, scene);
      if (disposed) { loaded.dispose(); return; }
      container = loaded;
      const meshes: AbstractMesh[] = [];
      for (const slot of slots) for (const holder of [slot.installation, slot.detached]) {
        const instance = loaded.instantiateModelsToScene(name => `${holder.name}-${name}`, false, { doNotInstantiate: true });
        entries.push(instance);
        for (const node of instance.rootNodes) node.parent = holder;
        for (const mesh of holder.getChildMeshes()) {
          mesh.isPickable = false;
          mesh.metadata = { ...mesh.metadata, aircraftVisualOnly: true, externalTankIndex: slot.definition.index };
          meshes.push(mesh);
        }
      }
      await (options.whenReady ?? ((meshes, signal) => whenMeshesReady(meshes, { signal })))(meshes, abort.signal);
      if (disposed) return;
      ready = true;
      let changed = false;
      for (const slot of slots) {
        slot.installation.setEnabled(slot.attached);
        changed = slot.installation.isEnabled() || changed;
      }
      if (changed) requestRender();
    } catch (error) {
      if (disposed) return;
      disposed = true;
      releaseResources();
      throw error;
    }
  };
  return {
    ready: prepare(),
    sync(tanks): void {
      if (disposed) return;
      let changed = false;
      for (const slot of slots) {
        const attached = tanks.find(tank => tank.index === slot.definition.index)?.attached ?? false;
        if (slot.attached === attached) continue;
        slot.attached = attached;
        const wasVisible = slot.installation.isEnabled();
        slot.installation.setEnabled(ready && attached);
        changed = wasVisible !== slot.installation.isEnabled() || changed;
      }
      if (changed) requestRender();
    },
    jettison(index, worldVelocity): void {
      if (disposed) return;
      const slot = slots.find(slot => slot.definition.index === index);
      if (!slot?.attached) return;
      const wasVisible = slot.installation.isEnabled();
      const frame = options.getWorldFromEcef();
      if (ready && maximum > 0 && lifetime > 0 && frame && [worldVelocity.x, worldVelocity.y, worldVelocity.z].every(Number.isFinite)) {
        const m = frame.m, world = slot.installation.computeWorldMatrix(true).m;
        const position = new Float64Array(3), velocity = new Float64Array(3), axes = new Float64Array(9);
        toEcefVector(m, world[12] - m[12], world[13] - m[13], world[14] - m[14], position);
        toEcefVector(m, worldVelocity.x, worldVelocity.y, worldVelocity.z, velocity);
        for (let axis = 0; axis < 3; axis++) toEcefVector(m, world[axis * 4], world[axis * 4 + 1], world[axis * 4 + 2], axes, axis * 3);
        slot.released = { position, velocity, axes, age: 0, serial: ++serial };
        projectReleased(slot, m);
        slot.detached.setEnabled(true);
      }
      slot.attached = false;
      slot.installation.setEnabled(false);
      const budgetChanged = enforceBudget();
      if (wasVisible || slot.detached.isEnabled() || budgetChanged) requestRender();
    },
    update(dtSeconds): void {
      if (disposed) return;
      const frame = options.getWorldFromEcef();
      if (!frame) return;
      const dt = Number.isFinite(dtSeconds) ? Math.max(0, dtSeconds) : 0;
      let changed = false;
      for (const slot of slots) {
        const release = slot.released;
        if (!release) continue;
        if (dt > 0) {
          release.age += dt;
          if (release.age >= lifetime) { changed = hideReleased(slot) || changed; continue; }
          // Earth-fixed radial gravity. No visual time advances during pause.
          const radius = Math.hypot(...release.position);
          if (radius > 0) for (let axis = 0; axis < 3; axis++) {
            const acceleration = -GRAVITY_METERS_PER_SECOND_SQUARED * release.position[axis] / radius;
            release.position[axis] += release.velocity[axis] * dt + 0.5 * acceleration * dt * dt;
            release.velocity[axis] += acceleration * dt;
          }
        }
        changed = projectReleased(slot, frame.m) || changed;
      }
      if (changed) requestRender();
    },
    setLifetimeSeconds(seconds): void {
      if (disposed || !Number.isFinite(seconds)) return;
      lifetime = Math.max(0, seconds);
      if (enforceBudget()) requestRender();
    },
    setMaxDetachedTanks(count): void {
      if (disposed || !Number.isFinite(count)) return;
      maximum = Math.max(0, Math.min(slots.length, Math.floor(count)));
      if (enforceBudget()) requestRender();
    },
    resetDetached(): void {
      if (disposed) return;
      let changed = false;
      for (const slot of slots) changed = hideReleased(slot) || changed;
      if (changed) requestRender();
    },
    dispose(): void {
      if (disposed) return;
      const visible = slots.some(slot => slot.installation.isEnabled() || slot.detached.isEnabled());
      disposed = true;
      abort.abort();
      releaseResources();
      if (visible) requestRender();
    },
  };
}
