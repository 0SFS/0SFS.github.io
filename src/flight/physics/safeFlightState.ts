import type { JSBSimSdk } from "@felipegalind0/jsbsim";
import type { FlightState } from "./flightState";
import { fuelTankContentsPath, fuelTankIndices } from "../jsbsim/fuelTanks";

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
  "atmosphere/wind-north-fps", "atmosphere/wind-east-fps", "atmosphere/wind-down-fps"];
const optionalAircraftControls = ["fcs/stovl-cmd-norm", "fcs/stovl-pos-norm", "fcs/control-law-mode"];
const modelControls = new WeakMap<JSBSimSdk, readonly string[]>();
const modelEngineThermalState = new WeakMap<JSBSimSdk, readonly { state: string; initialized: string }[]>();

function engineThermalStateProperties(sdk: JSBSimSdk): readonly { state: string; initialized: string }[] {
  const cached = modelEngineThermalState.get(sdk);
  if (cached) return cached;
  const catalog = new Map<string, string>();
  if (typeof sdk.queryPropertyCatalog === "function") {
    for (const line of sdk.queryPropertyCatalog("propulsion/engine").split(/\r?\n/)) {
      const match = /^(\S+)\s+\(([RW]+)\)\s*$/.exec(line.trim());
      if (match) catalog.set(match[1], match[2]);
    }
  }
  const properties = [...catalog].flatMap(([state, access]) => {
    if (!/^propulsion\/engine(?:\[\d+\])?\/thermal\/(?:[a-z0-9-]+\/)?metal-temperature-state-k$/.test(state)
      || !access.includes("R") || !access.includes("W")) return [];
    const initialized = state.replace(/metal-temperature-state-k$/, "initialized");
    return catalog.get(initialized)?.includes("R") ? [{ state, initialized }] : [];
  });
  // One SDK owns one model. Preserve the native catalogue's index spelling
  // and never create thermal nodes for engines without this capability.
  modelEngineThermalState.set(sdk, properties);
  return properties;
}

function captureEngineThermalState(sdk: JSBSimSdk): [string, number][] {
  return engineThermalStateProperties(sdk).flatMap(({ state, initialized }) => {
    // A pending native seed is not a hot state. Restoring a positive Kelvin
    // value marks it initialized, so omit pending engines to retain that state.
    const ready = sdk.getPropertyValue(initialized);
    if (!Number.isFinite(ready) || ready <= 0.5) return [];
    const temperature = sdk.getPropertyValue(state);
    return Number.isFinite(temperature) && temperature > 0 ? [[state, temperature] as [string, number]] : [];
  });
}

/** Restore observed native wall state before RunIC or warm engine initialization. */
export function restoreEngineThermalState(sdk: JSBSimSdk, snapshotControls: Readonly<Record<string, number>>): void {
  for (const { state } of engineThermalStateProperties(sdk)) {
    const temperature = snapshotControls[state];
    if (Number.isFinite(temperature) && temperature > 0) sdk.setPropertyValue(state, temperature);
  }
}

function restoreControls(sdk: JSBSimSdk, snapshotControls: Readonly<Record<string, number>>): void {
  for (const [property, value] of Object.entries(snapshotControls)) {
    // Native thermal state has its own capability and validation boundary;
    // an old/foreign snapshot must not invent nodes on another engine model.
    if (/^propulsion\/engine(?:\[\d+\])?\/thermal\//.test(property)) continue;
    sdk.setPropertyValue(property, value);
  }
}

function controlsForModel(sdk: JSBSimSdk): readonly string[] {
  const cached = modelControls.get(sdk);
  if (cached) return cached;
  // One SDK owns one aircraft for its lifetime. Discover optional controls once;
  // aircraft without them must never acquire invented properties.
  const catalog = new Set(typeof sdk.queryPropertyCatalog === "function"
    ? sdk.queryPropertyCatalog("fcs/").split(/\r?\n/).map(line => line.trim().split(/\s+/)[0])
    : []);
  // Every tank, however many the aircraft has: the Fuel tab can fill any of them.
  const paths = [...controls, ...optionalAircraftControls.filter(path => catalog.has(path)),
    ...(sdk.queryPropertyCatalog?.("stores/external-tank") ?? "").split(/\r?\n/)
      .map(line => line.trim().split(/\s+/)[0]!)
      .filter(path => /^stores\/external-tank(?:\[\d+\])?\/attached$/.test(path)),
    ...fuelTankIndices(sdk).map(fuelTankContentsPath)];
  modelControls.set(sdk, paths);
  return paths;
}
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
  const timing = sdk as JSBSimSdk & { getSimTime?: () => number };
  return { initial: Object.fromEntries(Object.entries(initialProperties).map(([ic, property]) => [ic, sdk.getPropertyValue(property)])),
    // The existing snapshot record includes restorable native state alongside
    // pilot controls. These values are observed, never synthesized by the app.
    controls: Object.fromEntries([
      ...controlsForModel(sdk).map(property => [property, sdk.getPropertyValue(property)] as [string, number]),
      ...captureEngineThermalState(sdk),
    ]),
    running: sdk.getPropertyValue("propulsion/engine/set-running") > 0.5,
    // Contact recovery rebuilds model state at zero integration time, but it is
    // still part of the current flight. Preserve the public simulation clock so
    // real-time consumers do not mistake every terrain refinement for a seek.
    // Some unit-test doubles implement the property reader without the SDK's
    // convenience method. The installed runtime supplies getSimTime().
    simTimeS: timing.getSimTime?.() ?? sdk.getPropertyValue("simulation/sim-time-sec") };
}
export type SimulationSnapshot = ReturnType<typeof captureSimulation>;

/** Clear contact forces and integrator history before rebuilding valid kinematics. */
export function restoreSimulation(sdk: JSBSimSdk, snapshot: SimulationSnapshot): void {
  if (![...Object.values(snapshot.initial), ...Object.values(snapshot.controls), snapshot.simTimeS].every(Number.isFinite)) throw new Error("Invalid simulation snapshot");
  sdk.resetToInitialConditions(2);
  restoreEngineThermalState(sdk, snapshot.controls);
  // ResetToInitialConditions rewinds the executive. This is state recovery
  // within one flight, so zero-time model evaluation belongs at the captured
  // time and the next accepted step must advance from it.
  const timing = sdk as JSBSimSdk & { setSimTime?: (seconds: number) => number };
  timing.setSimTime?.(snapshot.simTimeS);
  // Terrain MUST be set before RunIC: even a zero-time initialization evaluates contacts.
  for (const [property, value] of Object.entries(snapshot.initial)) sdk.setPropertyValue(property, value);
  restoreControls(sdk, snapshot.controls);
  if (!sdk.runIc()) throw new Error("Flight state reinitialization failed");
  // The global command takes an engine INDEX: 0 starts engine zero, it does
  // not mean false. Starting also initializes RPM, which the per-engine
  // boolean alone does not do after a reset.
  if (snapshot.running) sdk.setPropertyValue("propulsion/set-running", -1);
  else sdk.setPropertyValue("propulsion/engine/set-running", 0);
  restoreControls(sdk, snapshot.controls);
  // Startup evaluates full power internally; the restored commands must be
  // reflected in native engine state before returning a recovered snapshot.
  if (!sdk.runIc()) throw new Error("Flight engine reinitialization failed");
  // Preserve physical actuator positions evaluated by RunIC until stepping.
  restoreControls(sdk, snapshot.controls);
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
