import { describe, expect, it } from "vitest";
import {
  AIRCRAFT_CATALOG,
  AIRCRAFT_FAMILIES,
  AIRCRAFT_FAMILY_IDS,
  AIRCRAFT_IDS,
  autoLods,
  getAircraftDefinition,
  getAircraftFamily,
  getAircraftFamilyForAircraft,
  isAircraftFamilyId,
  isAircraftId,
  isAircraftLodId,
  normalizeAircraftSelection,
  resolveLod,
  selectAutoLod,
  type AircraftDefinition,
} from "./aircraftCatalog";
import { getFdmProfile } from "../jsbsim/fdmProfiles";

const c172 = getAircraftDefinition("cessna-172");
const cirrus = getAircraftDefinition("cirrus-vision-jet");
const f35b = getAircraftDefinition("f-35b");

describe("aircraft catalog", () => {
  it("exposes every runtime package and falls back to the first for unknown ids", () => {
    expect(AIRCRAFT_CATALOG.map((entry) => entry.id)).toEqual([
      "cessna-172", "cirrus-vision-jet", "cirrus-vision-jet-g2", "cirrus-vision-jet-g3", "f-35b",
    ]);
    expect(AIRCRAFT_CATALOG.map((entry) => entry.id)).toEqual(AIRCRAFT_IDS);
    expect(getAircraftDefinition("nope" as never).id).toBe("cessna-172");
  });

  it("validates persisted preferences", () => {
    for (const id of AIRCRAFT_IDS) expect(isAircraftId(id)).toBe(true);
    expect(isAircraftId("cirrus-vision-jet-g2+")).toBe(false);
    expect(isAircraftId("f16")).toBe(false);
    expect(isAircraftId(null)).toBe(false);
    expect(isAircraftLodId("auto")).toBe(true);
    expect(isAircraftLodId("lod3")).toBe(true);
    expect(isAircraftLodId("lod9")).toBe(false);
  });

  it("groups every runtime package under its family card", () => {
    expect(AIRCRAFT_FAMILIES.map((family) => family.id)).toEqual([
      "cessna-172", "cirrus-vision-jet", "f-35b",
    ]);
    expect(AIRCRAFT_FAMILIES.map((family) => family.id)).toEqual(AIRCRAFT_FAMILY_IDS);
    for (const family of AIRCRAFT_FAMILIES) {
      expect(isAircraftFamilyId(family.id)).toBe(true);
      expect(family.thumbnail.path).toMatch(/^aircraft\/thumbnails\/.+\.png$/);
      expect(family.thumbnail.credit.artist).toBeTruthy();
      expect(family.variants.some((variant) => variant.aircraftId === family.defaultAircraftId)).toBe(true);
      for (const variant of family.variants) {
        expect(getAircraftDefinition(variant.aircraftId).familyId).toBe(family.id);
      }
    }
    expect(isAircraftFamilyId("cirrus-vision-jet-g2")).toBe(false);
    for (const definition of AIRCRAFT_CATALOG) {
      const family = getAircraftFamilyForAircraft(definition.id);
      expect(family.id).toBe(definition.familyId);
      expect(family.variants.some((variant) => variant.aircraftId === definition.id)).toBe(true);
    }
  });

  it("keeps G2+ as a distinct generation label backed by the provisional G2 package", () => {
    const family = getAircraftFamily("cirrus-vision-jet");
    expect(family.variantLabel).toBe("Generation");
    expect(Object.fromEntries(family.variants.map(({ id, aircraftId, label }) => [id, { aircraftId, label }]))).toEqual({
      g1: { aircraftId: "cirrus-vision-jet", label: "G1" },
      g2: { aircraftId: "cirrus-vision-jet-g2", label: "G2" },
      "g2+": { aircraftId: "cirrus-vision-jet-g2", label: "G2+" },
      g3: { aircraftId: "cirrus-vision-jet-g3", label: "G3" },
    });
    expect(new Set(family.variants.map((variant) => variant.id)).size).toBe(4);
    expect(family.developmentNote).toContain("G2+ is currently mapped to the G2 runtime");
    expect(family.developmentNote).toContain("does not provide calibrated generation-specific performance");
    const selection = normalizeAircraftSelection({
      aircraftId: "cirrus-vision-jet", generationId: "g2+", lodId: "lod3",
    });
    expect(selection).toEqual({
      aircraftId: "cirrus-vision-jet-g2", generationId: "g2+", lodId: "lod3",
    });
    expect(normalizeAircraftSelection(selection)).toEqual(selection);
  });

  it("restores the legacy Vision Jet preference as G1 and identifies later packages", () => {
    expect(getAircraftFamilyForAircraft("cirrus-vision-jet").defaultAircraftId).toBe("cirrus-vision-jet");
    for (const [aircraftId, generationId] of [
      ["cirrus-vision-jet", "g1"],
      ["cirrus-vision-jet-g2", "g2"],
      ["cirrus-vision-jet-g3", "g3"],
    ] as const) {
      expect(normalizeAircraftSelection({ aircraftId, lodId: "auto" })).toEqual({
        aircraftId, generationId, lodId: "auto",
      });
    }
  });

  it("keeps C172 free of generation controls and falls back from a level it does not have", () => {
    const family = getAircraftFamily("cessna-172");
    expect(family.variantLabel).toBeUndefined();
    expect(family.variants).toHaveLength(1);
    expect(normalizeAircraftSelection({
      aircraftId: "cessna-172", generationId: "g3", lodId: "hd",
    })).toEqual({
      aircraftId: "cessna-172", generationId: "cessna-172", lodId: "auto",
    });
    // The jet has the level, so a chosen HD survives a stray generation.
    expect(normalizeAircraftSelection({
      aircraftId: "cirrus-vision-jet-g3", generationId: "unrecognized", lodId: "hd",
    })).toEqual({
      aircraftId: "cirrus-vision-jet-g3", generationId: "g3", lodId: "hd",
    });
  });

  it("orders every airframe's levels from most to least detailed", () => {
    for (const definition of AIRCRAFT_CATALOG) {
      const triangles = definition.lods.map((lod) => lod.triangles);
      expect(triangles).toEqual([...triangles].sort((a, b) => b - a));
      const distances = definition.lods.map((lod) => lod.autoFromMeters);
      expect(distances).toEqual([...distances].sort((a, b) => a - b));
      // The ladder always starts at the camera, and Auto's finest level is
      // never one that loads only when chosen.
      expect(distances[0]).toBe(0);
      expect(autoLods(definition)[0]?.optIn).toBeUndefined();
    }
    // Level numbers run the other way from the array: lod0 is the coarsest,
    // and the jet has no lod0 at all because its coarsest level is lod1.
    expect(c172.lods.map((lod) => lod.id)).toEqual(["lod3", "lod2", "lod1", "lod0"]);
    expect(cirrus.lods.map((lod) => lod.id)).toEqual(["hd", "lod3", "lod2", "lod1"]);
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
    expect(cirrus.lods.find((lod) => lod.id === "lod3")?.credit.artist).toBe("felipegalin0");
  });

  it("leaves opt-in levels out of Auto", () => {
    expect(autoLods(cirrus).map((lod) => lod.id)).toEqual(["lod3", "lod2", "lod1"]);
    // The C172 has none.
    expect(autoLods(c172)).toEqual(c172.lods);
    expect(selectAutoLod(cirrus, 0)?.id).toBe("lod3");
  });

  it("loads the F-35B's credited exterior in Auto at every distance", () => {
    expect(f35b.lods).toHaveLength(1);
    const exterior = f35b.lods[0];
    expect(exterior.path).toBe("aircraft/f-35b/F-35B_AF267.glb");
    expect(exterior.optIn).toBeUndefined();
    expect(autoLods(f35b)).toEqual([exterior]);
    for (const distance of [0, 100, 5000]) {
      expect(resolveLod(f35b, "auto", distance)).toBe(exterior);
    }
    expect(exterior.credit.artist).toBe("AF267");
    expect(exterior.credit.licence).toBe("CC BY 4.0");
    expect(exterior.credit.sourceUrl).toContain("5d54a6af45974ad386ae74d42b33374a");
    expect(f35b.propellerBlades).toBe(0);
    const family = getAircraftFamilyForAircraft("f-35b");
    expect(family.thumbnail.path).toBe("aircraft/thumbnails/f-35b.png");
    expect(family.thumbnail.credit.artist).toBe("AF267");
    expect(family.developmentNote).toContain("Experimental");
    expect(family.developmentNote).toContain("not validated");
  });

  it("restores an F-35B choice without inheriting a Vision Jet generation", () => {
    const family = getAircraftFamily("f-35b");
    expect(family.variantLabel).toBeUndefined();
    expect(family.variants).toHaveLength(1);
    expect(normalizeAircraftSelection({
      aircraftId: "f-35b", generationId: "g2+", lodId: "lod2",
    })).toEqual({ aircraftId: "f-35b", generationId: "f-35b", lodId: "auto" });
    expect(normalizeAircraftSelection({ aircraftId: "f-35b", lodId: "hd" }))
      .toEqual({ aircraftId: "f-35b", generationId: "f-35b", lodId: "hd" });
  });

  it("loads an opt-in level whenever it is chosen, at any distance", () => {
    expect(resolveLod(cirrus, "hd", 0)?.id).toBe("hd");
    expect(resolveLod(cirrus, "hd", 9999)?.id).toBe("hd");
  });

  it("keeps the jet off the propeller path", () => {
    expect(cirrus.propellerBlades).toBe(0);
    expect(c172.propellerBlades).toBe(2);
  });

  it("drops every model by the stance the simulator holds the aircraft at", () => {
    // The exterior meshes use a ground-plane origin below the aircraft
    // reference point. See docs/ground-contact.md.
    for (const definition of AIRCRAFT_CATALOG) {
      const profile = getFdmProfile(definition.id);
      expect(definition.modelOffset).toEqual({ x: 0, y: -profile.stance.staticMeters, z: 0 });
      expect(definition.modelYawRad).toBe(Math.PI);
    }
  });

  it("picks a coarser auto level as the chase camera pulls back", () => {
    expect(selectAutoLod(c172, 0)?.id).toBe("lod3");
    expect(selectAutoLod(c172, 59)?.id).toBe("lod3");
    expect(selectAutoLod(c172, 60)?.id).toBe("lod2");
    expect(selectAutoLod(c172, 200)?.id).toBe("lod1");
    expect(selectAutoLod(c172, 5000)?.id).toBe("lod0");
  });

  it("honours an explicit level regardless of distance", () => {
    expect(resolveLod(c172, "lod0", 0)?.id).toBe("lod0");
    expect(resolveLod(c172, "lod3", 9999)?.id).toBe("lod3");
  });

  it("picks a coarser auto level for the jet as well", () => {
    expect(selectAutoLod(cirrus, 0)?.id).toBe("lod3");
    expect(selectAutoLod(cirrus, 64)?.id).toBe("lod3");
    expect(selectAutoLod(cirrus, 65)?.id).toBe("lod2");
    expect(selectAutoLod(cirrus, 200)?.id).toBe("lod1");
    // No silhouette level under it: the far level runs all the way out.
    expect(selectAutoLod(cirrus, 5000)?.id).toBe("lod1");
  });

  it("returns no mesh for an airframe that has none, at any level", () => {
    // Every shipped airframe now has a mesh, but the fallback is how a new
    // entry lands before one exists, so it stays covered.
    const meshless: AircraftDefinition = { ...cirrus, lods: [] };
    expect(resolveLod(meshless, "auto", 0)).toBeNull();
    expect(resolveLod(meshless, "lod3", 0)).toBeNull();
    expect(selectAutoLod(meshless, 0)).toBeNull();
    // ...and an airframe whose only mesh is opt-in: Auto draws none, choosing it draws it
    const optInOnly: AircraftDefinition = { ...cirrus, lods: cirrus.lods.filter((lod) => lod.optIn) };
    expect(resolveLod(optInOnly, "auto", 0)).toBeNull();
    expect(resolveLod(optInOnly, "hd", 0)?.id).toBe("hd");
  });
});
