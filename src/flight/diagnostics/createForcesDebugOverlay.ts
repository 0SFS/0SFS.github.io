import type { JSBSimSdk } from "@felipegalind0/jsbsim";
import type { Mesh, Scene, TransformNode } from "@babylonjs/core";
import { createVectorDebugDrawing, type VectorDebugDrawingSettings } from "foss-earth/diagnostics";
import { bodyForceToDisplay, createAircraftForceReader, type AircraftForcesSnapshot } from "./aircraftForces";

export interface ForcesDebugSettings {
  enabled: boolean;
  newtonsPerMeter: number;
  maxArrowMeters: number;
  labels: boolean;
  labelRefreshHz: number;
}

export interface ForcesDebugOptions {
  settings: ForcesDebugSettings;
  engineLabels?: Readonly<Record<number, string>>;
  requestRender?(): void;
  onUnavailable?(message: string): void;
  /** Production waits for all glyphs and optional labels through FOSS Earth's readiness helper. */
  whenReady?(meshes: readonly Mesh[], signal: AbortSignal): Promise<void>;
}

/** 0sfs owns native force observations/frames; FOSS Earth owns reusable glyphs/labels. */
export function createForcesDebugOverlay(scene: Scene, parent: TransformNode, sdk: JSBSimSdk, options: ForcesDebugOptions) {
  let settings = options.settings;
  let reader: ReturnType<typeof createAircraftForceReader> | null = null;
  let drawing: ReturnType<typeof createVectorDebugDrawing> | null = null;
  let snapshot: AircraftForcesSnapshot | null = null;
  let disposed = false;
  const warnings = new Set<string>();
  const drawingSettings = (): VectorDebugDrawingSettings => ({ ...settings, valuePerMeter: settings.newtonsPerMeter });
  const warn = (message: string): void => {
    if (warnings.has(message)) return;
    warnings.add(message);
    options.onUnavailable?.(message);
  };
  const stop = (): void => {
    drawing?.dispose(); drawing = null;
    reader?.dispose(); reader = null;
    snapshot = null;
  };
  function update(withinScheduledFrame = false): void {
    if (disposed || !settings.enabled) return;
    reader ??= createAircraftForceReader(sdk, options.engineLabels);
    snapshot = reader.read();
    if (snapshot.unavailable.length) warn(`Force observations unavailable: ${snapshot.unavailable.join(", ")}`);
    drawing ??= createVectorDebugDrawing(scene, parent, {
      settings: drawingSettings(), valueDisplayScale: 0.001, valueUnit: "kN",
      requestRender: options.requestRender, onError: warn, whenReady: options.whenReady,
    });
    drawing.update(snapshot.forces.map(force => ({
      id: force.id, label: force.label, color: force.color,
      vector: bodyForceToDisplay(force.bodyNewtons), anchor: force.anchorMeters,
    })), snapshot.simulationTimeSeconds, withinScheduledFrame);
  }
  if (settings.enabled) update();
  return {
    get ready(): Promise<void> { return drawing?.ready ?? Promise.resolve(); },
    update,
    getSnapshot(): AircraftForcesSnapshot | null { return snapshot; },
    setSettings(next: ForcesDebugSettings): void {
      if (disposed) return;
      settings = next;
      if (!settings.enabled) { stop(); return; }
      drawing?.setSettings(drawingSettings());
      update();
    },
    dispose(): void { if (!disposed) { disposed = true; stop(); } },
  };
}
