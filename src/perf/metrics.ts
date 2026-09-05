import type { Engine, Scene, WebGPUEngine } from "@babylonjs/core";
import type { CullingStats } from "./culling";

export interface TileMetrics {
  visibleTiles: number;
  activeTiles: number;
}

export interface PerformanceSnapshot {
  fps: number;
  frameMs: number;
  p95FrameMs: number;
  activeMeshes: number;
  drawCalls: number | null;
  memoryMb: number | null;
  tiles: TileMetrics | null;
  culling: CullingStats;
}

export interface PerformanceMetricsHandle {
  update(): PerformanceSnapshot;
  getSnapshot(): PerformanceSnapshot;
  format(snapshot?: PerformanceSnapshot): string;
}

interface PerformanceMemory {
  usedJSHeapSize: number;
}

const FRAME_SAMPLE_COUNT = 120;
const EMPTY_CULLING: CullingStats = { total: 0, visible: 0, hidden: 0 };

function getMemoryMb(): number | null {
  const maybePerformance = performance as Performance & { memory?: PerformanceMemory };
  const usedHeap = maybePerformance.memory?.usedJSHeapSize;
  return typeof usedHeap === "number" ? usedHeap / 1_048_576 : null;
}

function percentile(values: readonly number[], percentileRank: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * percentileRank));
  return sorted[index];
}

export function createPerformanceMetrics(options: {
  engine: Engine | WebGPUEngine;
  scene: Scene;
  getTileMetrics: () => TileMetrics | null;
  getCullingStats: () => CullingStats;
}): PerformanceMetricsHandle {
  const frameSamples: number[] = [];
  let lastTimeMs = performance.now();
  let snapshot: PerformanceSnapshot = {
    fps: 0,
    frameMs: 0,
    p95FrameMs: 0,
    activeMeshes: 0,
    drawCalls: null,
    memoryMb: null,
    tiles: null,
    culling: EMPTY_CULLING,
  };

  function update(): PerformanceSnapshot {
    const now = performance.now();
    const frameMs = Math.max(0, now - lastTimeMs);
    lastTimeMs = now;

    if (frameMs > 0) {
      frameSamples.push(frameMs);
      if (frameSamples.length > FRAME_SAMPLE_COUNT) {
        frameSamples.shift();
      }
    }

    snapshot = {
      fps: options.engine.getFps(),
      frameMs,
      p95FrameMs: percentile(frameSamples, 0.95),
      activeMeshes: options.scene.getActiveMeshes().length,
      drawCalls: null,
      memoryMb: getMemoryMb(),
      tiles: options.getTileMetrics(),
      culling: options.getCullingStats(),
    };
    return snapshot;
  }

  function getSnapshot(): PerformanceSnapshot {
    return snapshot;
  }

  function format(value: PerformanceSnapshot = snapshot): string {
    const tiles = value.tiles ? ` t${value.tiles.visibleTiles}/${value.tiles.activeTiles}` : "";
    const culling = value.culling.total > 0 ? ` c${value.culling.visible}/${value.culling.total}` : "";
    const memory = value.memoryMb !== null ? ` m${Math.round(value.memoryMb)}MB` : "";
    return `Perf: ${Math.round(value.fps)}fps ${value.frameMs.toFixed(1)}ms p95 ${value.p95FrameMs.toFixed(1)}ms a${value.activeMeshes}${tiles}${culling}${memory}`;
  }

  return { update, getSnapshot, format };
}