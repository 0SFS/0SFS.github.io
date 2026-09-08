import { describe, expect, it, vi } from "vitest";
import type { SurfaceQuery } from "foss-earth/runtime";
import { createVisibleMeshCollision } from "./visibleMeshCollision";

function sdkAt(lat: number, lon: number, altitude: number) {
  const values: Record<string, number> = { "position/lat-geod-deg": lat, "position/long-gc-deg": lon, "position/h-sl-ft": altitude / 0.3048,
    "attitude/phi-deg": 0, "attitude/theta-deg": 0, "attitude/psi-deg": 90, "velocities/vc-kts": 80, "velocities/v-down-fps": 0,
    "velocities/v-north-fps": 0, "velocities/v-east-fps": 100, "fcs/throttle-cmd-norm": 0.5, "propulsion/engine/engine-rpm": 1000 };
  return { getPropertyValue: (name: string) => values[name] ?? 0, setPropertyValue: vi.fn((name: string, value: number) => { values[name] = value; }),
    resetToInitialConditions: vi.fn(), runIc: vi.fn(() => true) };
}

describe("visible mesh body collision", () => {
  it("uses at most five short swept rays and restores after an impact", () => {
    const sdk = sdkAt(45, -93, 320);
    const raycast = vi.fn().mockReturnValueOnce(null).mockReturnValueOnce({ distanceMeters: 0.2, point: { x: -2364458, y: -4511584, z: 4487560 }, normal: { x: 0, y: 1, z: 0 } });
    const surface: SurfaceQuery = { sample: () => ({ heightMeters: 300 } as never), raycast };
    const collision = createVisibleMeshCollision(sdk as never, surface);
    expect(collision.update()).toBe(false);
    sdk.setPropertyValue("position/long-gc-deg", -92.99999);
    expect(collision.update()).toBe(true);
    expect(raycast).toHaveBeenCalledTimes(2);
    expect(sdk.resetToInitialConditions).toHaveBeenCalled();
  });
});