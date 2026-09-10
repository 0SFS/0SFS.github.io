/**
 * Opt-in frame trace for investigating a flight that feels uneven.
 *
 * The normal HUD FPS value cannot say whether a hitch came from the browser,
 * JSBSim, terrain contact, or tile streaming. This recorder is deliberately
 * dormant unless `flightPerf=1` is in the URL, then keeps the most recent
 * minute of samples for the Debug panel and browser console.
 */

const DEFAULT_CAPACITY = 3_600;

export interface FlightPerformanceSample {
  /** Elapsed time between render ticks, before simulation time is clamped. */
  frameIntervalMs: number;
  /** CPU time for all flight work performed by this render tick. */
  flightTickCpuMs: number;
  /** CPU time spent asking the terrain surface for a height. */
  terrainQueryCpuMs: number;
  /** CPU time spent checking visible-mesh collision. */
  collisionCpuMs: number;
  /** CPU time inside the fixed-step physics loop, including JSBSim. */
  physicsLoopCpuMs: number;
  /** Whether map content was actively streaming on this tick. */
  streamingTiles: boolean;
  mapDownloadBytesPerSecond: number;
  visibleTiles: number | null;
  activeTiles: number | null;
}

export interface FlightPerformanceMetric {
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

export interface FlightPerformanceSummary {
  sampleCount: number;
  frame: FlightPerformanceMetric;
  flightTick: FlightPerformanceMetric;
  terrainQuery: FlightPerformanceMetric;
  collision: FlightPerformanceMetric;
  physicsLoop: FlightPerformanceMetric;
  slowFrames: {
    over25Ms: number;
    over50Ms: number;
    over100Ms: number;
  };
  streamingFrames: number;
  peakMapDownloadBytesPerSecond: number;
  peakVisibleTiles: number | null;
  peakActiveTiles: number | null;
  lastSample: FlightPerformanceSample | null;
}

export interface FlightPerformanceCapture {
  record(sample: FlightPerformanceSample): void;
  snapshot(): FlightPerformanceSummary;
  /** A serialisable copy of the retained trace, suitable for a bug report. */
  exportTrace(): readonly FlightPerformanceSample[];
}

export interface FlightPerformanceCaptureOptions {
  capacity?: number;
}

function percentile(values: readonly number[], rank: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * rank))];
}

function metric(values: readonly number[]): FlightPerformanceMetric {
  const finite = values.filter(Number.isFinite);
  return {
    p50Ms: percentile(finite, 0.5),
    p95Ms: percentile(finite, 0.95),
    p99Ms: percentile(finite, 0.99),
    maxMs: finite.length === 0 ? 0 : Math.max(...finite),
  };
}

export function createFlightPerformanceCapture(
  options: FlightPerformanceCaptureOptions = {},
): FlightPerformanceCapture {
  const capacity = Math.max(1, Math.floor(options.capacity ?? DEFAULT_CAPACITY));
  const samples: FlightPerformanceSample[] = [];

  return {
    record(sample): void {
      samples.push({ ...sample });
      if (samples.length > capacity) samples.shift();
    },
    snapshot(): FlightPerformanceSummary {
      const frameIntervals = samples.map((sample) => sample.frameIntervalMs);
      const visibleTiles = samples
        .map((sample) => sample.visibleTiles)
        .filter((value): value is number => value !== null && Number.isFinite(value));
      const activeTiles = samples
        .map((sample) => sample.activeTiles)
        .filter((value): value is number => value !== null && Number.isFinite(value));
      return {
        sampleCount: samples.length,
        frame: metric(frameIntervals),
        flightTick: metric(samples.map((sample) => sample.flightTickCpuMs)),
        terrainQuery: metric(samples.map((sample) => sample.terrainQueryCpuMs)),
        collision: metric(samples.map((sample) => sample.collisionCpuMs)),
        physicsLoop: metric(samples.map((sample) => sample.physicsLoopCpuMs)),
        slowFrames: {
          over25Ms: frameIntervals.filter((value) => value > 25).length,
          over50Ms: frameIntervals.filter((value) => value > 50).length,
          over100Ms: frameIntervals.filter((value) => value > 100).length,
        },
        streamingFrames: samples.filter((sample) => sample.streamingTiles).length,
        peakMapDownloadBytesPerSecond: Math.max(0, ...samples.map((sample) => sample.mapDownloadBytesPerSecond)),
        peakVisibleTiles: visibleTiles.length > 0 ? Math.max(...visibleTiles) : null,
        peakActiveTiles: activeTiles.length > 0 ? Math.max(...activeTiles) : null,
        lastSample: samples.at(-1) ?? null,
      };
    },
    exportTrace: (): readonly FlightPerformanceSample[] => samples.map((sample) => ({ ...sample })),
  };
}

let activeFlightPerformanceCapture: FlightPerformanceCapture | null = null;

declare global {
  interface Window {
    /** Available in DevTools while the page was opened with `flightPerf=1`. */
    osfsFlightPerformance?: FlightPerformanceCapture;
  }
}

export function isFlightPerformanceCaptureEnabled(search = window.location.search): boolean {
  return new URLSearchParams(search).get("flightPerf") === "1";
}

export function getActiveFlightPerformanceCapture(): FlightPerformanceCapture | null {
  return activeFlightPerformanceCapture;
}

export function setActiveFlightPerformanceCapture(capture: FlightPerformanceCapture | null): void {
  activeFlightPerformanceCapture = capture;
  if (capture) window.osfsFlightPerformance = capture;
  else delete window.osfsFlightPerformance;
}
