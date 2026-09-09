import { AssetContainer, Mesh, NullEngine, Scene, TransformNode } from "@babylonjs/core";
import { describe, expect, it, vi } from "vitest";
import { createAircraftModel } from "./createAircraftModel";

// Every shipped airframe now has a mesh, so the placeholder branch - what a
// catalog entry does before its mesh exists - is no longer reachable through
// the real catalog. Mocking the lookup keeps the branch covered without adding
// a seam to production code that exists only for a test.
vi.mock("./aircraftCatalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./aircraftCatalog")>();
  return {
    ...actual,
    getAircraftDefinition: (id: Parameters<typeof actual.getAircraftDefinition>[0]) =>
      id === "cirrus-vision-jet"
        ? { ...actual.getAircraftDefinition(id), lods: [] }
        : actual.getAircraftDefinition(id),
  };
});

function setup() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const parent = new TransformNode("parent", scene);
  const loadContainer = vi.fn(async () => {
    const container = new AssetContainer(scene);
    const mesh = new Mesh("mesh", scene);
    scene.removeMesh(mesh);
    container.meshes.push(mesh);
    container.rootNodes.push(mesh);
    return container;
  });
  return {
    scene, parent, loadContainer,
    teardown: () => { scene.dispose(); engine.dispose(); },
  };
}

describe("aircraft model loader, airframe with no mesh", () => {
  it("reports placeholder without fetching, and recovers when a mesh is selected", async () => {
    const t = setup();
    const model = createAircraftModel(t.scene, t.parent, {
      aircraftId: "cirrus-vision-jet", lodId: "auto", loadContainer: t.loadContainer,
    });
    expect(model.getState().status).toBe("placeholder");
    expect(t.loadContainer).not.toHaveBeenCalled();

    model.setAircraft("cessna-172");
    await vi.waitFor(() => expect(model.getState().status).toBe("ready"));

    model.setAircraft("cirrus-vision-jet");
    expect(model.getState().status).toBe("placeholder");
    expect(model.getState().triangles).toBeNull();

    model.dispose();
    t.teardown();
  });
});
