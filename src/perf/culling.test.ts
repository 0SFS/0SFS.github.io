import { describe, expect, it, vi } from "vitest";
import { WGS84_A } from "../camera/cameraMath";
import { createHemisphereCulling } from "./culling";

describe("createHemisphereCulling", () => {
  it("hides primitives on the far side of the globe", () => {
    let nearVisible = true;
    let farVisible = true;
    const culling = createHemisphereCulling(() => ({ x: WGS84_A + 600, y: 0, z: 0 }));

    culling.setCullables([
      {
        kind: "point",
        target: { setVisible: (visible) => { nearVisible = visible; } },
        getPosition: () => ({ x: WGS84_A, y: 0, z: 0 }),
      },
      {
        kind: "point",
        target: { setVisible: (visible) => { farVisible = visible; } },
        getPosition: () => ({ x: -WGS84_A, y: 0, z: 0 }),
      },
    ]);

    const stats = culling.update();

    expect(nearVisible).toBe(true);
    expect(farVisible).toBe(false);
    expect(stats).toEqual({ total: 2, visible: 1, hidden: 1 });
  });

  it("leaves cullables visible when no geospatial camera is active", () => {
    const setVisible = vi.fn();
    const culling = createHemisphereCulling(() => null);

    culling.setCullables([
      {
        kind: "point",
        target: { setVisible },
        getPosition: () => ({ x: -WGS84_A, y: 0, z: 0 }),
      },
    ]);
    const stats = culling.update();

    expect(setVisible).toHaveBeenLastCalledWith(true);
    expect(stats).toEqual({ total: 1, visible: 1, hidden: 0 });
  });
});