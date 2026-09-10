import { describe, expect, it, vi } from "vitest";
import type { SurfaceHit, SurfaceQuery } from "foss-earth/runtime";
import { createFrameSurfaceQuery } from "./frameSurfaceQuery";

const hit = (heightMeters: number, revision = 1): SurfaceHit => ({
  heightMeters, revision, meshId: "terrain", quality: 15, distanceMeters: 100,
  point: { x: 1, y: 2, z: 3 }, normal: { x: 0, y: 0, z: 1 },
});

describe("flight frame surface queries", () => {
  it("shares support between pre-contact, each physics step, collision, and the view", () => {
    const sample = vi.fn(() => hit(300));
    const query = createFrameSurfaceQuery({ sample, raycast: () => null });
    query.beginFrame();
    // The pre-contact update and the first substep see the same position.
    query.sample(45, -93);
    query.sample(45, -93);
    query.sample(45, -93); // Body collision needs the same height.
    query.sample(45, -92.99999); // Second 120 Hz substep has moved.
    query.sample(45, -92.99999);
    query.sample(45, -92.999995); // Interpolated camera position is distinct.
    expect(sample).toHaveBeenCalledTimes(3);
  });

  it("refreshes unchanged positions every frame for refinement and provider handoffs", () => {
    const sample = vi.fn<SurfaceQuery["sample"]>().mockReturnValueOnce(hit(300))
      .mockReturnValueOnce(hit(305, 2)).mockReturnValueOnce(null).mockReturnValue(hit(900, 3));
    const query = createFrameSurfaceQuery({ sample, raycast: () => null });
    for (const expected of [300, 305, undefined, 900]) {
      query.beginFrame();
      expect(query.sample(45, -93)?.heightMeters).toBe(expected);
      expect(query.sample(45, -93)?.heightMeters).toBe(expected);
    }
    expect(sample).toHaveBeenCalledTimes(4);
  });

  it("does not merge even extremely close coordinates across a surface edge", () => {
    const sample = vi.fn<SurfaceQuery["sample"]>((_lat, lon) => lon < -93 ? hit(300) : null);
    const query = createFrameSurfaceQuery({ sample, raycast: () => null });
    query.beginFrame();
    expect(query.sample(45, -93 - 1e-10)?.heightMeters).toBe(300);
    expect(query.sample(45, -93)).toBeNull();
    expect(sample).toHaveBeenCalledTimes(2);
  });

  it("always delegates body sweeps and keeps uncached queries correct beyond capacity", () => {
    const raycast = vi.fn(() => hit(12));
    const sample = vi.fn((lat: number) => hit(lat));
    const query = createFrameSurfaceQuery({ sample, raycast });
    query.beginFrame();
    for (let lat = 0; lat < 20; lat++) expect(query.sample(lat, 0)?.heightMeters).toBe(lat);
    expect(query.sample(19, 0)?.heightMeters).toBe(19);
    expect(sample).toHaveBeenCalledTimes(21);
    const origin = { x: 1, y: 2, z: 3 }, direction = { x: 0, y: 0, z: -1 };
    query.raycast(origin, direction, 0.5);
    query.raycast(origin, direction, 0.5);
    expect(raycast).toHaveBeenCalledTimes(2);
    expect(raycast).toHaveBeenLastCalledWith(origin, direction, 0.5);
  });
});
