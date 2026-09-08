import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { readFlightState } from "../bridge/ecefBridge";
import { interpolateFlightState, type FlightState } from "./flightState";
import { captureSimulation, restoreSimulation, validFlightState } from "./safeFlightState";

export const PHYSICS_HZ = 120;
export const FIXED_DT = 1 / PHYSICS_HZ;
const MAX_ACCUMULATED_SECONDS = FIXED_DT * 6;

export interface FixedStepPhysicsLoop {
  update(renderDt: number, applyInputs: () => void | boolean | "reset"): FlightState;
  setPaused(paused: boolean): void;
  reset(): void;
  getLatestState(): FlightState | null;
  getFault(): string | null;
}

export function createFixedStepPhysicsLoop(
  sdk: JSBSimSdk,
  onStep?: (state: FlightState) => void,
): FixedStepPhysicsLoop {
  let accumulator = 0;
  let prevState: FlightState | null = null;
  let currState: FlightState | null = null;
  let paused = false;
  let fault: string | null = null;

  return {
    update(renderDt: number, applyInputs: () => void | boolean | "reset"): FlightState {
      if (paused || fault) return currState ?? readFlightState(sdk);

      const clampedDt = Number.isFinite(renderDt) ? Math.min(Math.max(renderDt, 0), 0.1) : 0;
      accumulator = Math.min(accumulator + clampedDt, MAX_ACCUMULATED_SECONDS);

      while (accumulator >= FIXED_DT) {
        const result = applyInputs();
        if (result === false) {
          accumulator = 0;
          if (currState) prevState = currState;
          break;
        }
        const before = readFlightState(sdk);
        if (!validFlightState(before)) {
          fault = "Invalid flight state. Reposition the aircraft to reset the simulation.";
          accumulator = 0;
          break;
        }
        currState ??= before;
        if (result === "reset") prevState = currState = before;
        const snapshot = typeof sdk.resetToInitialConditions === "function" ? captureSimulation(sdk) : null;
        const success = sdk.run();
        const candidate = readFlightState(sdk);
        const deltaLon = ((candidate.lonDeg - before.lonDeg + 540) % 360) - 180;
        const distance = Math.hypot((candidate.latDeg - before.latDeg) * 111320,
          deltaLon * Math.cos(before.latDeg * Math.PI / 180) * 111320, candidate.altMeters - before.altMeters);
        if (!success || !validFlightState(candidate) || distance > 100 || Math.abs(candidate.airspeedKts - before.airspeedKts) > 200) {
          if (snapshot) { try { restoreSimulation(sdk, snapshot); } catch { /* Keep the last valid display, even if recovery fails. */ } }
          prevState = currState = before;
          fault = "Physics stopped after an unstable contact. Reposition the aircraft to reset the simulation.";
          accumulator = 0;
          break;
        }
        prevState = currState;
        currState = candidate;
        onStep?.(currState);
        accumulator -= FIXED_DT;
      }

      const alpha = accumulator / FIXED_DT;
      return currState ? prevState === currState ? currState : interpolateFlightState(prevState, currState, alpha) : readFlightState(sdk);
    },
    setPaused(value: boolean): void {
      if (value === paused) return;
      paused = value;
      if (paused) accumulator = 0;
    },
    reset(): void {
      const state = readFlightState(sdk);
      if (!validFlightState(state)) throw new Error("Cannot reset physics to an invalid state");
      fault = null;
      accumulator = 0;
      currState = state;
      prevState = currState;
    },
    getLatestState(): FlightState | null {
      return currState;
    },
    getFault: () => fault,
  };
}
