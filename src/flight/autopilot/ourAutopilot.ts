/**
 * In-sim autopilot. It drives the surfaces and throttle JSBSim already
 * exposes — not the trim wheels. Pitch/roll AUTO on the HUD remains a
 * separate trim assist that only runs when this AP does not own that axis.
 *
 * Signs match the stick: positive aileron rolls right, positive elevator
 * pitches the nose down, positive rudder yaws right (converted at apply).
 */

export interface AttitudeHoldState {
  hasTarget: boolean;
  targetRad: number;
  command: number;
}

export interface ThrottleHoldState {
  hasTarget: boolean;
  /** Knots when mode is airspeed; lever 0..1 when mode is hold. */
  target: number;
  command: number;
  integral: number;
}

export interface OurAutopilotState {
  roll: AttitudeHoldState;
  pitch: AttitudeHoldState;
  yaw: AttitudeHoldState;
  throttle: ThrottleHoldState;
}

export function createOurAutopilotState(): OurAutopilotState {
  return {
    roll: { hasTarget: false, targetRad: 0, command: 0 },
    pitch: { hasTarget: false, targetRad: 0, command: 0 },
    yaw: { hasTarget: false, targetRad: 0, command: 0 },
    throttle: { hasTarget: false, target: 0, command: 0, integral: 0 },
  };
}

const MAX_SURFACE_RATE = 2.5;
const MAX_ERROR = 30 * Math.PI / 180;
const ROLL_KP = 1.6;
const ROLL_KD = 0.45;
const PITCH_KP = 1.6;
const PITCH_KD = 0.45;
const YAW_KP = 0.9;
const YAW_KD = 0.55;
const THROTTLE_KP = 0.035;
const THROTTLE_KI = 0.012;
const THROTTLE_RATE = 0.35;
const MAX_IAS_ERROR = 40;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function wrapAngle(value: number): number {
  return ((value + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function stepAttitude(
  state: AttitudeHoldState,
  input: {
    dt: number;
    measuredRad: number;
    rateRad: number;
    kp: number;
    kd: number;
    /** +1 if positive command increases `measuredRad`. */
    commandSign: number;
    active: boolean;
    yieldToPilot: boolean;
  },
): { state: AttitudeHoldState; command: number | null } {
  if (!input.active) {
    return { state: { hasTarget: false, targetRad: 0, command: 0 }, command: null };
  }
  const dt = Math.max(0, finite(input.dt));
  const measuredRad = finite(input.measuredRad);
  const rateRad = finite(input.rateRad);
  if (dt === 0 || input.yieldToPilot) {
    return {
      state: {
        hasTarget: !input.yieldToPilot,
        targetRad: measuredRad,
        command: state.command,
      },
      command: null,
    };
  }
  const targetRad = state.hasTarget ? state.targetRad : measuredRad;
  const error = clamp(wrapAngle(targetRad - measuredRad), -MAX_ERROR, MAX_ERROR);
  const alongMeasured = input.kp * error - input.kd * rateRad;
  const commanded = clamp(input.commandSign * alongMeasured, -1, 1);
  const delta = clamp(commanded - state.command, -MAX_SURFACE_RATE * dt, MAX_SURFACE_RATE * dt);
  const next = clamp(state.command + delta, -1, 1);
  return {
    state: { hasTarget: true, targetRad, command: next },
    command: next,
  };
}

export interface OurAutopilotInput {
  dt: number;
  onGround: boolean;
  rollRad: number;
  rollRateRad: number;
  pitchRad: number;
  pitchRateRad: number;
  headingRad: number;
  yawRateRad: number;
  airspeedKts: number;
  throttle: number;
  aileron: number;
  elevator: number;
  rudder: number;
  active: { roll: boolean; pitch: boolean; yaw: boolean; throttle: boolean };
  throttleMode: "airspeed" | "hold";
  /** osfs.autopilot.stickOverride: a stick deflected further than this takes its axis back. */
  stickOverride: number;
}

export interface OurAutopilotCommands {
  aileron: number | null;
  elevator: number | null;
  rudder: number | null;
  throttle: number | null;
}

export function stickDeflected(value: number, threshold: number): boolean {
  return Math.abs(finite(value)) > threshold;
}

export function stepOurAutopilot(
  state: OurAutopilotState,
  input: OurAutopilotInput,
): { state: OurAutopilotState; commands: OurAutopilotCommands } {
  const onGround = input.onGround;
  const rolled = stepAttitude(state.roll, {
    dt: input.dt,
    measuredRad: input.rollRad,
    rateRad: input.rollRateRad,
    kp: ROLL_KP,
    kd: ROLL_KD,
    commandSign: 1,
    active: input.active.roll,
    yieldToPilot: onGround || stickDeflected(input.aileron, input.stickOverride),
  });
  const pitched = stepAttitude(state.pitch, {
    dt: input.dt,
    measuredRad: input.pitchRad,
    rateRad: input.pitchRateRad,
    kp: PITCH_KP,
    kd: PITCH_KD,
    commandSign: -1,
    active: input.active.pitch,
    yieldToPilot: onGround || stickDeflected(input.elevator, input.stickOverride),
  });
  const yawed = stepAttitude(state.yaw, {
    dt: input.dt,
    measuredRad: input.headingRad,
    rateRad: input.yawRateRad,
    kp: YAW_KP,
    kd: YAW_KD,
    commandSign: 1,
    active: input.active.yaw,
    yieldToPilot: onGround || stickDeflected(input.rudder, input.stickOverride),
  });

  let throttleState = state.throttle;
  let throttleCommand: number | null = null;
  if (!input.active.throttle) {
    throttleState = { hasTarget: false, target: 0, command: 0, integral: 0 };
  } else if (input.dt <= 0 || onGround) {
    throttleState = {
      hasTarget: !onGround,
      target: input.throttleMode === "airspeed" ? finite(input.airspeedKts) : clamp(finite(input.throttle), 0, 1),
      command: throttleState.command,
      integral: 0,
    };
  } else if (input.throttleMode === "hold") {
    const target = throttleState.hasTarget ? throttleState.target : clamp(finite(input.throttle), 0, 1);
    throttleState = { hasTarget: true, target, command: target, integral: 0 };
    throttleCommand = target;
  } else {
    const lever = clamp(finite(input.throttle), 0, 1);
    const previous = throttleState.hasTarget ? throttleState.command : lever;
    const target = throttleState.hasTarget ? throttleState.target : finite(input.airspeedKts);
    const error = clamp(target - finite(input.airspeedKts), -MAX_IAS_ERROR, MAX_IAS_ERROR);
    const integral = clamp(throttleState.integral + error * input.dt, -20, 20);
    const commanded = clamp(previous + (THROTTLE_KP * error + THROTTLE_KI * integral) * input.dt, 0, 1);
    const next = clamp(
      previous + clamp(commanded - previous, -THROTTLE_RATE * input.dt, THROTTLE_RATE * input.dt),
      0,
      1,
    );
    throttleState = { hasTarget: true, target, command: next, integral };
    throttleCommand = next;
  }

  return {
    state: {
      roll: rolled.state,
      pitch: pitched.state,
      yaw: yawed.state,
      throttle: throttleState,
    },
    commands: {
      aileron: rolled.command,
      elevator: pitched.command,
      rudder: yawed.command,
      throttle: throttleCommand,
    },
  };
}
