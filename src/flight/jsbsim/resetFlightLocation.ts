import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import type { GeodeticLocation } from "foss-earth/windowing";
import type { AircraftId } from "../aircraft/aircraftIds";
import { readFlightState } from "../bridge/ecefBridge";
import type { FlightState } from "../physics/flightState";
import { EMPTY_FLIGHT_STATE } from "../physics/flightState";
import { captureSimulation, validFlightState } from "../physics/safeFlightState";
import { getFdmProfile } from "./fdmProfiles";

/** Apply coordinates or a runway preset to the selected aircraft model. */
export function resetFlightLocation(
  sdk: JSBSimSdk,
  location: GeodeticLocation,
  terrainHeightMeters?: number,
  aircraftId: AircraftId = "cessna-172",
): FlightState {
  if (!Number.isFinite(location.latDeg) || Math.abs(location.latDeg) > 90
    || !Number.isFinite(location.lonDeg) || Math.abs(location.lonDeg) > 180
    || (location.altMeters !== undefined && !Number.isFinite(location.altMeters))) {
    throw new Error("Invalid geodetic location.");
  }
  const preset = location.flightPreset;
  if (preset && (!Number.isFinite(preset.headingDeg) || !Number.isFinite(preset.groundElevationMeters)
    || !Number.isFinite(preset.flightPathDeg) || !["departure", "arrival"].includes(preset.mode)
    || location.altMeters === undefined)) throw new Error("Invalid airport flight preset.");
  if (terrainHeightMeters !== undefined && !Number.isFinite(terrainHeightMeters)) throw new Error("Invalid terrain height");
  const profile = getFdmProfile(aircraftId);
  const runway = preset ? profile.runwayPresets[preset.mode] : null;
  const rawState = readFlightState(sdk);
  const state = validFlightState(rawState)
    ? rawState
    : { ...EMPTY_FLIGHT_STATE, altMeters: 1000, airspeedKts: 100, throttleNorm: profile.initialThrottleNorm };
  const saved = captureSimulation(sdk);
  const flapPosition = sdk.getPropertyValue(profile.flapPosition.property);
  const departure = preset?.mode === "departure";
  sdk.resetToInitialConditions(2);
  const terrain = terrainHeightMeters ?? preset?.groundElevationMeters;
  // Unknown destination terrain must not inherit the previous airport's floor.
  // Physics waits for a surface query before stepping, then corrects placement.
  sdk.setPropertyValue("ic/terrain-elevation-ft", (terrain ?? -10000) / 0.3048);
  // Preserve the model's static CG-to-ground height and a small settling
  // margin instead of assuming the C172's stance for every airframe.
  const clearanceMeters = profile.stance.staticMeters + 0.17;
  const requested = departure
    ? (terrain ?? preset.groundElevationMeters) + clearanceMeters
    : location.altMeters ?? state.altMeters;
  const altitude = terrain === undefined ? requested : Math.max(requested, terrain + clearanceMeters);
  sdk.setPropertyValue("ic/h-sl-ft", altitude / 0.3048);
  // Geodetic, not geocentric latitude: the ECEF/ENU bridge uses WGS84.
  sdk.setPropertyValue("ic/lat-geod-deg", location.latDeg);
  sdk.setPropertyValue("ic/long-gc-deg", location.lonDeg);
  sdk.setPropertyValue("ic/psi-true-deg", preset?.headingDeg ?? state.headingRad * 180 / Math.PI);
  sdk.setPropertyValue("ic/theta-deg", runway?.pitchDeg ?? profile.stance.staticPitchRad * 180 / Math.PI);
  sdk.setPropertyValue("ic/phi-deg", 0);
  sdk.setPropertyValue("ic/vc-kts", runway?.airspeedKts ?? state.airspeedKts);
  sdk.setPropertyValue("ic/gamma-deg", preset?.flightPathDeg ?? 0);
  if (preset?.mode === "arrival") sdk.setPropertyValue("ic/alpha-deg", 6);
  if (departure) sdk.setPropertyValue("ic/vg-fps", 0);
  if (runway) {
    sdk.setPropertyValue("fcs/elevator-cmd-norm", 0);
    sdk.setPropertyValue("fcs/aileron-cmd-norm", 0);
    sdk.setPropertyValue("fcs/rudder-cmd-norm", 0);
    sdk.setPropertyValue("fcs/pitch-trim-cmd-norm", 0);
    sdk.setPropertyValue("fcs/roll-trim-cmd-norm", 0);
    sdk.setPropertyValue("gear/gear-cmd-norm", 1);
    sdk.setPropertyValue("gear/gear-pos-norm", 1);
    sdk.setPropertyValue("fcs/flap-cmd-norm", runway.flapsNorm);
    sdk.setPropertyValue(profile.flapPosition.property, runway.flapsNorm * profile.flapPosition.fullTravel);
    sdk.setPropertyValue("fcs/left-brake-cmd-norm", departure ? 1 : 0);
    sdk.setPropertyValue("fcs/right-brake-cmd-norm", departure ? 1 : 0);
  } else {
    for (const [property, value] of Object.entries(saved.controls)) if (Number.isFinite(value)) sdk.setPropertyValue(property, value);
    if (Number.isFinite(flapPosition)) sdk.setPropertyValue(profile.flapPosition.property, flapPosition);
  }
  sdk.setPropertyValue("fcs/throttle-cmd-norm", runway?.throttleNorm ?? state.throttleNorm);
  if (!sdk.runIc()) throw new Error("JSBSim could not apply the location.");
  if (runway || saved.running) sdk.setPropertyValue("propulsion/set-running", -1);
  else sdk.setPropertyValue("propulsion/engine/set-running", 0);
  if (!runway) {
    // Reapply after native initialization, including a partially moved gear.
    for (const [property, value] of Object.entries(saved.controls)) if (Number.isFinite(value)) sdk.setPropertyValue(property, value);
    if (Number.isFinite(flapPosition)) sdk.setPropertyValue(profile.flapPosition.property, flapPosition);
  } else {
    if (profile.engine === "piston") {
      sdk.setPropertyValue("propulsion/magneto_cmd", 3);
      sdk.setPropertyValue("fcs/mixture-cmd-norm", Math.min(1, Math.max(0, Math.pow(Math.max(0, 1 - 6.87535e-6 * altitude / 0.3048), 5.2561) * 1.3)));
    }
  }
  sdk.setPropertyValue("fcs/throttle-cmd-norm", runway?.throttleNorm ?? state.throttleNorm);
  return readFlightState(sdk);
}
