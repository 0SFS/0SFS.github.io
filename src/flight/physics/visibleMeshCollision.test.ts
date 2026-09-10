import { describe, expect, it, vi } from "vitest";
import { DEG_TO_RAD, ecefToGeodetic, geodeticToEcef } from "foss-earth/cameraMath";
import type { SurfaceQuery } from "foss-earth/runtime";
import { createVisibleMeshCollision } from "./visibleMeshCollision";

type Vector = { x: number; y: number; z: number };

function sdkAt(altitude = 320) {
  const values: Record<string, number> = {
    "position/lat-geod-deg": 0, "position/long-gc-deg": 0, "position/h-sl-ft": altitude / 0.3048,
    "position/terrain-elevation-asl-ft": 300 / 0.3048,
    "attitude/phi-deg": 0, "attitude/theta-deg": 0, "attitude/psi-deg": 0,
    "velocities/vc-kts": 80, "velocities/v-down-fps": 3 / 0.3048,
    "velocities/v-north-fps": 10 / 0.3048, "velocities/v-east-fps": 4 / 0.3048,
    "fcs/throttle-cmd-norm": 0.5, "propulsion/engine/engine-rpm": 1000,
  };
  const initialProperties: Record<string, string> = {
    "ic/lat-geod-deg": "position/lat-geod-deg", "ic/long-gc-deg": "position/long-gc-deg",
    "ic/h-sl-ft": "position/h-sl-ft", "ic/terrain-elevation-ft": "position/terrain-elevation-asl-ft",
    "ic/phi-deg": "attitude/phi-deg", "ic/theta-deg": "attitude/theta-deg", "ic/psi-true-deg": "attitude/psi-deg",
    "ic/vn-fps": "velocities/v-north-fps", "ic/ve-fps": "velocities/v-east-fps", "ic/vd-fps": "velocities/v-down-fps",
  };
  return {
    values,
    getPropertyValue: vi.fn((name: string) => values[name] ?? 0),
    setPropertyValue: vi.fn((name: string, value: number) => { values[name] = value; }),
    resetToInitialConditions: vi.fn(),
    runIc: vi.fn(() => {
      for (const [initial, property] of Object.entries(initialProperties)) if (initial in values) values[property] = values[initial];
      return true;
    }),
  };
}

function position(sdk: ReturnType<typeof sdkAt>): Vector {
  return geodeticToEcef(sdk.values["position/lat-geod-deg"] * DEG_TO_RAD,
    sdk.values["position/long-gc-deg"] * DEG_TO_RAD, sdk.values["position/h-sl-ft"] * 0.3048);
}

function move(sdk: ReturnType<typeof sdkAt>, delta: Vector): void {
  const before = position(sdk);
  const next = ecefToGeodetic(before.x + delta.x, before.y + delta.y, before.z + delta.z);
  sdk.setPropertyValue("position/lat-geod-deg", next.latRad / DEG_TO_RAD);
  sdk.setPropertyValue("position/long-gc-deg", next.lonRad / DEG_TO_RAD);
  sdk.setPropertyValue("position/h-sl-ft", next.altMeters / 0.3048);
}

function surfaceWithHits(fractions: Array<number | null>, normal: Vector = { x: 0, y: 0, z: -1 }) {
  let index = 0;
  const raycast = vi.fn((from: Vector, movement: Vector, distance: number) => {
    const fraction = fractions[index++ % fractions.length];
    if (fraction === null) return null;
    return {
      point: { x: from.x + movement.x * fraction, y: from.y + movement.y * fraction, z: from.z + movement.z * fraction },
      normal, distanceMeters: distance * fraction,
    };
  });
  return { sample: () => ({ heightMeters: 300 }), raycast } as unknown as SurfaceQuery & { raycast: typeof raycast };
}

function speedSquared(sdk: ReturnType<typeof sdkAt>): number {
  return ["velocities/v-north-fps", "velocities/v-east-fps", "velocities/v-down-fps"]
    .reduce((sum, property) => sum + (sdk.getPropertyValue(property) * 0.3048) ** 2, 0);
}

function worldVelocity(sdk: ReturnType<typeof sdkAt>): Vector {
  const lat = sdk.values["position/lat-geod-deg"] * DEG_TO_RAD;
  const lon = sdk.values["position/long-gc-deg"] * DEG_TO_RAD;
  const north = sdk.values["velocities/v-north-fps"] * 0.3048;
  const east = sdk.values["velocities/v-east-fps"] * 0.3048;
  const up = -sdk.values["velocities/v-down-fps"] * 0.3048;
  return {
    x: -north * Math.sin(lat) * Math.cos(lon) - east * Math.sin(lon) + up * Math.cos(lat) * Math.cos(lon),
    y: -north * Math.sin(lat) * Math.sin(lon) + east * Math.cos(lon) + up * Math.cos(lat) * Math.sin(lon),
    z: north * Math.cos(lat) + up * Math.sin(lat),
  };
}

describe("visible mesh body collision", () => {
  it.each([100, 150].flatMap(speedKts => ["nose", "center", "left-wing", "right-wing", "tail"]
    .map((probe, probeIndex) => ({ speedKts, probe, probeIndex }))))("keeps a $speedKts kt $probe wall/slope impact passive at level and banked attitudes", ({ speedKts, probeIndex }) => {
    for (const roll of [0, 35]) for (const rawNormal of [{ x: 0, y: 0, z: -9 }, { x: 3, y: 1, z: -4 }]) {
      const sdk = sdkAt();
      sdk.values["attitude/phi-deg"] = roll;
      sdk.values["attitude/theta-deg"] = -12;
      sdk.values["attitude/psi-deg"] = 65;
      const speed = speedKts * 1852 / 3600;
      const north = speed / Math.sqrt(1.1);
      sdk.values["velocities/v-north-fps"] = north / 0.3048;
      sdk.values["velocities/v-east-fps"] = north * 0.3 / 0.3048;
      sdk.values["velocities/v-down-fps"] = north * 0.1 / 0.3048;
      const beforePosition = position(sdk);
      const motion = { x: -north * 0.1 / 120, y: north * 0.3 / 120, z: north / 120 };
      const collision = createVisibleMeshCollision(sdk as never,
        surfaceWithHits(Array.from({ length: 5 }, (_, index) => index === probeIndex ? 0.6 : null), rawNormal));
      collision.update();
      move(sdk, motion);
      const incoming = worldVelocity(sdk);
      const beforeEnergy = speedSquared(sdk);
      expect(collision.update()).toBe(true);
      const outgoing = worldVelocity(sdk);
      const normalLength = Math.hypot(rawNormal.x, rawNormal.y, rawNormal.z);
      const normal = { x: rawNormal.x / normalLength, y: rawNormal.y / normalLength, z: rawNormal.z / normalLength };
      const incomingNormal = incoming.x * normal.x + incoming.y * normal.y + incoming.z * normal.z;
      const outgoingNormal = outgoing.x * normal.x + outgoing.y * normal.y + outgoing.z * normal.z;
      expect(outgoingNormal).toBeCloseTo(-0.25 * incomingNormal, 7);
      expect(speedSquared(sdk)).toBeLessThan(beforeEnergy);
      const afterPosition = position(sdk);
      for (const axis of ["x", "y", "z"] as const) {
        expect(outgoing[axis] - outgoingNormal * normal[axis])
          .toBeCloseTo(incoming[axis] - incomingNormal * normal[axis], 7);
        expect(afterPosition[axis] - beforePosition[axis]).toBeCloseTo(motion[axis] * 0.6 + normal[axis] * 0.01, 5);
      }
    }
  });

  it("resolves the earliest probe impact without moving the centre to the wing or adding a 1.5m launch", () => {
    const sdk = sdkAt();
    const before = position(sdk);
    const surface = surfaceWithHits([0.8, null, 0.25, null, null]);
    const collision = createVisibleMeshCollision(sdk as never, surface);
    expect(collision.update()).toBe(false);
    move(sdk, { x: 0, y: 0, z: 1 });
    expect(collision.update()).toBe(true);
    const after = position(sdk);
    expect(surface.raycast).toHaveBeenCalledTimes(5);
    expect(after.x - before.x).toBeCloseTo(0, 4);
    expect(after.y - before.y).toBeCloseTo(0, 4);
    expect(after.z - before.z).toBeCloseTo(0.24, 4);
  });

  it("preserves the current terrain, controls and angular rates when restoring an impact", () => {
    const sdk = sdkAt();
    const collision = createVisibleMeshCollision(sdk as never, surfaceWithHits([0.5, null, null, null, null]));
    collision.update();
    sdk.setPropertyValue("position/terrain-elevation-asl-ft", 301 / 0.3048);
    sdk.setPropertyValue("fcs/throttle-cmd-norm", 0.75);
    sdk.setPropertyValue("fcs/elevator-cmd-norm", 0.3);
    sdk.setPropertyValue("velocities/q-rad_sec", 0.1);
    move(sdk, { x: 0, y: 0, z: 1 });
    expect(collision.update()).toBe(true);
    expect(sdk.values["ic/terrain-elevation-ft"] * 0.3048).toBeCloseTo(301, 6);
    expect(sdk.values["fcs/throttle-cmd-norm"]).toBe(0.75);
    expect(sdk.values["fcs/elevator-cmd-norm"]).toBe(0.3);
    expect(sdk.values["ic/q-rad_sec"]).toBe(0.1);
  });

  it.each([0, 0.25, 1])("normalizes scaled normals and dissipates normal energy for restitution %s", restitution => {
    const sdk = sdkAt();
    const beforeEnergy = speedSquared(sdk);
    const collision = createVisibleMeshCollision(sdk as never,
      surfaceWithHits([0.5, null, null, null, null], { x: 0, y: 0, z: -7 }), { getRestitution: () => restitution });
    collision.update();
    move(sdk, { x: 0, y: 0, z: 1 });
    expect(collision.update()).toBe(true);
    expect(speedSquared(sdk)).toBeLessThanOrEqual(beforeEnergy + 1e-6);
    expect(sdk.values["velocities/v-north-fps"] * 0.3048).toBeCloseTo(-10 * restitution, 4);
    expect(sdk.values["velocities/v-east-fps"] * 0.3048).toBeCloseTo(4, 4);
    expect(sdk.values["velocities/v-down-fps"] * 0.3048).toBeCloseTo(3, 4);
  });

  it.each([
    { x: 0, y: 0, z: 0 }, { x: NaN, y: 0, z: 1 }, { x: Infinity, y: 0, z: 1 },
  ])("ignores invalid collision normals %j", normal => {
    const sdk = sdkAt();
    const collision = createVisibleMeshCollision(sdk as never, surfaceWithHits([0.5, null, null, null, null], normal));
    collision.update();
    move(sdk, { x: 0, y: 0, z: 1 });
    expect(collision.update()).toBe(false);
    expect(sdk.resetToInitialConditions).not.toHaveBeenCalled();
  });

  it.each([0.5, 1])("detects slow taxi collisions including an impact at segment fraction %s", fraction => {
    const sdk = sdkAt();
    const collision = createVisibleMeshCollision(sdk as never, surfaceWithHits([fraction, null, null, null, null]));
    collision.update();
    move(sdk, { x: 0, y: 0, z: 0.005 });
    expect(collision.update()).toBe(true);
  });

  it("rotates the body probes with roll and pitch", () => {
    const sdk = sdkAt();
    const centre = position(sdk);
    const surface = surfaceWithHits([null]);
    const collision = createVisibleMeshCollision(sdk as never, surface);
    collision.update();
    sdk.setPropertyValue("attitude/phi-deg", 90);
    collision.update();
    const [leftFrom, leftMovement] = surface.raycast.mock.calls[2];
    expect(leftFrom.y - centre.y).toBeCloseTo(-5.5, 5);
    expect(leftFrom.x + leftMovement.x - centre.x).toBeCloseTo(5.5, 5);
    expect(leftFrom.y + leftMovement.y - centre.y).toBeCloseTo(0.6, 5);
    collision.reset();
    sdk.setPropertyValue("attitude/phi-deg", 0);
    collision.update();
    sdk.setPropertyValue("attitude/theta-deg", 90);
    surface.raycast.mockClear();
    collision.update();
    const [noseFrom, noseMovement] = surface.raycast.mock.calls[0];
    expect(noseFrom.x + noseMovement.x - centre.x).toBeCloseTo(4.5, 5);
    expect(noseFrom.z + noseMovement.z - centre.z).toBeCloseTo(-0.7, 5);
  });

  it("reset discards motion caused by a placement or terrain refinement", () => {
    const sdk = sdkAt();
    const surface = surfaceWithHits([0.5, null, null, null, null]);
    const collision = createVisibleMeshCollision(sdk as never, surface);
    collision.update();
    move(sdk, { x: 10, y: 0, z: 0 });
    collision.reset();
    expect(collision.update()).toBe(false);
    expect(surface.raycast).not.toHaveBeenCalled();
  });

  it.each([[1.35, 1.35], [99, 2], [NaN, 0.25]])("permits explicit arcade restitution %s with finite bounds", (requested, expected) => {
    const sdk = sdkAt();
    const collision = createVisibleMeshCollision(sdk as never, surfaceWithHits([0.5, null, null, null, null]),
      { getRestitution: () => requested });
    collision.update();
    move(sdk, { x: 0, y: 0, z: 1 });
    collision.update();
    expect(sdk.values["velocities/v-north-fps"] * 0.3048).toBeCloseTo(-10 * expected, 4);
  });
});
