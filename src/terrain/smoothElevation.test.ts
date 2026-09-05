import { describe, expect, it } from "vitest";
import { ecefToGeodetic } from "../camera/cameraMath";
import { smoothSurfaceEcef, smoothSurfaceHeightMeters } from "./smoothElevation";

describe("smoothSurfaceHeightMeters", () => {
  it("returns a plausible above-sea-level height for Minneapolis", () => {
    const height = smoothSurfaceHeightMeters(44.9778, -93.265);
    expect(height).toBeGreaterThan(180);
    expect(height).toBeLessThan(360);
  });

  it("returns a high but smoothed height for the Himalaya/Tibet region", () => {
    const height = smoothSurfaceHeightMeters(28.5, 86.5);
    expect(height).toBeGreaterThan(4_000);
    expect(height).toBeLessThanOrEqual(6_500);
  });

  it("keeps open ocean near sea level", () => {
    const height = smoothSurfaceHeightMeters(0, -140);
    expect(Math.abs(height)).toBeLessThan(60);
  });

  it("normalizes longitude wrapping", () => {
    const wrapped = smoothSurfaceHeightMeters(10, 190);
    const normalized = smoothSurfaceHeightMeters(10, -170);
    expect(wrapped).toBeCloseTo(normalized, 8);
  });

  it("is continuous for nearby points", () => {
    const firstHeight = smoothSurfaceHeightMeters(44.9778, -93.265);
    const secondHeight = smoothSurfaceHeightMeters(44.9788, -93.264);
    expect(Math.abs(secondHeight - firstHeight)).toBeLessThan(2);
  });

  it("returns finite values near the poles", () => {
    expect(Number.isFinite(smoothSurfaceHeightMeters(89.999, 45))).toBe(true);
    expect(Number.isFinite(smoothSurfaceHeightMeters(-89.999, -135))).toBe(true);
  });
});

describe("smoothSurfaceEcef", () => {
  it("converts the smooth height plus offset to ECEF", () => {
    const height = smoothSurfaceHeightMeters(44.9778, -93.265);
    const ecef = smoothSurfaceEcef(44.9778, -93.265, 12);
    const geodetic = ecefToGeodetic(ecef.x, ecef.y, ecef.z);
    expect(geodetic.altMeters).toBeCloseTo(height + 12, 1);
  });
});
