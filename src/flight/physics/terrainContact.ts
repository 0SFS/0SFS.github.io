import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import type { SurfaceQuery } from "foss-earth/runtime";
import { aircraftClearanceMeters, captureSimulation, restoreSimulation } from "./safeFlightState";

export function createTerrainContact(sdk: JSBSimSdk, surface: SurfaceQuery) {
  let previous: { lat: number; lon: number; height: number; revision: number; clearance: number; resting: boolean } | null = null;
  let placement = true;
  return {
    reset() { previous = null; placement = true; },
    update(blockOnMissingSurface = true): boolean | "reset" {
      const lat = sdk.getPropertyValue("position/lat-geod-deg"), lon = sdk.getPropertyValue("position/long-gc-deg");
      const hit = surface.sample(lat, lon);
      // Google only exposes currently visible photogrammetry, so a transient
      // tile/query miss must not halt the simulation. Raster keeps its strict
      // behavior: it has an independent adopted coverage index and a miss means
      // that no terrain surface is safe to integrate against.
      if (!hit || !Number.isFinite(hit.heightMeters)) return !blockOnMissingSurface;
      const altitude = sdk.getPropertyValue("position/h-sl-ft") * 0.3048;
      const clearance = aircraftClearanceMeters(sdk.getPropertyValue("attitude/phi-deg") * Math.PI / 180,
        sdk.getPropertyValue("attitude/theta-deg") * Math.PI / 180);
      let refinementDelta = 0;
      if (previous && hit.revision !== previous.revision) {
        // Compare two versions at ONE coordinate, never two heights along a flight path.
        const anchor = surface.sample(previous.lat, previous.lon);
        if (anchor && Number.isFinite(anchor.heightMeters)) refinementDelta = anchor.heightMeters - previous.height;
      }
      const support = hit.heightMeters + clearance;
      const changedHere = Math.abs(refinementDelta) > 0.00001;
      // Only repair penetration attributable to the world change. Moving into a
      // hill while some other tile refines is still an ordinary collision.
      const attributable = altitude + refinementDelta >= support - 0.1;
      const followGround = changedHere && previous?.resting && attributable;
      const liftedThroughPlane = refinementDelta > 0 && previous && previous.clearance >= -0.5
        && altitude < support && attributable;
      let corrected = false;
      if ((placement && altitude < support) || liftedThroughPlane || followGround) {
        const snapshot = captureSimulation(sdk);
        snapshot.initial["ic/terrain-elevation-ft"] = hit.heightMeters / 0.3048;
        snapshot.initial["ic/h-sl-ft"] = support / 0.3048;
        // Preserve lateral motion. JSBSim's support model uses a horizontal local
        // plane; remove only downward velocity into that plane.
        snapshot.initial["ic/vd-fps"] = Math.min(0, snapshot.initial["ic/vd-fps"]);
        restoreSimulation(sdk, snapshot);
        corrected = true;
      }
      sdk.setPropertyValue("position/terrain-elevation-asl-ft", hit.heightMeters / 0.3048);
      const height = sdk.getPropertyValue("position/h-sl-ft") * 0.3048;
      previous = { lat, lon, height: hit.heightMeters, revision: hit.revision,
        clearance: height - hit.heightMeters - clearance,
        resting: height - hit.heightMeters <= clearance + 0.25 && Math.abs(sdk.getPropertyValue("velocities/v-down-fps")) < 3 };
      placement = false;
      return corrected ? "reset" : true;
    },
  };
}

/** Feed the displayed raster surface into JSBSim's existing gear contacts.
 * A miss blocks integration; it must never reuse another airport's ground.
 * This is terrain support, not a general aircraft-versus-building solver. */
export function syncTerrainContact(sdk: JSBSimSdk, surface: SurfaceQuery): boolean {
  const hit = surface.sample(sdk.getPropertyValue("position/lat-geod-deg"), sdk.getPropertyValue("position/long-gc-deg"));
  if (!hit || !Number.isFinite(hit.heightMeters)) return false;
  sdk.setPropertyValue("position/terrain-elevation-asl-ft", hit.heightMeters / 0.3048);
  return true;
}
