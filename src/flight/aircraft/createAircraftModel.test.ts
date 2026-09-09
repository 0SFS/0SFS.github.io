import { AssetContainer, Mesh, NullEngine, Scene, TransformNode } from "@babylonjs/core";
import { describe, expect, it, vi } from "vitest";
import { createAircraftModel, type AircraftModelState } from "./createAircraftModel";

function setup() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const parent = new TransformNode("parent", scene);
  const urls: string[] = [];
  const containers: AssetContainer[] = [];
  const loadContainer = vi.fn(async (url: string) => {
    urls.push(url);
    const container = new AssetContainer(scene);
    const mesh = new Mesh(`mesh-${urls.length}`, scene);
    scene.removeMesh(mesh);
    container.meshes.push(mesh);
    container.rootNodes.push(mesh);
    containers.push(container);
    return container;
  });
  const states: AircraftModelState[] = [];
  return {
    engine, scene, parent, urls, containers, loadContainer, states,
    teardown: () => { scene.dispose(); engine.dispose(); },
  };
}

describe("aircraft model loader", () => {
  it("loads the requested level, parents it, and reports triangle count", async () => {
    const t = setup();
    const model = createAircraftModel(t.scene, t.parent, {
      aircraftId: "cessna-172",
      lodId: "lod2",
      loadContainer: t.loadContainer,
      onStateChange: (state) => t.states.push(state),
    });
    await vi.waitFor(() => expect(model.getState().status).toBe("ready"));

    expect(t.urls[0]).toContain("Cessna_172_LOD2.glb");
    expect(model.getState().triangles).toBe(288);
    expect(model.getState().activeLodId).toBe("lod2");
    expect(t.containers[0].rootNodes[0].parent).toBe(model.root);
    // The aircraft must never be a pick target: the terrain probe and the
    // chase camera both raycast the scene.
    expect(t.containers[0].meshes.every((mesh) => mesh.isPickable === false)).toBe(true);
    expect(t.states.map((state) => state.status)).toContain("loading");

    model.dispose();
    t.teardown();
  });

  it("orients the glTF -Z nose onto the sim's +Z nose and drops it to the ground", async () => {
    const t = setup();
    const model = createAircraftModel(t.scene, t.parent, {
      aircraftId: "cessna-172", lodId: "lod0", loadContainer: t.loadContainer,
    });
    await vi.waitFor(() => expect(model.getState().status).toBe("ready"));

    const yaw = model.root.rotationQuaternion!.toEulerAngles().y;
    expect(Math.abs(Math.sin(yaw))).toBeCloseTo(0, 6);
    expect(Math.cos(yaw)).toBeCloseTo(-1, 6);
    expect(model.root.position.y).toBeCloseTo(-1.33, 6);

    model.dispose();
    t.teardown();
  });

  it("swaps levels and disposes the mesh it replaces", async () => {
    const t = setup();
    const model = createAircraftModel(t.scene, t.parent, {
      aircraftId: "cessna-172", lodId: "lod0", loadContainer: t.loadContainer,
    });
    await vi.waitFor(() => expect(model.getState().status).toBe("ready"));
    // capture before the swap: AssetContainer.dispose() empties its own arrays
    const firstMesh = t.containers[0].meshes[0];

    model.setLod("lod3");
    await vi.waitFor(() => expect(model.getState().activeLodId).toBe("lod3"));
    expect(t.urls[1]).toContain("Cessna_172_LOD3.glb");
    expect(firstMesh.isDisposed()).toBe(true);

    model.dispose();
    t.teardown();
  });

  it("follows chase distance under auto, and only reloads when the level changes", async () => {
    const t = setup();
    let distance = 10;
    const model = createAircraftModel(t.scene, t.parent, {
      aircraftId: "cessna-172", lodId: "auto",
      getChaseDistanceMeters: () => distance,
      loadContainer: t.loadContainer,
    });
    await vi.waitFor(() => expect(model.getState().activeLodId).toBe("lod0"));

    distance = 40;
    model.refreshAutoLod();
    expect(t.loadContainer).toHaveBeenCalledTimes(1);

    distance = 400;
    model.refreshAutoLod();
    await vi.waitFor(() => expect(model.getState().activeLodId).toBe("lod3"));
    expect(t.loadContainer).toHaveBeenCalledTimes(2);

    model.dispose();
    t.teardown();
  });

  it("loads the jet's own levels when the airframe is switched", async () => {
    const t = setup();
    const model = createAircraftModel(t.scene, t.parent, {
      aircraftId: "cessna-172", lodId: "lod0", loadContainer: t.loadContainer,
    });
    await vi.waitFor(() => expect(model.getState().status).toBe("ready"));

    model.setAircraft("cirrus-vision-jet");
    await vi.waitFor(() => expect(model.getState().status).toBe("ready"));
    expect(t.urls[1]).toContain("Cirrus_Vision_Jet_LOD0.glb");
    expect(model.getState().triangles).toBe(1552);

    model.dispose();
    t.teardown();
  });

  it("surfaces a load failure instead of throwing", async () => {
    const t = setup();
    const model = createAircraftModel(t.scene, t.parent, {
      aircraftId: "cessna-172", lodId: "lod0",
      loadContainer: () => Promise.reject(new Error("404 not found")),
    });
    await vi.waitFor(() => expect(model.getState().status).toBe("error"));
    expect(model.getState().error).toContain("404");

    model.dispose();
    t.teardown();
  });
});
