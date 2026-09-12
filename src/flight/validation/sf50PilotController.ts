/** Project diagnostic pilot, not a Cirrus control law or flight-test tolerance. */
export const SF50_PITCH_CONTROLLER = {
  pitchToRateGainPerSec: 1.2,
  maximumCommandedPitchRateDegSec: 3,
  pitchRateProportionalGain: 0.25,
  pitchRateIntegralGain: 0.12,
  maximumIntegralNorm: 0.8,
  nearElevatorLimitNorm: 0.98,
  takeoffTrackingToleranceDeg: 1,
  takeoffSettlingAllowanceSec: 5,
} as const;

const limit = (value: number, maximum: number) =>
  Math.max(-maximum, Math.min(maximum, value));

export interface Sf50PitchCommand {
  elevatorNorm: number;
  pitchErrorDeg: number;
  commandedPitchRateDegSec: number;
  measuredPitchRateDegSec: number;
  pitchRateErrorDegSec: number;
  integralNoseUpNorm: number;
  saturated: boolean;
  nearElevatorLimit: boolean;
}

export interface Sf50PitchControllerGains {
  pitchToRateGainPerSec: number;
  maximumCommandedPitchRateDegSec: number;
  pitchRateProportionalGain: number;
  pitchRateIntegralGain: number;
  maximumIntegralNorm: number;
  nearElevatorLimitNorm: number;
}

/**
 * Pitch error requests a bounded pitch rate. A rate PI loop supplies the
 * persistent elevator bias that a proportional-only pitch loop cannot hold
 * at zero error. Negative elevator is nose-up in the current SF50 model.
 */
export class Sf50PitchController {
  #integralNoseUpNorm = 0;
  #settings: Readonly<Sf50PitchControllerGains>;

  constructor(gains: Partial<Sf50PitchControllerGains> = {}) {
    const settings = { ...SF50_PITCH_CONTROLLER, ...gains };
    if (!Object.values(settings).every(value => Number.isFinite(value) && value > 0) ||
      settings.maximumIntegralNorm > 1 || settings.nearElevatorLimitNorm > 1) {
      throw new RangeError("Pitch gains must be positive finite values with normalized limits at most one.");
    }
    this.#settings = Object.freeze(settings);
  }

  reset(): void { this.#integralNoseUpNorm = 0; }

  step(targetPitchDeg: number, pitchDeg: number, pitchRateRadSec: number, dtSec: number): Sf50PitchCommand {
    if (![targetPitchDeg, pitchDeg, pitchRateRadSec, dtSec].every(Number.isFinite) || dtSec <= 0) {
      throw new RangeError("Pitch control requires finite state and a positive finite timestep.");
    }
    const settings = this.#settings;
    const pitchErrorDeg = targetPitchDeg - pitchDeg;
    const commandedPitchRateDegSec = limit(
      settings.pitchToRateGainPerSec * pitchErrorDeg,
      settings.maximumCommandedPitchRateDegSec,
    );
    const measuredPitchRateDegSec = pitchRateRadSec * 180 / Math.PI;
    const pitchRateErrorDegSec = commandedPitchRateDegSec - measuredPitchRateDegSec;
    const proportional = settings.pitchRateProportionalGain * pitchRateErrorDegSec;
    const candidateIntegral = limit(
      this.#integralNoseUpNorm + settings.pitchRateIntegralGain * pitchRateErrorDegSec * dtSec,
      settings.maximumIntegralNorm,
    );
    const candidateDemand = proportional + candidateIntegral;
    // Do not accumulate error that would drive farther into actuator clipping.
    // Integration in the opposite direction is allowed to unwind the bias.
    if (!((candidateDemand > 1 && pitchRateErrorDegSec > 0) ||
      (candidateDemand < -1 && pitchRateErrorDegSec < 0))) {
      this.#integralNoseUpNorm = candidateIntegral;
    }
    const noseUpDemand = proportional + this.#integralNoseUpNorm;
    const elevatorNorm = -limit(noseUpDemand, 1);
    return {
      elevatorNorm, pitchErrorDeg, commandedPitchRateDegSec,
      measuredPitchRateDegSec, pitchRateErrorDegSec,
      integralNoseUpNorm: this.#integralNoseUpNorm,
      saturated: Math.abs(noseUpDemand) >= 1,
      nearElevatorLimit: Math.abs(elevatorNorm) >= settings.nearElevatorLimitNorm,
    };
  }
}

interface PitchSample {
  simTimeSec: number;
  pitchDeg: number;
  weightOnWheels: boolean;
}

/** Sampled tracking gates are separate from runway-distance comparison. */
export class Sf50TakeoffPitchAudit {
  #rotationTimeSec: number | null = null;
  #firstAirborne: PitchSample | null = null;
  #last: PitchSample | null = null;
  #targetPitchDeg: number;
  #samples = 0;
  #nearLimitSamples = 0;
  #settledSamples = 0;
  #settledSquaredError = 0;
  #settledMaximumErrorDeg = 0;

  constructor(targetPitchDeg: number) {
    if (!Number.isFinite(targetPitchDeg)) throw new RangeError("Pitch target must be finite.");
    this.#targetPitchDeg = targetPitchDeg;
  }

  startRotation(simTimeSec: number): void {
    if (!Number.isFinite(simTimeSec)) throw new RangeError("Rotation time must be finite.");
    this.#rotationTimeSec ??= simTimeSec;
  }

  observe(sample: PitchSample, command: Sf50PitchCommand): void {
    if (this.#rotationTimeSec === null) return;
    if (![sample.simTimeSec, sample.pitchDeg].every(Number.isFinite) ||
      sample.simTimeSec < (this.#last?.simTimeSec ?? this.#rotationTimeSec)) {
      throw new RangeError("Pitch audit requires finite, monotonic samples.");
    }
    this.#last = { ...sample };
    this.#samples++;
    if (command.nearElevatorLimit) this.#nearLimitSamples++;
    if (!sample.weightOnWheels) this.#firstAirborne ??= { ...sample };
    if (sample.simTimeSec - this.#rotationTimeSec >= SF50_PITCH_CONTROLLER.takeoffSettlingAllowanceSec) {
      const error = Math.abs(this.#targetPitchDeg - sample.pitchDeg);
      this.#settledSamples++;
      this.#settledSquaredError += error * error;
      this.#settledMaximumErrorDeg = Math.max(this.#settledMaximumErrorDeg, error);
    }
  }

  snapshot(screenReached: boolean) {
    const toleranceDeg = SF50_PITCH_CONTROLLER.takeoffTrackingToleranceDeg;
    const checkpoint = (sample: PitchSample | null) => sample === null ? null : ({
      simTimeSec: sample.simTimeSec, pitchDeg: sample.pitchDeg,
      errorDeg: this.#targetPitchDeg - sample.pitchDeg,
      passed: Math.abs(this.#targetPitchDeg - sample.pitchDeg) <= toleranceDeg,
    });
    const firstAirborne = checkpoint(this.#firstAirborne);
    const screen = checkpoint(screenReached ? this.#last : null);
    const blockers: string[] = [];
    if (this.#rotationTimeSec === null) blockers.push("Takeoff rotation was never commanded.");
    if (!firstAirborne?.passed) blockers.push("Takeoff pitch did not meet the project tracking gate at first sampled airborne state.");
    if (!screen?.passed) blockers.push("Takeoff pitch did not meet the project tracking gate at the 50-foot endpoint.");
    if (this.#settledSamples && this.#settledMaximumErrorDeg > toleranceDeg) {
      blockers.push("Takeoff pitch exceeded the project tracking tolerance after the rotation settling allowance.");
    }
    return {
      targetPitchDeg: this.#targetPitchDeg, toleranceDeg,
      settlingAllowanceSec: SF50_PITCH_CONTROLLER.takeoffSettlingAllowanceSec,
      rotationCommandTimeSec: this.#rotationTimeSec,
      firstAirborne, screen, observedSamples: this.#samples,
      settledSamples: this.#settledSamples,
      settledRmsErrorDeg: this.#settledSamples ? Math.sqrt(this.#settledSquaredError / this.#settledSamples) : null,
      settledMaximumErrorDeg: this.#settledSamples ? this.#settledMaximumErrorDeg : null,
      nearElevatorLimitFraction: this.#samples ? this.#nearLimitSamples / this.#samples : null,
      status: blockers.length ? "blocked" as const : "tracking-gates-met" as const,
      basis: "Project numerical tracking gates, not AFM tolerances; first-airborne and screen samples are not interpolated flight-test measurements",
      blockers,
    };
  }
}
