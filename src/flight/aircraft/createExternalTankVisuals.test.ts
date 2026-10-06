import { readFileSync } from "node:fs";
import {
  AssetContainer, LoadAssetContainerAsync, Mesh, NullEngine, Quaternion, Scene, StandardMaterial, TransformNode, Vector3, VertexData,
} from "@babylonjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildWorldShiftFrame } from "../bridge/enuFrame";
import { getExternalTankDefinitions } from "./externalTankDefinitions";
import { createExternalTankVisuals, type ExternalTankVisualOptions } from "./createExternalTankVisuals";

vi.mock("foss-earth/runtime", () => ({ whenMeshesReady: async () => {} }));

const definitions = getExternalTankDefinitions("f-35b");
const installed = definitions.map(tank => ({ index: tank.index, attached: true }));
const engines: NullEngine[] = [];
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); });

/** Actual exported geometry, with an untextured material for the NullEngine. */
function tankAsset(scene: Scene): AssetContainer {
  const bytes = readFileSync("public/aircraft/f-35b/ExternalTank_FlightGear.glb");
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
  const binary = bytes.subarray(28 + jsonLength);
  const asset = new AssetContainer(scene);
  const material = new StandardMaterial("source-material", scene);
  asset.materials.push(material);
  for (const source of gltf.meshes) {
    const primitive = source.primitives[0];
    const read = (index: number) => {
      const accessor = gltf.accessors[index], view = gltf.bufferViews[accessor.bufferView];
      const components = accessor.type === "VEC2" ? 2 : 3;
      return Array.from({ length: accessor.count * components }, (_, i) => binary.readFloatLE(view.byteOffset + i * 4));
    };
    const mesh = new Mesh(source.name, scene), data = new VertexData();
    data.positions = read(primitive.attributes.POSITION);
    data.normals = read(primitive.attributes.NORMAL);
    data.uvs = read(primitive.attributes.TEXCOORD_0);
    data.indices = Array.from({ length: data.positions.length / 3 }, (_, index) => index);
    data.applyToMesh(mesh);
    mesh.material = material;
    asset.meshes.push(mesh); asset.rootNodes.push(mesh);
  }
  asset.removeAllFromScene();
  return asset;
}

function fixture(overrides: Partial<ExternalTankVisualOptions> = {}) {
  const engine = new NullEngine(); engines.push(engine);
  const scene = new Scene(engine); scene.useRightHandedSystem = true;
  const parent = new TransformNode("aircraft", scene);
  parent.rotationQuaternion = Quaternion.RotationYawPitchRoll(Math.PI, 0, 0);
  let frame = buildWorldShiftFrame(0, 0, 0);
  const requestRender = vi.fn();
  const loadContainer = vi.fn(async () => tankAsset(scene));
  const options = { getWorldFromEcef: () => frame, requestRender, loadContainer,
    lifetimeSeconds: 15, maxDetachedTanks: 2, whenReady: async () => {}, ...overrides };
  const visual = createExternalTankVisuals(scene, parent, definitions, options);
  const node = (index: number, kind: "attached" | "detached") => scene.getTransformNodeByName(`external-tank-${index}-${kind}`)!;
  return { visual, scene, parent, requestRender, loadContainer, node, setFrame: (next: typeof frame) => { frame = next; } };
}

describe("external tank visuals", () => {
  it("loads the distributed GLB through Babylon with its source geometry and body axes", async () => {
    const t = fixture({ loadContainer: async (_url, scene) => LoadAssetContainerAsync(
      new Uint8Array(readFileSync("public/aircraft/f-35b/ExternalTank_FlightGear.glb")), scene,
      { pluginExtension: ".glb", pluginOptions: { gltf: { skipMaterials: true } } },
    ) });
    t.visual.sync(installed); await t.visual.ready;
    const meshes = t.node(2, "attached").getChildMeshes().filter(mesh => mesh.getTotalVertices() > 0);
    expect(meshes).toHaveLength(2);
    expect(meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices() / 3, 0)).toBe(4932);
    const tank = meshes.find(mesh => mesh.name.endsWith("-Tank"))!;
    expect(tank.getBoundingInfo().boundingBox.extendSize.z * 2).toBeCloseTo(4.612852, 5);
    expect(meshes.every(mesh => !mesh.isPickable)).toBe(true);
    t.visual.dispose();
  });

  it("prepares the actual tank and pylon hidden, with correct dimensions and right/left mounting", async () => {
    let release!: () => void;
    const t = fixture({ whenReady: () => new Promise(resolve => { release = resolve; }) });
    t.visual.sync(installed);
    await Promise.resolve();
    expect(t.node(2, "attached").isEnabled()).toBe(false);
    expect(t.requestRender).not.toHaveBeenCalled();
    release(); await t.visual.ready;
    expect(t.requestRender).toHaveBeenCalledOnce();
    expect(t.loadContainer).toHaveBeenCalledOnce();
    for (const index of [2, 3]) {
      const holder = t.node(index, "attached"), meshes = holder.getChildMeshes();
      expect(holder.isEnabled()).toBe(true);
      expect(meshes).toHaveLength(2);
      expect(meshes.every(mesh => !mesh.isPickable && mesh.metadata.aircraftVisualOnly)).toBe(true);
      expect(meshes.reduce((sum, mesh) => sum + mesh.getTotalIndices() / 3, 0)).toBe(4932);
      const tank = meshes.find(mesh => mesh.name.endsWith("-Tank"))!;
      const pylon = meshes.find(mesh => mesh.name.endsWith("-Pylon"))!;
      const size = tank.getBoundingInfo().boundingBox.extendSize.scale(2);
      expect(size.z).toBeCloseTo(4.612852, 5);
      expect(size.x).toBeCloseTo(0.665222, 5);
      expect(pylon.getBoundingInfo().boundingBox.maximum.y).toBeCloseTo(0.78874, 5);
      expect(pylon.getBoundingInfo().boundingBox.minimum.y).toBeLessThan(tank.getBoundingInfo().boundingBox.maximum.y);
    }
    t.node(2, "attached").computeWorldMatrix(true); t.node(3, "attached").computeWorldMatrix(true);
    expect(t.node(2, "attached").getAbsolutePosition().x).toBeCloseTo(3.25, 6);
    expect(t.node(3, "attached").getAbsolutePosition().x).toBeCloseTo(-3.25, 6);
    t.requestRender.mockClear();
    t.visual.sync(installed); t.visual.update(0); t.visual.update(1);
    expect(t.requestRender).not.toHaveBeenCalled();
    t.visual.dispose();
  });

  it("inherits ground momentum, falls under gravity and rebases ECEF position and orientation while paused", async () => {
    const t = fixture(); t.visual.sync(installed); await t.visual.ready;
    t.parent.rotationQuaternion = Quaternion.RotationYawPitchRoll(0.4, -0.1, 0.3);
    const attached = t.node(2, "attached"); attached.computeWorldMatrix(true);
    const start = attached.getAbsolutePosition().clone();
    t.visual.jettison(2, new Vector3(20, 0, -30));
    const detached = t.node(2, "detached");
    expect(attached.isEnabled()).toBe(false);
    expect(detached.isEnabled()).toBe(true);
    expect(Vector3.Distance(detached.position, start)).toBeLessThan(1e-7);
    const attitude = detached.rotationQuaternion!.clone();
    t.visual.update(1);
    expect(detached.position.x).toBeCloseTo(start.x + 20, 4);
    expect(detached.position.y).toBeCloseTo(start.y - 9.80665 / 2, 4);
    expect(detached.position.z).toBeCloseTo(start.z - 30, 4);
    t.requestRender.mockClear();
    const held = detached.position.clone();
    t.visual.update(0); t.visual.update(0);
    expect(detached.position.equals(held)).toBe(true);
    expect(t.requestRender).not.toHaveBeenCalled();
    // Move the local frame20m east without changing its orientation.
    t.setFrame(buildWorldShiftFrame(0, 0, 0, { x: 6378137, y: 20, z: 0 }));
    t.visual.update(0);
    expect(detached.position.x).toBeCloseTo(held.x - 20, 5);
    expect(Math.abs(Quaternion.Dot(attitude, detached.rotationQuaternion!))).toBeCloseTo(1, 6);
    expect(t.requestRender).toHaveBeenCalledOnce();
    // A rotated origin changes scene attitude, while the ECEF pose remains fixed.
    t.setFrame(buildWorldShiftFrame(0, Math.PI / 2, 0));
    t.visual.update(0);
    expect(Math.abs(Quaternion.Dot(attitude, detached.rotationQuaternion!))).toBeLessThan(0.9);
    t.visual.dispose();
  });

  it("caps releases, reuses each station's slot and obeys live debris budgets", async () => {
    const t = fixture(); t.visual.sync(installed); await t.visual.ready;
    const meshCount = t.scene.meshes.length;
    for (let i = 0; i < 5; i++) {
      t.visual.jettison(2, Vector3.Zero());
      t.visual.sync(installed);
    }
    expect(t.scene.meshes).toHaveLength(meshCount);
    expect(t.node(2, "attached").isEnabled()).toBe(true);
    expect(t.node(2, "detached").isEnabled()).toBe(true);
    t.visual.jettison(3, Vector3.Zero());
    t.visual.setMaxDetachedTanks(1);
    expect(t.node(2, "detached").isEnabled()).toBe(false);
    expect(t.node(3, "detached").isEnabled()).toBe(true);
    t.visual.setLifetimeSeconds(0);
    expect(t.node(3, "detached").isEnabled()).toBe(false);
    t.visual.setLifetimeSeconds(2);
    t.visual.setMaxDetachedTanks(0);
    t.visual.jettison(2, Vector3.Zero());
    expect(t.node(2, "detached").isEnabled()).toBe(false);
    t.visual.sync(installed); t.visual.setMaxDetachedTanks(2);
    t.visual.jettison(2, Vector3.Zero()); t.visual.update(2);
    expect(t.node(2, "detached").isEnabled()).toBe(false);
    t.visual.sync(installed); t.visual.jettison(3, Vector3.Zero());
    t.visual.resetDetached();
    expect(t.node(3, "detached").isEnabled()).toBe(false);
    t.visual.dispose();
    expect(t.scene.meshes).toHaveLength(0);
  });

  it("does not show a jettisoned tank after delayed readiness and cancels setup safely", async () => {
    let release!: () => void;
    const t = fixture({ whenReady: () => new Promise(resolve => { release = resolve; }) });
    t.visual.sync(installed);
    await Promise.resolve();
    t.visual.jettison(2, Vector3.Zero());
    release(); await t.visual.ready;
    expect(t.node(2, "attached").isEnabled()).toBe(false);
    expect(t.node(3, "attached").isEnabled()).toBe(true);
    t.visual.dispose();
    const pending = fixture({ whenReady: () => new Promise(resolve => { release = resolve; }) });
    pending.visual.sync(installed); await Promise.resolve();
    pending.visual.dispose(); release(); await pending.visual.ready;
    expect(pending.scene.meshes).toHaveLength(0);
    expect(pending.requestRender).not.toHaveBeenCalled();
  });

  it("releases setup resources on an asset load failure", async () => {
    const t = fixture({ loadContainer: async () => { throw new Error("asset failed"); } });
    await expect(t.visual.ready).rejects.toThrow("asset failed");
    expect(t.scene.transformNodes.map(node => node.name)).toEqual(["aircraft"]);
    expect(t.scene.meshes).toHaveLength(0);
    t.visual.dispose();
  });
});
