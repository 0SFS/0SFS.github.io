import { DEFAULT_RASTER_BASE_MAP_ID, isKnownRasterBaseMapId } from "../../engine/babylon/rasterBaseMaps";
import type { UrlAliasResult } from "../registry";
import type { LegacyMigration, ParameterSpec, ParameterValue } from "../types";
import { CONTROLS_PARAMETERS, CONTROLS_TAB } from "./controls";
import { INTERFACE_PARAMETERS, INTERFACE_TAB, PERFORMANCE_HUD_METRICS, SETTINGS_TAB, TOOLBAR_BUTTONS } from "./interface";
import { MAP_AUTO_PARAMETERS } from "./auto";
import { MAP_LOADING_PARAMETERS, MAP_SELECTION_PARAMETERS, MAP_TERRAIN_SELECTION_PARAMETERS } from "./loading";
import { MAP_DETAIL_PARAMETERS, MAP_SOURCE_PARAMETERS, MAP_TAB } from "./map";
import { RENDERER_EXPERIMENT_IDS, RENDERER_EXPERIMENT_PARAMETERS, RENDERER_PARAMETERS, RENDERER_TAB } from "./renderer";
import { PANORAMA_SETTINGS_TAB, PANORAMA_TAB, SCENE_PARAMETERS, SCENE_SECTION_TITLES, SCENES_TAB } from "./scenes";

export { CONTROLS_TAB, INTERFACE_TAB, MAP_TAB, PANORAMA_SETTINGS_TAB, PANORAMA_TAB, RENDERER_TAB, SCENES_TAB, SETTINGS_TAB, PERFORMANCE_HUD_METRICS, TOOLBAR_BUTTONS };
export { TOOLBAR_EDIT_PRIORITIES_ID, TOOLBAR_PRIORITIES, toolbarPriorityParameterId } from "./interface";
export type { ToolbarItemId, ToolbarVisibility } from "./interface";
export { INPUT_RATE_IDS, INPUT_SENSITIVITY_IDS } from "./controls";
export { RENDERER_EXPERIMENT_IDS };
export { atlasLimitMiB } from "./loading";

/** Every parameter FOSS Earth owns. Hosts register theirs alongside. */
export const FOSS_EARTH_PARAMETERS: readonly ParameterSpec[] = [
  ...MAP_SOURCE_PARAMETERS,
  ...MAP_DETAIL_PARAMETERS,
  ...MAP_AUTO_PARAMETERS,
  ...MAP_LOADING_PARAMETERS,
  ...MAP_SELECTION_PARAMETERS,
  ...MAP_TERRAIN_SELECTION_PARAMETERS,
  ...RENDERER_PARAMETERS,
  ...RENDERER_EXPERIMENT_PARAMETERS,
  ...CONTROLS_PARAMETERS,
  ...INTERFACE_PARAMETERS,
  ...SCENE_PARAMETERS,
];

export const FOSS_EARTH_SECTION_TITLES: ReadonlyArray<readonly [string, string, string]> = [
  [MAP_TAB, "source", "Source"],
  [MAP_TAB, "detail", "Detail"],
  [MAP_TAB, "loading", "Loading and memory"],
  [MAP_TAB, "auto", "Automatic adjustment"],
  [MAP_TAB, "selection", "Imagery selection"],
  [MAP_TAB, "terrain-selection", "Terrain selection"],
  [RENDERER_TAB, "backend", "Renderer"],
  [RENDERER_TAB, "frame", "Resolution and frame rate"],
  [RENDERER_TAB, "lighting", "Lighting and exposure"],
  [RENDERER_TAB, "clipping", "Depth range"],
  [RENDERER_TAB, "experiments", "Work-saving experiments"],
  [CONTROLS_TAB, "input-method", "Input method"],
  [CONTROLS_TAB, "camera", "Camera"],
  [CONTROLS_TAB, "orbit", "Orbit"],
  [CONTROLS_TAB, "mouse", "Mouse and trackpad"],
  [CONTROLS_TAB, "touch", "Touch"],
  [CONTROLS_TAB, "controller", "Controller"],
  [RENDERER_TAB, "performance", "Performance debug"],
  [INTERFACE_TAB, "toolbar", "Toolbar"],
  [INTERFACE_TAB, "log", "Log"],
  [INTERFACE_TAB, "search", "Search"],
  [SETTINGS_TAB, "app-files", "App files"],
  [SETTINGS_TAB, "diagnostics", "Diagnostics"],
  ...SCENE_SECTION_TITLES,
];

function parseJson(raw: string): unknown {
  return JSON.parse(raw) as unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** The legacy map detail record: one policy per source; the catalogue keeps one per kind. */
function migrateMapDetail(raw: string): Record<string, ParameterValue> | null {
  const parsed = parseJson(raw);
  if (!isObject(parsed) || parsed.version !== 1 || !isObject(parsed.policies)) return null;
  const values: Record<string, ParameterValue> = {};
  const google = parsed.policies.google;
  if (isObject(google) && finite(google.finestErrorPx) && finite(google.coarsestErrorPx)) {
    values["map.detail.google.range"] = { min: google.finestErrorPx, max: google.coarsestErrorPx };
    const fallback = google.defaultValue;
    if (finite(fallback)) values["map.detail.google.default"] = fallback;
    else if (isObject(fallback) && (fallback.policy === "device-hints" || fallback.policy === "renderer-default")) {
      values["map.detail.google.default"] = fallback.policy;
    }
  }
  // The default basemap's policy if it was saved, otherwise the first 2D one.
  const rasterKeys = Object.keys(parsed.policies).filter(key => key.startsWith("raster:"));
  const rasterKey = rasterKeys.includes(`raster:${DEFAULT_RASTER_BASE_MAP_ID}`) ? `raster:${DEFAULT_RASTER_BASE_MAP_ID}` : rasterKeys[0];
  const raster = rasterKey ? parsed.policies[rasterKey] : null;
  if (isObject(raster) && finite(raster.coarseOffset) && finite(raster.fineOffset)) {
    values["map.detail.imagery.range"] = { min: raster.coarseOffset, max: raster.fineOffset };
    values["map.detail.imagery.default"] = finite(raster.defaultValue) ? raster.defaultValue : "normal";
  }
  return values;
}

function migrateSensitivity(raw: string, version: string | null): Record<string, ParameterValue> | null {
  const parsed = parseJson(raw);
  if (!isObject(parsed)) return null;
  const values: Record<string, ParameterValue> = {};
  for (const device of ["mouse", "trackpad", "touch"] as const) {
    const movements = parsed[device];
    if (!isObject(movements)) continue;
    for (const movement of ["pan", "orbit", "zoom"] as const) {
      const value = movements[movement];
      if (!finite(value)) continue;
      // An older record's zoom and touch rates were tuned for other controllers; they reset.
      if (version !== "1" && version !== "6" && (movement === "zoom" || device === "touch")) continue;
      values[`input.sensitivity.${device}.${movement}`] = Math.max(0.1, Math.min(10, value));
    }
  }
  return values;
}

function readStorage(key: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function booleanString(id: string) {
  return (raw: string): Record<string, ParameterValue> | null => (raw === "true" || raw === "false" ? { [id]: raw === "true" } : null);
}

export const FOSS_EARTH_MIGRATIONS: readonly LegacyMigration[] = [
  { key: "foss-earth.map-detail.v1", migrate: migrateMapDetail },
  { key: "foss-earth.theme", migrate: raw => (raw === "light" || raw === "dark" ? { "interface.theme": raw } : null) },
  {
    key: "foss-earth.hudButtons",
    migrate: raw => {
      const parsed = parseJson(raw);
      if (!isObject(parsed)) return null;
      return Object.fromEntries(TOOLBAR_BUTTONS.flatMap(([button]) => {
        const value = parsed[button];
        // The old object included every default-true button, so only false
        // expressed a change. Named choices already express the user's intent.
        if (value === false) return [[`interface.toolbar.${button}`, "off"]];
        return value === "on" || value === "auto" || value === "off" ? [[`interface.toolbar.${button}`, value]] : [];
      }));
    },
  },
  {
    key: "foss-earth.performanceMetricVisibility",
    migrate: raw => {
      const parsed = parseJson(raw);
      if (!Array.isArray(parsed)) return null;
      // Only what the user changed from the old defaults: FPS and memory.
      // Today's memory default is off, but an old explicit off still stays off.
      return Object.fromEntries(PERFORMANCE_HUD_METRICS
        .filter(([metric]) => parsed.includes(metric) !== (metric === "fps" || metric === "memory"))
        .map(([metric]) => [`interface.performanceHud.${metric}`, parsed.includes(metric) ? "on" : "off"]));
    },
  },
  { key: "foss-earth.poiSpriteTunerVisible", migrate: booleanString("interface.poiSpriteTuner") },
  { key: "foss-earth.compassScaleTunerVisible", migrate: booleanString("interface.compassScaleTuner") },
  {
    key: "foss-earth.compassHeightOffsetMeters",
    migrate: raw => {
      const value = Number(raw);
      return Number.isFinite(value) ? { "visualization.compass.heightOffset": Math.max(-1000, Math.min(1000, value)) } : null;
    },
  },
  { key: "foss-earth.globeAnchorRotation", migrate: booleanString("input.globeAnchorRotation") },
  { key: "foss-earth.inputMode", migrate: raw => (["mouse", "trackpad", "touch"].includes(raw) ? { "input.mode": raw } : null) },
  { key: "moir-park.map-input-mode", migrate: raw => (["mouse", "trackpad", "touch"].includes(raw) ? { "input.mode": raw } : null) },
  {
    key: "foss-earth.inputSensitivity",
    migrate: raw => migrateSensitivity(raw, readStorage("foss-earth.inputSensitivityVersion") ?? readStorage("moir-park.map-input-sensitivity-version")),
  },
  { key: "moir-park.map-input-sensitivity", migrate: raw => migrateSensitivity(raw, readStorage("moir-park.map-input-sensitivity-version")) },
  {
    key: "osfs.orbit-invert",
    migrate: raw => {
      const parsed = parseJson(raw);
      if (!isObject(parsed)) return null;
      return {
        "input.orbit.invertYaw": parsed.invertYaw === true,
        "input.orbit.invertPitch": parsed.invertPitch === true,
        "input.orbit.recenterMode": parsed.recenterMode === "recenter" ? "recenter" : "hold",
      };
    },
  },
  {
    key: "foss-earth.compass-scale-defaults",
    migrate: raw => {
      const parsed = parseJson(raw);
      if (!isObject(parsed)) return null;
      const values: Record<string, ParameterValue> = {};
      for (const field of ["radiusScale", "minRadius", "maxRadius", "labelSizeScale"]) {
        if (finite(parsed[field])) values[`visualization.compass.${field}`] = parsed[field];
      }
      return values;
    },
  },
  {
    key: "foss-earth.poi-sprite-size-defaults",
    migrate: raw => {
      const parsed = parseJson(raw);
      if (!isObject(parsed)) return null;
      const values: Record<string, ParameterValue> = {};
      for (const field of ["maxSize", "minSize", "minRefZoom", "maxRefZoom"]) {
        if (finite(parsed[field])) values[`visualization.poiSprite.${field}`] = parsed[field];
      }
      return values;
    },
  },
];

function mapSourceAlias(value: string): string | null {
  const lower = value.trim().toLowerCase();
  if (lower === "google" || lower === "google-3d-tiles") return "google";
  if (lower === "fallback" || lower === "fallback-globe") return DEFAULT_RASTER_BASE_MAP_ID;
  return isKnownRasterBaseMapId(lower) ? lower : null;
}

/**
 * The query names each of these parameters is read from besides
 * `?set.<id>=`. The first is the one written back to the address bar.
 */
export const FOSS_EARTH_URL_NAMES: Readonly<Record<string, readonly string[]>> = {
  "map.source.basemap": ["mapSource", "tiles"],
  "map.source.elevation": ["elevationSource", "terrainSource"],
  "map.source.googleKey": ["key", "googleKey"],
};

/** The URL parameters FOSS Earth read before the registry, mapped onto parameters for this session. */
export function fossEarthUrlAliases(params: URLSearchParams): UrlAliasResult {
  const values: Record<string, string> = {};
  const source = params.get("mapSource") ?? params.get("tiles");
  if (source !== null) {
    const id = mapSourceAlias(source);
    if (id) values["map.source.basemap"] = id;
  }
  const elevation = params.get("elevationSource") ?? params.get("terrainSource");
  if (elevation) values["map.source.elevation"] = elevation.trim().toLowerCase();
  const renderer = params.get("renderer")?.trim().toLowerCase();
  if (renderer === "webgpu" || renderer === "webgl2" || renderer === "webgl") values["renderer.backend"] = renderer;
  const imagery = params.get("rasterImagery")?.trim().toLowerCase();
  if (imagery === "atlas" || imagery === "legacy") values["map.detail.imageryPath"] = imagery;
  const key = (params.get("key") ?? params.get("googleKey"))?.trim();
  if (key) values["map.source.googleKey"] = key;
  const notes: Record<string, string> = {};
  // The retired quality profiles, as the terrain values they stand for, for this visit only.
  const quality = params.get("terrainQuality")?.trim().toLowerCase();
  const profile = quality ? TERRAIN_QUALITY_VALUES[quality] : undefined;
  if (profile) {
    Object.assign(values, profile);
    notes["map.detail.terrain.default"] = `?terrainQuality=${quality} is retired: it set terrain detail for this visit.`;
  }
  return { values, notes };
}

/**
 * `?terrainQuality`'s profiles as parameter values: the terrain error each
 * profile showed under the camera, held there (low, balanced, high), or
 * adjusted to the frame time (auto).
 */
const TERRAIN_QUALITY_VALUES: Readonly<Record<string, Record<string, string>>> = {
  low: { "map.detail.terrain.default": "8", "map.auto.terrainDetail": "false" },
  balanced: { "map.detail.terrain.default": "4", "map.auto.terrainDetail": "false" },
  high: { "map.detail.terrain.default": "2", "map.auto.terrainDetail": "false" },
  auto: { "map.auto.terrainDetail": "true" },
};
