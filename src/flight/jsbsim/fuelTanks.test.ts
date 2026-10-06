import { describe, expect, it } from "vitest";
import {
  discoverFuelTanks, distributeFuel, fuelTankContentsPath, fuelTankIndices, readFuelTanks, writeFuelTanks,
} from "./fuelTanks";

/** A property tree that clamps tank contents to capacity the way JSBSim's SetContents does. */
function fakeSdk(tanks: { capacity: number; contents: number; x: number; y: number }[]) {
  const values = new Map<string, number>();
  tanks.forEach((tank, index) => {
    values.set(`propulsion/tank[${index}]/x-position`, tank.x);
    values.set(`propulsion/tank[${index}]/y-position`, tank.y);
    values.set(`propulsion/tank[${index}]/density-lbs_per_gal`, 6);
  });
  const writes: [string, number][] = [];
  const contents = (path: string) => /^propulsion\/tank\[(\d+)\]\/contents-lbs$/.exec(path);
  return {
    writes,
    values,
    getPropertyValue(path: string): number {
      const match = contents(path);
      return match ? tanks[Number(match[1])]!.contents : values.get(path) ?? 0;
    },
    setPropertyValue(path: string, value: number): void {
      writes.push([path, value]);
      const match = contents(path);
      if (!match) { values.set(path, value); return; }
      const tank = tanks[Number(match[1])]!;
      tank.contents = Math.min(tank.capacity, value);
    },
    queryPropertyCatalog(check: string): string {
      expect(check).toBe("propulsion/tank");
      return tanks.map((_, index) => `${index === 0 ? "propulsion/tank" : `propulsion/tank[${index}]`}/contents-lbs (RW)\n`
        + `${index === 0 ? "propulsion/tank" : `propulsion/tank[${index}]`}/pct-full (R)`).join("\n");
    },
    tanks,
  };
}

describe("fuel tanks", () => {
  it("finds every tank, spelling tank 0 with brackets", () => {
    const sdk = fakeSdk([
      { capacity: 185, contents: 100, x: 56, y: -112 },
      { capacity: 185, contents: 90, x: 56, y: 112 },
    ]);
    expect(fuelTankIndices(sdk)).toEqual([0, 1]);
    expect(fuelTankContentsPath(0)).toBe("propulsion/tank[0]/contents-lbs");
    expect(fuelTankIndices({ getPropertyValue: () => 0 })).toEqual([]);
  });

  it("reads each capacity from JSBSim's clamp and leaves the contents as they were", () => {
    const sdk = fakeSdk([
      { capacity: 6650, contents: 2500, x: 368.52, y: 40 },
      { capacity: 2991, contents: 0, x: 368.52, y: 80 },
    ]);
    expect(discoverFuelTanks(sdk)).toEqual([
      { index: 0, capacityLbs: 6650, xIn: 368.52, yIn: 40, densityLbsPerGal: 6 },
      { index: 1, capacityLbs: 2991, xIn: 368.52, yIn: 80, densityLbsPerGal: 6 },
    ]);
    expect(sdk.tanks.map(tank => tank.contents)).toEqual([2500, 0]);
    // Found once: a second look does not probe the tanks again.
    const probes = sdk.writes.length;
    expect(readFuelTanks(sdk).map(tank => tank.contentsLbs)).toEqual([2500, 0]);
    expect(sdk.writes).toHaveLength(probes);
  });

  it("holds every write between empty and full, and leaves unlisted tanks alone", () => {
    const sdk = fakeSdk([
      { capacity: 185, contents: 100, x: 56, y: -112 },
      { capacity: 185, contents: 100, x: 56, y: 112 },
    ]);
    writeFuelTanks(sdk, new Map([[0, -20], [7, 50]]));
    expect(sdk.tanks.map(tank => tank.contents)).toEqual([0, 100]);
    writeFuelTanks(sdk, new Map([[1, 1000]]));
    expect(sdk.tanks.map(tank => tank.contents)).toEqual([0, 185]);
  });
});

describe("distributing a total", () => {
  const base = [
    { contentsLbs: 185, capacityLbs: 185 },
    { contentsLbs: 92.5, capacityLbs: 185 },
    { contentsLbs: 0, capacityLbs: 100 },
  ];
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

  it("puts exactly the total on board, from empty to full", () => {
    for (const total of [0, 50, 277.5, 300, 470]) expect(sum(distributeFuel(base, total))).toBeCloseTo(total, 9);
    expect(distributeFuel(base, -10)).toEqual([0, 0, 0]);
    expect(distributeFuel(base, 1e6)).toEqual([185, 185, 100]);
  });

  it("empties every tank in proportion to what it holds", () => {
    const half = distributeFuel(base, 277.5 / 2);
    expect(half[0]).toBeCloseTo(92.5, 9);
    expect(half[1]).toBeCloseTo(46.25, 9);
    expect(half[2]).toBe(0);
  });

  it("fills every tank by the same share of the room it has left", () => {
    // 192.5 lb of room; adding half of it.
    const more = distributeFuel(base, 277.5 + 96.25);
    expect(more[0]).toBe(185);
    expect(more[1]).toBeCloseTo(92.5 + 46.25, 9);
    expect(more[2]).toBeCloseTo(50, 9);
  });

  it("returns the starting load when the total comes back to it", () => {
    expect(distributeFuel(base, 277.5)).toEqual([185, 92.5, 0]);
  });

  it("fills empty tanks to the same fraction of their capacity", () => {
    const empty = base.map(tank => ({ ...tank, contentsLbs: 0 }));
    const filled = distributeFuel(empty, 235);
    expect(filled[0]! / 185).toBeCloseTo(0.5, 9);
    expect(filled[2]! / 100).toBeCloseTo(0.5, 9);
  });
});
