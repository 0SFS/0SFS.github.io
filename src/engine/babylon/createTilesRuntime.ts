import type { Scene } from "@babylonjs/core";
import { TilesRenderer } from "3d-tiles-renderer/babylonjs";
import { GoogleCloudAuthPlugin } from "3d-tiles-renderer/core/plugins";

const GOOGLE_3D_TILES_ROOT_URL = "https://tile.googleapis.com/v1/3dtiles/root.json";

export interface GoogleTilesRuntimeOptions {
  scene: Scene;
  apiKey: string;
  onLoadError?: (error: Error, url: string) => void;
  onLoadStart?: () => void;
  onLoadEnd?: (visibleTiles: number, activeTiles: number) => void;
}

export interface GoogleTilesRuntime {
  tiles: TilesRenderer;
  update(): void;
  dispose(): void;
}

export function createGoogleTilesRuntime(options: GoogleTilesRuntimeOptions): GoogleTilesRuntime {
  const {
    scene,
    onLoadError,
    onLoadStart,
    onLoadEnd,
  } = options;
  const apiKey = options.apiKey.trim();

  if (!apiKey) {
    throw new Error("Google Maps API key is empty.");
  }

  const tiles = new TilesRenderer(GOOGLE_3D_TILES_ROOT_URL, scene);
  tiles.fetchOptions.mode = "cors";

  tiles.registerPlugin(
    new GoogleCloudAuthPlugin({
      apiToken: apiKey,
      autoRefreshToken: true,
      useRecommendedSettings: true,
    }),
  );

  const handleLoadStart = (): void => {
    console.info("[tiles] Google 3D tiles loading started");
    onLoadStart?.();
  };

  const handleLoadEnd = (): void => {
    const visibleTiles = tiles.visibleTiles.size;
    const activeTiles = tiles.activeTiles.size;

    console.info("[tiles] Google 3D tiles loading completed", {
      visibleTiles,
      activeTiles,
    });

    onLoadEnd?.(visibleTiles, activeTiles);
  };

  const handleLoadError = (event: { error: Error; url: string | URL }): void => {
    const url = String(event.url);
    console.error("[tiles] Failed to load Google 3D tile resource", {
      url,
      error: event.error,
    });
    onLoadError?.(event.error, url);
  };

  tiles.addEventListener("tiles-load-start", handleLoadStart);
  tiles.addEventListener("tiles-load-end", handleLoadEnd);
  tiles.addEventListener("load-error", handleLoadError);

  return {
    tiles,
    update() {
      tiles.update();
    },
    dispose() {
      tiles.removeEventListener("tiles-load-start", handleLoadStart);
      tiles.removeEventListener("tiles-load-end", handleLoadEnd);
      tiles.removeEventListener("load-error", handleLoadError);
      tiles.dispose();
    },
  };
}
