import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import type { SurfaceQuery } from "foss-earth/runtime";
import { flightLog } from "../diagnostics/flightLog";
import { aircraftClearanceMeters, captureSimulation, restoreSimulation } from "./safeFlightState";

/**
 * A surface sample this far above a flying aircraft is not believed at all.
 *
 * Photogrammetry refines by metres, not by kilometres. A hit that puts the
 * ground a kilometre over an aircraft that was in normal flight one frame ago
 * is a bad sample - a stale tile transform, a mesh from another part of the
 * world, geometry picked before the tile group was placed - and acting on it
 * would either launch the aircraft on the gear springs or teleport it into the
 * stratosphere. Neither is better than carrying the previous terrain height
 * for a frame, so the sample is dropped and reported.
 */
const MAX_BELIEVABLE_RISE_METERS = 1000;

/**
 * How far the surface under the aircraft may move between two consecutive
 * samples, roughly half a metre apart at cruise.
 *
 * Refinement moves it by metres and occasionally by a few hundred; a kilometre
 * between frames is a different piece of world, not a better measurement of
 * this one. This catches a bad sample that lands only slightly above the
 * aircraft, which the rise limit alone would let through.
 *
 * Only upward steps are rejected. A surface that drops away cannot fire the
 * gear springs, and refusing one would strand the aircraft on a phantom floor
 * if a bad sample were ever adopted as the first reference.
 */
const MAX_BELIEVABLE_STEP_METERS = 1000;

export function createTerrainContact(sdk: JSBSimSdk, surface: SurfaceQuery) {
  let previous: { lat: number; lon: number; height: number; revision: number; clearance: number; resting: boolean } | null = null;
  let placement = true;
  let hasReference = false;
  let rejectedSamples = 0;
  return {
    reset() { previous = null; placement = true; hasReference = false; rejectedSamples = 0; },
    update(blockOnMissingSurface = true): boolean | "reset" {
      const lat = sdk.getPropertyValue("position/lat-geod-deg"), lon = sdk.getPropertyValue("position/long-gc-deg");
      const hit = surface.sample(lat, lon);
      if (!hit || !Number.isFinite(hit.heightMeters)) {
        // Google only exposes currently visible photogrammetry, so a transient
        // miss AFTER a height has been established must not halt the
        // simulation. Raster keeps its strict behaviour: it has an independent
        // adopted coverage index and a miss means no surface is safe to
        // integrate against.
        //
        // Before any height has been established the two are the same, and
        // neither may proceed: JSBSim's terrain elevation is still unset, so
        // stepping drops the aircraft toward a ground plane that is not there,
        // and the gear model resolves the accumulated penetration explosively
        // the moment real terrain arrives.
        if (!hasReference) return false;
        return !blockOnMissingSurface;
      }
      if (!hasReference) {
        hasReference = true;
        flightLog.info("terrain", "First terrain height established", {
          heightMeters: Number(hit.heightMeters.toFixed(2)), latDeg: Number(lat.toFixed(5)), lonDeg: Number(lon.toFixed(5)),
        });
      }
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
      const penetration = support - altitude;
      // Placement is exempt from both limits: spawning at a mountain airport
      // legitimately puts the aircraft far below a surface it has never seen.
      const stepMeters = previous ? hit.heightMeters - previous.height : 0;
      const implausible = placement ? null
        : penetration > MAX_BELIEVABLE_RISE_METERS
          ? `${penetration.toFixed(0)} m above the aircraft`
          : stepMeters > MAX_BELIEVABLE_STEP_METERS
            ? `${stepMeters.toFixed(0)} m from the previous sample`
            : null;
      if (implausible) {
        if (rejectedSamples === 0) {
          flightLog.error("terrain", `Ignoring a surface sample ${implausible}`, {
            aircraftMeters: Number(altitude.toFixed(2)), terrainMeters: Number(hit.heightMeters.toFixed(2)),
            previousTerrainMeters: previous ? Number(previous.height.toFixed(2)) : null,
            latDeg: Number(lat.toFixed(5)), lonDeg: Number(lon.toFixed(5)),
            meshId: hit.meshId, revision: hit.revision, quality: hit.quality,
          });
        }
        rejectedSamples += 1;
        // Keep the previous terrain elevation rather than adopting this one.
        return !blockOnMissingSurface;
      }
      if (rejectedSamples > 0) {
        flightLog.info("terrain", "Surface samples are believable again", { ignoredSamples: rejectedSamples });
        rejectedSamples = 0;
      }
      let corrected = false;
      // Deliberately NOT a cause: an aircraft that flew into a hill is deep
      // below the surface too, and lifting it out would fly it through terrain.
      // Only a world that changed under a level aircraft is repaired here.
      const cause = (placement && altitude < support) ? "placement"
        : liftedThroughPlane ? "surface lifted through the aircraft"
          : followGround ? "resting aircraft followed the ground" : null;
      if (cause) {
        const movedMeters = penetration;
        if (Math.abs(movedMeters) > 1) {
          flightLog.info("terrain", `Repositioned onto the surface (${cause})`, {
            movedMeters: Number(movedMeters.toFixed(2)),
            refinementDeltaMeters: Number(refinementDelta.toFixed(2)),
            terrainMeters: Number(hit.heightMeters.toFixed(2)),
          });
        }
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
