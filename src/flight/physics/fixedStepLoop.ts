import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { readFlightState } from "../bridge/ecefBridge";
import { interpolateFlightState, type FlightState } from "./flightState";

export const PHYSICS_HZ = 120;
export const FIXED_DT = 1 / PHYSICS_HZ;
const MAX_ACCUMULATED_SECONDS = FIXED_DT * 6;

export interface FixedStepPhysicsLoop {
  update(renderDt: number, applyInputs: () => void): FlightState;
  setPaused(paused: boolean): void;
  reset(): void;
  getLatestState(): FlightState | null;
}

export function createFixedStepPhysicsLoop(
  sdk: JSBSimSdk,
  onStep?: (state: FlightState) => void,
): FixedStepPhysicsLoop {
  let accumulator = 0;
  let prevState: FlightState | null = null;
  let currState: FlightState | null = null;
  let paused = false;

  return {
    update(renderDt: number, applyInputs: () => void): FlightState {
      if (paused) return currState ?? readFlightState(sdk);

      const clampedDt = Math.min(Math.max(renderDt, 0), 0.1);
      accumulator = Math.min(accumulator + clampedDt, MAX_ACCUMULATED_SECONDS);

      while (accumulator >= FIXED_DT) {
        applyInputs();
        if (!sdk.run()) {
          break;
        }
        prevState = currState;
        currState = readFlightState(sdk);
        onStep?.(currState);
        accumulator -= FIXED_DT;
      }

      const alpha = accumulator / FIXED_DT;
      return interpolateFlightState(prevState, currState, alpha);
    },
    setPaused(value: boolean): void {
      if (value === paused) return;
      paused = value;
      if (paused) accumulator = 0;
    },
    reset(): void {
      accumulator = 0;
      currState = readFlightState(sdk);
      prevState = currState;
    },
    getLatestState(): FlightState | null {
      return currState;
    },
  };
}
