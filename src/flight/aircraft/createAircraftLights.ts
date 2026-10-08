import { Vector3, type Observer, type Scene, type TransformNode } from "@babylonjs/core";
import { createLightPoints, type LightPoint } from "foss-earth/lights";
import type { SkyGroundLight } from "foss-earth/runtime";
import type { AircraftId } from "./aircraftIds";
import {
  AIRCRAFT_LIGHTS, BEAMS, beamIntensityCd, flash, GEAR_LIGHTS_DOWN, lightColour, navigationIntensityCd,
  type AircraftLightInstallation, type Rgb,
} from "./aircraftLights";

export interface AircraftLightSettings {
  navigation: boolean;
  antiCollision: boolean;
  landing: boolean;
  /** Whether landing and taxi beams light the ground. */
  groundLight: boolean;
  /** The square each light's glare is spread over, px across. */
  sizePx: number;
  /** How far a light is drawn towards the camera, m. */
  liftMeters: number;
  /** The white luminance without a sky model, cd/m². */
  referenceNits: number;
}

export interface AircraftLightTimers {
  set(callback: () => void, delayMs: number): number;
  clear(id: number): void;
}

export interface AircraftLightsOptions {
  scene: Scene;
  /** The aircraft's node in body axes: +X left, +Y up, +Z nose. */
  parent: TransformNode;
  aircraftId: AircraftId;
  /** Added to the catalogue's model-frame positions. */
  modelOffset: { x: number; y: number; z: number };
  getSettings(): AircraftLightSettings;
  /** The sky's white luminance, or null with the sky model off. */
  getWhiteLuminance(): number | null;
  setGroundLights(lights: readonly SkyGroundLight[]): void;
  /** The landing gear's position, 0 up to 1 down. */
  getGearDownNorm(): number;
  /**
   * Whether the flight's time is passing: false while it is paused or loading,
   * when the flashing lights hold as they are and ask for no frames. Always
   * passing when omitted.
   */
  isRunning?: () => boolean;
  requestRender(): void;
  /** ms; `performance.now` when omitted. */
  now?: () => number;
  timers?: AircraftLightTimers;
}

export interface AircraftLightsHandle {
  /** Settings changed: draw again, and start or stop the flashes' frames. */
  refresh(): void;
  dispose(): void;
}

const beamCosines = (kind: "landing" | "taxi"): { cosInner: number; cosOuter: number } => ({
  cosInner: Math.cos((BEAMS[kind].innerDeg * Math.PI) / 180),
  cosOuter: Math.cos((BEAMS[kind].outerDeg * Math.PI) / 180),
});

/**
 * The aircraft's lights: each a point of light at its place on the airframe,
 * as bright towards the camera as its kind's photometry makes it, through
 * FOSS Earth's light points; the landing and taxi beams also light the
 * ground. Flashing lights ask for a frame at each flash's start and end, so a
 * still scene shows them flash; nothing else asks for frames. Their clock is
 * the flight's: while it is paused they hold as they are and ask for none.
 */
export function createAircraftLights(options: AircraftLightsOptions): AircraftLightsHandle {
  const now = options.now ?? (() => performance.now());
  const timers: AircraftLightTimers = options.timers ?? {
    set: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clear: id => window.clearTimeout(id),
  };
  const installations = AIRCRAFT_LIGHTS[options.aircraftId] ?? [];
  const { x: ox, y: oy, z: oz } = options.modelOffset;
  const place = (light: AircraftLightInstallation): Vector3 => new Vector3(light.position[0] + ox, light.position[1] + oy, light.position[2] + oz);
  const isRunning = options.isRunning ?? (() => true);
  let settings = options.getSettings();
  let disposed = false;
  /** The lights' own time, ms: the clock's, less the time the flight has stood still. Held while it stands. */
  let heldAtMs: number | null = isRunning() ? null : now();
  let stoodMs = 0;
  const lightSeconds = (): number => (heldAtMs ?? now() - stoodMs) / 1000;

  const lit = (light: AircraftLightInstallation): boolean => {
    switch (light.kind) {
      case "position-left": case "position-right": case "position-tail": return settings.navigation;
      case "strobe": case "beacon": return settings.antiCollision;
      case "landing": case "taxi": return settings.landing && (!light.onGear || options.getGearDownNorm() >= GEAR_LIGHTS_DOWN);
    }
  };

  /** A light's intensity towards a viewer, cd, before its colour. */
  function intensityCd(light: AircraftLightInstallation, toward: Vector3): number {
    if (!lit(light)) return 0;
    const share = light.share ?? 1;
    switch (light.kind) {
      case "position-left": case "position-right": case "position-tail":
        return navigationIntensityCd(light.kind, [toward.x, toward.y, toward.z]) * share;
      case "strobe": case "beacon": {
        const state = flash(light.kind, lightSeconds());
        return state.lit ? state.peakCd * share : 0;
      }
      case "landing": case "taxi": {
        const axis = light.direction ?? [0, 0, 1];
        return beamIntensityCd(light.kind, toward.x * axis[0] + toward.y * axis[1] + toward.z * axis[2]) * share;
      }
    }
  }

  const points = createLightPoints(options.scene, {
    getWhiteLuminance: options.getWhiteLuminance,
    referenceWhiteLuminance: () => settings.referenceNits,
    sizePx: () => settings.sizePx,
    liftMeters: () => settings.liftMeters,
  });
  points.setPoints(installations.map((light): LightPoint => {
    const colour = lightColour(light.kind);
    return {
      parent: options.parent,
      position: place(light),
      intensityToward(toward, out: Rgb) {
        const intensity = intensityCd(light, toward);
        out[0] = intensity * colour[0]; out[1] = intensity * colour[1]; out[2] = intensity * colour[2];
        return out;
      },
    };
  }));

  // The beams on the ground, where they are this frame.
  const beams = installations.filter((light): light is AircraftLightInstallation & { kind: "landing" | "taxi" } => light.kind === "landing" || light.kind === "taxi");
  let groundLightsShown = 0;
  const placeBeams = (): void => {
    const shown: SkyGroundLight[] = [];
    if (settings.groundLight) {
      const matrix = options.parent.computeWorldMatrix(true);
      for (const light of beams) {
        if (!lit(light)) continue;
        const colour = lightColour(light.kind);
        const peak = BEAMS[light.kind].peakCd * (light.share ?? 1);
        const axis = light.direction ?? [0, 0, 1];
        shown.push({
          position: Vector3.TransformCoordinates(place(light), matrix),
          direction: Vector3.TransformNormal(new Vector3(axis[0], axis[1], axis[2]), matrix).normalize(),
          intensityCd: [peak * colour[0], peak * colour[1], peak * colour[2]],
          ...beamCosines(light.kind),
        });
      }
    }
    if (shown.length === 0 && groundLightsShown === 0) return;
    groundLightsShown = shown.length;
    options.setGroundLights(shown);
  };

  // Flashes: a frame at each start and end while anti-collision lights are on and the flight's time is passing.
  let timer: number | null = null;
  const flashing = installations.filter(light => light.kind === "strobe" || light.kind === "beacon");
  const scheduleFlash = (): void => {
    if (timer !== null) timers.clear(timer);
    timer = null;
    if (disposed || heldAtMs !== null || !settings.antiCollision || flashing.length === 0) return;
    const seconds = lightSeconds();
    const next = Math.min(...flashing.map(light => flash(light.kind as "strobe" | "beacon", seconds).nextChangeSeconds));
    timer = timers.set(() => {
      timer = null;
      followFlight();
      if (heldAtMs !== null) return;
      options.requestRender();
      scheduleFlash();
    }, Math.max(1, (next - seconds) * 1000));
  };
  /** Holds the lights' time while the flight stands still, and lets it run on, from where it was, when the flight does. */
  function followFlight(): void {
    const running = isRunning();
    if (!running && heldAtMs === null) {
      heldAtMs = now() - stoodMs;
      scheduleFlash();
    } else if (running && heldAtMs !== null) {
      stoodMs = now() - heldAtMs;
      heldAtMs = null;
      scheduleFlash();
    }
  }
  // Each frame drawn looks: a pause is seen at the next flash at the latest, and a resumed flight draws frames.
  const observer: Observer<Scene> | null = beams.length > 0 || flashing.length > 0
    ? options.scene.onBeforeRenderObservable.add(() => {
      followFlight();
      if (beams.length > 0) placeBeams();
    })
    : null;
  scheduleFlash();

  return {
    refresh() {
      settings = options.getSettings();
      scheduleFlash();
      options.requestRender();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== null) timers.clear(timer);
      if (observer) options.scene.onBeforeRenderObservable.remove(observer);
      points.dispose();
      if (groundLightsShown > 0) options.setGroundLights([]);
    },
  };
}
