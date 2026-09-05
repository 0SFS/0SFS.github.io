import { Vector3 } from "@babylonjs/core";
import { DEG_TO_RAD, RAD_TO_DEG, ecefToGeodetic, geodeticToEcef } from "../camera/cameraMath";

export interface AnchorHeightSample {
  latDeg: number;
  lonDeg: number;
  heightMeters: number;
}

export type AnchorHeightProvider = (latDeg: number, lonDeg: number) => number | null;

export interface AnchorHeightResolverOptions {
  /** Quantization size for cache cells. 0.002 degrees is roughly 220 m north/south. */
  cellSizeDeg?: number;
  /** Height used when no sample/provider value exists. */
  fallbackHeightMeters?: number;
  /** Added to the resolved sample/provider/fallback height before creating the anchor. */
  heightOffsetMeters?: number;
  /** Optional synchronous height source, backed by precomputed/domain data. */
  provider?: AnchorHeightProvider;
  /** Maximum vertical motion speed for the displayed anchor height. */
  maxVerticalSpeedMetersPerSecond?: number;
  /** How long to wait before retrying a provider miss for the same cell. */
  providerMissRetryMs?: number;
  /** Optional clock override for tests. */
  nowMs?: () => number;
  /** Optional seed samples for known locations. */
  samples?: AnchorHeightSample[];
}

export interface AnchorHeightResolver {
  resolve(anchor: Vector3 | null): Vector3 | null;
  resolveHeight(latDeg: number, lonDeg: number): number;
  setSample(sample: AnchorHeightSample): void;
  getCachedHeight(latDeg: number, lonDeg: number): number | null;
  clear(): void;
  setHeightOffset(meters: number): void;
}

const DEFAULT_CELL_SIZE_DEG = 0.002;
const DEFAULT_FALLBACK_HEIGHT_METERS = 0;
const DEFAULT_PROVIDER_MISS_RETRY_MS = 1500;
const DEFAULT_MAX_VERTICAL_SPEED_METERS_PER_SECOND = 160;
const MAX_SMOOTHING_DELTA_MS = 100;

function normalizeLonDeg(lonDeg: number): number {
  return ((lonDeg + 180) % 360 + 360) % 360 - 180;
}

function getCellKey(latDeg: number, lonDeg: number, cellSizeDeg: number): string {
  const latCell = Math.round(latDeg / cellSizeDeg);
  const lonCell = Math.round(normalizeLonDeg(lonDeg) / cellSizeDeg);
  return `${latCell}:${lonCell}`;
}

function createAnchorAtHeight(anchor: Vector3, heightMeters: number): Vector3 {
  const { latRad, lonRad, altMeters } = ecefToGeodetic(anchor.x, anchor.y, anchor.z);
  if (Math.abs(altMeters - heightMeters) < 0.1) {
    return anchor;
  }
  const position = geodeticToEcef(latRad, lonRad, heightMeters);
  return new Vector3(position.x, position.y, position.z);
}

export function createAnchorHeightResolver(options: AnchorHeightResolverOptions = {}): AnchorHeightResolver {
  const cellSizeDeg = options.cellSizeDeg ?? DEFAULT_CELL_SIZE_DEG;
  const fallbackHeightMeters = options.fallbackHeightMeters ?? DEFAULT_FALLBACK_HEIGHT_METERS;
  let heightOffsetMeters = options.heightOffsetMeters ?? 0;
  const providerMissRetryMs = options.providerMissRetryMs ?? DEFAULT_PROVIDER_MISS_RETRY_MS;
  const maxVerticalSpeedMetersPerSecond = options.maxVerticalSpeedMetersPerSecond
    ?? DEFAULT_MAX_VERTICAL_SPEED_METERS_PER_SECOND;
  const nowMs = options.nowMs ?? (() => performance.now());
  const heightCache = new Map<string, number>();
  const missRetryAtByCell = new Map<string, number>();
  let smoothedHeightMeters: number | null = null;
  let lastResolveMs: number | null = null;

  function setSample(sample: AnchorHeightSample): void {
    const key = getCellKey(sample.latDeg, sample.lonDeg, cellSizeDeg);
    heightCache.set(key, sample.heightMeters);
    missRetryAtByCell.delete(key);
  }

  for (const sample of options.samples ?? []) {
    setSample(sample);
  }

  function getCachedHeight(latDeg: number, lonDeg: number): number | null {
    return heightCache.get(getCellKey(latDeg, lonDeg, cellSizeDeg)) ?? null;
  }

  function resolveBaseHeight(latDeg: number, lonDeg: number): number {
    const key = getCellKey(latDeg, lonDeg, cellSizeDeg);
    const cached = heightCache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    if (!options.provider) {
      return fallbackHeightMeters;
    }

    const retryAt = missRetryAtByCell.get(key) ?? 0;
    if (nowMs() < retryAt) {
      return fallbackHeightMeters;
    }

    const provided = options.provider(latDeg, lonDeg);
    if (provided !== null) {
      heightCache.set(key, provided);
      missRetryAtByCell.delete(key);
      return provided;
    }

    missRetryAtByCell.set(key, nowMs() + providerMissRetryMs);
    return fallbackHeightMeters;
  }

  function smoothHeight(targetHeightMeters: number): number {
    const now = nowMs();
    if (smoothedHeightMeters === null || lastResolveMs === null) {
      smoothedHeightMeters = targetHeightMeters;
      lastResolveMs = now;
      return smoothedHeightMeters;
    }

    const deltaMs = Math.max(0, Math.min(MAX_SMOOTHING_DELTA_MS, now - lastResolveMs));
    lastResolveMs = now;
    const maxStep = maxVerticalSpeedMetersPerSecond * (deltaMs / 1000);
    const delta = targetHeightMeters - smoothedHeightMeters;
    if (Math.abs(delta) <= maxStep) {
      smoothedHeightMeters = targetHeightMeters;
      return smoothedHeightMeters;
    }

    smoothedHeightMeters += Math.sign(delta) * maxStep;
    return smoothedHeightMeters;
  }

  function resolve(anchor: Vector3 | null): Vector3 | null {
    if (!anchor) {
      lastResolveMs = null;
      return null;
    }
    const { latRad, lonRad } = ecefToGeodetic(anchor.x, anchor.y, anchor.z);
    const heightMeters = smoothHeight(resolveBaseHeight(latRad * RAD_TO_DEG, lonRad * RAD_TO_DEG) + heightOffsetMeters);
    return createAnchorAtHeight(anchor, heightMeters);
  }

  function clear(): void {
    heightCache.clear();
    missRetryAtByCell.clear();
    smoothedHeightMeters = null;
    lastResolveMs = null;
    for (const sample of options.samples ?? []) {
      setSample(sample);
    }
  }

  function setHeightOffset(meters: number): void {
    heightOffsetMeters = meters;
  }

  return { resolve, resolveHeight: resolveBaseHeight, setSample, getCachedHeight, clear, setHeightOffset };
}

export function sampleToAnchor(sample: AnchorHeightSample): Vector3 {
  const position = geodeticToEcef(sample.latDeg * DEG_TO_RAD, sample.lonDeg * DEG_TO_RAD, sample.heightMeters);
  return new Vector3(position.x, position.y, position.z);
}