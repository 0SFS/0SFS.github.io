import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import type { GeodeticLocation } from "foss-earth/windowing";
import { readFlightState } from "../bridge/ecefBridge";
import type { FlightState } from "../physics/flightState";

/** Reset the loaded aircraft at a geodetic position, retaining altitude and speed. */
export function resetFlightLocation(sdk: JSBSimSdk, location: GeodeticLocation): FlightState {
  if (!Number.isFinite(location.latDeg) || Math.abs(location.latDeg) > 90
    || !Number.isFinite(location.lonDeg) || Math.abs(location.lonDeg) > 180) {
    throw new Error("Invalid geodetic location.");
  }
  const state = readFlightState(sdk);
  sdk.setPropertyValue("ic/h-sl-ft", state.altMeters / 0.3048);
  // Geodetic, not geocentric latitude: the ECEF/ENU bridge uses WGS84.
  sdk.setPropertyValue("ic/lat-geod-deg", location.latDeg);
  sdk.setPropertyValue("ic/long-gc-deg", location.lonDeg);
  sdk.setPropertyValue("ic/psi-true-deg", state.headingRad * 180 / Math.PI);
  sdk.setPropertyValue("ic/theta-deg", 0);
  sdk.setPropertyValue("ic/phi-deg", 0);
  sdk.setPropertyValue("ic/vc-kts", state.airspeedKts);
  if (!sdk.runIc()) throw new Error("JSBSim could not apply the location.");
  sdk.setPropertyValue("fcs/throttle-cmd-norm", state.throttleNorm);
  return readFlightState(sdk);
}
