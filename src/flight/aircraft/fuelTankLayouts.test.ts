import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AIRCRAFT_IDS, getAircraftFamilyForAircraft } from "./aircraftCatalog";
import { fuelTankShape, getAircraftFuelLayout } from "./fuelTankLayouts";
import { getExternalTankDefinitions } from "./externalTankDefinitions";
import { getFdmProfile } from "../jsbsim/fdmProfiles";

/** Each tank's location as the aircraft's JSBSim definition gives it, in inches. */
function definedTanks(model: string): { x: number; y: number }[] {
  const xml = readFileSync(`public/jsbsim-data/aircraft/${model}/${model}.xml`, "utf8");
  return [...xml.matchAll(/<tank\b[\s\S]*?<\/tank>/g)].map(([tank]) => {
    const location = /<location unit="IN">([\s\S]*?)<\/location>/.exec(tank)![1]!;
    const axis = (name: string) => Number(new RegExp(`<${name}>\\s*([-\\d.]+)\\s*</${name}>`).exec(location)![1]);
    return { x: axis("x"), y: axis("y") };
  });
}

function inside(outline: readonly (readonly [number, number])[], x: number, y: number): boolean {
  let crossings = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, yi] = outline[i]!;
    const [xj, yj] = outline[j]!;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) crossings = !crossings;
  }
  return crossings;
}

describe.each(AIRCRAFT_IDS)("%s fuel layout", aircraftId => {
  const layout = getAircraftFuelLayout(getAircraftFamilyForAircraft(aircraftId).id);
  const tanks = definedTanks(getFdmProfile(aircraftId).model);

  it("names every tank the flight model defines", () => {
    expect(tanks.length).toBeGreaterThan(0);
    expect(layout.tanks).toHaveLength(tanks.length);
  });

  it("puts internal tanks inside the traced airframe, without any tank boxes overlapping", () => {
    const externalIndices = new Set(getExternalTankDefinitions(aircraftId).map(tank => tank.index));
    for (const [index, tank] of tanks.entries()) {
      if (!externalIndices.has(index)) expect(layout.outlines.some(outline => inside(outline, tank.x, tank.y))).toBe(true);
    }
    const boxes = tanks.map((tank, index) => {
      const shape = fuelTankShape(layout, index, tank.y);
      return { left: tank.y - shape.spanIn / 2, right: tank.y + shape.spanIn / 2, top: tank.x - shape.chordIn / 2, bottom: tank.x + shape.chordIn / 2 };
    });
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) {
        expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
      }
    }
  });

  it("names each detachable tank for its external attachment", () => {
    for (const tank of getExternalTankDefinitions(aircraftId)) {
      expect(fuelTankShape(layout, tank.index, tank.locationIn.y).label).toBe(tank.label);
    }
  });

  it("names a tank it does not know for its side", () => {
    expect(fuelTankShape(layout, 9, -40).label).toBe("Left tank 10");
    expect(fuelTankShape(layout, 9, 0).label).toBe("Centre tank 10");
  });
});
