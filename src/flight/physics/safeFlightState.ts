import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import type { FlightState } from "./flightState";

/**
 * Which envelope checks a state fails, as readable strings.
 *
 * The loop pauses the simulator on an invalid state, so the reason has to be
 * recoverable after the fact — "invalid" alone is not actionable.
 */
export function invalidFlightStateReasons(state: FlightState): string[] {
  const reasons: string[] = [];
  for (const [key, value] of Object.entries(state)) {
    if (!Number.isFinite(value)) reasons.push(`${key} is ${value}`);
  }
  if (Math.abs(state.latDeg) > 90) reasons.push(`latDeg ${state.latDeg.toFixed(4)} outside +-90`);
  if (Math.abs(state.lonDeg) > 180) reasons.push(`lonDeg ${state.lonDeg.toFixed(4)} outside +-180`);
  if (Math.abs(state.altMeters) >= 100000) reasons.push(`altMeters ${state.altMeters.toFixed(1)} beyond 100000`);
  if (!(state.airspeedKts >= 0)) reasons.push(`airspeedKts ${state.airspeedKts} below 0`);
  if (state.airspeedKts >= 1500) reasons.push(`airspeedKts ${state.airspeedKts.toFixed(1)} beyond 1500`);
  if (Math.abs(state.verticalSpeedFps) >= 5000) reasons.push(`verticalSpeedFps ${state.verticalSpeedFps.toFixed(1)} beyond 5000`);
  return reasons;
}

export function validFlightState(state: FlightState): boolean {
  return invalidFlightStateReasons(state).length === 0;
}

const controls = ["fcs/throttle-cmd-norm", "fcs/mixture-cmd-norm", "fcs/elevator-cmd-norm",
  "fcs/aileron-cmd-norm", "fcs/rudder-cmd-norm", "fcs/pitch-trim-cmd-norm", "fcs/gear-cmd-norm",
  "fcs/flap-cmd-norm", "fcs/left-brake-cmd-norm", "fcs/right-brake-cmd-norm",
  "propulsion/tank[0]/contents-lbs", "propulsion/tank[1]/contents-lbs",
  "propulsion/magneto_cmd", "atmosphere/wind-north-fps", "atmosphere/wind-east-fps", "atmosphere/wind-down-fps"];
const initialProperties: Record<string, string> = {
  "ic/lat-geod-deg": "position/lat-geod-deg", "ic/long-gc-deg": "position/long-gc-deg",
  "ic/h-sl-ft": "position/h-sl-ft", "ic/terrain-elevation-ft": "position/terrain-elevation-asl-ft",
  "ic/phi-deg": "attitude/phi-deg", "ic/theta-deg": "attitude/theta-deg", "ic/psi-true-deg": "attitude/psi-deg",
  "ic/vn-fps": "velocities/v-north-fps", "ic/ve-fps": "velocities/v-east-fps", "ic/vd-fps": "velocities/v-down-fps",
  "ic/p-rad_sec": "velocities/p-rad_sec", "ic/q-rad_sec": "velocities/q-rad_sec", "ic/r-rad_sec": "velocities/r-rad_sec",
};
export function captureSimulation(sdk: JSBSimSdk) {
  return { initial: Object.fromEntries(Object.entries(initialProperties).map(([ic, property]) => [ic, sdk.getPropertyValue(property)])),
    controls: Object.fromEntries(controls.map(property => [property, sdk.getPropertyValue(property)])),
    running: sdk.getPropertyValue("propulsion/engine/engine-rpm") > 100 };
}
export type SimulationSnapshot = ReturnType<typeof captureSimulation>;

/** Clear contact forces and integrator history before rebuilding valid kinematics. */
export function restoreSimulation(sdk: JSBSimSdk, snapshot: SimulationSnapshot): void {
  if (![...Object.values(snapshot.initial), ...Object.values(snapshot.controls)].every(Number.isFinite)) throw new Error("Invalid simulation snapshot");
  sdk.resetToInitialConditions(2);
  // Terrain MUST be set before RunIC: even a zero-time initialization evaluates contacts.
  for (const [property, value] of Object.entries(snapshot.initial)) sdk.setPropertyValue(property, value);
  for (const [property, value] of Object.entries(snapshot.controls)) sdk.setPropertyValue(property, value);
  if (!sdk.runIc()) throw new Error("Flight state reinitialization failed");
  sdk.setPropertyValue("propulsion/set-running", snapshot.running ? -1 : 0);
  for (const [property, value] of Object.entries(snapshot.controls)) sdk.setPropertyValue(property, value);
}

/** Conservative C172 envelope about the CG, including wings when banked. */
export function aircraftClearanceMeters(roll: number, pitch: number): number {
  return 0.15 + Math.abs(Math.sin(pitch)) * 4.5 + Math.abs(Math.sin(roll) * Math.cos(pitch)) * 5.5
    + Math.abs(Math.cos(roll) * Math.cos(pitch)) * 1.5;
}
