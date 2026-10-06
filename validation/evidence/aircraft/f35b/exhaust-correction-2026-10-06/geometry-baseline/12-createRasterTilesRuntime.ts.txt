import { loadMapTexture } from "./loadMapTexture";
import {
  Color3,
  Mesh,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  VertexData,
  type Scene,
} from "@babylonjs/core";

import {
  DEG_TO_RAD,
  geodeticToEcef,
} from "../../camera/cameraMath";
import { createTerrainTileLoader, sampleTerrainGrid, type TerrainGrid, type TerrainSource } from "../../terrain/terrainTiles";
import { GLOBAL_TERRAIN } from "../../terrain/globalTerrain";
import { createRasterSurfaceSampler } from "../../terrain/rasterSurfaceSampler";
import type { SurfaceHit } from "../../terrain/surfaceQuery";
import type { TerrainPerformanceCapture } from "../../terrain/terrainPerformanceCapture";
import { retryDelayMs, type RetryDelay } from "../../terrain/retryDelay";
import { meshPositions, patchesForGeometryCommit, stitchTerrainEdges, updateTerrainPositions } from "../../terrain/meshRefinement";
import type { GlobeViewState } from "../types";
import type { DetailLimit } from "../../terrain/mapDetailPolicy";
import { lonLatToTileXY } from "../../terrain/imagery/imageryGeometry";
import { createImageryRuntime, type ImageryDiagnostics, type ImageryFocusRequest, type ImageryRuntime } from "./imagery/createImageryRuntime";
import { IMAGERY_TABLE_MAX_CELLS_LOG2 } from "./imagery/imageryAtlasLayout";
import type { ImageryLoader } from "./imagery/imageryResidency";
import type { RasterBaseMapSource } from "./rasterBaseMaps";
import { getAppSettings } from "../../settings/appSettings";
import type { SettingsRegistry } from "../../settings/registry";
import { IMAGERY_LIMIT_IDS, IMAGERY_TUNING_IDS, imageryLimitsFrom, imageryTuningFrom } from "./imagery/imageryParameters";
import { readImageryView, imageryViewChanged } from "./imagery/imageryView";
import type { ImageryView } from "../../terrain/imagery/imageryGeometry";
import { selectTerrain, type TerrainFocus, type TerrainSelection } from "../../terrain/terrainSelector";
import { createAutoDetailController, type AutoDetailDecision, type AutoDetailState } from "../../terrain/autoDetail";

/** Segments along a tile's side when the caller gives none: `map.terrain.tileSegments`'s default. */
const DEFAULT_TILE_SEGMENTS = 64;
const UNAVAILABLE_DETAIL: RasterDetailFeedback = Object.freeze({
  support: "unavailable",
  reason: "Detail for 2D basemaps is not available yet.",
  pending: false,
  limits: [],
  activeTarget: null,
  loadedTarget: null,
  effectiveTarget: null,
});

/** How the runtime is delivering the requested raster detail. */
export interface RasterDetailFeedback {
  support: "ready" | "unavailable";
  /** Why detail is unavailable, for the rail and the Map tab. */
  reason?: string;
  pending: boolean;
  limits: readonly DetailLimit[];
  /** The current policy offset, including automatic adjustment, not achieved detail. */
  activeTarget?: number | null;
  /** Visible-area estimate of imagery actually bound to terrain, in detail offsets. */
  loadedTarget?: number | null;
  /** The one delivered offset when every region meets the request, otherwise null. */
  effectiveTarget: number | null;
}

export interface RasterTerrainState {
  /** The mesh's screen-space error target in use, px, after the link and automatic adjustment. */
  targetPx: number;
  /** The target before automatic adjustment, px. */
  requestedTargetPx: number;
  /** Tiles the last selection chose, those the camera or focus region needs, and whether the limit cut it short. */
  selectedTiles: number;
  neededTiles: number;
  truncated: boolean;
}

export interface RasterAutoDetailState extends AutoDetailState {
  terrainEnabled: boolean;
  imageryEnabled: boolean;
  /** The imagery offset requested and the one in use. */
  requestedOffset: number;
  offset: number;
}

export interface RasterTileMetrics {
  visibleTiles: number;
  activeTiles: number;
}

export interface RasterTilesRuntimeOptions {
  scene: Scene;
  source: RasterBaseMapSource;
  worldRoot?: TransformNode;
  /** @deprecated Unused: the runtime selects on every update that finds a change. */
  alwaysRefresh?: boolean;
  /**
   * @deprecated Terrain is chosen from the scene's active camera and
   * `map.focus.*`; the view state no longer decides it. Ignored.
   */
  getViewState?: () => GlobeViewState | null;
  getSurfaceHeightMeters?: (latDeg: number, lonDeg: number) => number | null;
  terrainSource?: TerrainSource;
  performanceCapture?: TerrainPerformanceCapture;
  /**
   * @deprecated The quality profiles are retired: terrain detail is
   * `map.detail.terrain.*` and adjusts itself by `map.auto.*`. Ignored.
   */
  quality?: unknown;
  /** Mesh segments along each side of a tile; the runtime passes `map.terrain.tileSegments`. */
  segments?: number;
  /** Requested imagery detail offset; see RasterDetailPolicy. */
  detailOffset?: number;
  /**
   * "atlas" selects imagery by projected pixel size and draws it from a paged
   * atlas, independently of terrain. "legacy" binds one image to each terrain
   * mesh. Legacy when omitted; applications pass DEFAULT_RASTER_IMAGERY.
   */
  imagery?: "atlas" | "legacy";
  /** Loads atlas imagery; the browser loader when omitted. For tests and embedded hosts. */
  imageryLoader?: ImageryLoader;
  /** Called when detail delivery or support changes. */
  onDetailFeedback?: () => void;
  /**
   * The registry the runtime reads its budgets and tuning from and follows:
   * `map.imagery.*` and `map.terrain.*`. The app's when omitted.
   */
  settings?: SettingsRegistry;
  /** A region of terrain and imagery to load around a focus point, beyond or instead of the view. */
  getFocus?: () => ImageryFocusRequest | null;
  /** Called when automatic adjustment moves detail, for the host's log. */
  onDetailAdjusted?: (decision: AutoDetailDecision) => void;
  /** Texture samples for per-tile imagery; read when a texture is created. */
  anisotropy?: () => number;
  /** How failed terrain and imagery downloads back off, ms: `map.retryDelay`; read at each failure. */
  retryDelay?: () => RetryDelay;
  requestRender?: () => void;
  onLoadStart?: () => void;
  onDownloadBytes?: (bytes: number) => void;
  onLoadEnd?: (visibleTiles: number, activeTiles: number) => void;
  onLoadError?: (error: Error, url: string) => void;
  onDebugEvent?: (event: string, detail?: Record<string, unknown>) => void;
}

export interface RasterTilesRuntime {
  readonly source: RasterBaseMapSource;
  update(): void;
  getLoadingDiagnostics?(): {
    activeElevationRequests: number;
    queuedElevationRequests: number;
    pendingTiles: number;
  };
  /** Replace imagery in-place; elevation grids and displayed terrain stay put. */
  setSource(source: RasterBaseMapSource): void;
  /** Stream a replacement elevation source onto the current displayed mesh. */
  setTerrainSource(source: TerrainSource): void;
  /**
   * While suspended, nothing is selected and no request starts: `update`
   * returns at once and queued elevation waits. Downloads already running
   * finish. Resuming selects again on the next frame.
   */
  setSuspended(suspended: boolean): void;
  getMetrics(): RasterTileMetrics;
  getRevision(): number;
  sample(latDeg: number, lonDeg: number): SurfaceHit | null;
  /**
   * Request imagery detail as an offset. With `map.detail.linkTerrainToImagery`
   * the terrain mesh's target follows, a level per halving; the displayed
   * surface changes only through ordinary tile adoption.
   */
  setDetailTarget(offset: number): void;
  /** The terrain target in use and what the last selection chose. */
  getTerrainState(): RasterTerrainState;
  /** Where automatic adjustment has moved detail, and why. */
  getAutoDetailState(): RasterAutoDetailState;
  getDetailFeedback(): RasterDetailFeedback;
  /** The imagery path in use and, for the atlas, what it is doing. */
  getImageryDiagnostics(): { mode: "atlas" | "legacy"; atlas: ImageryDiagnostics | null };
  /** The source whose imagery is on screen; it lags a switch until the new source can cover the globe. */
  getDisplayedSourceId(): string;
  reportFrame(now: number, frameMs: number, suspended: boolean): void;
  dispose(): void;
}

interface TileCoord {
  z: number;
  x: number;
  y: number;
}

interface RasterTileRecord {
  tile: TileCoord;
  key: string;
  mesh: Mesh;
  material: StandardMaterial;
  texture: Texture | null;
  loaded: boolean;
  failed: boolean;
  settled: boolean;
  grid?: TerrainGrid;
  target: number[];
  imageryGeneration: number;
  replaceImagery(source: RasterBaseMapSource, generation: number): void;
  terrainGeneration: number;
  appliedTerrainGeneration: number;
  replaceTerrain(loadTerrain: (tile: TileCoord, progress: (grid: TerrainGrid) => void) => Promise<TerrainGrid>, generation: number): void;
  /** When failed detail elevation is requested again; Infinity when none failed. */
  terrainRetryAt: number;
  terrainFailures: number;
  /** Atlas imagery only: checks whether fallback coverage can now draw this patch. */
  refreshImagery(): void;
  /** Lowest and highest adopted heights, for imagery culling. */
  heightBounds: { min: number; max: number } | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}


function tileXToLon(x: number, z: number): number {
  return (x / (2 ** z)) * 360 - 180;
}

function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / (2 ** z);
  return Math.atan(Math.sinh(n)) / DEG_TO_RAD;
}

type ZoomLimits = Pick<RasterBaseMapSource, "minZoom" | "maxZoom">;

function tileKey(tile: TileCoord): string {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

function buildTileUrl(source: RasterBaseMapSource, tile: TileCoord): string {
  return source.urlTemplate
    .replace(/\{z\}/g, String(tile.z))
    .replace(/\{x\}/g, String(tile.x))
    .replace(/\{y\}/g, String(tile.y));
}

export function createTerrainMesh(options: RasterTilesRuntimeOptions, tile: TileCoord, grid?: TerrainGrid): Mesh {
  const started = options.performanceCapture ? performance.now() : 0;
  const { scene, source } = options;
  const mesh = new Mesh(`raster-basemap-tile-${source.id}-${tileKey(tile)}`, scene);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const segments = Math.max(1, Math.round(options.segments ?? DEFAULT_TILE_SEGMENTS));
  const center = geodeticToEcef(tileYToLat(tile.y + 0.5, tile.z) * DEG_TO_RAD, tileXToLon(tile.x + 0.5, tile.z) * DEG_TO_RAD, 0);
  let minHeight = Infinity, maxHeight = -Infinity;

  for (let row = 0; row <= segments; row += 1) {
    const v = row / segments;
    const mercatorY = tile.y + v;
    const latDeg = tileYToLat(mercatorY, tile.z);

    for (let col = 0; col <= segments; col += 1) {
      const u = col / segments;
      const mercatorX = tile.x + u;
      const lonDeg = tileXToLon(mercatorX, tile.z);
      const scale = grid ? 2 ** (grid.z - tile.z) : 1;
      const altitudeMeters = grid
        ? sampleTerrainGrid(grid, mercatorX * scale, mercatorY * scale)
        : options.getSurfaceHeightMeters?.(latDeg, lonDeg) ?? 0;
      if (altitudeMeters < minHeight) minHeight = altitudeMeters;
      if (altitudeMeters > maxHeight) maxHeight = altitudeMeters;
      const ecef = geodeticToEcef(latDeg * DEG_TO_RAD, lonDeg * DEG_TO_RAD, altitudeMeters);
      positions.push(ecef.x - center.x, ecef.y - center.y, ecef.z - center.z);
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

  mesh.position = new Vector3(center.x, center.y, center.z);
  // The displayed height range, whatever the terrain came from; imagery culls with it.
  mesh.metadata = { mapSurface: true, terrainZoom: grid?.z ?? -1, segments, heightBounds: { min: minHeight, max: maxHeight } };

  mesh.isPickable = true;
  mesh.renderingGroupId = 0;
  mesh.setEnabled(false);
  if (options.worldRoot) {
    mesh.parent = options.worldRoot;
  } else {
    mesh.freezeWorldMatrix();
  }

  if (options.performanceCapture) {
    options.performanceCapture.counters.preparationCpuMs += performance.now() - started;
    options.performanceCapture.counters.geometryWrites++;
  }
  return mesh;
}

function createTileRecord(
  options: RasterTilesRuntimeOptions,
  source: RasterBaseMapSource,
  tile: TileCoord,
  onSettled: (record: RasterTileRecord) => void,
  loadTerrain: (tile: TileCoord, progress: (grid: TerrainGrid) => void) => Promise<TerrainGrid>,
  onChanged: (record: RasterTileRecord) => void,
  onRetryScheduled: (at: number) => void,
  imagery: ImageryRuntime | null = null,
): RasterTileRecord {
  const { scene } = options;
  const key = tileKey(tile);
  const mesh = createTerrainMesh(options, tile, options.getSurfaceHeightMeters ? undefined : GLOBAL_TERRAIN);
  const material = new StandardMaterial(`raster-basemap-material-${source.id}-${key}`, scene);
  const record: RasterTileRecord = {
    key,
    tile,
    mesh,
    material,
    texture: null,
    loaded: false,
    failed: false,
    settled: false,
    grid: options.getSurfaceHeightMeters ? undefined : GLOBAL_TERRAIN,
    target: meshPositions(mesh),
    imageryGeneration: 0,
    replaceImagery: () => {},
    terrainGeneration: 0,
    appliedTerrainGeneration: 0,
    replaceTerrain: () => {},
    terrainRetryAt: Infinity,
    terrainFailures: 0,
    refreshImagery: () => {},
    heightBounds: mesh.metadata.heightBounds,
  };

  let imageryReady = false;
  let terrainReady = false;
  const finish = () => {
    if (record.settled) return;
    if (imageryReady) { record.loaded = true; onChanged(record); }
    if (imageryReady && terrainReady) onSettled(record);
  };
  const applyGrid = (grid: TerrainGrid | undefined, generation: number) => {
    if (record.mesh.isDisposed() || generation !== record.terrainGeneration) return;
    if (grid && record.appliedTerrainGeneration === generation && grid.z <= record.mesh.metadata.terrainZoom) return;
    const readyMesh = createTerrainMesh(options, tile, grid);
    const started = options.performanceCapture ? performance.now() : 0;
    record.target = meshPositions(readyMesh);
    record.grid = grid;
    record.heightBounds = readyMesh.metadata.heightBounds;
    record.appliedTerrainGeneration = generation;
    record.mesh.metadata.terrainZoom = grid?.z ?? -1;
    readyMesh.dispose();
    if (options.performanceCapture) options.performanceCapture.counters.preparationCpuMs += performance.now() - started;
    onChanged(record);
  };
  const requestTerrain = (
    nextLoadTerrain: (tile: TileCoord, progress: (grid: TerrainGrid) => void) => Promise<TerrainGrid>,
    generation: number,
    settlesInitialRecord: boolean,
  ) => {
    record.terrainGeneration = generation;
    record.terrainRetryAt = Infinity;
    const terrain = options.getSurfaceHeightMeters ? Promise.resolve(undefined) : nextLoadTerrain(tile, grid => applyGrid(grid, generation));
    void terrain.then(grid => {
      applyGrid(grid, generation);
      if (record.mesh.isDisposed() || generation !== record.terrainGeneration) return;
      record.terrainFailures = 0;
      if (settlesInitialRecord) {
        terrainReady = true;
        finish();
      }
    }).catch(error => {
      if (record.mesh.isDisposed() || generation !== record.terrainGeneration) return;
      options.onLoadError?.(error instanceof Error ? error : new Error(String(error)), `terrain:${key}`);
      // Keep the best geometry already available when detail fails, and ask
      // again later: coarse startup terrain must not become permanent.
      record.terrainFailures += 1;
      record.terrainRetryAt = performance.now() + retryDelayMs(record.terrainFailures, options.retryDelay?.());
      onRetryScheduled(record.terrainRetryAt);
      if (settlesInitialRecord) {
        terrainReady = true;
        finish();
      }
    });
  };
  record.replaceTerrain = (nextLoadTerrain, generation) => requestTerrain(nextLoadTerrain, generation, false);
  requestTerrain(loadTerrain, 0, true);
  const loadImagery = (nextSource: RasterBaseMapSource, generation: number) => {
    const url = buildTileUrl(nextSource, tile);
    options.onDebugEvent?.("imagery-request-start", { key, source: nextSource.id, generation, url });
    // A source can switch before its first image settles. The replacement is
    // still responsible for activating this record once it arrives.
    const activatesRecord = !imageryReady;
    let texture: Texture | null = null;
    texture = loadMapTexture(url, scene,
      () => {
        if (!texture || record.mesh.isDisposed() || generation !== record.imageryGeneration) {
          texture?.dispose();
          return;
        }
        const oldTexture = record.texture;
        record.texture = texture;
        material.diffuseTexture = texture;
        options.onDebugEvent?.("texture-material-assignment", { key, source: nextSource.id, generation });
        if (oldTexture && oldTexture !== texture) oldTexture.dispose();
        if (activatesRecord) {
          imageryReady = true;
          finish();
        } else {
          options.requestRender?.();
        }
        options.onDebugEvent?.("imagery-request-success", { key, source: nextSource.id, generation });
      },
      (message, exception) => {
        if (record.mesh.isDisposed() || generation !== record.imageryGeneration) return;
        const detail = exception instanceof Error ? exception.message : String(message ?? "unknown texture load error");
        options.onDebugEvent?.("imagery-request-error", { key, source: nextSource.id, generation, url, error: detail });
        options.onLoadError?.(new Error(detail), url);
        if (activatesRecord) {
          record.failed = true;
          onSettled(record);
        }
        // During a hot swap the old texture remains visible after a failure.
      },
      (bytes) => options.onDownloadBytes?.(bytes),
    );
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    texture.anisotropicFilteringLevel = options.anisotropy?.() ?? 1;
    // New records have no usable old texture, so attach their pending texture
    // immediately. Existing records keep their previous map until replacement.
    if (!record.texture) {
      record.texture = texture;
      material.diffuseTexture = texture;
    }
  };
  if (imagery) {
    // Imagery comes from the atlas: the patch is drawable once fallback
    // coverage is resident, and no image is ever bound to this mesh.
    imagery.attachPatch(key, tile, material);
    record.refreshImagery = () => {
      if (imageryReady || record.mesh.isDisposed() || !imagery.hasCoverage(tile)) return;
      imageryReady = true;
      finish();
    };
    record.refreshImagery();
  } else {
    record.replaceImagery = (nextSource, generation) => {
      record.imageryGeneration = generation;
      loadImagery(nextSource, generation);
    };
    record.replaceImagery(source, 0);
  }

  material.specularColor = Color3.Black();
  material.emissiveColor = Color3.White();
  material.disableLighting = true;
  material.backFaceCulling = false;
  mesh.material = material;

  return record;
}

function disposeTile(record: RasterTileRecord): void {
  record.texture?.dispose();
  record.material.dispose();
  record.mesh.dispose();
}

interface DesiredEntry {
  tile: TileCoord;
  key: string;
  baseZoom: number;
}

interface DisplayBuildResult {
  covered: boolean;
  keys: string[];
}

/** Parameters that change which terrain tiles a selection chooses. */
const TERRAIN_SELECTION_IDS = new Set([
  "map.terrain.maxLevel",
  "map.terrain.errorPerSpacing",
  "map.terrain.tileSegments",
  "map.terrain.maxTiles",
  "map.terrain.refineAbove",
  "map.terrain.coarsenBelow",
]);

export function createRasterTilesRuntime(options: RasterTilesRuntimeOptions): RasterTilesRuntime {
  const capture = options.performanceCapture;
  const settings = options.settings ?? getAppSettings();
  const setting = (id: string): number => {
    const value = settings.get(id);
    return typeof value === "number" ? value : Number.NaN;
  };
  const range = (id: string): { min: number; max: number } => {
    const value = settings.get(id);
    return typeof value === "object" && value !== null && "min" in value ? value : { min: Number.NaN, max: Number.NaN };
  };
  let imagerySource = options.source;
  let imageryGeneration = 0;
  // Tile-record callbacks retain this object, so a new segment count also
  // reaches meshes prepared after the change.
  const meshOptions: RasterTilesRuntimeOptions = {
    ...options,
    segments: Math.round(setting("map.terrain.tileSegments")),
    anisotropy: () => Math.round(setting("map.imagery.anisotropy")),
    retryDelay: () => {
      const seconds = range("map.retryDelay");
      return { min: seconds.min * 1000, max: seconds.max * 1000 };
    },
  };

  // Detail: the rail's imagery request, the terrain target it sets when
  // linked, and how far automatic adjustment has coarsened both.
  let requestedOffset = options.detailOffset ?? 0;
  const autoTuning = () => {
    const goal = settings.get("map.auto.frameTimeGoal");
    const cap = settings.get("renderer.frameRateCap");
    return {
      goalMs: typeof goal === "number" ? goal : null,
      leastGoalMs: typeof cap === "number" && cap > 0 ? 1000 / cap : 0,
      coarsenAbove: setting("map.auto.coarsenAbove"),
      refineBelow: setting("map.auto.refineBelow"),
      windowMs: setting("map.auto.window"),
      coarsenWindows: Math.round(setting("map.auto.coarsenWindows")),
      refineWindows: Math.round(setting("map.auto.refineWindows")),
      step: setting("map.auto.step"),
      intervalMs: setting("map.auto.interval"),
    };
  };
  const autoDetail = createAutoDetailController(autoTuning());
  const terrainAuto = (): boolean => settings.get("map.auto.terrainDetail") !== false;
  const imageryAuto = (): boolean => settings.get("map.auto.imageryDetail") !== false;
  /** The terrain target before adjustment: the default, moved a level per level of the rail when linked, within its range. */
  const requestedTerrainTarget = (): number => {
    const bounds = range("map.detail.terrain.range");
    const base = setting("map.detail.terrain.default");
    const imageryDefault = settings.get("map.detail.imagery.default");
    const linked = settings.get("map.detail.linkTerrainToImagery") !== false;
    const target = linked ? base * 2 ** ((typeof imageryDefault === "number" ? imageryDefault : 0) - requestedOffset) : base;
    return clamp(target, bounds.min, bounds.max);
  };
  const terrainTarget = (): number => {
    const requested = requestedTerrainTarget();
    return terrainAuto() ? Math.min(range("map.detail.terrain.range").max, requested * 2 ** autoDetail.getAdjustment()) : requested;
  };
  const imageryOffset = (): number => {
    if (!imageryAuto()) return requestedOffset;
    return Math.max(Math.min(requestedOffset, range("map.detail.imagery.range").min), requestedOffset - autoDetail.getAdjustment());
  };
  /** How far the enabled details can still coarsen from their requests, in levels. */
  const autoRoom = (): number => Math.max(
    terrainAuto() ? Math.log2(range("map.detail.terrain.range").max / requestedTerrainTarget()) : 0,
    imageryAuto() && imageryRuntime ? requestedOffset - range("map.detail.imagery.range").min : 0,
    0,
  );
  let terrainSource = options.terrainSource;
  let suspended = false;
  const createTerrainLoader = () => {
    const loader = createTerrainTileLoader(terrainSource, options.onDownloadBytes, undefined, Boolean(capture),
      capture ? milliseconds => { capture.counters.preparationCpuMs += milliseconds; } : undefined);
    loader.setPaused(suspended);
    return loader;
  };
  let terrain = createTerrainLoader();
  let terrainGeneration = 0;
  // Persistent cache: tiles stay alive after they leave the desired set so we
  // can keep showing them (or use them as best-effort fallbacks) without
  // re-downloading. Eviction is LRU and bound by `map.terrain.cachedTiles`.
  const cache = new Map<string, RasterTileRecord>();
  const lastUsedTick = new Map<string, number>();
  const retryAfter = new Map<string, number>();
  const imageryFailures = new Map<string, number>();
  let visibleTileKeys = new Set<string>();
  let tick = 0;
  let lastDesired: DesiredEntry[] = [];
  let loadingCount = 0;
  let loadCycleActive = false;
  let disposed = false;
  let revision = 0;
  const surfaceSampler = createRasterSurfaceSampler(() => revision, capture?.counters);
  let geometryDirty = false;
  const dirtyGeometryKeys = new Set<string>();
  let visibilityDirty = false;
  const meshRebuildQueue = new Set<string>();
  // What the last terrain selection was made from, and what it chose.
  let selectionDirty = true;
  let selectedView: ImageryView | null = null;
  let selectedFocus: TerrainFocus | null = null;
  let selectedAt = -Infinity;
  let selection: TerrainSelection | null = null;
  let selectedTarget = Number.NaN;
  // A tile's heights arrived since the last selection, which may measure it differently now.
  let heightsArrived = false;
  // Adopted terrain levels, finest first, for imagery height queries.
  let visibleLevels: number[] = [];

  const coveringVisibleRecord = (tile: TileCoord): RasterTileRecord | null => {
    let { z, x, y } = tile;
    for (;;) {
      const key = `${z}/${x}/${y}`;
      if (visibleTileKeys.has(key)) return cache.get(key) ?? null;
      if (z === 0) return null;
      z -= 1; x >>= 1; y >>= 1;
    }
  };
  /**
   * The height range terrain selection measures a tile with: the tile's own
   * heights once they arrive, otherwise its nearest ancestor's. Not only
   * visible tiles: a split tile's children replace it on screen, and its
   * range must not widen to the fallback then, or a reselection with nothing
   * moved would choose differently.
   */
  const knownHeightBounds = (tile: TileCoord): { min: number; max: number } | null => {
    let { z, x, y } = tile;
    for (;;) {
      const record = cache.get(`${z}/${x}/${y}`);
      if (record?.heightBounds && (record.grid || (options.getSurfaceHeightMeters && record.loaded))) return record.heightBounds;
      if (z === 0) return null;
      z -= 1; x >>= 1; y >>= 1;
    }
  };
  // What imagery selection may know about the surface: adopted terrain only.
  // It never asks for finer heights to decide imagery.
  const imagerySurface = {
    heightAt(latDeg: number, lonDeg: number): number | null {
      for (const z of visibleLevels) {
        const at = lonLatToTileXY(lonDeg, latDeg, z);
        const key = `${z}/${Math.floor(at.x)}/${Math.floor(at.y)}`;
        if (!visibleTileKeys.has(key)) continue;
        const record = cache.get(key);
        if (!record) continue;
        if (record.grid) {
          const scale = 2 ** (record.grid.z - z);
          return sampleTerrainGrid(record.grid, at.x * scale, at.y * scale);
        }
        break;
      }
      return options.getSurfaceHeightMeters?.(latDeg, lonDeg) ?? null;
    },
    boundsFor(tile: TileCoord): { min: number; max: number } {
      const bounds = coveringVisibleRecord(tile)?.heightBounds;
      return bounds ? { min: bounds.min - 50, max: bounds.max + 50 } : { min: -500, max: 9000 };
    },
    maxLevelFor(tile: TileCoord): number {
      const record = coveringVisibleRecord(tile);
      return record ? record.tile.z + IMAGERY_TABLE_MAX_CELLS_LOG2 : Infinity;
    },
    getRevision: () => revision,
  };

  let imageryRuntime: ImageryRuntime | null = null;
  let imageryUnavailableReason: string | null = null;
  if (options.imagery === "atlas") {
    const created = createImageryRuntime({
      scene: options.scene,
      worldRoot: options.worldRoot ?? null,
      source: imagerySource,
      offset: options.detailOffset ?? 0,
      limits: imageryLimitsFrom(settings),
      tuning: imageryTuningFrom(settings),
      getFocus: options.getFocus,
      surface: imagerySurface,
      loader: options.imageryLoader,
      requestRender: () => options.requestRender?.(),
      onDownloadBytes: options.onDownloadBytes,
      onError: (error, url) => options.onLoadError?.(error, url),
      onFeedback: () => options.onDetailFeedback?.(),
      onCoverageChange: () => {
        for (const record of cache.values()) record.refreshImagery();
        visibilityDirty = true;
        options.requestRender?.();
        // The displayed source may have changed: its credit follows.
        options.onDetailFeedback?.();
      },
    });
    if (created.supported) {
      imageryRuntime = created;
    } else {
      // Report it rather than hide it: the map still draws, but detail is unavailable.
      imageryUnavailableReason = created.getFeedback().reason ?? "Projected imagery is not supported by this renderer.";
      console.warn("[imagery]", imageryUnavailableReason, "Using per-tile imagery.");
      created.dispose();
    }
  }
  // Detail follows its request, the link and automatic adjustment wherever
  // they change: imagery at once, terrain at the next selection.
  let appliedOffset = requestedOffset;
  function applyDetail(): void {
    const decision = autoDetail.setRoom(autoRoom());
    if (decision) options.onDetailAdjusted?.(decision);
    const offset = imageryOffset();
    if (offset !== appliedOffset) {
      appliedOffset = offset;
      imageryRuntime?.setOffset(offset);
    }
    options.requestRender?.();
  }
  applyDetail();

  // Budgets and tuning follow the registry wherever they change.
  let appliedLimits = JSON.stringify(imageryLimitsFrom(settings));
  let appliedTuning = JSON.stringify(imageryTuningFrom(settings));
  const limitIds = new Set<string>(IMAGERY_LIMIT_IDS);
  const tuningIds = new Set<string>(IMAGERY_TUNING_IDS);
  const unsubscribeSettings = settings.subscribe(changed => {
    if (disposed) return;
    const ids = [...changed];
    // A note or a reading changes a parameter's state, not its value: only new values apply.
    const limits = ids.some(id => limitIds.has(id)) ? imageryLimitsFrom(settings) : null;
    const tuning = ids.some(id => tuningIds.has(id)) ? imageryTuningFrom(settings) : null;
    const newLimits = limits !== null && JSON.stringify(limits) !== appliedLimits;
    const newTuning = tuning !== null && JSON.stringify(tuning) !== appliedTuning;
    if (newLimits) { appliedLimits = JSON.stringify(limits); imageryRuntime?.setLimits(limits); }
    if (newTuning) { appliedTuning = JSON.stringify(tuning); imageryRuntime?.setTuning(tuning); }
    // A budget the renderer could not allocate says so where it was changed.
    if ((newLimits || newTuning) && imageryRuntime) settings.setNote("map.imagery.gpuBudget", imageryRuntime.getDiagnostics().allocationError);
    if (changed.has("map.imagery.anisotropy")) {
      const samples = Math.round(setting("map.imagery.anisotropy"));
      for (const record of cache.values()) if (record.texture) record.texture.anisotropicFilteringLevel = samples;
    }
    if (changed.has("map.terrain.tileSegments")) {
      const segments = Math.round(setting("map.terrain.tileSegments"));
      if (segments !== meshOptions.segments) {
        meshOptions.segments = segments;
        for (const key of cache.keys()) meshRebuildQueue.add(key);
        selectionDirty = true;
      }
    }
    if (ids.some(id => id.startsWith("map.auto.") || id === "renderer.frameRateCap")) autoDetail.setTuning(autoTuning());
    if (ids.some(id => TERRAIN_SELECTION_IDS.has(id) || id.startsWith("map.auto.") || id.startsWith("map.detail."))) applyDetail();
    options.requestRender?.();
  });
  // With projected imagery, terrain levels no longer follow the imagery
  // provider's cap and tile size: `map.terrain.maxLevel` bounds them.
  const zoomLimits = (): ZoomLimits => (imageryRuntime ? { minZoom: 0, maxZoom: Math.round(setting("map.terrain.maxLevel")) } : imagerySource);
  const disposeRecord = (record: RasterTileRecord): void => {
    imageryRuntime?.detachPatch(record.key);
    disposeTile(record);
  };

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

  // Failed loads are requested again through tile selection, which otherwise
  // runs only when the camera moves. Terrain preparation holds it still.
  let nextRetryAt = Infinity;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleRetry(at: number): void {
    if (disposed || at >= nextRetryAt) return;
    nextRetryAt = at;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { retryTimer = undefined; options.requestRender?.(); }, Math.max(0, at - performance.now()));
  }

  function finishLoad(record: RasterTileRecord): void {
    if (disposed || record.settled) return;
    record.settled = true;
    loadingCount = Math.max(0, loadingCount - 1);
    if (record.failed) {
      // Drop failed tiles from the cache so we can retry on next request.
      cache.delete(record.key);
      const failures = (imageryFailures.get(record.key) ?? 0) + 1;
      imageryFailures.set(record.key, failures);
      const retryAt = performance.now() + retryDelayMs(failures, meshOptions.retryDelay?.());
      retryAfter.set(record.key, retryAt);
      scheduleRetry(retryAt);
      lastUsedTick.delete(record.key);
      disposeRecord(record);
    } else {
      imageryFailures.delete(record.key);
    }
    // Adopt loaded coverage at the next update, before simulation and rendering.
    visibilityDirty = true;
    options.requestRender?.();
    emitLoadEndIfIdle();
  }

  function ensureCached(tile: TileCoord): void {
    const key = tileKey(tile);
    const existing = cache.get(key);
    if (existing) {
      if (existing.terrainGeneration !== terrainGeneration) existing.replaceTerrain(loadProgressive, terrainGeneration);
      else if (existing.terrainRetryAt !== Infinity) {
        // The coarse surface stays displayed; only the failed detail is requested.
        if (performance.now() >= existing.terrainRetryAt) existing.replaceTerrain(loadDetail, terrainGeneration);
        else scheduleRetry(existing.terrainRetryAt);
      }
      return;
    }
    const retryAt = retryAfter.get(key) ?? 0;
    if (performance.now() < retryAt) {
      scheduleRetry(retryAt);
      return;
    }
    beginLoad();
    const record = createTileRecord(meshOptions, imagerySource, tile, finishLoad, loadProgressive, changed => {
      geometryDirty = true;
      dirtyGeometryKeys.add(changed.key);
      visibilityDirty = true;
      heightsArrived = true;
      options.requestRender?.();
    }, scheduleRetry, imageryRuntime);
    cache.set(key, record);
  }

  function loadDetail(requested: TileCoord): Promise<TerrainGrid> {
    return terrain.loadPatch(requested);
  }

  function loadProgressive(requested: TileCoord, progress: (grid: TerrainGrid) => void): Promise<TerrainGrid> {
    const coarseZoom = Math.max(0, Math.min(requested.z, requested.z - 4));
    const loader = terrain;
    return (async () => {
      if (coarseZoom < requested.z) {
        try {
          const scale = 2 ** (requested.z - coarseZoom);
          progress(await loader.loadPatch({ z: coarseZoom, x: Math.floor(requested.x / scale), y: Math.floor(requested.y / scale) }));
        } catch { /* Retain the current displayed surface and still try detail. */ }
      }
      return loader.loadPatch(requested);
    })();
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
      const quality = cache.get(key)?.mesh.metadata.terrainZoom ?? -1;
      // Never replace a known parent with less accurate startup geometry.
      if (!loaded || childKeys.every(child => cache.get(child)!.mesh.metadata.terrainZoom >= quality)) {
        return { covered: true, keys: childKeys };
      }
    }
    return loaded ? { covered: true, keys: [key] } : { covered: false, keys: childKeys };
  }

  function recomputeVisibility(): void {
    visibilityDirty = false;
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
    const oldVisible = visibleTileKeys;
    const changed = oldVisible.size !== representatives.size || [...representatives].some(key => !oldVisible.has(key));
    if (changed) {
      for (const key of representatives) if (!oldVisible.has(key)) dirtyGeometryKeys.add(key);
      geometryDirty = true;
    }
    visibleTileKeys = representatives;
    for (const [key, record] of cache) {
      const visible = representatives.has(key) && record.loaded && !record.failed;
      if (visible === record.mesh.isEnabled()) {
        if (visible) lastUsedTick.set(key, tick);
        continue;
      }
      if (visible) options.onDebugEvent?.("tile-visible", { key });
      record.mesh.setEnabled(visible);
      imageryRuntime?.setPatchVisible(key, visible);
      if (visible) lastUsedTick.set(key, tick);
    }
    visibleLevels = [...new Set([...representatives].map(key => Number(key.split("/")[0])))].sort((a, b) => b - a);
    if (changed) surfaceSampler.setCoverage([...representatives].map(key => cache.get(key)!));
  }

  function evictIfNeeded(): void {
    const maxCachedTiles = Math.round(setting("map.terrain.cachedTiles"));
    if (cache.size <= maxCachedTiles) return;
    const desiredKeys = new Set(lastDesired.map((e) => e.key));
    const candidates: Array<{ key: string; tick: number }> = [];
    for (const [key, record] of cache) {
      if (desiredKeys.has(key)) continue; // never evict the current desired set
      if (visibleTileKeys.has(key)) continue;
      if (!record.settled) continue;       // don't evict in-flight loads
      candidates.push({ key, tick: lastUsedTick.get(key) ?? 0 });
    }
    candidates.sort((a, b) => a.tick - b.tick);
    let toEvict = cache.size - maxCachedTiles;
    for (const { key } of candidates) {
      if (toEvict <= 0) break;
      const record = cache.get(key);
      if (!record) continue;
      cache.delete(key);
      lastUsedTick.delete(key);
      disposeRecord(record);
      toEvict -= 1;
    }
  }

  /** The focus region as terrain measures it: from the camera's distance to the point. */
  function terrainFocus(view: ImageryView | null): TerrainFocus | null {
    const request = options.getFocus?.();
    if (!request || !view) return null;
    const { position } = request;
    return {
      mode: request.mode,
      position: { ...position },
      radiusMeters: request.radiusMeters,
      minDistanceMeters: Math.hypot(view.camera.x - position.x, view.camera.y - position.y, view.camera.z - position.z),
      horizonCull: request.horizonCull,
    };
  }

  /** A change in the focus region worth a new selection: the point moved, or what it asks for changed. */
  function focusChanged(a: TerrainFocus | null, b: TerrainFocus | null): boolean {
    if (!a || !b) return a !== b;
    const moved = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z);
    const nearer = Math.abs(a.minDistanceMeters - b.minDistanceMeters) > 0.02 * Math.max(1, a.minDistanceMeters);
    return a.mode !== b.mode || moved > 0.5 || nearer || a.radiusMeters !== b.radiusMeters || a.horizonCull !== b.horizonCull;
  }

  function commitTerrain(): void {
    const visible = [...visibleTileKeys].map(key => cache.get(key)!);
    const changed = visible.filter(record => dirtyGeometryKeys.has(record.key));
    if (!geometryDirty || changed.length === 0) return;
    for (const record of changed) {
      updateTerrainPositions(record.mesh, record.target);
      if (capture) capture.counters.geometryWrites++;
      dirtyGeometryKeys.delete(record.key);
    }
    // A replacement is a discrete commit. Stitch the committed tiles and the
    // visible neighbors that read them. Unrelated tiles keep their last upload.
    const dirtyKeys = new Set(changed.map(record => record.key));
    stitchTerrainEdges(patchesForGeometryCommit(visible, dirtyKeys), capture?.counters);
    revision++;
    geometryDirty = false;
  }

  /**
   * Changing quality replaces a few cached meshes at a time. It never rebuilds
   * the whole globe in one simulation frame, and it retains the elevation grid
   * so collision and rendering keep describing the same surface.
   */
  function processMeshRebuilds(): void {
    if (meshRebuildQueue.size === 0) return;
    const started = performance.now();
    let rebuilt = false;
    for (const key of meshRebuildQueue) {
      meshRebuildQueue.delete(key);
      const record = cache.get(key);
      if (!record || record.mesh.isDisposed()) continue;
      const oldMesh = record.mesh;
      const replacement = createTerrainMesh(meshOptions, record.tile, record.grid);
      replacement.material = record.material;
      replacement.setEnabled(oldMesh.isEnabled());
      record.mesh = replacement;
      record.target = meshPositions(replacement);
      record.heightBounds = replacement.metadata.heightBounds;
      oldMesh.dispose();
      dirtyGeometryKeys.add(key);
      geometryDirty = true;
      rebuilt = true;
      // Cap preparation work so an explicit quality change cannot make the
      // flight hitch in the way the LOD system is meant to prevent.
      if (performance.now() - started >= 2) break;
    }
    if (rebuilt) {
      surfaceSampler.setCoverage([...visibleTileKeys].map(key => cache.get(key)!).filter(Boolean));
    }
    if (meshRebuildQueue.size > 0) options.requestRender?.();
  }

  function selectTiles(view: ImageryView | null, focus: TerrainFocus | null): void {
    selectionDirty = false;
    heightsArrived = false;
    selectedView = view;
    selectedFocus = focus;
    selectedAt = performance.now();
    selectedTarget = terrainTarget();
    tick += 1;

    const limits = zoomLimits();
    const previous = selection;
    selection = selectTerrain({
      view,
      focus,
      targetPx: selectedTarget,
      errorPerSpacing: setting("map.terrain.errorPerSpacing"),
      segments: meshOptions.segments ?? DEFAULT_TILE_SEGMENTS,
      minLevel: limits.minZoom ?? 0,
      maxLevel: limits.maxZoom ?? 18,
      maxTiles: Math.round(setting("map.terrain.maxTiles")),
      hysteresis: { refineAbove: setting("map.terrain.refineAbove"), coarsenBelow: setting("map.terrain.coarsenBelow") },
      previous: previous && { split: previous.split, leaves: new Set(previous.leaves.map(leaf => leaf.key)) },
      boundsFor: tile => {
        const bounds = knownHeightBounds(tile);
        return bounds ? { min: bounds.min - 50, max: bounds.max + 50 } : { min: -500, max: 9000 };
      },
    });
    const baseZoom = selection.rootLevel;
    // Nearest needed first, so a flight does not wait behind distant tiles.
    lastDesired = selection.leaves.map(leaf => ({ tile: leaf.tile, key: leaf.key, baseZoom }));

    // Queue loads for any desired tile not yet cached; touch ancestors so
    // already-loaded coarser tiles survive LRU while we wait for detail.
    // Real coarse parents are useful immediately while finer leaves stream.
    const parents = new Map<string, TileCoord>();
    for (const entry of lastDesired) {
      let { z, x, y } = entry.tile;
      while (z > entry.baseZoom) {
        z--; x = Math.floor(x / 2); y = Math.floor(y / 2);
        parents.set(`${z}/${x}/${y}`, { z, x, y });
      }
    }
    // Preserve the focus-first ordering above. Enqueuing every ancestor
    // first makes cold-cache flight preparation download the globe before
    // the terrain under the aircraft can become ready.
    for (const entry of lastDesired) {
      ensureCached(entry.tile);
      touchAncestors(entry.tile, baseZoom);
    }
    for (const tile of [...parents.values()].sort((a, b) => a.z - b.z)) ensureCached(tile);

    visibilityDirty = true;
  }

  function captureResources(now: number): void {
    if (!capture?.needsResources(now)) return;
    let cachedTriangles = 0, adoptedTriangles = 0, meshBytes = 0, textureBytes = 0;
    for (const record of cache.values()) {
      const triangles = record.mesh.getTotalIndices() / 3;
      cachedTriangles += triangles;
      if (visibleTileKeys.has(record.key)) adoptedTriangles += triangles;
      // Conservative CPU + GPU estimate for position/normal/UV/index storage and
      // retained target/morph arrays. Decoder/driver allocations are unavailable.
      meshBytes += record.mesh.getTotalVertices() * 8 * 12 + triangles * 3 * 12 + record.target.length * 8;
      if (record.texture) {
        const size = record.texture.getSize();
        textureBytes += size.width * size.height * 4 * 4 / 3;
      }
    }
    textureBytes += imageryRuntime?.getDiagnostics().atlas?.estimatedGpuBytes ?? 0;
    const dem = terrain.getMetrics();
    capture.recordResources({ adoptedTiles: visibleTileKeys.size, cachedTiles: cache.size, adoptedTriangles,
      cachedTriangles, meshBytes, textureBytes, decodedDemBytes: dem.decodedBytes, pendingTiles: loadingCount,
      activeDemRequests: dem.active, queuedDemRequests: dem.queued }, now);
  }

  return {
    get source(): RasterBaseMapSource { return imagerySource; },
    getLoadingDiagnostics() {
      const requests = terrain.getMetrics();
      return {
        activeElevationRequests: requests.active,
        queuedElevationRequests: requests.queued,
        pendingTiles: loadingCount,
      };
    },
    update(): void {
      if (disposed || suspended) return;
      const started = capture ? performance.now() : 0, oldRevision = revision;
      const previousPreparation = capture?.counters.preparationCpuMs ?? 0;
      const view = readImageryView(options.scene, options.worldRoot ?? null);
      const focus = terrainFocus(view);
      const now = performance.now();
      const retryDue = nextRetryAt !== Infinity && now >= nextRetryAt;
      // A still camera and focus point have no new coverage to select unless
      // a failed load is due again, or heights arrived that measure a tile
      // better: a still view settles on what it would choose again. Around a
      // focus point the view decides nothing, so turning the camera selects
      // nothing.
      const moved = (focus?.mode !== "around" && imageryViewChanged(selectedView, view)) || focusChanged(selectedFocus, focus);
      if (selectionDirty || retryDue || terrainTarget() !== selectedTarget) {
        nextRetryAt = Infinity;
        selectTiles(view, focus);
      } else if (moved || heightsArrived) {
        // While the view moves or heights arrive, select at most every
        // interval; the view it stops at, and the last heights, are always
        // selected for.
        if (now - selectedAt >= setting("map.terrain.reselectWhileMoving")) selectTiles(view, focus);
        else options.requestRender?.();
      }
      if (visibilityDirty) recomputeVisibility();
      // Imagery follows the camera and only uploads pages and page tables; it
      // never writes terrain buffers or changes the adopted surface.
      imageryRuntime?.update();
      if (visibilityDirty) recomputeVisibility();
      processMeshRebuilds();
      // One atomic terrain replacement after coverage adoption, including
      // stationary/paused frames. There is no continuous CPU morph.
      commitTerrain();
      evictIfNeeded();
      emitLoadEndIfIdle();
      if (capture) {
        // Mesh construction is already recorded as preparation; do not count it twice.
        capture.counters.updateCpuMs += performance.now() - started - (capture.counters.preparationCpuMs - previousPreparation);
        capture.counters.revisionChanges += revision - oldRevision;
        captureResources(performance.now());
      }
    },
    setSource(source): void {
      // The same source with a key added or changed is a new source: its requests differ.
      if (source.id === imagerySource.id && source.version === imagerySource.version && source.urlTemplate === imagerySource.urlTemplate) return;
      if (imageryRuntime) {
        // Imagery only: no mesh, grid or selection of terrain changes.
        imagerySource = source;
        imageryRuntime.setSource(source);
        options.requestRender?.();
        return;
      }
      imagerySource = source;
      imageryGeneration += 1;
      for (const record of cache.values()) record.replaceImagery(source, imageryGeneration);
      // A provider may have different useful bounds/levels. Selection updates
      // independently from the DEM and does not revise the physical surface.
      selectionDirty = true;
      options.requestRender?.();
    },
    setSuspended(next): void {
      if (suspended === next || disposed) return;
      suspended = next;
      terrain.setPaused(next);
      if (!next) {
        selectionDirty = true;
        options.requestRender?.();
      }
    },
    setTerrainSource(source): void {
      if (terrainSource?.id === source.id) return;
      terrain.dispose();
      terrainSource = source;
      terrain = createTerrainLoader();
      terrainGeneration += 1;
      // Keep the adopted mesh live until its replacement grid commits. Current
      // desired and visible tiles get priority; cache-only tiles switch lazily
      // if they later become useful again.
      const requested = new Set([...lastDesired.map(entry => entry.key), ...visibleTileKeys]);
      for (const key of requested) {
        const record = cache.get(key);
        if (record) record.replaceTerrain(loadProgressive, terrainGeneration);
      }
      options.requestRender?.();
    },
    getMetrics,
    getRevision: () => revision,
    setDetailTarget(offset): void {
      if (!Number.isFinite(offset) || offset === requestedOffset) return;
      requestedOffset = offset;
      applyDetail();
    },
    getDetailFeedback: () => {
      if (!imageryRuntime) return imageryUnavailableReason ? { ...UNAVAILABLE_DETAIL, reason: imageryUnavailableReason, limits: ["backend"] } : UNAVAILABLE_DETAIL;
      const feedback = imageryRuntime.getFeedback();
      // Coarser than the rail asks because frames were slow: the rail says so.
      return appliedOffset < requestedOffset && !feedback.limits.includes("frame-time")
        ? { ...feedback, limits: [...feedback.limits, "frame-time"] }
        : feedback;
    },
    getImageryDiagnostics: () => ({ mode: imageryRuntime ? "atlas" : "legacy", atlas: imageryRuntime?.getDiagnostics() ?? null }),
    getDisplayedSourceId: () => imageryRuntime?.getDisplayedSourceId() ?? imagerySource.id,
    getTerrainState: () => ({
      targetPx: terrainTarget(),
      requestedTargetPx: requestedTerrainTarget(),
      selectedTiles: selection?.leaves.length ?? 0,
      neededTiles: selection?.leaves.filter(leaf => leaf.needed).length ?? 0,
      truncated: selection?.truncated ?? false,
    }),
    getAutoDetailState: () => ({
      ...autoDetail.getState(),
      terrainEnabled: terrainAuto(),
      imageryEnabled: imageryAuto() && imageryRuntime !== null,
      requestedOffset,
      offset: imageryOffset(),
    }),
    reportFrame(now, frameMs, suspended): void {
      const decision = autoDetail.observe(now, frameMs, suspended);
      if (!decision) return;
      options.onDetailAdjusted?.(decision);
      applyDetail();
    },
    sample(lat, lon) {
      if (!capture) return surfaceSampler.sample(lat, lon);
      const started = performance.now();
      const hit = surfaceSampler.sample(lat, lon);
      capture.counters.sampleCpuMs += performance.now() - started;
      return hit;
    },
    dispose(): void {
      disposed = true;
      unsubscribeSettings();
      terrain.dispose();
      imageryRuntime?.dispose();
      for (const record of cache.values()) {
        if (!record.settled) {
          record.settled = true;
          loadingCount = Math.max(0, loadingCount - 1);
        }
        disposeRecord(record);
      }
      cache.clear();
      surfaceSampler.setCoverage([]);
      lastUsedTick.clear();
      clearTimeout(retryTimer);
      retryAfter.clear();
      imageryFailures.clear();
      dirtyGeometryKeys.clear();
      meshRebuildQueue.clear();
      lastDesired = [];
      loadingCount = 0;
      loadCycleActive = false;
    },
  };
}
