import { describe, expect, it } from "vitest";
import {
  AIRCRAFT_CATALOG,
  availableLods,
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
      const distances = definition.lods.map((lod) => lod.autoFromMeters);
      expect(distances).toEqual([...distances].sort((a, b) => a - b));
      // The ladder always starts at the camera, whether or not its finest
      // level is one the user has to switch on.
      expect(distances[0]).toBe(0);
      expect(availableLods(definition, false)[0]?.optIn).toBeUndefined();
    }
    expect(c172.lods.map((lod) => lod.id)).toEqual(["lod0", "lod1", "lod2", "lod3"]);
    expect(cirrus.lods.map((lod) => lod.id)).toEqual(["hd", "lod0", "lod1", "lod2", "lod3"]);
  });

  it("credits every mesh, and names a licence and a source for third-party ones", () => {
    for (const definition of AIRCRAFT_CATALOG) {
      for (const lod of definition.lods) {
        expect(lod.credit.artist).toBeTruthy();
        expect(lod.credit.note).toBeTruthy();
        // Anything not ours ships only because its licence allows it, so the
        // licence and a link back are not optional on those.
        if (lod.credit.artist !== "felipegalin0") {
          expect(lod.credit.licence).toBeTruthy();
          expect(lod.credit.sourceUrl).toMatch(/^https:\/\//);
        }
      }
    }
    const hd = cirrus.lods.find((lod) => lod.id === "hd");
    expect(hd?.credit.artist).toBe("hilos run");
    expect(cirrus.lods.find((lod) => lod.id === "lod0")?.credit.artist).toBe("felipegalin0");
  });

  it("hides opt-in levels until they are switched on", () => {
    expect(availableLods(cirrus, false).map((lod) => lod.id)).toEqual([
      "lod0", "lod1", "lod2", "lod3",
    ]);
    expect(availableLods(cirrus, true).map((lod) => lod.id)).toEqual([
      "hd", "lod0", "lod1", "lod2", "lod3",
    ]);
    // The C172 has none, so the flag changes nothing for it.
    expect(availableLods(c172, true)).toEqual(availableLods(c172, false));
  });

  it("never reaches an opt-in level while it is switched off", () => {
    expect(selectAutoLod(cirrus, 0, false)?.id).toBe("lod0");
    // ...and a stored choice of one falls back rather than blanking the model
    expect(resolveLod(cirrus, "hd", 0, false)?.id).toBe("lod0");
  });

  it("lets an opt-in level cover the close range once it is on", () => {
    expect(selectAutoLod(cirrus, 0, true)?.id).toBe("hd");
    expect(selectAutoLod(cirrus, 39, true)?.id).toBe("hd");
    expect(selectAutoLod(cirrus, 40, true)?.id).toBe("lod0");
    expect(selectAutoLod(cirrus, 65, true)?.id).toBe("lod1");
    expect(selectAutoLod(cirrus, 5000, true)?.id).toBe("lod3");
    expect(resolveLod(cirrus, "hd", 9999, true)?.id).toBe("hd");
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
    // ...and an airframe whose only mesh is opt-in, while it is switched off
    const optInOnly: AircraftDefinition = { ...cirrus, lods: cirrus.lods.filter((lod) => lod.optIn) };
    expect(resolveLod(optInOnly, "auto", 0, false)).toBeNull();
    expect(resolveLod(optInOnly, "auto", 0, true)?.id).toBe("hd");
  });
});
