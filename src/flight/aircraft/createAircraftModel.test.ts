import { readFileSync } from "node:fs";
import { AssetContainer, Mesh, MeshBuilder, NullEngine, Scene, TransformNode, type AbstractMesh, type ISceneLoaderProgressEvent } from "@babylonjs/core";
import { describe, expect, it, vi } from "vitest";
import { createAircraftModel, type AircraftModelState } from "./createAircraftModel";
import { getFdmProfile } from "../jsbsim/fdmProfiles";

// The readiness wait is FOSS Earth's, covered there; the runtime it comes with
// does not load under this environment. Tests that care pass `whenReady`.
vi.mock("foss-earth/runtime", () => ({ whenMeshesReady: async () => {} }));

/** A readiness wait each test releases by hand, as compiling shaders would. */
function readinessGate() {
  const waits: Array<{ meshes: readonly AbstractMesh[]; release(): void; signal: AbortSignal }> = [];
  const whenReady = vi.fn((meshes: readonly AbstractMesh[], signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    waits.push({ meshes, release: resolve, signal });
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }));
  return { waits, whenReady, releaseLast: () => waits[waits.length - 1].release() };
}

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

/** Reproduce the distributed GLB's hierarchy and Babylon's multi-primitive mesh names. */
function f35bVisibilityContainer(scene: Scene): AssetContainer {
  const bytes = readFileSync("public/aircraft/f-35b/F-35B_AF267.glb");
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString()) as {
    nodes: { name: string; mesh?: number; children?: number[] }[];
    meshes: { primitives: unknown[] }[];
  };
  const container = new AssetContainer(scene);
  const nodes = gltf.nodes.map(definition => {
    const primitives = definition.mesh === undefined ? [] : gltf.meshes[definition.mesh].primitives;
    if (primitives.length === 1) {
      const mesh = new Mesh(definition.name, scene);
      container.meshes.push(mesh);
      return mesh;
    }
    const node = new TransformNode(definition.name, scene);
    container.transformNodes.push(node);
    primitives.forEach((_primitive, index) => {
      const mesh = new Mesh(`${definition.name}_primitive${index}`, scene);
      mesh.parent = node;
      container.meshes.push(mesh);
    });
    return node;
  });
  gltf.nodes.forEach((definition, index) => {
    for (const child of definition.children ?? []) nodes[child].parent = nodes[index];
  });
  container.rootNodes.push(...nodes.filter(node => node.parent === null));
  container.removeAllFromScene();
  return container;
}

function gearMeshes(container: AssetContainer): AbstractMesh[] {
  const roots = container.transformNodes.filter(node => ["leftGear", "rightGear", "noseGear"].includes(node.name));
  return container.meshes.filter(mesh => roots.some(root => mesh.isDescendantOf(root)));
}

describe("aircraft model loader", () => {
  it("publishes only ready mesh hierarchies and detaches inspection before replacing or disposing them", async () => {
    const t = setup();
    const gate = readinessGate();
    let previous: readonly TransformNode[] = [];
    const onMeshRootsChange = vi.fn((roots: readonly TransformNode[]) => {
      // Consumers must release shared geometry references before container disposal.
      if (roots.length === 0) expect(previous.every(node => !node.isDisposed())).toBe(true);
      previous = roots;
    });
    const model = createAircraftModel(t.scene, t.parent, {
      aircraftId: "cessna-172", lodId: "lod3", loadContainer: t.loadContainer,
      whenReady: gate.whenReady, onMeshRootsChange,
    });
    try {
      await vi.waitFor(() => expect(gate.waits).toHaveLength(1));
      expect(onMeshRootsChange).not.toHaveBeenCalled();
      gate.releaseLast();
      await vi.waitFor(() => expect(model.getState().status).toBe("ready"));
      expect(onMeshRootsChange).toHaveBeenLastCalledWith(t.containers[0].rootNodes);
      model.setLod("lod1");
      expect(onMeshRootsChange).toHaveBeenLastCalledWith([]);
      await vi.waitFor(() => expect(gate.waits).toHaveLength(2));
      expect(onMeshRootsChange).toHaveBeenCalledTimes(2);
      gate.releaseLast();
      await vi.waitFor(() => expect(model.getState().status).toBe("ready"));
      expect(onMeshRootsChange).toHaveBeenLastCalledWith(t.containers[1].rootNodes);
      model.dispose();
      expect(onMeshRootsChange).toHaveBeenLastCalledWith([]);
      expect(onMeshRootsChange).toHaveBeenCalledTimes(4);
    } finally { t.teardown(); }
  });

  it("hides actual F-35B wheels and arms only at full stow, including primitive meshes, and preserves nested bay doors", async () => {
    const t = setup();
    const container = f35bVisibilityContainer(t.scene);
    const gear = gearMeshes(container);
    expect(gear).toHaveLength(21); // 18 authored parts, three with two primitives.
    const doors = container.meshes.filter(mesh => ["leftDoor", "rightDoor", "leftNoseDoor", "rightNoseDoor"].includes(mesh.name));
    expect(doors).toHaveLength(4);
    // A different asset hierarchy must never make a door inherit a hidden arm.
    doors[0].parent = container.transformNodes.find(node => node.name === "leftGear")!;
    const requestRender = vi.fn();
    const model = createAircraftModel(t.scene, t.parent, {
      aircraftId: "f-35b", lodId: "hd", loadContainer: async () => container, requestRender,
    });
    await vi.waitFor(() => expect(model.getState().status).toBe("ready"));
    expect(gear.every(mesh => mesh.isVisible)).toBe(true); // Unknown physical position.
    requestRender.mockClear();
    for (const position of [1, 0.5, Number.EPSILON]) model.updateGearVisibility(position);
    expect(gear.every(mesh => mesh.isVisible)).toBe(true);
    expect(requestRender).not.toHaveBeenCalled();
    model.updateGearVisibility(0);
    expect(gear.every(mesh => !mesh.isVisible)).toBe(true);
    expect(doors.every(mesh => mesh.isVisible && mesh.isEnabled())).toBe(true);
    expect(requestRender).toHaveBeenCalledOnce();
    model.updateGearVisibility(0);
    model.updateGearVisibility(Number.NaN);
    model.updateGearVisibility(-1);
    expect(requestRender).toHaveBeenCalledOnce();
    model.updateGearVisibility(Number.EPSILON);
    expect(gear.every(mesh => mesh.isVisible)).toBe(true);
    expect(requestRender).toHaveBeenCalledTimes(2);
    model.dispose();
    t.teardown();
  });

  it("applies the live stowed-gear override without redundant frames and retains original hidden parts", async () => {
    const t = setup();
    const container = f35bVisibilityContainer(t.scene);
    const gear = gearMeshes(container);
    const originallyHidden = container.meshes.find(mesh => mesh.name === "leftPiston")!;
    originallyHidden.isVisible = false;
    const requestRender = vi.fn();
    const model = createAircraftModel(t.scene, t.parent, {
      aircraftId: "f-35b", lodId: "hd", loadContainer: async () => container, requestRender,
    });
    await vi.waitFor(() => expect(model.getState().status).toBe("ready"));
    requestRender.mockClear();
    model.setRenderStowedGear(true);
    model.setRenderStowedGear(false);
    expect(requestRender).not.toHaveBeenCalled();
    model.updateGearVisibility(0, true);
    expect(gear.every(mesh => !mesh.isVisible)).toBe(true);
    expect(requestRender).not.toHaveBeenCalled(); // The current scheduled frame draws the change.
    model.setRenderStowedGear(true);
    expect(gear.filter(mesh => mesh !== originallyHidden).every(mesh => mesh.isVisible)).toBe(true);
    expect(originallyHidden.isVisible).toBe(false);
    expect(requestRender).toHaveBeenCalledOnce();
    model.setRenderStowedGear(true);
    expect(requestRender).toHaveBeenCalledOnce();
    model.setRenderStowedGear(false);
    expect(gear.every(mesh => !mesh.isVisible)).toBe(true);
    expect(requestRender).toHaveBeenCalledTimes(2);
    model.dispose();
    model.setRenderStowedGear(true);
    model.updateGearVisibility(1);
    expect(requestRender).toHaveBeenCalledTimes(2);
    t.teardown();
  });

  it.each([false, true])("uses the latest physical and debug state before revealing deferred geometry (override %s)", async renderStowedGear => {
    const t = setup();
    const container = f35bVisibilityContainer(t.scene);
    const gear = gearMeshes(container);
    const gate = readinessGate();
    const requestRender = vi.fn();
    const model = createAircraftModel(t.scene, t.parent, {
      aircraftId: "f-35b", lodId: "hd", renderStowedGear: !renderStowedGear,
      loadContainer: async () => container, whenReady: gate.whenReady, requestRender,
      onStateChange: state => {
        if (state.status === "ready") expect(gear.every(mesh => mesh.isVisible === renderStowedGear)).toBe(true);
      },
    });
    model.updateGearVisibility(0.5);
    await vi.waitFor(() => expect(gate.waits).toHaveLength(1));
    model.setRenderStowedGear(renderStowedGear);
    model.updateGearVisibility(0);
    expect(requestRender).not.toHaveBeenCalled();
    expect(gear.every(mesh => !mesh.isEnabled())).toBe(true);
    gate.releaseLast();
    await vi.waitFor(() => expect(model.getState().status).toBe("ready"));
    expect(gear.every(mesh => mesh.isVisible === renderStowedGear)).toBe(true);
    expect(requestRender).toHaveBeenCalledOnce();
    model.dispose();
    t.teardown();
  });

  it("does no visibility work for aircraft without stowed geometry metadata", async () => {
    const t = setup();
    const requestRender = vi.fn();
    const model = createAircraftModel(t.scene, t.parent, {
      aircraftId: "cessna-172", lodId: "lod3", loadContainer: t.loadContainer, requestRender,
    });
    await vi.waitFor(() => expect(model.getState().status).toBe("ready"));
    requestRender.mockClear();
    model.updateGearVisibility(0);
    model.setRenderStowedGear(true);
    model.setRenderStowedGear(false);
    expect(t.containers[0].meshes[0].isVisible).toBe(true);
    expect(requestRender).not.toHaveBeenCalled();
    model.dispose();
    t.teardown();
  });

  it("never makes a tyre something to collide with", async () => {
    // Collision is JSBSim's contact points and the body probes, and the debug
    // overlays draw their own plain tyre outlines. The visual tyres are a
    // picture - their band and its blur are a texture, planes/shared/tyres.py
    // - and not a shape anything should hit, so every loaded mesh, tyres
    // included, stays unpickable.
    const t = setup();
    const loadContainer = vi.fn(async () => {
      const container = new AssetContainer(t.scene);
      for (const name of ["Wheel_Left", "Wheel_Right", "Wheel_Nose"]) {
        const mesh = new Mesh(name, t.scene);
        t.scene.removeMesh(mesh);
        container.meshes.push(mesh);
        container.rootNodes.push(mesh);
      }
      t.containers.push(container);
      return container;
    });
    const model = createAircraftModel(t.scene, t.parent, {
      aircraftId: "cirrus-vision-jet", lodId: "lod3", loadContainer,
    });
    await vi.waitFor(() => expect(model.getState().status).toBe("ready"));
    expect(t.containers[0].meshes.every((mesh) => mesh.isPickable === false)).toBe(true);
    model.dispose();
    t.teardown();
  });

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
    expect(model.getState().triangles).toBe(778);
    expect(model.getState().activeLodId).toBe("lod2");
    // Under a node of its own, which shows or hides all of it.
    expect(t.containers[0].rootNodes[0].parent?.parent).toBe(model.root);
    // The aircraft must never be a pick target: the terrain probe and the
    // chase camera both raycast the scene.
    expect(t.containers[0].meshes.every((mesh) => mesh.isPickable === false)).toBe(true);
    expect(t.states.map((state) => state.status)).toContain("loading");

    model.dispose();
    t.teardown();
  });

  it("binds the F-35B's authored part names when Auto loads its exterior", async () => {
    const t = setup();
    const loadContainer = vi.fn(async () => {
      const container = new AssetContainer(t.scene);
      for (const name of ["leftElevator", "rightElevator", "leftFlaperon", "rightFlaperon", "leftRudder", "rightRudder", "vtol"]) {
        const node = new TransformNode(name, t.scene);
        t.scene.removeTransformNode(node);
        container.transformNodes.push(node);
        container.rootNodes.push(node);
      }
      return container;
    });
    const model = createAircraftModel(t.scene, t.parent, { aircraftId: "f-35b", lodId: "auto", loadContainer });
    await vi.waitFor(() => expect(model.getState().status).toBe("ready"));
    expect(model.getState().activeLodId).toBe("hd");
    expect(model.getRig()?.parts).toHaveLength(6);
    expect(model.getRig()?.stovl.map(part => part.node.name)).toEqual(["vtol"]);
    model.dispose();
    t.teardown();
  });

  it("loads an opt-in level only when it is chosen, never from Auto", async () => {
    const t = setup();
    const model = createAircraftModel(t.scene, t.parent, {
      aircraftId: "cirrus-vision-jet",
      lodId: "auto",
      loadContainer: t.loadContainer,
    });
    await vi.waitFor(() => expect(model.getState().status).toBe("ready"));
    expect(model.getState().activeLodId).toBe("lod3");
    expect(t.urls.some((url) => url.includes("HilosRun"))).toBe(false);

    // Choosing it is the opt-in: no other switch stands in front of it.
    model.setLod("hd");
    await vi.waitFor(() => expect(model.getState().activeLodId).toBe("hd"));
    expect(t.urls[t.urls.length - 1]).toContain("Cirrus_Vision_Jet_HilosRun.glb");
    expect(model.getState().triangles).toBe(7294);

    // ...and going back to Auto puts the cheap mesh back.
    model.setLod("auto");
    await vi.waitFor(() => expect(model.getState().activeLodId).toBe("lod3"));

    model.dispose();
    t.teardown();
  });

  it("shows a model only once it can be drawn whole, in one frame, and draws nothing while it gets ready", async () => {
    const t = setup();
    const gate = readinessGate();
    const requestRender = vi.fn();
    const model = createAircraftModel(t.scene, t.parent, {
      aircraftId: "cessna-172", lodId: "lod3", loadContainer: t.loadContainer,
      whenReady: gate.whenReady, requestRender,
    });
    await vi.waitFor(() => expect(gate.waits).toHaveLength(1));
    // In the scene, so it compiles for the scene's lights, but hidden.
    const mesh = t.containers[0].meshes[0];
    expect(t.scene.meshes).toContain(mesh);
    expect(mesh.isEnabled()).toBe(false);
    expect(model.getState().status).toBe("loading");
    expect(requestRender).not.toHaveBeenCalled();

    gate.releaseLast();
    await vi.waitFor(() => expect(model.getState().status).toBe("ready"));
    expect(mesh.isEnabled()).toBe(true);
    expect(requestRender).toHaveBeenCalledOnce();

    model.dispose();
    t.teardown();
  });

  it("takes the old mesh away at once for a level the user chooses, and shows the new one in a second frame", async () => {
    const t = setup();
    const gate = readinessGate();
    const requestRender = vi.fn();
    const model = createAircraftModel(t.scene, t.parent, {
      aircraftId: "cirrus-vision-jet", lodId: "lod3", loadContainer: t.loadContainer,
      whenReady: gate.whenReady, requestRender,
    });
    await vi.waitFor(() => expect(gate.waits).toHaveLength(1));
    gate.releaseLast();
    await vi.waitFor(() => expect(model.getState().status).toBe("ready"));
    const old = t.containers[0].meshes[0];
    requestRender.mockClear();

    model.setLod("hd");
    // Frame one: no aircraft, and the download's progress to show meanwhile.
    expect(old.isDisposed()).toBe(true);
    expect(requestRender).toHaveBeenCalledOnce();
    expect(model.getState()).toMatchObject({ status: "loading", activeLodId: null });
    expect(model.getState().download).toMatchObject({ lodId: "hd", chosen: true });

    await vi.waitFor(() => expect(gate.waits).toHaveLength(2));
    expect(requestRender).toHaveBeenCalledOnce();
    gate.releaseLast();
    // Frame two: the new aircraft, whole.
    await vi.waitFor(() => expect(model.getState().activeLodId).toBe("hd"));
    expect(requestRender).toHaveBeenCalledTimes(2);
    expect(model.getState().download).toBeNull();

    model.dispose();
    t.teardown();
  });

  it("keeps the old mesh in view while Auto's next level gets ready, then swaps them in one frame", async () => {
    const t = setup();
    const gate = readinessGate();
    const requestRender = vi.fn();
    let distance = 10;
    const model = createAircraftModel(t.scene, t.parent, {
      aircraftId: "cessna-172", lodId: "auto", getChaseDistanceMeters: () => distance,
      loadContainer: t.loadContainer, whenReady: gate.whenReady, requestRender,
    });
    await vi.waitFor(() => expect(gate.waits).toHaveLength(1));
    gate.releaseLast();
    await vi.waitFor(() => expect(model.getState().activeLodId).toBe("lod3"));
    const near = t.containers[0].meshes[0];
    requestRender.mockClear();

    distance = 400;
    model.refreshAutoLod();
    await vi.waitFor(() => expect(gate.waits).toHaveLength(2));
    expect(near.isDisposed()).toBe(false);
    expect(near.isEnabled()).toBe(true);
    expect(model.getState().activeLodId).toBe("lod3");
    expect(model.getState().download).toMatchObject({ lodId: "lod0", chosen: false });
    expect(requestRender).not.toHaveBeenCalled();

    gate.releaseLast();
    await vi.waitFor(() => expect(model.getState().activeLodId).toBe("lod0"));
    expect(near.isDisposed()).toBe(true);
    expect(requestRender).toHaveBeenCalledOnce();

    model.dispose();
    t.teardown();
  });

  it("reports download progress without asking for a frame", async () => {
    const t = setup();
    const requestRender = vi.fn();
    const states: AircraftModelState[] = [];
    let progress: ((event: ISceneLoaderProgressEvent) => void) | null = null;
    let finish: (() => void) | null = null;
    const model = createAircraftModel(t.scene, t.parent, {
      aircraftId: "cessna-172", lodId: "lod3", requestRender,
      onStateChange: state => states.push(state),
      loadContainer: (url, scene, onProgress) => new Promise(resolve => {
        progress = onProgress;
        finish = () => {
          const container = new AssetContainer(scene);
          const mesh = MeshBuilder.CreateBox("loaded", { size: 1 }, scene);
          scene.removeMesh(mesh);
          container.meshes.push(mesh);
          container.rootNodes.push(mesh);
          resolve(container);
        };
      }),
    });
    progress!({ lengthComputable: true, loaded: 40_000, total: 80_000 });
    progress!({ lengthComputable: false, loaded: 60_000, total: 0 });
    expect(states.map(state => state.download)).toEqual([
      { lodId: "lod3", loaded: 0, total: null, chosen: true },
      { lodId: "lod3", loaded: 40_000, total: 80_000, chosen: true },
      { lodId: "lod3", loaded: 60_000, total: null, chosen: true },
    ]);
    expect(requestRender).not.toHaveBeenCalled();
    finish!();
    await vi.waitFor(() => expect(model.getState().status).toBe("ready"));
    expect(requestRender).toHaveBeenCalledOnce();

    model.dispose();
    t.teardown();
  });

  it("drops a level that is still loading when another is chosen, and never shows it", async () => {
    const t = setup();
    const gate = readinessGate();
    const model = createAircraftModel(t.scene, t.parent, {
      aircraftId: "cessna-172", lodId: "lod3", loadContainer: t.loadContainer, whenReady: gate.whenReady,
    });
    await vi.waitFor(() => expect(gate.waits).toHaveLength(1));
    model.setLod("lod1");
    expect(gate.waits[0].signal.aborted).toBe(true);
    await vi.waitFor(() => expect(gate.waits).toHaveLength(2));
    gate.releaseLast();
    await vi.waitFor(() => expect(model.getState().activeLodId).toBe("lod1"));
    expect(t.containers[0].meshes.every(mesh => mesh.isDisposed())).toBe(true);
    expect(t.containers[1].meshes[0].isEnabled()).toBe(true);

    model.dispose();
    t.teardown();
  });

  it("keeps the mesh it shows when the level Auto was moving to fails", async () => {
    const t = setup();
    let distance = 10;
    let fail = false;
    const model = createAircraftModel(t.scene, t.parent, {
      aircraftId: "cessna-172", lodId: "auto", getChaseDistanceMeters: () => distance,
      loadContainer: (url, scene, onProgress) => fail ? Promise.reject(new Error("offline")) : t.loadContainer(url, scene, onProgress),
    });
    await vi.waitFor(() => expect(model.getState().activeLodId).toBe("lod3"));
    fail = true;
    distance = 400;
    model.refreshAutoLod();
    await vi.waitFor(() => expect(model.getState().error).toBe("offline"));
    expect(model.getState()).toMatchObject({ status: "ready", activeLodId: "lod3" });
    expect(t.containers[0].meshes[0].isDisposed()).toBe(false);

    model.dispose();
    t.teardown();
  });

  it("orients the glTF -Z nose onto the sim's +Z nose and drops it to the ground", async () => {
    const t = setup();
    const model = createAircraftModel(t.scene, t.parent, {
      aircraftId: "cessna-172", lodId: "lod3", loadContainer: t.loadContainer,
    });
    await vi.waitFor(() => expect(model.getState().status).toBe("ready"));

    const yaw = model.root.rotationQuaternion!.toEulerAngles().y;
    expect(Math.abs(Math.sin(yaw))).toBeCloseTo(0, 6);
    expect(Math.cos(yaw)).toBeCloseTo(-1, 6);
    expect(model.root.position.y).toBeCloseTo(-getFdmProfile("cessna-172").stance.staticMeters, 6);

    model.dispose();
    t.teardown();
  });

  it("swaps levels and disposes the mesh it replaces", async () => {
    const t = setup();
    const model = createAircraftModel(t.scene, t.parent, {
      aircraftId: "cessna-172", lodId: "lod3", loadContainer: t.loadContainer,
    });
    await vi.waitFor(() => expect(model.getState().status).toBe("ready"));
    // capture before the swap: AssetContainer.dispose() empties its own arrays
    const firstMesh = t.containers[0].meshes[0];

    model.setLod("lod0");
    await vi.waitFor(() => expect(model.getState().activeLodId).toBe("lod0"));
    expect(t.urls[1]).toContain("Cessna_172_LOD0.glb");
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
    await vi.waitFor(() => expect(model.getState().activeLodId).toBe("lod3"));

    distance = 40;
    model.refreshAutoLod();
    expect(t.loadContainer).toHaveBeenCalledTimes(1);

    distance = 400;
    model.refreshAutoLod();
    await vi.waitFor(() => expect(model.getState().activeLodId).toBe("lod0"));
    expect(t.loadContainer).toHaveBeenCalledTimes(2);

    model.dispose();
    t.teardown();
  });

  it("loads the jet's own levels when the airframe is switched", async () => {
    const t = setup();
    const model = createAircraftModel(t.scene, t.parent, {
      aircraftId: "cessna-172", lodId: "lod3", loadContainer: t.loadContainer,
    });
    await vi.waitFor(() => expect(model.getState().status).toBe("ready"));

    model.setAircraft("cirrus-vision-jet");
    await vi.waitFor(() => expect(model.getState().status).toBe("ready"));
    expect(t.urls[1]).toContain("Cirrus_Vision_Jet_LOD3.glb");
    expect(model.getState().triangles).toBe(1654);

    model.dispose();
    t.teardown();
  });

  it("surfaces a load failure instead of throwing", async () => {
    const t = setup();
    const model = createAircraftModel(t.scene, t.parent, {
      aircraftId: "cessna-172", lodId: "lod3",
      loadContainer: () => Promise.reject(new Error("404 not found")),
    });
    await vi.waitFor(() => expect(model.getState().status).toBe("error"));
    expect(model.getState().error).toContain("404");

    model.dispose();
    t.teardown();
  });
});
