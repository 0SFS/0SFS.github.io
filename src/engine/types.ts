export interface GlobeViewState {
  latDeg: number;
  lonDeg: number;
  headingDeg: number;
  pitchDeg: number;
  zoomMeters: number;
}

export type GlobeInputModePreference = "auto" | "mouse" | "trackpad" | "touch";

export interface GlobeMovementSensitivity {
  pan: number;
  orbit: number;
  zoom: number;
}

export interface GlobeInputSensitivitySettings {
  mouse: GlobeMovementSensitivity;
  trackpad: GlobeMovementSensitivity;
  touch: GlobeMovementSensitivity;
}

export interface GlobeLayerContext {
  scene: unknown;
  engine: unknown;
}

export interface GlobeLayerState {
  poiEntities?: unknown[];
  getPoiOrbitTarget?: () => unknown | null;
  cullables?: unknown[];
  anchorHeightSamples?: unknown[];
}

export interface GlobeLayer {
  id: string;
  setup(context: GlobeLayerContext): GlobeLayerState;
  destroy(context: GlobeLayerContext): void;
}

export interface GlobeHandle {
  addLayer(layer: GlobeLayer): void;
  removeLayer(layerId: string): void;
  destroy(): void;
  /** Return the current camera state. Returns null in fallback mode. */
  getViewState(): GlobeViewState | null;
  /**
   * Merge partial overrides into the current camera state.
   * No-op in fallback mode.
   */
  setViewState(partial: Partial<GlobeViewState>): void;
  /** Current UI theme. Default: "dark". */
  getTheme(): GlobeTheme;
  /** Set the UI theme and persist it. Notifies all subscribers. */
  setTheme(theme: GlobeTheme): void;
  /**
   * Subscribe to theme changes (including those originating from other tabs).
   * Returns an unsubscribe function.
   */
  onThemeChange(cb: (theme: GlobeTheme) => void): () => void;
  /**
   * Render the scene on the next animation frame. The globe renders on demand,
   * so external code that mutates scene content (e.g. layer sprite data) must
   * call this to make the change visible.
   */
  requestRender(): void;
}

export type GlobeTheme = "light" | "dark";
