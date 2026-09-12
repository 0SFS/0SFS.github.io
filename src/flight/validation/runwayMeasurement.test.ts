import { describe, expect, it } from "vitest";
import { RunwayMeasurement, type RunwaySample } from "./runwayMeasurement";

function sample(timeSec: number, anyWheelOnGround: boolean, clearanceFt: number, northFps = 100, eastFps = 0): RunwaySample {
  return { timeSec, anyWheelOnGround, clearanceFt, northFps, eastFps };
}

describe("runway performance event measurement", () => {
  it("records liftoff at contact loss, not at six feet or confirmation time", () => {
    const measurement = new RunwayMeasurement("takeoff", 0, sample(0, true, 0));
    measurement.push(sample(0.1, false, 0.1));
    measurement.push(sample(0.2, false, 0.2));
    measurement.push(sample(0.3, false, 0.3));
    expect(measurement.snapshot().groundRollFt).toBeCloseTo(10);
  });
  it("rejects a brief contact dropout", () => {
    const measurement = new RunwayMeasurement("takeoff", 0, sample(0, true, 0));
    measurement.push(sample(0.1, false, 0.1));
    measurement.push(sample(0.2, true, 0));
    expect(measurement.snapshot().groundRollFt).toBeNull();
  });
  it("projects distance along the runway and interpolates the screen crossing", () => {
    const measurement = new RunwayMeasurement("takeoff", 0, sample(0, true, 0, 100, 20));
    measurement.push(sample(0.1, false, 1, 100, 20));
    measurement.push(sample(0.4, false, 40, 100, 20));
    measurement.push(sample(0.6, false, 60, 100, 20));
    const result = measurement.snapshot();
    expect(result.totalDistanceFt).toBeCloseTo(50);
    expect(result.crossTrackFt).toBeCloseTo(12);
    expect(result.completed).toBe(true);
  });
  it("keeps the first touchdown through a bounce and requires a sustained stop", () => {
    const measurement = new RunwayMeasurement("landing", 0, sample(0, false, 50));
    measurement.push(sample(1, true, 0));
    measurement.push(sample(1.1, false, 1, 80));
    measurement.push(sample(1.2, true, 0, 60));
    measurement.push(sample(2, true, 0, 0));
    expect(measurement.snapshot().completed).toBe(false);
    measurement.push(sample(2.5, true, 0, 0));
    const result = measurement.snapshot();
    expect(result.bounces).toBe(1);
    expect(result.events.find(event => event.kind === "touchdown")?.distanceFt).toBe(100);
    expect(result.completed).toBe(true);
    expect(result.groundRollFt).toBeCloseTo(result.totalDistanceFt! - 100);
  });
  it("rejects invalid measurement starts and nonadvancing samples", () => {
    expect(() => new RunwayMeasurement("takeoff", 0, sample(0, false, 4))).toThrow(/runway/);
    expect(() => new RunwayMeasurement("landing", 0, sample(0, false, 46))).toThrow(/50-foot/);
    const measurement = new RunwayMeasurement("takeoff", 0, sample(0, true, 0));
    expect(() => measurement.push(sample(0, true, 0))).toThrow(/advance/);
  });
});
