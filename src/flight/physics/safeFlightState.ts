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
  "fcs/aileron-cmd-norm", "fcs/rudder-cmd-norm", "fcs/pitch-trim-cmd-norm", "fcs/roll-trim-cmd-norm", "gear/gear-cmd-norm", "gear/gear-pos-norm",
  "fcs/flap-cmd-norm", "fcs/left-brake-cmd-norm", "fcs/right-brake-cmd-norm",
  "propulsion/tank[0]/contents-lbs", "propulsion/tank[1]/contents-lbs",
  "atmosphere/wind-north-fps", "atmosphere/wind-east-fps", "atmosphere/wind-down-fps"];
// propulsion/magneto_cmd is write-only: reading it returns zero even when the
// engine has ignition. Replaying that zero would kill a restored running engine.
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
    running: sdk.getPropertyValue("propulsion/engine/set-running") > 0.5 };
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
  // The global command takes an engine INDEX: 0 starts engine zero, it does
  // not mean false. Starting also initializes RPM, which the per-engine
  // boolean alone does not do after a reset.
  if (snapshot.running) sdk.setPropertyValue("propulsion/set-running", -1);
  else sdk.setPropertyValue("propulsion/engine/set-running", 0);
  for (const [property, value] of Object.entries(snapshot.controls)) sdk.setPropertyValue(property, value);
}

export interface AircraftClearanceStance {
  staticMeters: number;
  staticPitchRad: number;
  pitchArmMeters: number;
  rollArmMeters: number;
}

/**
 * Conservative C172 envelope about the reference point: the stance, grown to
 * keep the tail and wingtips clear when the aircraft is placed at an attitude
 * the gear does not hold it at.
 *
 * The pitch term measures deviation from the static stance rather than
 * absolute pitch. Absolute pitch would add 19 cm of float to an aircraft
 * sitting on its own wheels, which is exactly the gap that made repositioning
 * bounce it.
 */
export function aircraftClearanceMeters(
  stance: AircraftClearanceStance,
  roll: number,
  pitch: number,
): number {
  const staticPitchSine = Math.sin(stance.staticPitchRad);
  const excessPitch = Math.max(0, Math.abs(Math.sin(pitch)) - staticPitchSine);
  return excessPitch * stance.pitchArmMeters
    + Math.abs(Math.sin(roll) * Math.cos(pitch)) * stance.rollArmMeters
    + Math.abs(Math.cos(roll) * Math.cos(pitch)) * stance.staticMeters;
}
