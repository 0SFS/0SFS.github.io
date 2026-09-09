import { describe, expect, it } from "vitest";
import { createWheelGroundFilter, WHEEL_RADIUS_METERS } from "./wheelGroundFilter";

describe("wheel ground filter", () => {
  it("adopts the first sample outright", () => {
    const filter = createWheelGroundFilter();
    expect(filter.height(120.4, 0, false)).toBe(120.4);
  });

  it("bridges photogrammetry noise a wheel would roll straight over", () => {
    const filter = createWheelGroundFilter();
    filter.height(100, 0, true);
    let worst = 0;
    for (let step = 0; step < 400; step += 1) {
      // 4 cm of noise, sampled every 5 mm of taxi - about 25 kt at 120 Hz.
      const ridden = filter.height(100 + (step % 2 === 0 ? 0.04 : -0.04), 0.005, false);
      worst = Math.max(worst, Math.abs(ridden - 100));
    }
    expect(worst).toBeLessThan(0.01);
  });

  it("does not drift while parked", () => {
    const filter = createWheelGroundFilter();
    filter.height(100, 0, true);
    for (let step = 0; step < 200; step += 1) filter.height(100 + (step % 2 ? 0.04 : -0.04), 0, false);
    expect(filter.height(100, 0, false)).toBe(100);
  });

  it("climbs a kerb it cannot bridge immediately", () => {
    // Taller than the wheel: a step, not surface noise. Smoothing it would
    // drive the aircraft through the obstacle.
    const filter = createWheelGroundFilter();
    filter.height(100, 0, true);
    expect(filter.height(101, 0.005, false)).toBe(101);
  });

  it("follows a real slope within a wheel radius of travel", () => {
    const filter = createWheelGroundFilter();
    filter.height(100, 0, true);
    const climb = (radii: number): number => {
      let ridden = 100;
      for (let step = 0; step < radii * 10; step += 1) ridden = filter.height(100.3, WHEEL_RADIUS_METERS / 10, false);
      return ridden;
    };
    // Most of the way within two radii of travel, all of it within six.
    expect(climb(2)).toBeGreaterThan(100.25);
    expect(climb(6)).toBeCloseTo(100.3, 2);
  });

  it("starts over after a reset", () => {
    const filter = createWheelGroundFilter();
    filter.height(100, 0, true);
    filter.reset();
    expect(filter.height(250, 0.005, false)).toBe(250);
  });
});
