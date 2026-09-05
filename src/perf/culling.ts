import { WGS84_A } from "../camera/cameraMath";

export interface CullingVector3 {
  x: number;
  y: number;
  z: number;
}

export interface CullingVisibilityTarget {
  setVisible(visible: boolean): void;
}

export interface CullablePoint {
  kind: "point";
  target: CullingVisibilityTarget;
  getPosition(): CullingVector3 | null;
}

export interface CullablePolyline {
  kind: "polyline";
  target: CullingVisibilityTarget;
  getSamplePositions(): readonly CullingVector3[];
}

export type CullablePrimitive = CullablePoint | CullablePolyline;

export interface CullingStats {
  total: number;
  visible: number;
  hidden: number;
}

export interface HemisphereCullingHandle {
  setCullables(cullables: readonly CullablePrimitive[]): void;
  update(): CullingStats;
  getStats(): CullingStats;
  destroy(): void;
}

const HORIZON_MARGIN = 0.03;
const DEFAULT_STATS: CullingStats = { total: 0, visible: 0, hidden: 0 };

function magnitude(value: CullingVector3): number {
  return Math.hypot(value.x, value.y, value.z);
}

function dot(a: CullingVector3, b: CullingVector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalize(value: CullingVector3): CullingVector3 | null {
  const length = magnitude(value);
  if (!Number.isFinite(length) || length <= 0) {
    return null;
  }
  return { x: value.x / length, y: value.y / length, z: value.z / length };
}

function isVisibleFromCamera(
  cameraNormal: CullingVector3,
  threshold: number,
  samples: readonly CullingVector3[],
): boolean {
  for (const sample of samples) {
    const sampleNormal = normalize(sample);
    if (sampleNormal && dot(cameraNormal, sampleNormal) > threshold) {
      return true;
    }
  }
  return false;
}

export function createHemisphereCulling(
  getCameraPosition: () => CullingVector3 | null,
): HemisphereCullingHandle {
  let cullables: readonly CullablePrimitive[] = [];
  let stats: CullingStats = DEFAULT_STATS;

  function setCullables(nextCullables: readonly CullablePrimitive[]): void {
    cullables = nextCullables;
    stats = { total: cullables.length, visible: cullables.length, hidden: 0 };
    for (const cullable of cullables) {
      cullable.target.setVisible(true);
    }
  }

  function update(): CullingStats {
    const cameraPosition = getCameraPosition();
    const cameraNormal = cameraPosition ? normalize(cameraPosition) : null;
    if (!cameraPosition || !cameraNormal || cullables.length === 0) {
      stats = { total: cullables.length, visible: cullables.length, hidden: 0 };
      for (const cullable of cullables) {
        cullable.target.setVisible(true);
      }
      return stats;
    }

    const cameraDistance = magnitude(cameraPosition);
    const threshold = WGS84_A / cameraDistance - HORIZON_MARGIN;
    let visible = 0;

    for (const cullable of cullables) {
      const samples = cullable.kind === "point"
        ? [cullable.getPosition()].filter((position): position is CullingVector3 => position !== null)
        : cullable.getSamplePositions();
      const shouldShow = samples.length === 0 || isVisibleFromCamera(cameraNormal, threshold, samples);
      cullable.target.setVisible(shouldShow);
      if (shouldShow) {
        visible += 1;
      }
    }

    stats = { total: cullables.length, visible, hidden: cullables.length - visible };
    return stats;
  }

  function getStats(): CullingStats {
    return stats;
  }

  function destroy(): void {
    for (const cullable of cullables) {
      cullable.target.setVisible(true);
    }
    cullables = [];
    stats = DEFAULT_STATS;
  }

  return { setCullables, update, getStats, destroy };
}