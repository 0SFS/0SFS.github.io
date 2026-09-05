import {
  Color3,
  Mesh,
  StandardMaterial,
  Texture,
  TransformNode,
  VertexData,
  type Scene,
} from "@babylonjs/core";

import {
  DEG_TO_RAD,
  WGS84_A,
  geodeticToEcef,
} from "../../camera/cameraMath";
import { smoothSurfaceHeightMeters } from "../../terrain/smoothElevation";
import type { GlobeViewState } from "../types";
import type { RasterBaseMapSource } from "./rasterBaseMaps";

const WEB_MERCATOR_MAX_LAT_DEG = 85.05112878;
const EARTH_CIRCUMFERENCE_METERS = 2 * Math.PI * WGS84_A;
const MIN_TILE_PATCH_SEGMENTS = 12;
const MAX_TILE_PATCH_SEGMENTS = 96;
const TILE_REQUEST_DEBOUNCE_METERS = 5;
const GLOBAL_BASE_ZOOM = 2;

export interface RasterTileMetrics {
  visibleTiles: number;
  activeTiles: number;
}

export interface RasterTilesRuntimeOptions {
  scene: Scene;
  source: RasterBaseMapSource;
  worldRoot?: TransformNode;
  /** When true, refresh desired tiles every update() call (flight sim). */
  alwaysRefresh?: boolean;
  getViewState: () => GlobeViewState | null;
  getSurfaceHeightMeters?: (latDeg: number, lonDeg: number) => number | null;
  requestRender?: () => void;
  onLoadStart?: () => void;
  onLoadEnd?: (visibleTiles: number, activeTiles: number) => void;
  onLoadError?: (error: Error, url: string) => void;
}

export interface RasterTilesRuntime {
  readonly source: RasterBaseMapSource;
  update(): void;
  getMetrics(): RasterTileMetrics;
  dispose(): void;
}

interface TileCoord {
  z: number;
  x: number;
  y: number;
}

interface HighLodTile {
  x: number;
  y: number;
}

interface RasterTileRecord {
  key: string;
  mesh: Mesh;
  material: StandardMaterial;
  texture: Texture;
  loaded: boolean;
  failed: boolean;
  settled: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wrapTileX(x: number, z: number): number {
  const n = 2 ** z;
  return ((x % n) + n) % n;
}

function lonToTileX(lonDeg: number, z: number): number {
  const n = 2 ** z;
  return Math.floor(((lonDeg + 180) / 360) * n);
}

function latToTileY(latDeg: number, z: number): number {
  const clampedLat = clamp(latDeg, -WEB_MERCATOR_MAX_LAT_DEG, WEB_MERCATOR_MAX_LAT_DEG);
  const latRad = clampedLat * DEG_TO_RAD;
  const n = 2 ** z;
  return Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
}

function tileXToLon(x: number, z: number): number {
  return (x / (2 ** z)) * 360 - 180;
}

function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / (2 ** z);
  return Math.atan(Math.sinh(n)) / DEG_TO_RAD;
}

function chooseTileZoom(view: GlobeViewState, source: RasterBaseMapSource): number {
  const minZoom = source.minZoom ?? 0;
  const maxZoom = source.maxZoom ?? 18;
  const targetTileMeters = clamp(view.zoomMeters * 0.65, 250, 8_000_000);
  const zoom = Math.round(Math.log2(EARTH_CIRCUMFERENCE_METERS / targetTileMeters));
  return clamp(zoom, minZoom, maxZoom);
}

function chooseGlobalBaseZoom(source: RasterBaseMapSource, focusZoom: number): number {
  const minZoom = source.minZoom ?? 0;
  const maxZoom = source.maxZoom ?? 18;
  return clamp(Math.min(GLOBAL_BASE_ZOOM, focusZoom), minZoom, maxZoom);
}

function chooseTileRingRadius(zoom: number): number {
  if (zoom <= 4) return Number.POSITIVE_INFINITY;
  if (zoom <= 6) return 6;
  if (zoom <= 8) return 5;
  return 4;
}

function tileKey(tile: TileCoord): string {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

function buildTileUrl(source: RasterBaseMapSource, tile: TileCoord): string {
  return source.urlTemplate
    .replace(/\{z\}/g, String(tile.z))
    .replace(/\{x\}/g, String(tile.x))
    .replace(/\{y\}/g, String(tile.y));
}

function getDesiredTiles(view: GlobeViewState, source: RasterBaseMapSource): TileCoord[] {
  const z = chooseTileZoom(view, source);
  const baseZoom = chooseGlobalBaseZoom(source, z);
  const n = 2 ** z;
  const centerX = lonToTileX(view.lonDeg, z);
  const centerY = clamp(latToTileY(view.latDeg, z), 0, n - 1);
  const radius = chooseTileRingRadius(z);
  const tiles: TileCoord[] = [];
  const seen = new Set<string>();

  const addTile = (tile: TileCoord): void => {
    const key = tileKey(tile);
    if (seen.has(key)) return;
    seen.add(key);
    tiles.push(tile);
  };

  // High-LOD focus tiles around the camera anchor. Skipped at very low zoom
  // where the focus zoom collapses onto the global base zoom.
  const highLodTiles: HighLodTile[] = [];
  const markHighLod = (x: number, y: number): void => {
    highLodTiles.push({ x, y });
  };
  if (z > baseZoom) {
    if (!Number.isFinite(radius)) {
      for (let y = 0; y < n; y += 1) {
        for (let x = 0; x < n; x += 1) {
          markHighLod(x, y);
        }
      }
    } else {
      for (let dy = -radius; dy <= radius; dy += 1) {
        const y = centerY + dy;
        if (y < 0 || y >= n) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const x = wrapTileX(centerX + dx, z);
          markHighLod(x, y);
        }
      }
    }
  }

  // Build a non-overlapping quadtree. Regions outside the focus ring stay as
  // coarse as possible; regions intersecting it split until the high-LOD tiles
  // become the leaves. This avoids partial base tiles underneath detail tiles.
  const baseTileCount = 2 ** baseZoom;
  for (let by = 0; by < baseTileCount; by += 1) {
    for (let bx = 0; bx < baseTileCount; bx += 1) {
      addDesiredCoverage({ z: baseZoom, x: bx, y: by }, z, highLodTiles, addTile);
    }
  }

  return tiles;
}

function addDesiredCoverage(
  tile: TileCoord,
  focusZoom: number,
  highLodTiles: readonly HighLodTile[],
  addTile: (tile: TileCoord) => void,
): void {
  const coverage = getHighLodCoverage(tile, focusZoom, highLodTiles);
  if (coverage === "none" || tile.z === focusZoom) {
    addTile(tile);
    return;
  }

  const childZ = tile.z + 1;
  const childX = tile.x * 2;
  const childY = tile.y * 2;
  addDesiredCoverage({ z: childZ, x: childX, y: childY }, focusZoom, highLodTiles, addTile);
  addDesiredCoverage({ z: childZ, x: childX + 1, y: childY }, focusZoom, highLodTiles, addTile);
  addDesiredCoverage({ z: childZ, x: childX, y: childY + 1 }, focusZoom, highLodTiles, addTile);
  addDesiredCoverage({ z: childZ, x: childX + 1, y: childY + 1 }, focusZoom, highLodTiles, addTile);
}

function getHighLodCoverage(
  tile: TileCoord,
  focusZoom: number,
  highLodTiles: readonly HighLodTile[],
): "none" | "partial" | "full" {
  if (tile.z > focusZoom || highLodTiles.length === 0) return "none";
  const ratio = 2 ** (focusZoom - tile.z);
  const x0 = tile.x * ratio;
  const x1 = x0 + ratio;
  const y0 = tile.y * ratio;
  const y1 = y0 + ratio;
  let covered = 0;
  for (const highTile of highLodTiles) {
    if (highTile.x >= x0 && highTile.x < x1 && highTile.y >= y0 && highTile.y < y1) {
      covered += 1;
    }
  }
  if (covered === 0) return "none";
  return covered === ratio * ratio ? "full" : "partial";
}

function chooseTilePatchSegments(tile: TileCoord): number {
  const west = tileXToLon(tile.x, tile.z);
  const east = tileXToLon(tile.x + 1, tile.z);
  const north = tileYToLat(tile.y, tile.z);
  const south = tileYToLat(tile.y + 1, tile.z);
  const angularSpanDeg = Math.max(Math.abs(east - west), Math.abs(north - south));
  return clamp(Math.ceil(angularSpanDeg), MIN_TILE_PATCH_SEGMENTS, MAX_TILE_PATCH_SEGMENTS);
}

function createTileMesh(options: RasterTilesRuntimeOptions, tile: TileCoord): Mesh {
  const { scene, source } = options;
  const getSurfaceHeightMeters = options.getSurfaceHeightMeters ?? smoothSurfaceHeightMeters;
  const mesh = new Mesh(`raster-basemap-tile-${source.id}-${tileKey(tile)}`, scene);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const segments = chooseTilePatchSegments(tile);

  for (let row = 0; row <= segments; row += 1) {
    const v = row / segments;
    const mercatorY = tile.y + v;
    const latDeg = tileYToLat(mercatorY, tile.z);

    for (let col = 0; col <= segments; col += 1) {
      const u = col / segments;
      const mercatorX = tile.x + u;
      const lonDeg = tileXToLon(mercatorX, tile.z);
      const altitudeMeters = getSurfaceHeightMeters(latDeg, lonDeg) ?? smoothSurfaceHeightMeters(latDeg, lonDeg);
      const ecef = geodeticToEcef(latDeg * DEG_TO_RAD, lonDeg * DEG_TO_RAD, altitudeMeters);
      positions.push(ecef.x, ecef.y, ecef.z);
      uvs.push(u, v);
    }
  }

  const stride = segments + 1;
  for (let row = 0; row < segments; row += 1) {
    for (let col = 0; col < segments; col += 1) {
      const a = row * stride + col;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);

  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.uvs = uvs;
  data.applyToMesh(mesh, true);

  mesh.isPickable = true;
  mesh.renderingGroupId = 0;
  mesh.setEnabled(false);
  if (options.worldRoot) {
    mesh.parent = options.worldRoot;
  }

  return mesh;
}

function createTileRecord(
  options: RasterTilesRuntimeOptions,
  tile: TileCoord,
  onSettled: (record: RasterTileRecord) => void,
): RasterTileRecord {
  const { scene, source } = options;
  const key = tileKey(tile);
  const url = buildTileUrl(source, tile);
  const mesh = createTileMesh(options, tile);
  const material = new StandardMaterial(`raster-basemap-material-${source.id}-${key}`, scene);
  const record: RasterTileRecord = {
    key,
    mesh,
    material,
    texture: null as unknown as Texture,
    loaded: false,
    failed: false,
    settled: false,
  };

  const texture = new Texture(
    url,
    scene,
    false,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
    () => {
      record.loaded = true;
      onSettled(record);
    },
    (message, exception) => {
      record.failed = true;
      const detail = exception instanceof Error ? exception.message : String(message ?? "unknown texture load error");
      options.onLoadError?.(new Error(detail), url);
      onSettled(record);
    },
  );
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 4;
  record.texture = texture;

  material.diffuseTexture = texture;
  material.specularColor = Color3.Black();
  material.emissiveColor = Color3.White();
  material.disableLighting = true;
  material.backFaceCulling = false;
  mesh.material = material;

  return record;
}

function disposeTile(record: RasterTileRecord): void {
  record.texture.dispose();
  record.material.dispose();
  record.mesh.dispose();
}

const MAX_CACHED_TILES = 512;

interface DesiredEntry {
  tile: TileCoord;
  key: string;
  baseZoom: number;
}

interface DisplayBuildResult {
  covered: boolean;
  keys: string[];
}

export function createRasterTilesRuntime(options: RasterTilesRuntimeOptions): RasterTilesRuntime {
  // Persistent cache: tiles stay alive after they leave the desired set so we
  // can keep showing them (or use them as best-effort fallbacks) without
  // re-downloading. Eviction is LRU and only kicks in over MAX_CACHED_TILES.
  const cache = new Map<string, RasterTileRecord>();
  const lastUsedTick = new Map<string, number>();
  let visibleTileKeys = new Set<string>();
  let tick = 0;
  let lastDesired: DesiredEntry[] = [];
  let loadingCount = 0;
  let loadCycleActive = false;
  let disposed = false;
  let lastView: Pick<GlobeViewState, "latDeg" | "lonDeg" | "zoomMeters"> | null = null;

  function getMetrics(): RasterTileMetrics {
    let visibleTiles = 0;
    for (const record of cache.values()) {
      if (record.mesh.isEnabled() && record.loaded && !record.failed) visibleTiles += 1;
    }
    return { visibleTiles, activeTiles: cache.size };
  }

  function beginLoad(): void {
    loadingCount += 1;
    if (!loadCycleActive) {
      loadCycleActive = true;
      options.onLoadStart?.();
    }
  }

  function emitLoadEndIfIdle(): void {
    if (!loadCycleActive || loadingCount !== 0) return;
    loadCycleActive = false;
    const metrics = getMetrics();
    options.onLoadEnd?.(metrics.visibleTiles, metrics.activeTiles);
  }

  function finishLoad(record: RasterTileRecord): void {
    if (disposed || record.settled) return;
    record.settled = true;
    loadingCount = Math.max(0, loadingCount - 1);
    if (record.failed) {
      // Drop failed tiles from the cache so we can retry on next request.
      cache.delete(record.key);
      lastUsedTick.delete(record.key);
      disposeTile(record);
    } else {
      // A new tile just became available — refresh visibility so it can take
      // over from any ancestor that was standing in for it.
      recomputeVisibility();
    }

    options.requestRender?.();
    emitLoadEndIfIdle();
  }

  function ensureCached(tile: TileCoord): RasterTileRecord {
    const key = tileKey(tile);
    const existing = cache.get(key);
    if (existing) return existing;
    beginLoad();
    const record = createTileRecord(options, tile, finishLoad);
    cache.set(key, record);
    return record;
  }

  function touchAncestors(tile: TileCoord, baseZoom: number): void {
    let z = tile.z;
    let x = tile.x;
    let y = tile.y;
    while (z >= baseZoom) {
      const key = `${z}/${x}/${y}`;
      if (cache.has(key)) lastUsedTick.set(key, tick);
      if (z === baseZoom) break;
      z -= 1;
      x >>= 1;
      y >>= 1;
    }
  }

  function isLoadedTile(key: string): boolean {
    const record = cache.get(key);
    return Boolean(record && record.loaded && !record.failed);
  }

  function buildTargetSets(): { leafKeys: Set<string>; internalKeys: Set<string>; baseZoom: number | null } {
    if (lastDesired.length === 0) return { leafKeys: new Set(), internalKeys: new Set(), baseZoom: null };
    const leafKeys = new Set(lastDesired.map((entry) => entry.key));
    const internalKeys = new Set<string>();
    for (const entry of lastDesired) {
      let z = entry.tile.z;
      let x = entry.tile.x;
      let y = entry.tile.y;
      while (z > entry.baseZoom) {
        z -= 1;
        x >>= 1;
        y >>= 1;
        const key = `${z}/${x}/${y}`;
        if (!leafKeys.has(key)) internalKeys.add(key);
      }
    }
    return { leafKeys, internalKeys, baseZoom: lastDesired[0].baseZoom };
  }

  function buildDisplayKeys(
    tile: TileCoord,
    leafKeys: ReadonlySet<string>,
    internalKeys: ReadonlySet<string>,
  ): DisplayBuildResult {
    const key = tileKey(tile);
    const loaded = isLoadedTile(key);
    if (!internalKeys.has(key)) {
      return leafKeys.has(key) && loaded ? { covered: true, keys: [key] } : { covered: false, keys: [] };
    }

    const childZ = tile.z + 1;
    const childX = tile.x * 2;
    const childY = tile.y * 2;
    const children = [
      buildDisplayKeys({ z: childZ, x: childX, y: childY }, leafKeys, internalKeys),
      buildDisplayKeys({ z: childZ, x: childX + 1, y: childY }, leafKeys, internalKeys),
      buildDisplayKeys({ z: childZ, x: childX, y: childY + 1 }, leafKeys, internalKeys),
      buildDisplayKeys({ z: childZ, x: childX + 1, y: childY + 1 }, leafKeys, internalKeys),
    ];
    const childKeys = children.flatMap((child) => child.keys);
    if (children.every((child) => child.covered)) {
      return { covered: true, keys: childKeys };
    }
    return loaded ? { covered: true, keys: [key] } : { covered: false, keys: childKeys };
  }

  function recomputeVisibility(): void {
    const { leafKeys, internalKeys, baseZoom } = buildTargetSets();
    const representatives = new Set<string>();
    if (baseZoom !== null) {
      const rootCount = 2 ** baseZoom;
      for (let y = 0; y < rootCount; y += 1) {
        for (let x = 0; x < rootCount; x += 1) {
          for (const key of buildDisplayKeys({ z: baseZoom, x, y }, leafKeys, internalKeys).keys) {
            representatives.add(key);
          }
        }
      }
    }
    visibleTileKeys = representatives;
    for (const [key, record] of cache) {
      const visible = representatives.has(key) && record.loaded && !record.failed;
      record.mesh.setEnabled(visible);
      if (visible) lastUsedTick.set(key, tick);
    }
  }

  function evictIfNeeded(): void {
    if (cache.size <= MAX_CACHED_TILES) return;
    const desiredKeys = new Set(lastDesired.map((e) => e.key));
    const candidates: Array<{ key: string; tick: number }> = [];
    for (const [key, record] of cache) {
      if (desiredKeys.has(key)) continue; // never evict the current desired set
      if (visibleTileKeys.has(key)) continue;
      if (!record.settled) continue;       // don't evict in-flight loads
      candidates.push({ key, tick: lastUsedTick.get(key) ?? 0 });
    }
    candidates.sort((a, b) => a.tick - b.tick);
    let toEvict = cache.size - MAX_CACHED_TILES;
    for (const { key } of candidates) {
      if (toEvict <= 0) break;
      const record = cache.get(key);
      if (!record) continue;
      cache.delete(key);
      lastUsedTick.delete(key);
      disposeTile(record);
      toEvict -= 1;
    }
  }

  function hasMeaningfulCameraChange(view: GlobeViewState): boolean {
    if (!lastView) return true;
    if (Math.abs(view.zoomMeters - lastView.zoomMeters) > TILE_REQUEST_DEBOUNCE_METERS) return true;
    return Math.abs(view.latDeg - lastView.latDeg) > 0.00001 || Math.abs(view.lonDeg - lastView.lonDeg) > 0.00001;
  }

  return {
    source: options.source,
    update(): void {
      if (disposed) return;

      const view = options.getViewState();
      if (!view) return;
      if (!options.alwaysRefresh && !hasMeaningfulCameraChange(view)) return;
      lastView = { latDeg: view.latDeg, lonDeg: view.lonDeg, zoomMeters: view.zoomMeters };
      tick += 1;

      const baseZoom = chooseGlobalBaseZoom(options.source, chooseTileZoom(view, options.source));
      const desiredTiles = getDesiredTiles(view, options.source);
      lastDesired = desiredTiles.map((tile) => ({ tile, key: tileKey(tile), baseZoom }));

      // Queue loads for any desired tile not yet cached; touch ancestors so
      // already-loaded coarser tiles survive LRU while we wait for detail.
      for (const entry of lastDesired) {
        ensureCached(entry.tile);
        touchAncestors(entry.tile, baseZoom);
      }

      recomputeVisibility();
      evictIfNeeded();
      emitLoadEndIfIdle();
    },
    getMetrics,
    dispose(): void {
      disposed = true;
      for (const record of cache.values()) {
        if (!record.settled) {
          record.settled = true;
          loadingCount = Math.max(0, loadingCount - 1);
        }
        disposeTile(record);
      }
      cache.clear();
      lastUsedTick.clear();
      lastDesired = [];
      loadingCount = 0;
      loadCycleActive = false;
    },
  };
}