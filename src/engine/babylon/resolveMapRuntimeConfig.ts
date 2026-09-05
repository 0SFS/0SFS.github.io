import {
  DEFAULT_RASTER_BASE_MAP_ID,
  isKnownRasterBaseMapId,
  resolveRasterBaseMapSource,
  type RasterBaseMapSource,
} from "./rasterBaseMaps";

export interface MapRuntimeConfig {
  googleApiKey: string | null;
  rasterBaseMap: RasterBaseMapSource;
  preferGoogleTiles: boolean;
}

export interface ResolveMapRuntimeConfigOptions {
  googleApiKey?: string | null;
  baseMap?: string | RasterBaseMapSource | null;
  preferGoogleTiles?: boolean;
  searchParams?: URLSearchParams;
}

export function getGoogleApiKeyFromSearchParams(searchParams: URLSearchParams): string | null {
  const key = searchParams.get("key") ?? searchParams.get("googleKey");
  if (!key) return null;
  const trimmed = key.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getMapSourcePreferenceFromSearchParams(searchParams: URLSearchParams): string | null {
  const value = (searchParams.get("mapSource") ?? searchParams.get("tiles") ?? "").trim().toLowerCase();
  if (value === "google" || value === "google-3d-tiles") return "google";
  if (value === "fallback" || value === "fallback-globe") return DEFAULT_RASTER_BASE_MAP_ID;
  if (isKnownRasterBaseMapId(value)) return value;
  return null;
}

export function setMapSourcePreference(source: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("mapSource", source);
  window.location.assign(url.toString());
}

export function resolveMapRuntimeConfig(
  options: ResolveMapRuntimeConfigOptions = {},
): MapRuntimeConfig {
  const searchParams = options.searchParams ?? new URLSearchParams(window.location.search);
  const configuredBaseMap = resolveRasterBaseMapSource(options.baseMap ?? DEFAULT_RASTER_BASE_MAP_ID);
  const sourcePreference = getMapSourcePreferenceFromSearchParams(searchParams);
  const urlGoogleApiKey = options.googleApiKey ?? getGoogleApiKeyFromSearchParams(searchParams);
  const preferGoogleTiles = options.preferGoogleTiles !== false;
  const shouldUseGoogle = sourcePreference === "google"
    || (!sourcePreference && preferGoogleTiles && Boolean(urlGoogleApiKey));

  return {
    googleApiKey: shouldUseGoogle ? urlGoogleApiKey : null,
    rasterBaseMap: shouldUseGoogle
      ? configuredBaseMap
      : resolveRasterBaseMapSource(sourcePreference ?? configuredBaseMap),
    preferGoogleTiles,
  };
}

export function getActiveMapSourceId(
  status: { mode: string; rasterBaseMap: RasterBaseMapSource | null },
): string {
  if (status.mode === "google-tiles") return "google";
  return status.rasterBaseMap?.id ?? DEFAULT_RASTER_BASE_MAP_ID;
}
