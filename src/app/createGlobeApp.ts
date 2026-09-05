import { Matrix, Vector3 } from "@babylonjs/core";
import { createBabylonRuntime, type BabylonRuntime, type RendererMode } from "../engine/babylon/createBabylonRuntime";
import {
  DEFAULT_RASTER_BASE_MAP_ID,
  RASTER_BASE_MAP_SOURCES,
  resolveRasterBaseMapSource,
  type RasterBaseMapSource,
} from "../engine/babylon/rasterBaseMaps";
import {
  resolveMapRuntimeConfig,
  setMapSourcePreference,
} from "../engine/babylon/resolveMapRuntimeConfig";
import type {
  GlobeHandle,
  GlobeLayerContext,
  GlobeViewState,
} from "../engine/types";
import { getTheme, setTheme, onThemeChange, toggleTheme } from "../theme/theme";
import { createPoiTracking } from "../layers/poiTracking";
import { createLayerRegistry } from "../layers/layerRegistry";
import { MAX_PITCH_DEG } from "../camera/cameraState";
import { createStatusHud, type StatusHudHandle } from "../hud/statusHud";
import { createNorthButton, type NorthButtonHandle } from "../hud/northButton";
import { createHelpModal, type HelpModalHandle } from "../hud/helpModal";
import { createSettingsModal, type SettingsModalHandle } from "../hud/settingsModal";
import { createOrbitCompass, type OrbitCompassHandle } from "../visualization/orbitCompass";
import { createHemisphereCulling } from "../perf/culling";
import { createPerformanceMetrics, type PerformanceSnapshot } from "../perf/metrics";
import { createAnchorHeightResolver } from "../terrain/anchorHeight";
import { smoothSurfaceHeightMeters } from "../terrain/smoothElevation";
import { createPoiSpriteSizeTuner } from "../hud/poiSpriteSizeTuner";
import { createCompassScaleTuner } from "../hud/compassScaleTuner";
import type { PoiSpriteSizeParams } from "../hud/poiSpriteSizeTuner";
import type { OrbitCompassScaleParams } from "../visualization/orbitCompass";

export interface GlobeAppHandle extends GlobeHandle {
  runtime: BabylonRuntime;
}

export interface GlobeAppOptions {
  googleApiKey?: string | null;
  baseMap?: string | RasterBaseMapSource | null;
  preferGoogleTiles?: boolean;
  getSurfaceHeightMeters?: (latDeg: number, lonDeg: number) => number | null;
  onPoiSpriteSizeChange?: (params: PoiSpriteSizeParams) => void;
  onCompassScaleChange?: (params: OrbitCompassScaleParams) => void;
}

const COMPASS_HEIGHT_OFFSET_METERS = 0;
/** Pixel offset from the projected sphere centre to the top-right exit button. */
const POI_EXIT_BTN_OFFSET_PX = 22;
const BUILD_TIME = __BUILD_TIME__;
const SOURCE_VERSION = __SOURCE_VERSION__;
const REPOSITORY_SLUG = __REPOSITORY_SLUG__;
const PERFORMANCE_METRIC_VISIBILITY_STORAGE_KEY = "foss-earth.performanceMetricVisibility";
const COMPASS_HEIGHT_STORAGE_KEY = "foss-earth.compassHeightOffsetMeters";
const POI_SPRITE_TUNER_VISIBLE_STORAGE_KEY = "foss-earth.poiSpriteTunerVisible";
const COMPASS_SCALE_TUNER_VISIBLE_STORAGE_KEY = "foss-earth.compassScaleTunerVisible";

type PerformanceMetricId = "fps" | "frame" | "p95" | "activeMeshes" | "drawCalls" | "tiles" | "culling" | "memory";

interface PerformanceMetricDefinition {
  id: PerformanceMetricId;
  settingsLabel: string;
  tooltip: string;
  defaultVisible: boolean;
  format(snapshot: PerformanceSnapshot): string | null;
}

const PERFORMANCE_METRIC_DEFINITIONS: readonly PerformanceMetricDefinition[] = [
  {
    id: "fps",
    settingsLabel: "FPS",
    tooltip: "Frames per second rendered by the map.",
    defaultVisible: true,
    format: (snapshot) => `${Math.round(snapshot.fps)}fps`,
  },
  {
    id: "frame",
    settingsLabel: "Frame time",
    tooltip: "Average time spent rendering each frame.",
    defaultVisible: false,
    format: (snapshot) => `${snapshot.frameMs.toFixed(1)}ms`,
  },
  {
    id: "p95",
    settingsLabel: "P95 frame time",
    tooltip: "95th percentile frame time over the recent sample window.",
    defaultVisible: false,
    format: (snapshot) => `p95 ${snapshot.p95FrameMs.toFixed(1)}ms`,
  },
  {
    id: "activeMeshes",
    settingsLabel: "Active meshes (#⬟)",
    tooltip: "Babylon meshes currently active in the scene.",
    defaultVisible: false,
    format: (snapshot) => `${snapshot.activeMeshes}⬟`,
  },
  {
    id: "drawCalls",
    settingsLabel: "Draw calls",
    tooltip: "GPU draw calls submitted for the current frame when the renderer exposes them.",
    defaultVisible: false,
    format: (snapshot) => snapshot.drawCalls === null ? null : `d${snapshot.drawCalls}`,
  },
  {
    id: "tiles",
    settingsLabel: "Map tiles (#/#t)",
    tooltip: "Visible map tiles over active map tiles managed by the tile runtime.",
    defaultVisible: false,
    format: (snapshot) => snapshot.tiles ? `${snapshot.tiles.visibleTiles}/${snapshot.tiles.activeTiles}t` : null,
  },
  {
    id: "culling",
    settingsLabel: "Culling",
    tooltip: "Visible tracked objects over total tracked objects after hemisphere culling.",
    defaultVisible: false,
    format: (snapshot) => snapshot.culling.total > 0 ? `c${snapshot.culling.visible}/${snapshot.culling.total}` : null,
  },
  {
    id: "memory",
    settingsLabel: "Memory",
    tooltip: "Approximate JavaScript heap memory currently used by the page.",
    defaultVisible: true,
    format: (snapshot) => snapshot.memoryMb === null ? null : `${Math.round(snapshot.memoryMb)}MB`,
  },
];

const PERFORMANCE_METRIC_IDS = new Set<PerformanceMetricId>(PERFORMANCE_METRIC_DEFINITIONS.map((metric) => metric.id));

function getLoadedBundleName(): string {
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"));
  const bundle = scripts
    .map((script) => script.src)
    .map((src) => new URL(src, window.location.href).pathname.split("/").pop() ?? "")
    .find((name) => /^index-[\w-]+\.js$/.test(name));

  return bundle ?? "dev";
}

async function getCurrentDeploySha(): Promise<string | null> {
  if (!REPOSITORY_SLUG) {
    return null;
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${REPOSITORY_SLUG}/git/ref/heads/gh-pages`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    const payload = await response.json() as { object?: { sha?: unknown } };
    return typeof payload.object?.sha === "string" ? payload.object.sha : null;
  } catch {
    return null;
  }
}

function hydrateDeployShaLine(line: HTMLElement | null): void {
  if (!line) {
    return;
  }

  void getCurrentDeploySha().then((sha) => {
    line.textContent = sha ? `Deploy: ${sha.slice(0, 12)}` : "Deploy: unavailable";
  });
}

function getRendererForceFromUrl(): RendererMode | null {
  const v = new URLSearchParams(window.location.search).get("renderer")?.toLowerCase() ?? "";
  if (v === "webgpu") return "webgpu";
  if (v === "webgl2") return "webgl2";
  if (v === "webgl") return "webgl";
  return null;
}

function setRendererForce(force: RendererMode | null): void {
  const url = new URL(window.location.href);
  if (force) url.searchParams.set("renderer", force);
  else url.searchParams.delete("renderer");
  window.location.assign(url.toString());
}

function getRendererApiLabel(mode: RendererMode): string {
  if (mode === "webgpu") return "WebGPU";
  if (mode === "webgl2") return "WebGL2";
  return "WebGL";
}

function getPerformanceMetricSettingsMarkup(): string {
  return PERFORMANCE_METRIC_DEFINITIONS.map((metric) => `
            <label class="settings-checkbox" title="${metric.tooltip}">
              <input type="checkbox" data-perf-metric="${metric.id}" ${metric.defaultVisible ? "checked" : ""}>
              <span>${metric.settingsLabel}</span>
            </label>`).join("");
}

function getDefaultVisiblePerformanceMetrics(): Set<PerformanceMetricId> {
  return new Set(PERFORMANCE_METRIC_DEFINITIONS
    .filter((metric) => metric.defaultVisible)
    .map((metric) => metric.id));
}

function isPerformanceMetricId(value: string | undefined): value is PerformanceMetricId {
  return value !== undefined && PERFORMANCE_METRIC_IDS.has(value as PerformanceMetricId);
}

function loadPerformanceMetricVisibility(): Set<PerformanceMetricId> {
  try {
    const raw = window.localStorage.getItem(PERFORMANCE_METRIC_VISIBILITY_STORAGE_KEY);
    if (!raw) return getDefaultVisiblePerformanceMetrics();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return getDefaultVisiblePerformanceMetrics();

    const visible = new Set<PerformanceMetricId>();
    for (const value of parsed) {
      if (typeof value === "string" && isPerformanceMetricId(value)) {
        visible.add(value);
      }
    }
    return visible;
  } catch {
    return getDefaultVisiblePerformanceMetrics();
  }
}

function savePerformanceMetricVisibility(visibleMetrics: ReadonlySet<PerformanceMetricId>): void {
  try {
    const metricIds = PERFORMANCE_METRIC_DEFINITIONS
      .filter((metric) => visibleMetrics.has(metric.id))
      .map((metric) => metric.id);
    window.localStorage.setItem(PERFORMANCE_METRIC_VISIBILITY_STORAGE_KEY, JSON.stringify(metricIds));
  } catch {
    // Ignore private-mode or restricted-storage failures; visibility still works for this session.
  }
}

function loadCompassHeightOffset(): number {
  try {
    const raw = window.localStorage.getItem(COMPASS_HEIGHT_STORAGE_KEY);
    if (raw === null) return COMPASS_HEIGHT_OFFSET_METERS;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.max(-1000, Math.min(1000, parsed)) : COMPASS_HEIGHT_OFFSET_METERS;
  } catch {
    return COMPASS_HEIGHT_OFFSET_METERS;
  }
}

function syncPerformanceMetricInputs(element: HTMLElement | null, visibleMetrics: ReadonlySet<PerformanceMetricId>): void {
  element?.querySelectorAll<HTMLInputElement>("[data-perf-metric]").forEach((input) => {
    input.checked = isPerformanceMetricId(input.dataset.perfMetric) && visibleMetrics.has(input.dataset.perfMetric);
  });
}

function renderPerformanceChips(
  element: HTMLElement,
  snapshot: PerformanceSnapshot,
  visibleMetrics: ReadonlySet<PerformanceMetricId>,
): void {
  const chips = PERFORMANCE_METRIC_DEFINITIONS.flatMap((metric) => {
    if (!visibleMetrics.has(metric.id)) return [];
    const value = metric.format(snapshot);
    if (value === null) return [];

    const chip = document.createElement("span");
    chip.className = "hud-chip perf-chip";
    chip.dataset.perfMetric = metric.id;
    chip.title = metric.tooltip;
    chip.setAttribute("aria-label", `${metric.settingsLabel}: ${value}`);
    chip.textContent = value;
    return chip;
  });

  element.replaceChildren(...chips);
}

function getFallbackNoticeMessage(status: BabylonRuntime["status"]): string {
  if (!status.googleApiKeyProvided) {
    return "Fallback mode active because no Google Maps API key was provided. Append ?key=YOUR_GOOGLE_MAPS_API_KEY to the URL to enable Google Photorealistic 3D Tiles.";
  }

  if (status.lastError) {
    return `Fallback mode active because Google 3D tiles failed: ${status.lastError} Verify the key is valid, the Maps Tiles API is enabled, and localhost is allowed in key restrictions.`;
  }

  return "Fallback mode active.";
}

function getGoogleWarningMessage(status: BabylonRuntime["status"]): string {
  if (status.lastError) {
    return `Google tiles reported an error: ${status.lastError}`;
  }

  return "Google mode is active, but tiles may still be loading.";
}

function getRasterWarningMessage(status: BabylonRuntime["status"]): string {
  const source = status.rasterBaseMap;
  if (status.lastError) {
    return `${source?.label ?? "Raster basemap"} is active, but some tiles failed to load: ${status.lastError}`;
  }

  return `${source?.label ?? "Raster basemap"} is active. Attribution: ${source?.attribution ?? "see provider terms"}.`;
}

export async function createGlobeApp(
  rootElement: HTMLElement,
  options: GlobeAppOptions = {},
): Promise<GlobeAppHandle> {
  rootElement.innerHTML = `
    <div class="globe-shell">
      <canvas id="globeCanvas" class="globe-canvas" aria-label="3D globe canvas"></canvas>

      <div class="hud-bar" aria-label="Map indicators">
        <button id="northButton" class="hud-circle-button north-button" type="button"
          title="Reset to north-up" aria-label="Reset camera to north-up">
          <svg id="northButtonSvg" viewBox="0 0 36 36" width="28" height="28" aria-hidden="true">
            <polygon points="18,5 14,14 22,14" fill="#ef4444"/>
            <text x="18" y="27" text-anchor="middle"
              fill="rgba(255,255,255,0.82)"
              font-family="system-ui,-apple-system,sans-serif"
              font-weight="700" font-size="13">N</text>
          </svg>
        </button>
        <button id="helpButton" class="hud-circle-button" type="button"
          title="Controls help" aria-label="Controls help">?</button>
        <button id="settingsButton" class="hud-circle-button settings-button" type="button"
          title="Settings" aria-label="Settings">&#9881;</button>
        <button id="themeButton" class="hud-circle-button theme-button" type="button"
          title="Toggle theme" aria-label="Toggle theme">
          <span class="theme-button-icon" aria-hidden="true">\u263E</span>
        </button>
        <div class="renderer-control">
          <button id="rendererModePill" class="hud-chip hud-chip-button hud-chip--gpu" type="button"
            aria-haspopup="menu" aria-expanded="false" aria-controls="rendererMenu"
            title="GPU renderer API. Click to change.">GPU</button>
          <div id="rendererMenu" class="renderer-menu" role="menu" hidden>
            <button class="renderer-option" type="button" role="menuitem" data-renderer="">Auto-detect</button>
            <button class="renderer-option" type="button" role="menuitem" data-renderer="webgpu">Force WebGPU</button>
            <button class="renderer-option" type="button" role="menuitem" data-renderer="webgl2">Force WebGL2</button>
            <button class="renderer-option" type="button" role="menuitem" data-renderer="webgl">Force WebGL</button>
          </div>
        </div>
        <div class="map-source-control">
          <button id="runtimeModePill" class="hud-chip hud-chip-button hud-chip--source" type="button"
            aria-haspopup="menu" aria-expanded="false" aria-controls="mapSourceMenu"
            title="Map data source. Click to switch between Google 3D Tiles and free raster basemaps.">Map Source</button>
          <div id="mapSourceMenu" class="map-source-menu" role="menu" hidden>
            <button class="map-source-option" type="button" role="menuitem" data-map-source="google">Google 3D Tiles</button>
            ${RASTER_BASE_MAP_SOURCES.map((source) => `<button class="map-source-option" type="button" role="menuitem" data-map-source="${source.id}">${source.label}</button>`).join("")}
          </div>
        </div>
        <span id="perfMetricsPill" class="hud-chip-group perf-chip-group" aria-label="Performance metrics"></span>
        <span id="hudStatus" class="hud-chip hud-status-text" aria-live="polite" aria-label="Camera status"
          title="Camera status: latitude, longitude, heading, pitch, and zoom distance."></span>
      </div>

      <div id="runtimeNotice" class="runtime-notice" hidden>
        <strong id="runtimeNoticeTitle" class="runtime-notice-title"></strong>
        <p id="runtimeNoticeText" class="runtime-notice-text"></p>
        <button id="runtimeNoticeDismiss" class="runtime-notice-dismiss" type="button">Dismiss</button>
      </div>

      <div id="helpModal" class="modal-overlay" hidden aria-modal="true" role="dialog"
        aria-labelledby="helpModalTitle">
        <div class="modal-card">
          <h2 id="helpModalTitle" class="modal-title">Controls</h2>
          <div class="help-axes">
            <div class="help-axis">
              <div class="help-axis-title">Pan</div>
              <div class="help-axis-triggers">
                <span class="help-trigger">Left drag</span>
                <span class="help-trigger">2-finger swipe</span>
                <span class="help-trigger">1-finger <small>(mobile)</small></span>
              </div>
              <div class="help-axis-note">Changes Lat\u202F/\u202FLon</div>
            </div>
            <div class="help-axis">
              <div class="help-axis-title">Orbit</div>
              <div class="help-axis-triggers">
                <span class="help-trigger">Right drag</span>
                <span class="help-trigger">\u21E7\u202F+\u202F2-finger swipe</span>
                <span class="help-trigger">2-finger <small>(mobile)</small></span>
              </div>
              <div class="help-axis-note">Changes Heading\u202F/\u202FPitch</div>
            </div>
          </div>
          <p class="help-zoom">Zoom \u2014 Scroll wheel\u00B7Pinch</p>
          <button id="helpModalDismiss" class="modal-dismiss" type="button">Got it</button>
        </div>
      </div>

      <div id="settingsModal" class="modal-overlay" hidden aria-modal="true" role="dialog"
        aria-labelledby="settingsModalTitle">
        <div class="modal-card">
          <h2 id="settingsModalTitle" class="modal-title">Settings</h2>
          <p class="settings-line">Camera model: state-driven orbit geometry.</p>
          <p class="settings-line">Pitch: 0\u00B0\u202F=\u202Fhorizon, 90\u00B0\u202F=\u202Fstraight down.</p>
          <p id="settingsRendererLine" class="settings-renderer-line"></p>
          <div id="settingsPerformanceMetrics" class="settings-metric-menu" aria-label="Performance HUD visibility">
            <div class="settings-section-title">Performance HUD</div>${getPerformanceMetricSettingsMarkup()}
          </div>
          <div class="settings-metric-menu">
            <div class="settings-section-title">Extra Panels</div>
            <label class="settings-checkbox" title="Show the POI sprite size tuner panel at the bottom-right of the map.">
              <input type="checkbox" id="poiSpriteTunerToggle">
              <span>POI sprite size tuner</span>
            </label>
            <label class="settings-checkbox" title="Show the compass scale tuner panel at the bottom-right of the map.">
              <input type="checkbox" id="compassScaleTunerToggle">
              <span>Compass scale tuner</span>
            </label>
          </div>
          <div class="settings-metric-menu">
            <div class="settings-section-title">Camera</div>
            <label class="settings-checkbox settings-slider-row" style="grid-column:1/-1;flex-direction:column;align-items:stretch;gap:4px">
              <span style="display:flex;justify-content:space-between">
                <span>Compass orbit height</span>
                <span id="compassHeightValue"></span>
              </span>
              <input id="compassHeightSlider" type="range" min="-1000" max="1000" step="10"
                style="width:100%;accent-color:#60a5fa;cursor:pointer">
            </label>
          </div>
          <p id="settingsBuildLine" class="settings-line">Build: ${BUILD_TIME}</p>
           <p id="settingsSourceLine" class="settings-line">Source: ${SOURCE_VERSION}</p>
           <p id="settingsBundleLine" class="settings-line">Bundle: ${getLoadedBundleName()}</p>
           <p id="settingsDeployLine" class="settings-line">Deploy: loading</p>
          <button id="settingsModalDismiss" class="modal-dismiss" type="button">Close</button>
        </div>
      </div>

      <button id="poiExitBtn" class="poi-exit-btn" hidden
        type="button" aria-label="Exit point of interest view">&#x2715;</button>

      <div id="extraPanelsGrid" class="extra-panels-grid"></div>
    </div>
  `;

  const canvas = rootElement.querySelector<HTMLCanvasElement>("#globeCanvas");
  if (!canvas) {
    throw new Error('Expected to find a canvas element with id "globeCanvas".');
  }

  const rendererModePill = rootElement.querySelector<HTMLButtonElement>("#rendererModePill");
  const rendererMenu = rootElement.querySelector<HTMLElement>("#rendererMenu");
  const runtimeModePill = rootElement.querySelector<HTMLButtonElement>("#runtimeModePill");
  const mapSourceMenu = rootElement.querySelector<HTMLElement>("#mapSourceMenu");
  const perfMetricsPill = rootElement.querySelector<HTMLElement>("#perfMetricsPill");
  const runtimeNotice = rootElement.querySelector<HTMLElement>("#runtimeNotice");
  const runtimeNoticeTitle = rootElement.querySelector<HTMLElement>("#runtimeNoticeTitle");
  const runtimeNoticeText = rootElement.querySelector<HTMLElement>("#runtimeNoticeText");
  const runtimeNoticeDismiss = rootElement.querySelector<HTMLButtonElement>("#runtimeNoticeDismiss");
  const settingsDeployLine = rootElement.querySelector<HTMLElement>("#settingsDeployLine");
  hydrateDeployShaLine(settingsDeployLine);

  let runtimeNoticeDismissed = false;
  const configuredBaseMap = resolveRasterBaseMapSource(options.baseMap ?? DEFAULT_RASTER_BASE_MAP_ID);

  const applyRuntimeStatus = (status: BabylonRuntime["status"]): void => {
    if (runtimeModePill) {
      const hasWarning = Boolean(status.lastError);
      if (status.mode === "google-tiles") {
        runtimeModePill.textContent = hasWarning ? "Google 3D Tiles warning" : "Google 3D Tiles";
      } else if (status.mode === "raster-basemap") {
        runtimeModePill.textContent = hasWarning
          ? `${status.rasterBaseMap?.label ?? "Raster"} warning`
          : status.rasterBaseMap?.label ?? "Raster Basemap";
      } else {
        runtimeModePill.textContent = "Fallback Globe";
      }

      runtimeModePill.classList.toggle("hud-chip--fallback", status.mode === "fallback");
      runtimeModePill.classList.toggle("hud-chip--raster", status.mode === "raster-basemap");
    }

    if (!runtimeNotice || !runtimeNoticeTitle || !runtimeNoticeText) {
      return;
    }

    if (runtimeNoticeDismissed) {
      runtimeNotice.hidden = true;
      return;
    }

    if (status.mode === "fallback") {
      runtimeNotice.hidden = false;
      runtimeNoticeTitle.textContent = "Fallback Mode";
      runtimeNoticeText.textContent = getFallbackNoticeMessage(status);
      return;
    }

    if (status.mode === "raster-basemap") {
      if (!status.lastError) {
        runtimeNotice.hidden = true;
        return;
      }
      runtimeNotice.hidden = false;
      runtimeNoticeTitle.textContent = "Raster Basemap Warning";
      runtimeNoticeText.textContent = getRasterWarningMessage(status);
      return;
    }

    if (status.lastError) {
      runtimeNotice.hidden = false;
      runtimeNoticeTitle.textContent = "Google Tiles Warning";
      runtimeNoticeText.textContent = getGoogleWarningMessage(status);
      return;
    }

    runtimeNotice.hidden = true;
  };

  runtimeNoticeDismiss?.addEventListener("click", () => {
    runtimeNoticeDismissed = true;
    if (runtimeNotice) {
      runtimeNotice.hidden = true;
    }
  });

  const mapConfig = resolveMapRuntimeConfig({
    googleApiKey: options.googleApiKey,
    baseMap: options.baseMap,
    preferGoogleTiles: options.preferGoogleTiles,
  });
  const googleApiKey = mapConfig.googleApiKey;
  const rasterBaseMap = mapConfig.rasterBaseMap;
  const rendererForce = getRendererForceFromUrl();

  const runtime = await createBabylonRuntime(canvas, {
    googleApiKey,
    rasterBaseMap,
    getSurfaceHeightMeters: options.getSurfaceHeightMeters,
    rendererForce,
    onStatusChange: applyRuntimeStatus,
  });
  const layerContext: GlobeLayerContext = {
    scene: runtime.scene,
    engine: runtime.engine,
  };
  const poiTracking = createPoiTracking(runtime.scene, () => runtime.geospatialCamera);
  const culling = createHemisphereCulling(() => runtime.geospatialCamera?.globalPosition ?? null);
  const resolveSurfaceHeightMeters = (latDeg: number, lonDeg: number): number => (
    options.getSurfaceHeightMeters?.(latDeg, lonDeg) ?? smoothSurfaceHeightMeters(latDeg, lonDeg)
  );
  const anchorHeights = createAnchorHeightResolver({
    provider: resolveSurfaceHeightMeters,
    heightOffsetMeters: loadCompassHeightOffset(),
  });
  runtime.configureOrbitTargetHeight({
    resolveSurfaceHeightMeters: anchorHeights.resolveHeight,
    initialOffsetMeters: loadCompassHeightOffset(),
  });
  const registry = createLayerRegistry(layerContext, poiTracking, culling, anchorHeights);
  // Layer add/remove mutates scene contents (meshes, sprites); wrap so the
  // change becomes visible on the next animation frame in render-on-demand mode.
  const addLayer: typeof registry.addLayer = (layer) => {
    registry.addLayer(layer);
    runtime.requestRender();
  };
  const removeLayer: typeof registry.removeLayer = (layerId) => {
    registry.removeLayer(layerId);
    runtime.requestRender();
  };
  const orbitCompass: OrbitCompassHandle = createOrbitCompass(runtime.scene);
  const performanceMetrics = createPerformanceMetrics({
    engine: runtime.engine,
    scene: runtime.scene,
    getTileMetrics: () => runtime.getTileMetrics(),
    getCullingStats: () => culling.getStats(),
  });

  if (rendererModePill) {
    const rendererLabel = getRendererApiLabel(runtime.renderer.mode);
    const forceFailed =
      runtime.renderer.requested !== "auto" && runtime.renderer.requested !== runtime.renderer.mode;
    rendererModePill.textContent = forceFailed ? `${rendererLabel}*` : rendererLabel;
    rendererModePill.classList.toggle("hud-chip--good", runtime.renderer.mode === "webgpu");
    rendererModePill.classList.toggle("hud-chip--bad", runtime.renderer.mode !== "webgpu");
  }
  // Mark the active option in the renderer menu
  rendererMenu?.querySelectorAll<HTMLElement>("[data-renderer]").forEach((btn) => {
    btn.classList.toggle("is-active", (btn.dataset.renderer ?? "") === (rendererForce ?? ""));
  });
  // Inject diagnostics block into the renderer menu when a forced renderer fell back
  if (rendererMenu && runtime.renderer.diagnostics) {
    const d = runtime.renderer.diagnostics;
    const lines: string[] = [
      `Secure context: ${d.isSecureContext ? "✓ yes" : "✗ no — WebGPU requires HTTPS"}`,
      `navigator.gpu: ${d.navigatorGpuPresent ? "✓ present" : "✗ missing"}`,
      d.isSupportedAsyncResult !== null
        ? `IsSupportedAsync: ${d.isSupportedAsyncResult}`
        : null,
      runtime.renderer.fallbackReason ? `Error: ${runtime.renderer.fallbackReason}` : null,
    ].filter((l): l is string => l !== null);
    if (lines.length) {
      const hr = document.createElement("div");
      hr.className = "renderer-debug-sep";
      rendererMenu.appendChild(hr);
      const dbg = document.createElement("div");
      dbg.className = "renderer-debug";
      dbg.textContent = lines.join("\n");
      rendererMenu.appendChild(dbg);
    }
  }

  mapSourceMenu?.querySelectorAll<HTMLElement>("[data-map-source]").forEach((btn) => {
    const value = btn.dataset.mapSource ?? "";
    const isActive = runtime.status.mode === "google-tiles"
      ? value === "google"
      : value === (runtime.status.rasterBaseMap?.id ?? configuredBaseMap.id);
    btn.classList.toggle("is-active", isActive);
  });

  applyRuntimeStatus(runtime.status);

  // ── HUD setup ────────────────────────────────────────────────────
  const hudStatusEl = rootElement.querySelector<HTMLElement>("#hudStatus");
  const northBtnEl = rootElement.querySelector<HTMLButtonElement>("#northButton");
  const northBtnSvgEl = rootElement.querySelector<SVGElement>("#northButtonSvg");
  const helpBtnEl = rootElement.querySelector<HTMLButtonElement>("#helpButton");
  const helpModalEl = rootElement.querySelector<HTMLElement>("#helpModal");
  const settingsBtnEl = rootElement.querySelector<HTMLButtonElement>("#settingsButton");
  const themeBtnEl = rootElement.querySelector<HTMLButtonElement>("#themeButton");
  const themeBtnIconEl = themeBtnEl?.querySelector<HTMLElement>(".theme-button-icon") ?? null;
  const settingsModalEl = rootElement.querySelector<HTMLElement>("#settingsModal");
  const settingsPerformanceMetricsEl = rootElement.querySelector<HTMLElement>("#settingsPerformanceMetrics");
  const compassHeightSliderEl = rootElement.querySelector<HTMLInputElement>("#compassHeightSlider");
  const compassHeightValueEl = rootElement.querySelector<HTMLElement>("#compassHeightValue");
  const poiExitBtnEl = rootElement.querySelector<HTMLButtonElement>("#poiExitBtn");
  const extraPanelsGridEl = rootElement.querySelector<HTMLElement>("#extraPanelsGrid");
  const poiSpriteTunerToggleEl = rootElement.querySelector<HTMLInputElement>("#poiSpriteTunerToggle");
  const compassScaleTunerToggleEl = rootElement.querySelector<HTMLInputElement>("#compassScaleTunerToggle");

  const statusHud: StatusHudHandle | null = hudStatusEl ? createStatusHud(hudStatusEl) : null;
  const northButton: NorthButtonHandle | null = northBtnSvgEl ? createNorthButton(northBtnSvgEl) : null;
  const helpModal: HelpModalHandle | null = helpModalEl ? createHelpModal(helpModalEl) : null;
  const settingsModal: SettingsModalHandle | null = settingsModalEl ? createSettingsModal(settingsModalEl) : null;

  settingsModal?.setRendererMode(getRendererApiLabel(runtime.renderer.mode));

  let visiblePerformanceMetrics = loadPerformanceMetricVisibility();
  let lastPerfSnapshot: PerformanceSnapshot | null = null;
  syncPerformanceMetricInputs(settingsPerformanceMetricsEl, visiblePerformanceMetrics);

  if (compassHeightSliderEl) {
    const storedHeight = loadCompassHeightOffset();
    compassHeightSliderEl.value = String(storedHeight);
    if (compassHeightValueEl) compassHeightValueEl.textContent = `${storedHeight}m`;
  }

  // ── POI sprite size tuner ─────────────────────────────────────
  function loadPoiSpriteTunerVisible(): boolean {
    try {
      return window.localStorage.getItem(POI_SPRITE_TUNER_VISIBLE_STORAGE_KEY) === "true";
    } catch { return false; }
  }
  function savePoiSpriteTunerVisible(visible: boolean): void {
    try { window.localStorage.setItem(POI_SPRITE_TUNER_VISIBLE_STORAGE_KEY, String(visible)); } catch { /* ignore */ }
  }
  let poiSpriteTunerVisible = loadPoiSpriteTunerVisible();
  const spriteTuner = extraPanelsGridEl
    ? createPoiSpriteSizeTuner(extraPanelsGridEl, (params) => {
        options.onPoiSpriteSizeChange?.(params);
        runtime.requestRender();
      })
    : null;
  if (poiSpriteTunerVisible) spriteTuner?.show(); else spriteTuner?.hide();
  if (poiSpriteTunerToggleEl) poiSpriteTunerToggleEl.checked = poiSpriteTunerVisible;

  const onPoiSpriteTunerToggleChange = (): void => {
    if (!poiSpriteTunerToggleEl) return;
    poiSpriteTunerVisible = poiSpriteTunerToggleEl.checked;
    savePoiSpriteTunerVisible(poiSpriteTunerVisible);
    if (poiSpriteTunerVisible) spriteTuner?.show(); else spriteTuner?.hide();
  };
  poiSpriteTunerToggleEl?.addEventListener("change", onPoiSpriteTunerToggleChange);

  // ── Compass scale tuner ───────────────────────────────────────
  function loadCompassScaleTunerVisible(): boolean {
    try {
      return window.localStorage.getItem(COMPASS_SCALE_TUNER_VISIBLE_STORAGE_KEY) === "true";
    } catch { return false; }
  }
  function saveCompassScaleTunerVisible(visible: boolean): void {
    try { window.localStorage.setItem(COMPASS_SCALE_TUNER_VISIBLE_STORAGE_KEY, String(visible)); } catch { /* ignore */ }
  }
  let compassScaleTunerVisible = loadCompassScaleTunerVisible();
  const compassScaleTuner = extraPanelsGridEl
    ? createCompassScaleTuner(extraPanelsGridEl, (params) => {
        orbitCompass.setScaleParams(params);
        options.onCompassScaleChange?.(params);
        runtime.requestRender();
      })
    : null;
  if (compassScaleTunerVisible) compassScaleTuner?.show(); else compassScaleTuner?.hide();
  if (compassScaleTunerToggleEl) compassScaleTunerToggleEl.checked = compassScaleTunerVisible;

  const onCompassScaleTunerToggleChange = (): void => {
    if (!compassScaleTunerToggleEl) return;
    compassScaleTunerVisible = compassScaleTunerToggleEl.checked;
    saveCompassScaleTunerVisible(compassScaleTunerVisible);
    if (compassScaleTunerVisible) compassScaleTuner?.show(); else compassScaleTuner?.hide();
  };
  compassScaleTunerToggleEl?.addEventListener("change", onCompassScaleTunerToggleChange);

  function setMapSourceMenuOpen(open: boolean): void {
    if (!mapSourceMenu || !runtimeModePill) return;
    mapSourceMenu.hidden = !open;
    runtimeModePill.setAttribute("aria-expanded", String(open));
  }

  const onMapSourceClick = (e: MouseEvent): void => {
    e.stopPropagation();
    setMapSourceMenuOpen(Boolean(mapSourceMenu?.hidden));
  };
  const onMapSourceMenuClick = (e: MouseEvent): void => {
    const option = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-map-source]");
    if (!option) return;
    const selected = option.dataset.mapSource ?? DEFAULT_RASTER_BASE_MAP_ID;
    const current = runtime.status.mode === "google-tiles"
      ? "google"
      : runtime.status.rasterBaseMap?.id ?? DEFAULT_RASTER_BASE_MAP_ID;
    setMapSourceMenuOpen(false);
    if (selected !== current) {
      setMapSourcePreference(selected);
    }
  };
  function setRendererMenuOpen(open: boolean): void {
    if (!rendererMenu || !rendererModePill) return;
    rendererMenu.hidden = !open;
    rendererModePill.setAttribute("aria-expanded", String(open));
  }
  const onRendererPillClick = (e: MouseEvent): void => {
    e.stopPropagation();
    setRendererMenuOpen(Boolean(rendererMenu?.hidden));
    setMapSourceMenuOpen(false);
  };
  const onRendererMenuClick = (e: MouseEvent): void => {
    const option = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-renderer]");
    if (!option) return;
    const val = option.dataset.renderer ?? "";
    const force: RendererMode | null = (val === "webgpu" || val === "webgl2" || val === "webgl") ? val : null;
    setRendererMenuOpen(false);
    setRendererForce(force);
  };
  const onDocumentPointerDown = (e: PointerEvent): void => {
    if (mapSourceMenu && !mapSourceMenu.hidden) {
      if (!runtimeModePill?.contains(e.target as Node) && !mapSourceMenu.contains(e.target as Node))
        setMapSourceMenuOpen(false);
    }
    if (rendererMenu && !rendererMenu.hidden) {
      if (!rendererModePill?.contains(e.target as Node) && !rendererMenu.contains(e.target as Node))
        setRendererMenuOpen(false);
    }
  };
  const onPerformanceMetricChange = (e: Event): void => {
    const input = (e.target as HTMLElement).closest<HTMLInputElement>("[data-perf-metric]");
    if (!input || !isPerformanceMetricId(input.dataset.perfMetric)) return;

    const nextVisibleMetrics = new Set(visiblePerformanceMetrics);
    if (input.checked) {
      nextVisibleMetrics.add(input.dataset.perfMetric);
    } else {
      nextVisibleMetrics.delete(input.dataset.perfMetric);
    }

    visiblePerformanceMetrics = nextVisibleMetrics;
    savePerformanceMetricVisibility(visiblePerformanceMetrics);
    if (lastPerfSnapshot && perfMetricsPill) {
      renderPerformanceChips(perfMetricsPill, lastPerfSnapshot, visiblePerformanceMetrics);
    }
  };

  rendererModePill?.addEventListener("click", onRendererPillClick);
  rendererMenu?.addEventListener("click", onRendererMenuClick);
  runtimeModePill?.addEventListener("click", onMapSourceClick);
  mapSourceMenu?.addEventListener("click", onMapSourceMenuClick);
  settingsPerformanceMetricsEl?.addEventListener("change", onPerformanceMetricChange);

  const onCompassHeightInput = (): void => {
    if (!compassHeightSliderEl) return;
    const meters = Number(compassHeightSliderEl.value);
    if (compassHeightValueEl) compassHeightValueEl.textContent = `${meters}m`;
    anchorHeights.setHeightOffset(meters);
    runtime.configureOrbitTargetHeight({
      resolveSurfaceHeightMeters: anchorHeights.resolveHeight,
      initialOffsetMeters: meters,
    });
    try { window.localStorage.setItem(COMPASS_HEIGHT_STORAGE_KEY, String(meters)); } catch { /* ignore */ }
  };
  compassHeightSliderEl?.addEventListener("input", onCompassHeightInput);
  document.addEventListener("pointerdown", onDocumentPointerDown, { capture: true });

  northBtnEl?.addEventListener("click", () => {
    poiTracking.exitTracking();
    runtime.setViewState({ headingDeg: 0, pitchDeg: MAX_PITCH_DEG });
  });
  helpBtnEl?.addEventListener("click", () => helpModal?.show());
  settingsBtnEl?.addEventListener("click", () => settingsModal?.show());

  // ── Theme button ────────────────────────────────────────────
  // Shows sun in dark mode (click to go light), moon in light mode (click to go dark).
  function syncThemeButton(theme: "light" | "dark"): void {
    if (themeBtnIconEl) themeBtnIconEl.textContent = theme === "dark" ? "\u263C" : "\u263E";
    if (themeBtnEl) {
      const nextLabel = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
      themeBtnEl.title = nextLabel;
      themeBtnEl.setAttribute("aria-label", nextLabel);
    }
  }
  syncThemeButton(getTheme());
  const onThemeButtonClick = (): void => { toggleTheme(); };
  themeBtnEl?.addEventListener("click", onThemeButtonClick);
  // Theme changes can update scene-side colors (fallback clear color, etc.);
  // pump a frame whenever the theme flips for either tab-local or cross-tab events.
  const offThemeChangeForButton = onThemeChange((next) => {
    syncThemeButton(next);
    runtime.requestRender();
  });
  poiExitBtnEl?.addEventListener("click", (e) => {
    e.stopPropagation();
    poiTracking.exitTracking();
    runtime.requestRender();
  });

  // Update HUD every frame while the scene is running
  let hudObserver: ReturnType<typeof runtime.scene.onBeforeRenderObservable.add> | null = null;
  // Track last known POI-tracking state so we only call setOrbitMode on
  // transitions, never every frame. Calling setOrbitMode every frame would
  // stomp over external orbit-mode requests (e.g. from PropertyEarthMap's own
  // trackedPoint state), since poiTracking.isTracking() returns false for
  // external trackers and would reset orbitModeActive to false immediately.
  let lastPoiTrackingActive = false;
  hudObserver = runtime.scene.onBeforeRenderObservable.add(() => {
    const state = runtime.getViewState();
    if (state) {
      statusHud?.update(state);
      northButton?.update(state.headingDeg);
    }
    const camera = runtime.geospatialCamera;
    const compassAnchor = anchorHeights.resolve(poiTracking.getOrbitTarget() ?? camera?.center ?? null);
    orbitCompass.update(compassAnchor, state?.zoomMeters ?? camera?.radius ?? 0);
    culling.update();
    const poiTrackingActive = poiTracking.isTracking();
    if (poiTrackingActive !== lastPoiTrackingActive) {
      lastPoiTrackingActive = poiTrackingActive;
      runtime.setOrbitMode(poiTrackingActive);
    }

    // ── POI exit button: project orbit target to screen space ─────
    if (poiExitBtnEl) {
      const orbitTarget = poiTracking.getOrbitTarget();
      const poiCamera = runtime.geospatialCamera;
      const poiEngine = runtime.engine;
      const poiCanvas = poiEngine.getRenderingCanvas();
      if (orbitTarget && poiCamera && poiCanvas) {
        const txMatrix = runtime.scene.getTransformMatrix();
        const vp = poiCamera.viewport.toGlobal(
          poiEngine.getRenderWidth(),
          poiEngine.getRenderHeight(),
        );
        const sp = Vector3.Project(orbitTarget, Matrix.IdentityReadOnly, txMatrix, vp);
        if (sp.z > 0 && sp.z < 1) {
          const rect = poiCanvas.getBoundingClientRect();
          const scaleX = rect.width / poiEngine.getRenderWidth();
          const scaleY = rect.height / poiEngine.getRenderHeight();
          poiExitBtnEl.hidden = false;
          poiExitBtnEl.style.left = `${rect.left + sp.x * scaleX + POI_EXIT_BTN_OFFSET_PX}px`;
          poiExitBtnEl.style.top = `${rect.top + sp.y * scaleY - POI_EXIT_BTN_OFFSET_PX}px`;
        } else {
          poiExitBtnEl.hidden = true;
        }
      } else {
        poiExitBtnEl.hidden = true;
      }
    }
    const perfSnapshot = performanceMetrics.update();
    lastPerfSnapshot = perfSnapshot;
    if (perfMetricsPill) {
      renderPerformanceChips(perfMetricsPill, perfSnapshot, visiblePerformanceMetrics);
    }
  });

  console.info(
    `[app] runtime initialized renderer=${runtime.renderer.mode} mode=${runtime.status.mode} googleApiKeyProvided=${runtime.status.googleApiKeyProvided}`,
  );

  // Visual feedback for render-on-demand state:
  // - .is-streaming on the map-source pill while Google tiles are loading
  //   (drives the spinning outline animation)
  // - .is-active on the perf metrics group while the scheduler is pumping
  //   frames (drives the FPS chip's green tint)
  const offTilesStreaming = runtime.onTilesStreamingChange((streaming) => {
    runtimeModePill?.classList.toggle("is-streaming", streaming);
  });
  if (runtime.isStreamingTiles()) {
    runtimeModePill?.classList.add("is-streaming");
  }
  const offRenderActive = runtime.onActiveRenderChange((active) => {
    perfMetricsPill?.classList.toggle("is-active", active);
  });
  if (runtime.isRendering()) {
    perfMetricsPill?.classList.add("is-active");
  }

  return {
    runtime,
    addLayer,
    removeLayer,
    getViewState(): GlobeViewState | null {
      return runtime.getViewState();
    },
    setViewState(partial: Partial<GlobeViewState>): void {
      runtime.setViewState(partial);
    },
    getTheme,
    setTheme,
    onThemeChange,
    requestRender(): void {
      runtime.requestRender();
    },
    destroy() {
      if (hudObserver) {
        runtime.scene.onBeforeRenderObservable.remove(hudObserver);
        hudObserver = null;
      }
      statusHud?.destroy();
      northButton?.destroy();
      helpModal?.destroy();
      settingsModal?.destroy();
      spriteTuner?.destroy();
      compassScaleTuner?.destroy();
      runtimeModePill?.removeEventListener("click", onMapSourceClick);
      mapSourceMenu?.removeEventListener("click", onMapSourceMenuClick);
      settingsPerformanceMetricsEl?.removeEventListener("change", onPerformanceMetricChange);
      compassHeightSliderEl?.removeEventListener("input", onCompassHeightInput);
      poiSpriteTunerToggleEl?.removeEventListener("change", onPoiSpriteTunerToggleChange);
      compassScaleTunerToggleEl?.removeEventListener("change", onCompassScaleTunerToggleChange);
      themeBtnEl?.removeEventListener("click", onThemeButtonClick);
      offThemeChangeForButton();
      offTilesStreaming();
      offRenderActive();
      document.removeEventListener("pointerdown", onDocumentPointerDown, { capture: true });

      poiTracking.destroy();
      registry.destroy();
      culling.destroy();
      orbitCompass.destroy();

      runtime.destroy();
      rootElement.replaceChildren();
    },
  };
}
