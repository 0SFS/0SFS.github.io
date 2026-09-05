import { describe, it, expect } from "vitest";
import {
  geodeticToEcef,
  ecefToGeodetic,
  shortestAngleDeltaDeg,
  normalizeAngleDeltaRad,
  normalizeHeadingDeg,
  computeTwoPointGestureMetrics,
  classifyTwoPointGestureIntent,
  computeSurfaceRelativePitchDeg,
  compensateInvertedHeading,
  WGS84_A,
  WGS84_B,
} from "./cameraMath";

// ─── geodeticToEcef / ecefToGeodetic ────────────────────────────────

describe("geodeticToEcef", () => {
  it("places the prime meridian equator at (WGS84_A, 0, 0)", () => {
    const { x, y, z } = geodeticToEcef(0, 0, 0);
    expect(x).toBeCloseTo(WGS84_A, 0);
    expect(y).toBeCloseTo(0, 3);
    expect(z).toBeCloseTo(0, 3);
  });

  it("places the north pole at approximately (0, 0, WGS84_B)", () => {
    const { x, y, z } = geodeticToEcef(Math.PI / 2, 0, 0);
    expect(x).toBeCloseTo(0, 0);
    expect(y).toBeCloseTo(0, 0);
    expect(z).toBeCloseTo(WGS84_B, 0);
  });

  it("places 90°E equator at approximately (0, WGS84_A, 0)", () => {
    const { x, y, z } = geodeticToEcef(0, Math.PI / 2, 0);
    expect(x).toBeCloseTo(0, 0);
    expect(y).toBeCloseTo(WGS84_A, 0);
    expect(z).toBeCloseTo(0, 3);
  });

  it("adds altitude along the radial direction", () => {
    const alt = 1000;
    const { x: x0 } = geodeticToEcef(0, 0, 0);
    const { x: x1 } = geodeticToEcef(0, 0, alt);
    expect(x1 - x0).toBeCloseTo(alt, 3);
  });
});

describe("ecefToGeodetic", () => {
  it("round-trips Central Park NYC within 1 cm", () => {
    const latRad = 40.782773 * (Math.PI / 180);
    const lonRad = -73.965363 * (Math.PI / 180);
    const altMeters = 0;
    const ecef = geodeticToEcef(latRad, lonRad, altMeters);
    const back = ecefToGeodetic(ecef.x, ecef.y, ecef.z);
    expect(back.latRad).toBeCloseTo(latRad, 9);
    expect(back.lonRad).toBeCloseTo(lonRad, 9);
    expect(back.altMeters).toBeCloseTo(altMeters, 2);
  });

  it("round-trips southern hemisphere / west longitude within 1 cm", () => {
    const latRad = -33.8688 * (Math.PI / 180);
    const lonRad = 151.2093 * (Math.PI / 180);
    const altMeters = 500;
    const ecef = geodeticToEcef(latRad, lonRad, altMeters);
    const back = ecefToGeodetic(ecef.x, ecef.y, ecef.z);
    expect(back.latRad).toBeCloseTo(latRad, 9);
    expect(back.lonRad).toBeCloseTo(lonRad, 9);
    expect(back.altMeters).toBeCloseTo(altMeters, 2);
  });

  it("round-trips near the north pole", () => {
    const latRad = 89.9 * (Math.PI / 180);
    const lonRad = 45 * (Math.PI / 180);
    const ecef = geodeticToEcef(latRad, lonRad, 0);
    const back = ecefToGeodetic(ecef.x, ecef.y, ecef.z);
    expect(back.latRad).toBeCloseTo(latRad, 6);
    expect(back.lonRad).toBeCloseTo(lonRad, 6);
  });
});

// ─── shortestAngleDeltaDeg ──────────────────────────────────────────

describe("shortestAngleDeltaDeg", () => {
  it("returns 0 for identical angles", () => {
    expect(shortestAngleDeltaDeg(45, 45)).toBe(0);
  });

  it("returns positive delta for clockwise motion", () => {
    expect(shortestAngleDeltaDeg(10, 20)).toBe(10);
  });

  it("returns negative delta for counter-clockwise motion", () => {
    expect(shortestAngleDeltaDeg(20, 10)).toBe(-10);
  });

  it("wraps across 0°/360° going clockwise (350 → 10)", () => {
    expect(shortestAngleDeltaDeg(350, 10)).toBe(20);
  });

  it("wraps across 0°/360° going counter-clockwise (10 → 350)", () => {
    expect(shortestAngleDeltaDeg(10, 350)).toBe(-20);
  });

  it("handles exact 180° gap (ambiguous, returns -180)", () => {
    expect(shortestAngleDeltaDeg(0, 180)).toBe(-180);
  });

  it("handles near-180° gap correctly (picks short way)", () => {
    expect(shortestAngleDeltaDeg(0, 179)).toBe(179);
    expect(shortestAngleDeltaDeg(0, 181)).toBe(-179);
  });

  it("works with angles > 360", () => {
    expect(shortestAngleDeltaDeg(720, 740)).toBe(20);
  });
});

// ─── normalizeAngleDeltaRad ─────────────────────────────────────────

describe("normalizeAngleDeltaRad", () => {
  it("returns 0 for identical angles", () => {
    expect(normalizeAngleDeltaRad(1.5, 1.5)).toBe(0);
  });

  it("wraps clockwise across the -π/π seam", () => {
    expect(normalizeAngleDeltaRad((350 * Math.PI) / 180, (10 * Math.PI) / 180)).toBeCloseTo(
      (20 * Math.PI) / 180,
    );
  });

  it("wraps counter-clockwise across the -π/π seam", () => {
    expect(normalizeAngleDeltaRad((10 * Math.PI) / 180, (350 * Math.PI) / 180)).toBeCloseTo(
      (-20 * Math.PI) / 180,
    );
  });

  it("returns -π for the ambiguous half-turn", () => {
    expect(normalizeAngleDeltaRad(0, Math.PI)).toBe(-Math.PI);
  });
});

// ─── normalizeHeadingDeg ─────────────────────────────────────────────

describe("normalizeHeadingDeg", () => {
  it("keeps 0° as 0°", () => {
    expect(normalizeHeadingDeg(0)).toBe(0);
  });

  it("keeps 180° as 180°", () => {
    expect(normalizeHeadingDeg(180)).toBe(180);
  });

  it("wraps -90° to 270°", () => {
    expect(normalizeHeadingDeg(-90)).toBe(270);
  });

  it("wraps 360° to 0°", () => {
    expect(normalizeHeadingDeg(360)).toBe(0);
  });

  it("wraps 450° to 90°", () => {
    expect(normalizeHeadingDeg(450)).toBe(90);
  });
});

// ─── computeTwoPointGestureMetrics ──────────────────────────────────

describe("computeTwoPointGestureMetrics", () => {
  it("computes angle, distance, and centroid", () => {
    const m = computeTwoPointGestureMetrics({ x: 10, y: 20 }, { x: 22, y: 36 });
    expect(m.angleRad).toBeCloseTo(Math.atan2(16, 12));
    expect(m.distancePx).toBeCloseTo(20);
    expect(m.centroidX).toBe(16);
    expect(m.centroidY).toBe(28);
  });
});

// ─── classifyTwoPointGestureIntent ──────────────────────────────────

describe("classifyTwoPointGestureIntent", () => {
  it("recognizes swipe intent when centroid translation dominates", () => {
    expect(classifyTwoPointGestureIntent(15, 1, true, true)).toBe("swipe");
    // Even when fingers don't pass the "moving together" cosine/magnitude
    // bar (e.g. noisy Android Firefox touch coordinates), a clearly
    // translation-dominant gesture must still classify as swipe — not
    // pinch — so the user can orbit.
    expect(classifyTwoPointGestureIntent(15, 1, true, false)).toBe("swipe");
  });

  it("recognizes pinch intent when distance change dominates", () => {
    expect(classifyTwoPointGestureIntent(0, 20)).toBe("pinch");
    expect(classifyTwoPointGestureIntent(0, -20)).toBe("pinch");
    expect(classifyTwoPointGestureIntent(10, 20)).toBe("pinch");
  });

  it("returns null while intent is still ambiguous", () => {
    expect(classifyTwoPointGestureIntent(3, 4)).toBeNull();
    expect(classifyTwoPointGestureIntent(5, 10, false)).toBeNull();
    expect(classifyTwoPointGestureIntent(10, 24, false, false, false)).toBeNull();
    // Neither signal dominates the other by the required margin — wait
    // for another frame instead of guessing.
    expect(classifyTwoPointGestureIntent(10, 12, true, false)).toBeNull();
  });

  it("allows a large one-finger pivot pinch", () => {
    expect(classifyTwoPointGestureIntent(10, 24, false, false, true)).toBe("pinch");
  });

  it("classifies single-active-finger swipe immediately when centroid dominates", () => {
    // Mirrors Android Firefox: one finger fires events, the other never does.
    // centroid has moved far, distance barely changed → immediate swipe
    // (no delay needed — false swipe is geometrically impossible in this mode).
    expect(classifyTwoPointGestureIntent(43.5, 0.7, false, false, false)).toBe("swipe");
    expect(classifyTwoPointGestureIntent(43.5, 0.7, false, false, true)).toBe("swipe");
    // Ambiguous (neither dominates) → wait.
    expect(classifyTwoPointGestureIntent(20, 20, false, false, true)).toBeNull();
    // Vertical swipe toward stationary finger: centΔ = distΔ/2 → cannot commit to swipe.
    expect(classifyTwoPointGestureIntent(20, 40, false, false, false)).toBeNull();
  });
});

// ─── computeSurfaceRelativePitchDeg ─────────────────────────────────

describe("computeSurfaceRelativePitchDeg", () => {
  it("returns 90 when looking straight down at the surface", () => {
    expect(computeSurfaceRelativePitchDeg(-1)).toBeCloseTo(90);
  });

  it("returns 0 at the horizon", () => {
    expect(computeSurfaceRelativePitchDeg(0)).toBeCloseTo(0);
  });

  it("returns negative values when looking away from the globe", () => {
    expect(computeSurfaceRelativePitchDeg(1)).toBeCloseTo(-90);
  });

  it("clamps minor floating point overshoot", () => {
    expect(computeSurfaceRelativePitchDeg(-1.2)).toBeCloseTo(90);
    expect(computeSurfaceRelativePitchDeg(1.2)).toBeCloseTo(-90);
  });
});

// ─── compensateInvertedHeading ───────────────────────────────────────

describe("compensateInvertedHeading", () => {
  it("returns heading unchanged when not looking away", () => {
    expect(compensateInvertedHeading(45, false)).toBe(45);
    expect(compensateInvertedHeading(0, false)).toBe(0);
    expect(compensateInvertedHeading(359, false)).toBe(359);
  });

  it("adds 180° when looking away", () => {
    expect(compensateInvertedHeading(0, true)).toBe(180);
    expect(compensateInvertedHeading(90, true)).toBe(270);
  });

  it("wraps back to [0, 360) when looking away", () => {
    expect(compensateInvertedHeading(200, true)).toBe(20);
    expect(compensateInvertedHeading(270, true)).toBe(90);
  });

  it("handles exact 180° input", () => {
    expect(compensateInvertedHeading(180, true)).toBe(0);
  });
});
