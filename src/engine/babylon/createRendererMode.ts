import { Engine, type EngineOptions, WebGPUEngine } from "@babylonjs/core";

export type RendererMode = "webgpu" | "webgl2" | "webgl";

export interface RendererDiagnostics {
  navigatorGpuPresent: boolean;
  /** null if IsSupportedAsync was never checked (e.g. non-WebGPU path). */
  isSupportedAsyncResult: boolean | null;
  isSecureContext: boolean;
}

export interface RendererSelection {
  /** The renderer the user explicitly requested, or "auto" for auto-detect. */
  requested: RendererMode | "auto";
  /** The renderer that was actually initialised. */
  mode: RendererMode;
  engine: Engine | WebGPUEngine;
  /** If a forced renderer fell back, this is the error message explaining why. */
  fallbackReason?: string;
  /** Low-level diagnostics captured during renderer selection. */
  diagnostics?: RendererDiagnostics;
}

export interface RendererModeOptions {
  /**
   * Force a specific renderer.  When null/undefined the runtime auto-detects
   * WebGPU → WebGL2 → WebGL in that order.
   */
  force?: RendererMode | null;
}

const WEBGL_ENGINE_OPTIONS: EngineOptions = {
  preserveDrawingBuffer: false,
  stencil: true,
  useLargeWorldRendering: true,
};

function createWebGlEngine(canvas: HTMLCanvasElement): Engine {
  return new Engine(canvas, true, WEBGL_ENGINE_OPTIONS, true);
}

function actualWebGLMode(engine: Engine): "webgl" | "webgl2" {
  const v = (engine as unknown as { webGLVersion?: number }).webGLVersion;
  return v === 1 ? "webgl" : "webgl2";
}

async function tryCreateWebGPU(canvas: HTMLCanvasElement): Promise<WebGPUEngine> {
  const webGpuEngine = new WebGPUEngine(canvas, {
    antialias: true,
    adaptToDeviceRatio: true,
    useLargeWorldRendering: true,
  });
  await webGpuEngine.initAsync();
  return webGpuEngine;
}

export async function createRendererMode(
  canvas: HTMLCanvasElement,
  options: RendererModeOptions = {},
): Promise<RendererSelection> {
  const force = options.force ?? null;

  if (force === "webgpu") {
    const gpuInNavigator = typeof navigator !== "undefined" && "gpu" in navigator;
    const secureCtx = typeof isSecureContext !== "undefined" ? isSecureContext : false;
    console.log(
      `[renderer] Forced WebGPU requested. navigator.gpu present: ${gpuInNavigator}, isSecureContext: ${secureCtx}`,
      gpuInNavigator ? navigator.gpu : "(missing)",
    );
    let isSupportedResult: boolean | null = null;
    let initError: unknown = null;
    try {
      isSupportedResult = await WebGPUEngine.IsSupportedAsync;
      console.log(`[renderer] WebGPUEngine.IsSupportedAsync: ${isSupportedResult}`);
      const engine = await tryCreateWebGPU(canvas);
      return {
        requested: "webgpu",
        mode: "webgpu",
        engine,
        diagnostics: { navigatorGpuPresent: gpuInNavigator, isSupportedAsyncResult: isSupportedResult, isSecureContext: secureCtx },
      };
    } catch (error) {
      initError = error;
    }
    const reason = initError instanceof Error ? initError.message : String(initError);
    console.warn(
      `[renderer] Forced WebGPU failed (navigator.gpu present: ${gpuInNavigator}, IsSupportedAsync: ${isSupportedResult}, isSecureContext: ${secureCtx}).\nReason: ${reason}`,
      initError,
    );
    const engine = createWebGlEngine(canvas);
    return {
      requested: "webgpu",
      mode: actualWebGLMode(engine),
      engine,
      fallbackReason: reason,
      diagnostics: { navigatorGpuPresent: gpuInNavigator, isSupportedAsyncResult: isSupportedResult, isSecureContext: secureCtx },
    };
  }

  if (force === "webgl2" || force === "webgl") {
    // Both use Babylon's standard Engine which prefers WebGL2 by default.
    // Report the mode that was actually created so the label is accurate.
    const engine = createWebGlEngine(canvas);
    return { requested: force, mode: actualWebGLMode(engine), engine };
  }

  // Auto-detect: WebGPU → WebGL2/WebGL.
  try {
    const webGpuSupported = await WebGPUEngine.IsSupportedAsync;
    if (webGpuSupported) {
      const engine = await tryCreateWebGPU(canvas);
      return { requested: "auto", mode: "webgpu", engine };
    }
  } catch (error) {
    console.warn("[renderer] WebGPU initialization failed. Falling back to WebGL.", error);
  }

  const engine = createWebGlEngine(canvas);
  return { requested: "auto", mode: actualWebGLMode(engine), engine };
}
