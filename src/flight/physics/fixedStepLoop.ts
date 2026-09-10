import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { readFlightState } from "../bridge/ecefBridge";
import { interpolateFlightState, type FlightState } from "./flightState";
import { flightLog } from "../diagnostics/flightLog";
import { readContactDiagnostics } from "./contactDiagnostics";
import { groundContactClearanceMeters } from "./groundContactClearance";
import {
  captureSimulation, invalidFlightStateReasons, restoreSimulation,
} from "./safeFlightState";

export const PHYSICS_HZ = 120;
export const FIXED_DT = 1 / PHYSICS_HZ;
const MAX_ACCUMULATED_SECONDS = FIXED_DT * 6;
// Beyond normal suspension compression, this is a hard impact. Feeding deep
// penetration into an unbounded spring turns a cliff into a launch pad.
const MAX_GROUND_PENETRATION_METERS = 0.5;

export interface FixedStepPhysicsOptions {
  /** Deliberate arcade mode; numerical/absolute flight-state guards still apply. */
  getArcadeGroundLaunches?: () => boolean;
}

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
  options: FixedStepPhysicsOptions = {},
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
        const beforeReasons = invalidFlightStateReasons(before);
        if (beforeReasons.length > 0) {
          fault = "Invalid flight state. Reposition the aircraft to reset the simulation.";
          flightLog.error("physics", "Faulted before stepping: state is outside the envelope", {
            failed: beforeReasons, state: before,
          });
          accumulator = 0;
          break;
        }
        const terrainMeters = sdk.getPropertyValue("position/terrain-elevation-asl-ft") * 0.3048;
        const groundPenetration = terrainMeters + groundContactClearanceMeters(sdk, before.rollRad, before.pitchRad) - before.altMeters;
        if (!options.getArcadeGroundLaunches?.() && groundPenetration > MAX_GROUND_PENETRATION_METERS) {
          fault = "Hard ground impact. Reposition the aircraft to recover.";
          flightLog.error("physics", "Stopped a deep ground impact before loading the gear springs", {
            penetrationMeters: Number(groundPenetration.toFixed(3)),
            terrainMeters, state: before,
          });
          prevState = currState = before;
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
        const airspeedJump = Math.abs(candidate.airspeedKts - before.airspeedKts);
        const candidateReasons = invalidFlightStateReasons(candidate);
        // Report which guard tripped, not merely that one did: "moved 4 km in
        // one 120 Hz step" and "airspeed is NaN" call for different fixes.
        const tripped: string[] = [];
        if (!success) tripped.push("JSBSim run() returned false");
        if (candidateReasons.length > 0) tripped.push(...candidateReasons);
        if (distance > 100) tripped.push(`moved ${distance.toFixed(1)} m in one ${(1 / FIXED_DT).toFixed(0)} Hz step (limit 100)`);
        if (airspeedJump > 200) tripped.push(`airspeed jumped ${airspeedJump.toFixed(1)} kt in one step (limit 200)`);
        if (tripped.length > 0) {
          // Read the contact state before restoring: the restore rewinds the
          // terrain elevation and gear compression that explain the fault.
          const contact = readContactDiagnostics(sdk, before.altMeters, candidate.altMeters);
          // The on-screen notice shows these reasons, and this is the one line
          // that separates a gear-spring launch from an aerodynamic
          // divergence, so it belongs there and not only in the console.
          if (contact.aglBeforeMeters < -1) {
            tripped.push(`gear was ${(-contact.aglBeforeMeters).toFixed(0)} m under the terrain JSBSim was given (${contact.terrainElevationMeters.toFixed(0)} m)`);
          }
          let restored: string | null = null;
          if (snapshot) {
            try { restoreSimulation(sdk, snapshot); }
            catch (error) { restored = error instanceof Error ? error.message : String(error); }
          }
          prevState = currState = before;
          fault = "Physics stopped after an unstable contact. Reposition the aircraft to reset the simulation.";
          flightLog.error("physics", "Faulted after stepping", {
            failed: tripped,
            stepMeters: Number(distance.toFixed(2)),
            airspeedJumpKts: Number(airspeedJump.toFixed(2)),
            before, after: candidate, contact,
            ...(restored ? { restoreFailed: restored } : {}),
          });
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
      const reasons = invalidFlightStateReasons(state);
      if (reasons.length > 0) {
        flightLog.error("physics", "Cannot reset: the simulation is still outside the envelope", {
          failed: reasons, state,
        });
        throw new Error(`Cannot reset physics to an invalid state: ${reasons.join("; ")}`);
      }
      if (fault) flightLog.info("physics", "Fault cleared; physics resuming", { clearedFault: fault });
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
