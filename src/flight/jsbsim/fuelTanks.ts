/**
 * The aircraft's fuel tanks as the flight model defines them: where each one
 * is, what it holds and how much it can hold. The Fuel tab draws and edits
 * them; flight snapshots keep every tank's contents.
 */

export interface FuelTankReader {
  getPropertyValue(property: string): number;
  /** Absent on stub backends; without it the aircraft has no tanks to show. */
  queryPropertyCatalog?(check: string): string;
}

export interface FuelTankWriter extends FuelTankReader {
  setPropertyValue(property: string, value: number): void;
}

export interface FuelTank {
  /** JSBSim's tank number. */
  index: number;
  capacityLbs: number;
  /** Structural frame, inches: x aft, y right. */
  xIn: number;
  yIn: number;
  densityLbsPerGal: number;
  /** Present only for a detachable tank whose native model declares a store index. */
  attachmentProperty?: string;
}

export interface FuelTankReading extends FuelTank {
  contentsLbs: number;
  /** Undefined for internal tanks; false excludes an absent external tank. */
  attached?: boolean;
}

/** One spelling per tank, bracketed even for tank 0, as saved flights record it. */
export function fuelTankContentsPath(index: number): string {
  return `propulsion/tank[${index}]/contents-lbs`;
}

/** Every tank the flight model has. Its catalogue spells tank 0 without brackets. */
export function fuelTankIndices(reader: FuelTankReader): number[] {
  if (typeof reader.queryPropertyCatalog !== "function") return [];
  let text: string;
  try { text = reader.queryPropertyCatalog("propulsion/tank"); } catch { return []; }
  const indices = new Set<number>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^propulsion\/tank(?:\[(\d+)\])?\/contents-lbs\b/.exec(line.trim());
    if (match) indices.add(Number(match[1] ?? 0));
  }
  return [...indices].sort((a, b) => a - b);
}

/** More than any tank holds: JSBSim clamps a larger write to the tank's capacity. */
const CAPACITY_PROBE_LBS = 1e9;
const discovered = new WeakMap<object, readonly FuelTank[]>();

/**
 * Every tank, found once per simulator: one simulator flies one aircraft for
 * its lifetime. JSBSim publishes no capacity property, but SetContents clamps
 * a write to the capacity, so writing more than any tank holds and reading it
 * back gives the capacity exactly. The contents are put back at once, before
 * anything steps.
 */
export function discoverFuelTanks(sdk: FuelTankWriter): readonly FuelTank[] {
  const cached = discovered.get(sdk);
  if (cached) return cached;
  const catalog = sdk.queryPropertyCatalog?.("propulsion/tank") ?? "";
  const tanks = fuelTankIndices(sdk).flatMap((index): FuelTank[] => {
    const base = `propulsion/tank[${index}]`;
    const path = fuelTankContentsPath(index);
    const held = sdk.getPropertyValue(path);
    sdk.setPropertyValue(path, CAPACITY_PROBE_LBS);
    const capacityLbs = sdk.getPropertyValue(path);
    sdk.setPropertyValue(path, held);
    if (!(capacityLbs > 0) || capacityLbs >= CAPACITY_PROBE_LBS) return [];
    const marker = `${base}/external-store-index`;
    const attachmentProperty = catalog.includes(`${marker} (`)
      ? `stores/external-tank[${sdk.getPropertyValue(marker)}]/attached` : undefined;
    return [{
      index,
      capacityLbs,
      xIn: sdk.getPropertyValue(`${base}/x-position`),
      yIn: sdk.getPropertyValue(`${base}/y-position`),
      densityLbsPerGal: sdk.getPropertyValue(`${base}/density-lbs_per_gal`),
      ...(attachmentProperty ? { attachmentProperty } : {}),
    }];
  });
  discovered.set(sdk, tanks);
  return tanks;
}

export function readFuelTanks(sdk: FuelTankWriter): FuelTankReading[] {
  return discoverFuelTanks(sdk).map(tank => {
    const attached = tank.attachmentProperty ? sdk.getPropertyValue(tank.attachmentProperty) > 0.5 : undefined;
    return { ...tank,
      contentsLbs: attached === false ? 0 : sdk.getPropertyValue(fuelTankContentsPath(tank.index)),
      ...(attached === undefined ? {} : { attached }),
    };
  });
}

/**
 * Sets the tanks listed, by JSBSim tank number, each held between empty and
 * full: JSBSim caps a write at the capacity but takes a negative one as given.
 */
export function writeFuelTanks(sdk: FuelTankWriter, contentsLbs: ReadonlyMap<number, number>): void {
  for (const tank of discoverFuelTanks(sdk)) {
    if (tank.attachmentProperty && sdk.getPropertyValue(tank.attachmentProperty) <= 0.5) continue;
    const value = contentsLbs.get(tank.index);
    if (value === undefined || !Number.isFinite(value)) continue;
    sdk.setPropertyValue(fuelTankContentsPath(tank.index), Math.min(tank.capacityLbs, Math.max(0, value)));
  }
}

/**
 * Contents that put `totalLbs` on board and keep the tanks' load as like the
 * `base` load as possible. Taking fuel out empties every tank in proportion
 * to what it holds; adding fuel fills every tank by the same share of the
 * room it has left. Both meet all-empty and all-full at the ends, so a pilot's
 * uneven load survives the total being dragged anywhere between them, and
 * returns exactly when it is dragged back.
 */
export function distributeFuel(
  base: readonly Pick<FuelTankReading, "contentsLbs" | "capacityLbs">[],
  totalLbs: number,
): number[] {
  const capacity = base.reduce((sum, tank) => sum + tank.capacityLbs, 0);
  const held = base.reduce((sum, tank) => sum + tank.contentsLbs, 0);
  const target = Math.min(capacity, Math.max(0, totalLbs));
  if (target >= held) {
    const room = capacity - held;
    const share = room > 0 ? (target - held) / room : 0;
    return base.map(tank => tank.contentsLbs + (tank.capacityLbs - tank.contentsLbs) * share);
  }
  const share = held > 0 ? target / held : 0;
  return base.map(tank => tank.contentsLbs * share);
}
