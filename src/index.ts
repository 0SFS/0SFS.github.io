import "./styles/globe.css";

import { createGlobeApp } from "./app/createGlobeApp";
import type { GlobeAppHandle } from "./app/createGlobeApp";
import type { PoiSpriteSizeParams } from "./hud/poiSpriteSizeTuner";
import type { OrbitCompassScaleParams } from "./visualization/orbitCompass";
import type { RasterBaseMapSource } from "./engine/babylon/rasterBaseMaps";

export type { GlobeHandle, GlobeLayer, GlobeLayerContext, GlobeLayerState, GlobeViewState, GlobeTheme, GlobeInputModePreference, GlobeInputSensitivitySettings } from "./engine/types";
export { DEFAULT_INPUT_SENSITIVITY } from "./input/inputSettings";
export { createGlobeApp } from "./app/createGlobeApp";
export { createFlightSimApp } from "./flight/createFlightSimApp";
export { createBabylonLayer, createMeshCullable, asBabylonContext } from "./layers/types";
export { DEFAULT_RASTER_BASE_MAP_ID, RASTER_BASE_MAP_SOURCES, resolveRasterBaseMapSource } from "./engine/babylon/rasterBaseMaps";
export {
  getActiveMapSourceId,
  getGoogleApiKeyFromSearchParams,
  getMapSourcePreferenceFromSearchParams,
  resolveMapRuntimeConfig,
  setMapSourcePreference,
} from "./engine/babylon/resolveMapRuntimeConfig";
export type { RasterBaseMapProtocol, RasterBaseMapSource } from "./engine/babylon/rasterBaseMaps";
export type { BabylonLayerContext, BabylonLayerState, PoiDescriptor } from "./layers/types";
export { smoothSurfaceHeightMeters, smoothSurfaceEcef } from "./terrain/smoothElevation";
export type { PoiSpriteSizeParams } from "./hud/poiSpriteSizeTuner";
export { DEFAULT_POI_SPRITE_SIZE_PARAMS } from "./hud/poiSpriteSizeTuner";
export type { OrbitCompassScaleParams } from "./visualization/orbitCompass";
export { DEFAULT_ORBIT_COMPASS_SCALE_PARAMS } from "./visualization/orbitCompass";
export { getTheme, setTheme, toggleTheme, onThemeChange } from "./theme/theme";

// ─── Sprite POI primitives ────────────────────────────────────────────────────
export {
  type RgbColor,
  type MarkerStyle,
  DEFAULT_DOT_TEXTURE_SIZE,
  DEFAULT_SPRITE_CAPACITY,
  EARTH_RADIUS_METERS,
  rgbToCss,
  markerStyleKey,
} from "./sprites/types";
export {
  drawCircleAtlasCell,
  makeCircularMarkerAtlas,
} from "./sprites/atlas";
export {
  type CreatePointSpriteManagerOptions,
  type CreatePointSpriteOptions,
  createPointSpriteManager,
  createPointSprite,
  setSpriteOpacity,
  disposeSpriteManagers,
} from "./sprites/spriteManager";
export { currentSpriteSize } from "./sprites/spriteSize";
export {
  DEFAULT_POI_HEIGHT_REFINEMENT_MAX_ZOOM_M,
  DEFAULT_POI_HEIGHT_REFINEMENT_PROBE_UP_M,
  DEFAULT_POI_HEIGHT_REFINEMENT_PROBE_DOWN_M,
  smoothPointPosition,
  isEligiblePoiHeightMesh,
  samplePoiMeshPosition,
  poiRefinementLod,
  poiRefinementTileRadius,
  lonLatToTile,
  wrapTileX,
  makeTileKey,
  buildPoiTileIndex,
  distanceScoreMetersSq,
} from "./sprites/positioning";
export {
  type PickPointMetadataOptions,
  pickPointMetadata,
} from "./sprites/picking";

export interface GlobeOptions {
  container?: string | HTMLElement;
  apiKey?: string | null;
  baseMap?: string | RasterBaseMapSource | null;
  preferGoogleTiles?: boolean;
  getSurfaceHeightMeters?: (latDeg: number, lonDeg: number) => number | null;
  onPoiSpriteSizeChange?: (params: PoiSpriteSizeParams) => void;
  onCompassScaleChange?: (params: OrbitCompassScaleParams) => void;
}

export async function createGlobe(options: GlobeOptions = {}): Promise<GlobeAppHandle> {
  const target = options.container ?? "root";
  const rootElement = typeof target === "string" ? document.getElementById(target) : target;
  if (!rootElement) {
    throw new Error(`Expected to find a globe container for ${String(target)}.`);
  }

  return createGlobeApp(rootElement, {
    googleApiKey: options.apiKey,
    baseMap: options.baseMap,
    preferGoogleTiles: options.preferGoogleTiles,
    getSurfaceHeightMeters: options.getSurfaceHeightMeters,
    onPoiSpriteSizeChange: options.onPoiSpriteSizeChange,
    onCompassScaleChange: options.onCompassScaleChange,
  });
}