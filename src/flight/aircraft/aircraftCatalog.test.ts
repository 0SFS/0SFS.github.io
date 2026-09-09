import { describe, expect, it } from "vitest";
import {
  AIRCRAFT_CATALOG,
  getAircraftDefinition,
  isAircraftId,
  isAircraftLodId,
  resolveLod,
  selectAutoLod,
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

  it("orders C172 levels from most to least detailed", () => {
    const triangles = c172.lods.map((lod) => lod.triangles);
    expect(triangles).toEqual([...triangles].sort((a, b) => b - a));
    expect(c172.lods.map((lod) => lod.id)).toEqual(["lod0", "lod1", "lod2", "lod3"]);
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

  it("returns no mesh for an airframe that has none, at any level", () => {
    expect(cirrus.lods).toHaveLength(0);
    expect(resolveLod(cirrus, "auto", 0)).toBeNull();
    expect(resolveLod(cirrus, "lod0", 0)).toBeNull();
    expect(selectAutoLod(cirrus, 0)).toBeNull();
  });
});
