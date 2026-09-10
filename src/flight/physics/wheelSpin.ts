/**
 * One-way wheel spin/audio experiment. JSBSim prescribes contact motion.
 * This module never changes aircraft forces or collision response.
 * Slip energy is a feedback-model quantity, not aircraft energy loss.
 */
export type WheelSpinMode = "instant" | "inertia";

export interface WheelSpinConfig {
  name: "NOSE" | "LEFT_MAIN" | "RIGHT_MAIN";
  radiusMeters: number;
  widthMeters: number;
  inertiaKgMetersSquared: number;
  frictionCoefficient: number;
  maxBrakeTorqueNewtonMeters: number;
}

/**
 * Outside dimensions approximate Goodyear's 5.00-5 / 6.00-6 catalog.
 * Inertias use estimated tire/hub masses, not measured C172 assemblies.
 * Brake torque is a tunable estimate, not a verified C172 specification.
 */
export const WHEEL_SPIN_CONFIGS: readonly WheelSpinConfig[] = [
  { name: "NOSE", radiusMeters: 0.18, widthMeters: 0.127, inertiaKgMetersSquared: 0.052,
    frictionCoefficient: 0.5, maxBrakeTorqueNewtonMeters: 0 },
  { name: "LEFT_MAIN", radiusMeters: 0.22, widthMeters: 0.152, inertiaKgMetersSquared: 0.124,
    frictionCoefficient: 0.5, maxBrakeTorqueNewtonMeters: 450 },
  { name: "RIGHT_MAIN", radiusMeters: 0.22, widthMeters: 0.152, inertiaKgMetersSquared: 0.124,
    frictionCoefficient: 0.5, maxBrakeTorqueNewtonMeters: 450 },
];

export interface WheelSpinState {
  /** Wrapped to [0, 2π); positive speed rolls forward. */
  angleRad: number;
  omegaRadSec: number;
  /** Signed longitudinal slip at the end of the step. */
  slipMetersSec: number;
  /** Step-average slip work/time, including convergence inside this step. */
  slipPowerWatts: number;
  onGround: boolean;
  compressionMeters: number;
  steeringRad: number;
}

export interface WheelSpinInput {
  onGround: boolean;
  rollMetersSec: number;
  normalLoadNewtons: number;
  compressionMeters: number;
  steeringRad: number;
  brake: number;
}

const TWO_PI = 2 * Math.PI;
const AIRBORNE_COAST_SECONDS = 20;

export function createWheelSpinState(): WheelSpinState {
  return { angleRad: 0, omegaRadSec: 0, slipMetersSec: 0, slipPowerWatts: 0,
    onGround: false, compressionMeters: 0, steeringRad: 0 };
}

function bounded(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 0;
}

/**
 * Allocation-free, intended for the fixed 120 Hz loop. Integrates constant
 * tire/brake torque between ω = 0 and ω = v/r. Capping at those boundaries
 * avoids overshoot, reversal chatter, and numerical energy production.
 * dt is bounded for fault containment.
 */
export function stepWheelSpin(
  state: WheelSpinState, config: WheelSpinConfig, input: WheelSpinInput,
  dt: number, mode: WheelSpinMode,
): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const seconds = Math.min(dt, 0.25);
  const radius = Math.max(0.01, bounded(config.radiusMeters, 0.01, 2));
  const inertia = Math.max(0.001, bounded(config.inertiaKgMetersSquared, 0.001, 100));
  const speed = bounded(input.rollMetersSec, -200, 200);
  const target = speed / radius;
  const brakeTorque = bounded(input.brake, 0, 1)
    * bounded(config.maxBrakeTorqueNewtonMeters, 0, 10_000);
  let omega = bounded(state.omegaRadSec, -20_000, 20_000);
  let angle = bounded(state.angleRad, -TWO_PI, TWO_PI);
  let heat = 0;

  state.onGround = input.onGround;
  state.compressionMeters = input.onGround ? bounded(input.compressionMeters, 0, 1) : 0;
  state.steeringRad = bounded(input.steeringRad, -Math.PI / 2, Math.PI / 2);

  if (!input.onGround) {
    // Ignore JSBSim's artificial airborne wheel-speed proxy decay. Keep our
    // angular state through bounces; brakes and drag dissipate it locally.
    const brakeAcceleration = brakeTorque / inertia;
    const brakingTime = brakeAcceleration > 0 ? Math.min(seconds, Math.abs(omega) / brakeAcceleration) : seconds;
    const brakedOmega = Math.sign(omega) * Math.max(0, Math.abs(omega) - brakeAcceleration * seconds);
    angle += (omega + brakedOmega) * brakingTime / 2;
    omega = brakedOmega * Math.exp(-seconds / AIRBORNE_COAST_SECONDS);
  } else if (mode === "instant") {
    // Baseline matches contact motion immediately, without spin-up slip.
    // JSBSim braking still affects that prescribed contact motion.
    omega = target;
    angle += omega * seconds;
  } else {
    const frictionForce = bounded(config.frictionCoefficient, 0, 2)
      * bounded(input.normalLoadNewtons, 0, 200_000);
    const tireTorqueLimit = frictionForce * radius;
    let remaining = seconds;

    for (let segment = 0; segment < 4 && remaining > 0; segment++) {
      let tireTorque: number;
      let brake: number;
      if (omega === target) {
        brake = -Math.sign(omega) * brakeTorque;
        tireTorque = -Math.sign(brake) * Math.min(Math.abs(brake), tireTorqueLimit);
      } else {
        tireTorque = Math.sign(target - omega) * tireTorqueLimit;
        brake = omega === 0
          ? -Math.sign(tireTorque) * Math.min(Math.abs(tireTorque), brakeTorque)
          : -Math.sign(omega) * brakeTorque;
      }
      const acceleration = (tireTorque + brake) / inertia;
      let duration = remaining;
      let boundary: number | null = null;
      if (acceleration !== 0) {
        const zeroTime = -omega / acceleration;
        if (zeroTime > 0 && zeroTime <= duration) {
          duration = zeroTime;
          boundary = 0;
        }
        const rollingTime = (target - omega) / acceleration;
        if (rollingTime > 0 && rollingTime <= duration) {
          duration = rollingTime;
          boundary = target;
        }
      }
      const rotation = omega * duration + acceleration * duration * duration / 2;
      // Tire force × relative contact travel. Positive even when slip reaches
      // zero before this 120 Hz step finishes.
      heat += Math.max(0, tireTorque / radius * (speed * duration - radius * rotation));
      angle += rotation;
      omega = boundary ?? omega + acceleration * duration;
      remaining -= duration;
    }
  }

  state.angleRad = ((angle % TWO_PI) + TWO_PI) % TWO_PI;
  state.omegaRadSec = omega;
  state.slipMetersSec = input.onGround && mode === "inertia" ? speed - radius * omega : 0;
  state.slipPowerWatts = heat / seconds;
}
