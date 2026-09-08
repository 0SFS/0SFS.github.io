import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import type { GeodeticLocation } from "foss-earth/windowing";
import { readFlightState } from "../bridge/ecefBridge";
import type { FlightState } from "../physics/flightState";
import { EMPTY_FLIGHT_STATE } from "../physics/flightState";
import { captureSimulation, validFlightState } from "../physics/safeFlightState";

/** Apply coordinates or a runway preset to the loaded C172. */
export function resetFlightLocation(sdk: JSBSimSdk, location: GeodeticLocation, terrainHeightMeters?: number): FlightState {
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
  const rawState = readFlightState(sdk);
  const state = validFlightState(rawState) ? rawState : { ...EMPTY_FLIGHT_STATE, altMeters: 1000, airspeedKts: 100, throttleNorm: 0.65 };
  const saved = captureSimulation(sdk);
  const departure = preset?.mode === "departure";
  sdk.resetToInitialConditions(2);
  const terrain = terrainHeightMeters ?? preset?.groundElevationMeters;
  // Unknown destination terrain must not inherit the previous airport's floor.
  // Physics waits for a surface query before stepping, then corrects placement.
  sdk.setPropertyValue("ic/terrain-elevation-ft", (terrain ?? -10000) / 0.3048);
  // C172 CG is roughly 4.5 ft above its wheels. Allow a small settling clearance.
  const requested = departure ? (terrain ?? preset.groundElevationMeters) + 1.5 : location.altMeters ?? state.altMeters;
  const altitude = terrain === undefined ? requested : Math.max(requested, terrain + 1.5);
  sdk.setPropertyValue("ic/h-sl-ft", altitude / 0.3048);
  // Geodetic, not geocentric latitude: the ECEF/ENU bridge uses WGS84.
  sdk.setPropertyValue("ic/lat-geod-deg", location.latDeg);
  sdk.setPropertyValue("ic/long-gc-deg", location.lonDeg);
  sdk.setPropertyValue("ic/psi-true-deg", preset?.headingDeg ?? state.headingRad * 180 / Math.PI);
  sdk.setPropertyValue("ic/theta-deg", preset?.mode === "arrival" ? 3 : 0);
  sdk.setPropertyValue("ic/phi-deg", 0);
  sdk.setPropertyValue("ic/vc-kts", preset ? (departure ? 0 : 75) : state.airspeedKts);
  sdk.setPropertyValue("ic/gamma-deg", preset?.flightPathDeg ?? 0);
  if (preset?.mode === "arrival") sdk.setPropertyValue("ic/alpha-deg", 6);
  if (departure) sdk.setPropertyValue("ic/vg-fps", 0);
  if (preset) {
    sdk.setPropertyValue("ic/gear-gear-pos-norm", 1);
    sdk.setPropertyValue("ic/flap-pos-norm", 0);
  }
  if (!sdk.runIc()) throw new Error("JSBSim could not apply the location.");
  if (!preset) {
    sdk.setPropertyValue("propulsion/set-running", saved.running ? -1 : 0);
    for (const [property, value] of Object.entries(saved.controls)) if (Number.isFinite(value)) sdk.setPropertyValue(property, value);
  }
  sdk.setPropertyValue("fcs/throttle-cmd-norm", preset ? (departure ? 0 : 0.35) : state.throttleNorm);
  if (preset) {
    sdk.setPropertyValue("fcs/elevator-cmd-norm", 0);
    sdk.setPropertyValue("fcs/aileron-cmd-norm", 0);
    sdk.setPropertyValue("fcs/rudder-cmd-norm", 0);
    sdk.setPropertyValue("fcs/pitch-trim-cmd-norm", 0);
    sdk.setPropertyValue("propulsion/set-running", -1);
    sdk.setPropertyValue("propulsion/magneto_cmd", 3);
    sdk.setPropertyValue("fcs/gear-cmd-norm", 1);
    sdk.setPropertyValue("fcs/flap-cmd-norm", 0);
    sdk.setPropertyValue("fcs/left-brake-cmd-norm", departure ? 1 : 0);
    sdk.setPropertyValue("fcs/right-brake-cmd-norm", departure ? 1 : 0);
    sdk.setPropertyValue("fcs/mixture-cmd-norm", Math.min(1, Math.max(0, Math.pow(Math.max(0, 1 - 6.87535e-6 * altitude / 0.3048), 5.2561) * 1.3)));
  }
  return readFlightState(sdk);
}
