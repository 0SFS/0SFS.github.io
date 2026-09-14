/**
 * Single control-owner decision for each physics step.
 *
 * Input owners (local stick vs phone) are resolved before this runs. This
 * arbiter then decides, per axis, whether the pilot or an autopilot writes
 * the normalized command that `applyFlightControls` sends to JSBSim.
 *
 * Override policy (documented, same idea as auto-trim):
 * - Attitude axes (roll / pitch / yaw) yield while that stick is deflected
 *   beyond STICK_DEADBAND, and while on the ground. Releasing recaptures
 *   the current attitude.
 * - Throttle and flaps yield when the pilot lever moves.
 * - Gear yields when the lever changes.
 * - ArduPilot never owns an axis unless the status object says it is
 *   connected and ready. A selected-but-disconnected backend refuses engage.
 */

import type { ControlSurfaceState } from "../input/flightInputManager";
import {
  type AutopilotAxisId,
  type AutopilotSettingsV1,
} from "./autopilotSettings";
import {
  ardupilotCanOwnControls,
  type ArduPilotStatus,
} from "./ardupilotStatus";
import {
  createOurAutopilotState,
  stickDeflected,
  stepOurAutopilot,
  type OurAutopilotState,
} from "./ourAutopilot";

export type AxisOwner = "pilot" | "our-ap" | "ardupilot";

export type AutopilotOwners = Record<AutopilotAxisId, AxisOwner>;

export interface ControlArbiterState {
  requestedEngaged: boolean;
  our: OurAutopilotState;
  heldGearDownNorm: number;
  heldFlaps: number;
  previousPilotThrottle: number;
  previousPilotFlaps: number;
  previousPilotGearDownNorm: number;
  hasPilotBaseline: boolean;
}

export function createControlArbiterState(
  gearDownNorm = 1,
  flaps = 0,
  throttle = 0,
): ControlArbiterState {
  return {
    requestedEngaged: false,
    our: createOurAutopilotState(),
    heldGearDownNorm: gearDownNorm,
    heldFlaps: flaps,
    previousPilotThrottle: throttle,
    previousPilotFlaps: flaps,
    previousPilotGearDownNorm: gearDownNorm,
    hasPilotBaseline: false,
  };
}

export function setArbiterEngaged(state: ControlArbiterState, engaged: boolean): ControlArbiterState {
  if (state.requestedEngaged === engaged) return state;
  return {
    ...state,
    requestedEngaged: engaged,
    our: engaged ? createOurAutopilotState() : state.our,
  };
}

export function resetArbiterHold(state: ControlArbiterState): ControlArbiterState {
  return {
    ...state,
    our: createOurAutopilotState(),
    hasPilotBaseline: false,
  };
}

export function autopilotEngageBlockReason(
  settings: AutopilotSettingsV1,
  ardupilot: ArduPilotStatus,
): string | null {
  if (settings.backend !== "ardupilot") return null;
  if (!ardupilotCanOwnControls(ardupilot)) {
    return ardupilot.detail;
  }
  return null;
}

export function idleAutopilotOwners(): AutopilotOwners {
  return {
    roll: "pilot",
    pitch: "pilot",
    yaw: "pilot",
    throttle: "pilot",
    gear: "pilot",
    flaps: "pilot",
  };
}

function allPilot(): AutopilotOwners {
  return idleAutopilotOwners();
}

function leverMoved(current: number, previous: number, deadband = 0.03): boolean {
  return Math.abs(current - previous) > deadband;
}

export interface ControlArbiterFlight {
  dt: number;
  onGround: boolean;
  rollRad: number;
  rollRateRad: number;
  pitchRad: number;
  pitchRateRad: number;
  headingRad: number;
  yawRateRad: number;
  airspeedKts: number;
}

export interface ControlArbiterInput {
  settings: AutopilotSettingsV1;
  ardupilot: ArduPilotStatus;
  pilot: ControlSurfaceState;
  gearDownNorm: number;
  flight: ControlArbiterFlight;
}

export interface ControlArbiterResult {
  engaged: boolean;
  blockedReason: string | null;
  owners: AutopilotOwners;
  controls: ControlSurfaceState;
  gearDownNorm: number;
}

export function stepControlArbiter(
  state: ControlArbiterState,
  input: ControlArbiterInput,
): { state: ControlArbiterState; result: ControlArbiterResult } {
  const blockedReason = autopilotEngageBlockReason(input.settings, input.ardupilot);
  const engaged = state.requestedEngaged && blockedReason === null;
  const owners = allPilot();
  const next: ControlArbiterState = {
    ...state,
    requestedEngaged: engaged ? state.requestedEngaged : false,
    previousPilotThrottle: input.pilot.throttle,
    previousPilotFlaps: input.pilot.flaps,
    previousPilotGearDownNorm: input.gearDownNorm,
    hasPilotBaseline: true,
  };

  if (!engaged) {
    next.our = createOurAutopilotState();
    next.heldGearDownNorm = input.gearDownNorm;
    next.heldFlaps = input.pilot.flaps;
    return {
      state: next,
      result: {
        engaged: false,
        blockedReason: state.requestedEngaged ? blockedReason : null,
        owners,
        controls: { ...input.pilot },
        gearDownNorm: input.gearDownNorm,
      },
    };
  }

  const backendOwner: AxisOwner = input.settings.backend === "ardupilot" ? "ardupilot" : "our-ap";
  // ArduPilot connected+ready would own every automated axis. This slice never
  // reaches that branch without `ardupilotCanOwnControls`, which refuses
  // disconnected status above.
  const throttleMoved = state.hasPilotBaseline
    && leverMoved(input.pilot.throttle, state.previousPilotThrottle);
  const flapsMoved = state.hasPilotBaseline
    && leverMoved(input.pilot.flaps, state.previousPilotFlaps);
  const gearMoved = state.hasPilotBaseline
    && input.gearDownNorm !== state.previousPilotGearDownNorm;

  const want = input.settings.axes;
  const yieldRoll = input.flight.onGround || stickDeflected(input.pilot.aileron);
  const yieldPitch = input.flight.onGround || stickDeflected(input.pilot.elevator);
  const yieldYaw = input.flight.onGround || stickDeflected(input.pilot.rudder);
  const yieldThrottle = input.flight.onGround || throttleMoved;
  if (want.roll && !yieldRoll) owners.roll = backendOwner;
  if (want.pitch && !yieldPitch) owners.pitch = backendOwner;
  if (want.yaw && !yieldYaw) owners.yaw = backendOwner;
  if (want.throttle && !yieldThrottle) owners.throttle = backendOwner;
  if (want.gear && !gearMoved) owners.gear = backendOwner;
  if (want.flaps && !flapsMoved) owners.flaps = backendOwner;

  const controls = { ...input.pilot };
  let gearDownNorm = input.gearDownNorm;

  if (backendOwner === "our-ap") {
    const stepped = stepOurAutopilot(state.our, {
      dt: input.flight.dt,
      onGround: input.flight.onGround,
      rollRad: input.flight.rollRad,
      rollRateRad: input.flight.rollRateRad,
      pitchRad: input.flight.pitchRad,
      pitchRateRad: input.flight.pitchRateRad,
      headingRad: input.flight.headingRad,
      yawRateRad: input.flight.yawRateRad,
      airspeedKts: input.flight.airspeedKts,
      throttle: input.pilot.throttle,
      aileron: input.pilot.aileron,
      elevator: input.pilot.elevator,
      rudder: input.pilot.rudder,
      active: {
        roll: owners.roll === "our-ap",
        pitch: owners.pitch === "our-ap",
        yaw: owners.yaw === "our-ap",
        throttle: owners.throttle === "our-ap",
      },
      throttleMode: input.settings.throttleMode,
    });
    next.our = stepped.state;
    if (stepped.commands.aileron !== null) controls.aileron = stepped.commands.aileron;
    if (stepped.commands.elevator !== null) controls.elevator = stepped.commands.elevator;
    if (stepped.commands.rudder !== null) controls.rudder = stepped.commands.rudder;
    if (stepped.commands.throttle !== null) controls.throttle = stepped.commands.throttle;
  }

  if (owners.gear !== "pilot") {
    gearDownNorm = state.hasPilotBaseline ? state.heldGearDownNorm : input.gearDownNorm;
    next.heldGearDownNorm = gearDownNorm;
  } else {
    next.heldGearDownNorm = input.gearDownNorm;
  }
  if (owners.flaps !== "pilot") {
    controls.flaps = state.hasPilotBaseline ? state.heldFlaps : input.pilot.flaps;
    next.heldFlaps = controls.flaps;
  } else {
    next.heldFlaps = input.pilot.flaps;
  }

  return {
    state: next,
    result: {
      engaged: true,
      blockedReason: null,
      owners,
      controls,
      gearDownNorm,
    },
  };
}