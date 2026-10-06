import { describe, expect, it } from "vitest";
import { createEngineSpoolMotion, engineSpoolDisplayRate } from "./engineSpoolMotion";

describe("engine shaft display motion", () => {
  it("passes the requested maximum to the renderer for its actual-cadence limit", () => {
    const blades = { outer: 16, inner: 40, outerEstimated: false, innerEstimated: true };
    expect(engineSpoolDisplayRate(2, 30, blades)).toBe(2);
    expect(engineSpoolDisplayRate(0.1, 30, blades)).toBe(0.1);
    expect(engineSpoolDisplayRate(2, 15, blades)).toBe(2);
    expect(engineSpoolDisplayRate(4, 60, blades)).toBe(4);
    expect(engineSpoolDisplayRate(2, 0, blades)).toBe(0);
    expect(engineSpoolDisplayRate(2, 30)).toBe(0);
    const propeller = { ...blades, outer: 2, inner: null };
    expect(engineSpoolDisplayRate(2, 30, propeller)).toBe(2);
    expect(engineSpoolDisplayRate(-2, 30, blades)).toBe(0);
    expect(engineSpoolDisplayRate(Number.NaN, 30, blades)).toBe(0);
    expect(engineSpoolDisplayRate(2, Number.NaN, blades)).toBe(0);
  });
  it("uses a common speed scale and integrates changing speeds", () => {
    const motion = createEngineSpoolMotion();
    motion.update(0, { outer: 0, inner: 0 }, 2);
    const frame = motion.update(0.25, { outer: 0.5, inner: 1 }, 2);
    expect(frame.outerAngle).toBeCloseTo(Math.PI / 4);
    expect(frame.innerAngle).toBeCloseTo(Math.PI / 2);
    expect(frame.maxAngle).toBeCloseTo(Math.PI);
    motion.update(0.5, { outer: 0.5, inner: 1 }, 2);
    expect(frame.outerAngle).toBeCloseTo(3 * Math.PI / 4);
    expect(frame.innerAngle).toBeCloseTo(3 * Math.PI / 2);
    expect(frame.maxAngle).toBeCloseTo(2 * Math.PI);
  });

  it("freezes on pause, absent time, and rewinds; a stopped shaft remains still", () => {
    const motion = createEngineSpoolMotion();
    motion.update(10, { outer: 1, inner: null }, 2);
    const frame = motion.update(10.1, { outer: 1, inner: null }, 2);
    const angle = frame.outerAngle;
    for (const time of [10.1, 10.1, 5, null, Number.NaN, 50]) {
      expect(motion.update(time, { outer: 1, inner: null }, 2).outerAngle).toBe(angle);
    }
    motion.update(50, { outer: 0, inner: null }, 2);
    expect(motion.update(55, { outer: 0, inner: null }, 2).outerAngle).toBe(angle);
    expect(frame.innerAngle).toBeNull();
  });

  it("bounds corrupt speed data and rebases aircraft changes", () => {
    const motion = createEngineSpoolMotion();
    motion.update(0, { outer: Number.NaN, inner: -1 }, 2);
    const frame = motion.update(0.25, { outer: Number.POSITIVE_INFINITY, inner: -1 }, 2);
    expect(frame).toEqual({ outerAngle: 0, innerAngle: 0, maxAngle: Math.PI });
    motion.update(0.5, { outer: 10, inner: 1 }, 2);
    expect(frame.outerAngle).toBeCloseTo(Math.PI / 2);
    motion.reset();
    expect(motion.update(100, { outer: 1, inner: null }, 2)).toEqual({ outerAngle: 0, innerAngle: null, maxAngle: 0 });
  });

  it("retains complete revolutions and the full-scale reference across long intervals", () => {
    const motion = createEngineSpoolMotion();
    motion.update(0, { outer: .5, inner: .99 }, 2);
    const frame = motion.update(1000, { outer: .5, inner: .99 }, 2);
    expect(frame.outerAngle).toBeCloseTo(2000 * Math.PI);
    expect(frame.innerAngle).toBeCloseTo(3960 * Math.PI);
    expect(frame.maxAngle).toBeCloseTo(4000 * Math.PI);
    const held = { ...frame };
    for (const time of [1000, 10, null, 20]) {
      expect(motion.update(time, { outer: .5, inner: .99 }, 2)).toEqual(held);
    }
  });
});
