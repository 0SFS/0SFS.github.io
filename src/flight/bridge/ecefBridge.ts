import { Quaternion } from "@babylonjs/core";
import type { JSBSimSdk } from "@felipegalind0/jsbsim";
import { degreesToRadians, feetToMeters, type FlightState } from "../physics/flightState";

export function readFlightState(sdk: JSBSimSdk): FlightState {
  return {
    latDeg: sdk.getPropertyValue("position/lat-geod-deg"),
    lonDeg: sdk.getPropertyValue("position/long-gc-deg"),
    altMeters: feetToMeters(sdk.getPropertyValue("position/h-sl-ft")),
    rollRad: degreesToRadians(sdk.getPropertyValue("attitude/phi-deg")),
    pitchRad: degreesToRadians(sdk.getPropertyValue("attitude/theta-deg")),
    headingRad: degreesToRadians(sdk.getPropertyValue("attitude/psi-deg")),
    airspeedKts: sdk.getPropertyValue("velocities/vc-kts"),
    northVelocityFps: sdk.getPropertyValue("velocities/v-north-fps"),
    eastVelocityFps: sdk.getPropertyValue("velocities/v-east-fps"),
    verticalSpeedFps: -sdk.getPropertyValue("velocities/v-down-fps"),
    throttleNorm: sdk.getPropertyValue("fcs/throttle-cmd-norm"),
  };
}

/**
 * Convert JSBSim NED body attitude (phi, theta, psi) to a Babylon quaternion.
 * The aircraft model uses +X left, +Y up, and +Z nose-forward.
 * World axes are east/up/south, so north is -Z and headings turn toward +X.
 */
export function flightAttitudeToQuaternion(rollRad: number, pitchRad: number, headingRad: number): Quaternion {
  return Quaternion.RotationYawPitchRoll(Math.PI - headingRad, -pitchRad, rollRad);
}
