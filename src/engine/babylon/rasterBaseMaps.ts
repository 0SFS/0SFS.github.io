export type RasterBaseMapProtocol = "xyz" | "arcgis-tile";

export interface RasterBaseMapSource {
  id: string;
  label: string;
  provider: string;
  protocol: RasterBaseMapProtocol;
  urlTemplate: string;
  attribution: string;
  minZoom?: number;
  maxZoom?: number;
  bounds?: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
}

export const DEFAULT_RASTER_BASE_MAP_ID = "usgs-imagery-topo";

export const RASTER_BASE_MAP_SOURCES: readonly RasterBaseMapSource[] = [
  {
    id: "usgs-imagery",
    label: "USGS Imagery",
    provider: "USGS The National Map",
    protocol: "arcgis-tile",
    urlTemplate: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}",
    attribution: "USGS The National Map",
    minZoom: 0,
    maxZoom: 16,
    bounds: { west: -180, south: -14, east: 180, north: 72 },
  },
  {
    id: "usgs-imagery-topo",
    label: "USGS Imagery Topo",
    provider: "USGS The National Map",
    protocol: "arcgis-tile",
    urlTemplate: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}",
    attribution: "USGS The National Map",
    minZoom: 0,
    maxZoom: 16,
    bounds: { west: -180, south: -14, east: 180, north: 72 },
  },
  {
    id: "usgs-topo",
    label: "USGS Topo",
    provider: "USGS The National Map",
    protocol: "arcgis-tile",
    urlTemplate: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}",
    attribution: "USGS The National Map",
    minZoom: 0,
    maxZoom: 16,
    bounds: { west: -180, south: -14, east: 180, north: 72 },
  },
  {
    id: "osm-standard",
    label: "OpenStreetMap",
    provider: "OpenStreetMap",
    protocol: "xyz",
    urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "OpenStreetMap contributors",
    minZoom: 0,
    maxZoom: 19,
  },
  {
    id: "carto-positron",
    label: "CARTO Positron",
    provider: "CARTO",
    protocol: "xyz",
    urlTemplate: "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    attribution: "OpenStreetMap contributors, CARTO",
    minZoom: 0,
    maxZoom: 20,
  },
  {
    id: "carto-dark-matter",
    label: "CARTO Dark Matter",
    provider: "CARTO",
    protocol: "xyz",
    urlTemplate: "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    attribution: "OpenStreetMap contributors, CARTO",
    minZoom: 0,
    maxZoom: 20,
  },
  {
    id: "open-topo-map",
    label: "OpenTopoMap",
    provider: "OpenTopoMap",
    protocol: "xyz",
    urlTemplate: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "OpenTopoMap, OpenStreetMap contributors",
    minZoom: 0,
    maxZoom: 17,
  },
];

const RASTER_BASE_MAP_BY_ID = new Map(RASTER_BASE_MAP_SOURCES.map((source) => [source.id, source]));

export function resolveRasterBaseMapSource(source: string | RasterBaseMapSource | null | undefined): RasterBaseMapSource {
  if (source && typeof source !== "string") {
    return source;
  }

  const sourceId = typeof source === "string" ? source : "";
  return RASTER_BASE_MAP_BY_ID.get(sourceId)
    ?? RASTER_BASE_MAP_BY_ID.get(DEFAULT_RASTER_BASE_MAP_ID)
    ?? RASTER_BASE_MAP_SOURCES[0];
}

export function isKnownRasterBaseMapId(value: string | null | undefined): boolean {
  return typeof value === "string" && RASTER_BASE_MAP_BY_ID.has(value);
}