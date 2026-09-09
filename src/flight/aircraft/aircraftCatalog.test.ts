import { describe, expect, it } from "vitest";
import {
  AIRCRAFT_CATALOG,
  getAircraftDefinition,
  isAircraftId,
  isAircraftLodId,
  resolveLod,
  selectAutoLod,
  type AircraftDefinition,
} from "./aircraftCatalog";

const c172 = getAircraftDefinition("cessna-172");
const cirrus = getAircraftDefinition("cirrus-vision-jet");

describe("aircraft catalog", () => {
  it("exposes both selectable airframes and falls back to the first for unknown ids", () => {
    expect(AIRCRAFT_CATALOG.map((entry) => entry.id)).toEqual(["cessna-172", "cirrus-vision-jet"]);
    expect(getAircraftDefinition("nope" as never).id).toBe("cessna-172");
  });

  it("validates persisted preferences", () => {
    expect(isAircraftId("cessna-172")).toBe(true);
    expect(isAircraftId("f16")).toBe(false);
    expect(isAircraftId(null)).toBe(false);
    expect(isAircraftLodId("auto")).toBe(true);
    expect(isAircraftLodId("lod3")).toBe(true);
    expect(isAircraftLodId("lod9")).toBe(false);
  });

  it("orders every airframe's levels from most to least detailed", () => {
    for (const definition of AIRCRAFT_CATALOG) {
      const triangles = definition.lods.map((lod) => lod.triangles);
      expect(triangles).toEqual([...triangles].sort((a, b) => b - a));
      expect(definition.lods.map((lod) => lod.id)).toEqual(["lod0", "lod1", "lod2", "lod3"]);
      const distances = definition.lods.map((lod) => lod.autoFromMeters);
      expect(distances).toEqual([...distances].sort((a, b) => a - b));
      expect(distances[0]).toBe(0);
    }
  });

  it("keeps the jet off the propeller path", () => {
    expect(cirrus.propellerBlades).toBe(0);
    expect(c172.propellerBlades).toBe(2);
  });

  it("drops every model by the stance the simulator holds the aircraft at", () => {
    // Both meshes put their origin on the ground between the wheels, so both
    // are dropped by STATIC_STANCE_METERS. See docs/ground-contact.md.
    for (const definition of AIRCRAFT_CATALOG) {
      expect(definition.modelOffset).toEqual({ x: 0, y: -1.33, z: 0 });
      expect(definition.modelYawRad).toBe(Math.PI);
    }
  });

  it("picks a coarser auto level as the chase camera pulls back", () => {
    expect(selectAutoLod(c172, 0)?.id).toBe("lod0");
    expect(selectAutoLod(c172, 59)?.id).toBe("lod0");
    expect(selectAutoLod(c172, 60)?.id).toBe("lod1");
    expect(selectAutoLod(c172, 200)?.id).toBe("lod2");
    expect(selectAutoLod(c172, 5000)?.id).toBe("lod3");
  });

  it("honours an explicit level regardless of distance", () => {
    expect(resolveLod(c172, "lod3", 0)?.id).toBe("lod3");
    expect(resolveLod(c172, "lod0", 9999)?.id).toBe("lod0");
  });

  it("picks a coarser auto level for the jet as well", () => {
    expect(selectAutoLod(cirrus, 0)?.id).toBe("lod0");
    expect(selectAutoLod(cirrus, 64)?.id).toBe("lod0");
    expect(selectAutoLod(cirrus, 65)?.id).toBe("lod1");
    expect(selectAutoLod(cirrus, 200)?.id).toBe("lod2");
    expect(selectAutoLod(cirrus, 5000)?.id).toBe("lod3");
  });

  it("returns no mesh for an airframe that has none, at any level", () => {
    // Every shipped airframe now has a mesh, but the fallback is how a new
    // entry lands before one exists, so it stays covered.
    const meshless: AircraftDefinition = { ...cirrus, lods: [] };
    expect(resolveLod(meshless, "auto", 0)).toBeNull();
    expect(resolveLod(meshless, "lod0", 0)).toBeNull();
    expect(selectAutoLod(meshless, 0)).toBeNull();
  });
});
