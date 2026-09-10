import { describe, expect, it } from "vitest";
import { createFlightPerformanceCapture } from "./flightPerformanceCapture";

function sample(frameIntervalMs: number) {
  return {
    frameIntervalMs,
    flightTickCpuMs: frameIntervalMs / 4,
    terrainQueryCpuMs: frameIntervalMs / 10,
    collisionCpuMs: frameIntervalMs / 20,
    physicsLoopCpuMs: frameIntervalMs / 5,
    streamingTiles: frameIntervalMs > 25,
    mapDownloadBytesPerSecond: frameIntervalMs * 100,
    visibleTiles: frameIntervalMs > 50 ? 12 : 8,
    activeTiles: frameIntervalMs > 50 ? 18 : 10,
  };
}

describe("flight performance capture", () => {
  it("summarises slow frames and keeps the newest bounded trace", () => {
    const capture = createFlightPerformanceCapture({ capacity: 3 });
    capture.record(sample(10));
    capture.record(sample(30));
    capture.record(sample(60));
    capture.record(sample(120));

    expect(capture.exportTrace().map((entry) => entry.frameIntervalMs)).toEqual([30, 60, 120]);
    expect(capture.snapshot()).toMatchObject({
      sampleCount: 3,
      frame: { p50Ms: 60, p95Ms: 60, p99Ms: 60, maxMs: 120 },
      slowFrames: { over25Ms: 3, over50Ms: 2, over100Ms: 1 },
      streamingFrames: 3,
      peakMapDownloadBytesPerSecond: 12_000,
      peakVisibleTiles: 12,
      peakActiveTiles: 18,
      lastSample: { frameIntervalMs: 120 },
    });
  });

  it("returns zero-valued metrics before the first frame", () => {
    const summary = createFlightPerformanceCapture().snapshot();
    expect(summary).toMatchObject({
      sampleCount: 0,
      frame: { p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 },
      slowFrames: { over25Ms: 0, over50Ms: 0, over100Ms: 0 },
      lastSample: null,
    });
  });
});
