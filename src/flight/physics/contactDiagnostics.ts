import type { JSBSimSdk } from "@0x62/jsbsim-wasm";

/**
 * The contact state JSBSim was in when the physics loop tripped.
 *
 * A gear-spring launch and an aerodynamic divergence produce the same symptom
 * in the flight state — impossible speeds — but need opposite fixes. The
 * difference is visible only in the terrain elevation the gear model was given
 * and how deep the gear was through it, so a fault report that omits those
 * cannot be acted on.
 */
export interface ContactDiagnostics {
  terrainElevationMeters: number;
  /** Height above the terrain JSBSim was told about, before the faulting step. */
  aglBeforeMeters: number;
  aglAfterMeters: number;
  /** Per-gear compression in metres; a large value is a penetration, not a landing. */
  gearCompressionMeters: number[];
  weightOnWheels: boolean[];
}

const FEET_TO_METERS = 0.3048;
const GEAR_UNITS = 3;

export function readContactDiagnostics(
  sdk: JSBSimSdk,
  altitudeBeforeMeters: number,
  altitudeAfterMeters: number,
): ContactDiagnostics {
  const terrainElevationMeters = sdk.getPropertyValue("position/terrain-elevation-asl-ft") * FEET_TO_METERS;
  const gearCompressionMeters: number[] = [];
  const weightOnWheels: boolean[] = [];
  for (let unit = 0; unit < GEAR_UNITS; unit += 1) {
    gearCompressionMeters.push(
      Number((sdk.getPropertyValue(`gear/unit[${unit}]/compression-ft`) * FEET_TO_METERS).toFixed(3)),
    );
    weightOnWheels.push(sdk.getPropertyValue(`gear/unit[${unit}]/WOW`) > 0.5);
  }
  return {
    terrainElevationMeters: Number(terrainElevationMeters.toFixed(2)),
    aglBeforeMeters: Number((altitudeBeforeMeters - terrainElevationMeters).toFixed(2)),
    aglAfterMeters: Number((altitudeAfterMeters - terrainElevationMeters).toFixed(2)),
    gearCompressionMeters,
    weightOnWheels,
  };
}
