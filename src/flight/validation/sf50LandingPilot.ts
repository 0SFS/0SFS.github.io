import type { Sf50PitchCommand } from "./sf50PilotController.ts";

export interface Sf50LandingPilotSettings {
  pathMode: "fixed-pitch" | "flight-path";
  approachFlightPathDeg: number;
  approachPitchDeg: number;
  flarePitchDeg: number;
  flareHeightFt: number;
  minimumSinkFps: number;
  flightPathGain: number;
  minimumPitchDeg: number;
  maximumPitchDeg: number;
  brakeMode: "instant" | "ramp" | "deceleration";
  brakeDelaySec: number;
  brakeRampSec: number;
  decelerationG: number;
  brakeIntegralGain: number;
  decelerationFilterSec: number;
  maximumBrakeNorm: number;
}

/** Project pilot-demand fit, not Cirrus autobrake or tire-friction data. */
export const SF50_LANDING_PILOT_DEFAULTS: Readonly<Sf50LandingPilotSettings> = Object.freeze({
  pathMode: "flight-path",
  approachFlightPathDeg: -3, approachPitchDeg: 3, flarePitchDeg: 5,
  flareHeightFt: 30, minimumSinkFps: 2.5, flightPathGain: 2.4,
  minimumPitchDeg: -3, maximumPitchDeg: 8,
  brakeMode: "deceleration", brakeDelaySec: 0.35, brakeRampSec: 1,
  decelerationG: 0.16, brakeIntegralGain: 0.8, decelerationFilterSec: 0.15,
  maximumBrakeNorm: 1,
});

/** Numerical touchdown-quality allowance, not an AFM limit. */
export const SF50_LANDING_TOUCHDOWN_MAXIMUM_SINK_FPS = 3.5;

interface LandingObservation {
  simTimeSec: number;
  pitchDeg: number;
  flightPathAngleDeg: number;
  northVelocityFps: number;
  eastVelocityFps: number;
  groundSpeedFps: number;
  downVelocityFps: number;
  calibratedAirspeedKts: number;
  weightOnWheels: boolean;
}

export interface Sf50LandingCommand {
  targetPitchDeg: number;
  flightPathTargetDeg: number | null;
  descentTargetFps: number | null;
  brakeNorm: number;
  mainContactSinceSec: number | null;
  filteredDecelerationG: number;
  phase: "approach" | "flare" | "rollout";
}

/** Uses controls only; never writes attitude, native forces or tire coefficients. */
export class Sf50LandingPilot {
  #settings: Readonly<Sf50LandingPilotSettings>;
  #priorTime: number | null = null;
  #priorGroundSpeedFps: number | null = null;
  #mainContactSinceSec: number | null = null;
  #brakeDemand = 0;
  #filteredDecelerationG = 0;
  #command: Sf50LandingCommand | null = null;
  #touchdown: { timeSec: number; pitchDeg: number; casKts: number; groundSpeedFps: number; sinkFps: number } | null = null;
  #airborneSamples = 0;
  #airborneSquaredGammaError = 0;
  #airborneMaximumGammaError = 0;
  #airborneNearElevatorLimitSamples = 0;
  #maximumBrakeNorm = 0;

  constructor(settings: Sf50LandingPilotSettings = SF50_LANDING_PILOT_DEFAULTS) {
    const positive = [settings.flareHeightFt, settings.minimumSinkFps, settings.flightPathGain,
      settings.brakeRampSec, settings.decelerationG, settings.brakeIntegralGain,
      settings.decelerationFilterSec, settings.maximumBrakeNorm];
    if (!positive.every(value => Number.isFinite(value) && value > 0) ||
      ![settings.approachFlightPathDeg, settings.approachPitchDeg, settings.flarePitchDeg,
        settings.minimumPitchDeg, settings.maximumPitchDeg, settings.brakeDelaySec].every(Number.isFinite) ||
      settings.approachFlightPathDeg >= 0 || settings.approachFlightPathDeg <= -30 ||
      settings.minimumPitchDeg >= settings.maximumPitchDeg || settings.brakeDelaySec < 0 ||
      settings.maximumBrakeNorm > 1 || settings.decelerationG > 1 ||
      !["fixed-pitch", "flight-path"].includes(settings.pathMode) ||
      !["instant", "ramp", "deceleration"].includes(settings.brakeMode)) {
      throw new RangeError("Invalid SF50 landing pilot settings.");
    }
    this.#settings = Object.freeze({ ...settings });
  }

  step(observed: LandingObservation, clearanceFt: number, bothMainsLoaded: boolean,
    touchedDown: boolean, dtSec: number): Sf50LandingCommand {
    if (![observed.simTimeSec, observed.pitchDeg, observed.flightPathAngleDeg,
      observed.northVelocityFps, observed.eastVelocityFps, observed.groundSpeedFps,
      clearanceFt, dtSec].every(Number.isFinite) || dtSec <= 0 ||
      observed.groundSpeedFps < 0 ||
      (this.#priorTime !== null && observed.simTimeSec <= this.#priorTime)) {
      throw new RangeError("Landing pilot requires finite state, positive timestep and advancing time.");
    }
    const s = this.#settings;
    this.#priorTime = observed.simTimeSec;
    let targetPitchDeg = touchedDown ? 0 : clearanceFt < s.flareHeightFt ? s.flarePitchDeg : s.approachPitchDeg;
    let flightPathTargetDeg: number | null = null;
    let descentTargetFps: number | null = null;
    if (!touchedDown && s.pathMode === "flight-path") {
      const horizontalSpeed = Math.max(1, Math.hypot(observed.northVelocityFps, observed.eastVelocityFps));
      const fraction = Math.max(0, Math.min(1, clearanceFt / s.flareHeightFt));
      descentTargetFps = Math.max(s.minimumSinkFps,
        horizontalSpeed * Math.tan(-s.approachFlightPathDeg * Math.PI / 180) * Math.sqrt(fraction));
      flightPathTargetDeg = -Math.atan2(descentTargetFps, horizontalSpeed) * 180 / Math.PI;
      targetPitchDeg = Math.max(s.minimumPitchDeg, Math.min(s.maximumPitchDeg,
        observed.pitchDeg + s.flightPathGain * (flightPathTargetDeg - observed.flightPathAngleDeg)));
    }
    const decelerationG = this.#priorGroundSpeedFps === null ? 0 :
      (this.#priorGroundSpeedFps - observed.groundSpeedFps) / dtSec / 32.174;
    this.#priorGroundSpeedFps = observed.groundSpeedFps;
    this.#filteredDecelerationG += (1 - Math.exp(-dtSec / s.decelerationFilterSec)) *
      (decelerationG - this.#filteredDecelerationG);
    if (!bothMainsLoaded) {
      this.#mainContactSinceSec = null;
      this.#brakeDemand = 0;
    } else {
      this.#mainContactSinceSec ??= observed.simTimeSec;
      const elapsed = observed.simTimeSec - this.#mainContactSinceSec - s.brakeDelaySec;
      if (s.brakeMode === "instant") this.#brakeDemand = s.maximumBrakeNorm;
      else if (elapsed >= 0) {
        if (s.brakeMode === "ramp") this.#brakeDemand = Math.min(s.maximumBrakeNorm, elapsed / s.brakeRampSec);
        else if (observed.groundSpeedFps >= 1) {
          this.#brakeDemand = Math.max(0, Math.min(s.maximumBrakeNorm,
            this.#brakeDemand + s.brakeIntegralGain * (s.decelerationG - this.#filteredDecelerationG) * dtSec));
        }
        // Hold the last demand below the stop threshold rather than chasing
        // derivative noise after the aircraft has stopped.
      }
    }
    const brakeNorm = bothMainsLoaded ? this.#brakeDemand : 0;
    this.#maximumBrakeNorm = Math.max(this.#maximumBrakeNorm, brakeNorm);
    this.#command = {
      targetPitchDeg, flightPathTargetDeg, descentTargetFps, brakeNorm,
      mainContactSinceSec: this.#mainContactSinceSec,
      filteredDecelerationG: this.#filteredDecelerationG,
      phase: touchedDown ? "rollout" : clearanceFt < s.flareHeightFt ? "flare" : "approach",
    };
    return { ...this.#command };
  }

  /** Observe the resulting native step, separately from command generation. */
  observeResult(observed: LandingObservation, pitchCommand: Sf50PitchCommand): void {
    if (![observed.simTimeSec, observed.pitchDeg, observed.flightPathAngleDeg,
      observed.calibratedAirspeedKts, observed.groundSpeedFps, observed.downVelocityFps].every(Number.isFinite)) {
      throw new RangeError("Landing evidence requires finite native observations.");
    }
    if (!observed.weightOnWheels && this.#command?.flightPathTargetDeg != null) {
      const error = this.#command.flightPathTargetDeg - observed.flightPathAngleDeg;
      this.#airborneSamples++;
      this.#airborneSquaredGammaError += error * error;
      this.#airborneMaximumGammaError = Math.max(this.#airborneMaximumGammaError, Math.abs(error));
      if (pitchCommand.nearElevatorLimit) this.#airborneNearElevatorLimitSamples++;
    }
    if (observed.weightOnWheels) this.#touchdown ??= {
      timeSec: observed.simTimeSec, pitchDeg: observed.pitchDeg,
      casKts: observed.calibratedAirspeedKts, groundSpeedFps: observed.groundSpeedFps,
      sinkFps: observed.downVelocityFps,
    };
  }

  snapshot(completed: boolean, bounces: number) {
    const blockers: string[] = [];
    if (!completed) blockers.push("Landing procedure did not complete.");
    if (!this.#touchdown) blockers.push("Landing has no observed touchdown.");
    else if (this.#touchdown.sinkFps < 0 || this.#touchdown.sinkFps > SF50_LANDING_TOUCHDOWN_MAXIMUM_SINK_FPS) {
      blockers.push("Landing first-contact sink rate is outside the project 0-3.5 ft/s touchdown gate.");
    }
    if (bounces > 0) blockers.push("Landing bounced after initial touchdown.");
    return {
      settings: this.#settings, touchdown: this.#touchdown === null ? null : { ...this.#touchdown },
      touchdownMaximumSinkFps: SF50_LANDING_TOUCHDOWN_MAXIMUM_SINK_FPS,
      airborneSamples: this.#airborneSamples,
      airborneRmsGammaErrorDeg: this.#airborneSamples ? Math.sqrt(this.#airborneSquaredGammaError / this.#airborneSamples) : null,
      airborneMaximumGammaErrorDeg: this.#airborneSamples ? this.#airborneMaximumGammaError : null,
      airborneNearElevatorLimitFraction: this.#airborneSamples ? this.#airborneNearElevatorLimitSamples / this.#airborneSamples : null,
      maximumBrakeCommandNorm: this.#maximumBrakeNorm,
      status: blockers.length ? "blocked" as const : "touchdown-gates-met" as const,
      basis: "Project pilot response gates, not Cirrus flight-test tolerances or tail-clearance approval",
      frictionIdentifiability: this.#settings.brakeMode === "deceleration" ?
        "Closed-loop pilot demand compensates brake response; this cannot identify tire friction independently." :
        "Open-loop brake demand exposes response but still requires aircraft-specific brake/friction evidence.",
      blockers,
    };
  }
}
