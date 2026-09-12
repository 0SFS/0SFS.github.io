import { RunwayMeasurement } from "./runwayMeasurement.ts";
import { SF50_AFM_PROCEDURES } from "./sf50AfmData.ts";
import { sf50KcasToKias, sf50KiasToKcas } from "./sf50Airspeed.ts";
import { SF50_PITCH_CONTROLLER, Sf50PitchController, Sf50TakeoffPitchAudit, type Sf50PitchCommand } from "./sf50PilotController.ts";
import { SF50_DEFAULT_PILOT_PROFILE, type Sf50PilotProfile } from "./sf50PilotProfiles.ts";
import { Sf50LandingPilot, type Sf50LandingCommand } from "./sf50LandingPilot.ts";
import {
  SF50_DRY_PAVED_SURFACE, surveySf50Runway, auditSf50Surface,
  Sf50RunwayConditionMonitor, type Sf50RunwaySurvey,
} from "./sf50RunwayConditions.ts";

interface Wheel {
  index: number;
  weightOnWheels: boolean;
  bodyXFt: number;
  bodyYFt: number;
  bodyZFt: number;
  compressionFt: number;
  strutForceLb: number;
}
interface Observation {
  simTimeSec: number;
  latitudeDeg: number;
  longitudeDeg: number;
  altitudeMslFt: number;
  altitudeAglFt: number;
  calibratedAirspeedKts: number;
  groundSpeedFps: number;
  northVelocityFps: number;
  eastVelocityFps: number;
  downVelocityFps: number;
  rollDeg: number;
  pitchDeg: number;
  headingDeg: number;
  flightPathAngleDeg: number;
  pitchRateRadSec: number;
  rollRateRadSec: number;
  yawRateRadSec: number;
  throttleCommandNorm: number;
  throttlePositionNorm: number;
  weightLb: number;
  temperatureC: number;
  gearPositionNorm: number;
  flapsPositionNorm: number;
  weightOnWheels: boolean;
  thrustLb: number | null;
  fuelLb: readonly number[];
  wheelContacts: readonly Wheel[];
  diagnostics: Readonly<Record<string, number | null>>;
}
interface Controls {
  elevatorNorm: number; aileronNorm: number; rudderNorm: number;
  throttleNorm: number; flapsNorm: number; gearDown: boolean;
  leftBrakeNorm: number; rightBrakeNorm: number;
}
interface Initial {
  latitudeDeg: number; longitudeDeg: number; altitudeMslFt: number;
  terrainElevationFt: number; calibratedAirspeedKts: number;
  headingDeg: number; pitchDeg: number; flightPathAngleDeg: number;
  controls: Controls; fuelLb: readonly number[];
}
interface Driver {
  initialize(initial: Initial): Observation;
  observe(): Observation;
  applyControls(controls: Controls): void;
  step(): Observation;
  setFuelFrozen(frozen: boolean): void;
  configureGroundSurface(configuration: typeof SF50_DRY_PAVED_SURFACE): void;
}
interface Reference {
  id: string; phase: "takeoff" | "landing";
  conditions: {
    pressureAltitudeFt: number; weightLb: number; temperatureC: number;
    flapsNorm: number; referenceSpeedKias: number | null;
  };
}
export const SF50_BENCHMARK_ASSUMPTIONS = {
  version: "development-pilot-v6-response",
  pitchController: SF50_PITCH_CONTROLLER,
  groundSurface: SF50_DRY_PAVED_SURFACE,
  fixedDtSec: 1 / 120,
  rotationKias: 90,
  takeoffPitchDeg: SF50_AFM_PROCEDURES.takeoff.pitchTargetDeg,
  landingFlightPathDeg: -3,
  landingPitchDeg: 3,
  flareLowestWheelHeightFt: SF50_DEFAULT_PILOT_PROFILE.landing.flareHeightFt,
  flarePitchDeg: null,
  landingBrakeNorm: null,
  brakeApplication: "Both main wheels loaded; delayed closed-loop pilot demand, with a separate open-loop full-brake diagnostic",
  screenDatum: "Lowest extended native wheel contact point; AFM reference-point interpretation remains unconfirmed",
  gearSchedule: "Down through 50 feet, following table configuration; timing relative to normal-procedure retraction is unresolved",
  pilot: "Bounded pitch-rate request with rate PI and anti-windup; provisional roll/rudder damping; not flight-test-calibrated",
  airspeed: "AFM chart interpolation, with an unresolved power-condition mismatch at takeoff/idle",
} as const;

const neutral: Controls = {
  elevatorNorm: 0, aileronNorm: 0, rudderNorm: 0,
  throttleNorm: 0, flapsNorm: 0, gearDown: true,
  leftBrakeNorm: 0, rightBrakeNorm: 0,
};
const clamp = (value: number) => Math.max(-1, Math.min(1, value));

export function sf50AfmPilotAssumptions(profile: Readonly<Sf50PilotProfile> = SF50_DEFAULT_PILOT_PROFILE) {
  return {
    ...SF50_BENCHMARK_ASSUMPTIONS, pilotProfile: profile,
    takeoffPitchController: profile.takeoffPitch, landingPitchController: profile.landingPitch,
    flareLowestWheelHeightFt: profile.landing.flareHeightFt,
    flarePitchDeg: profile.landing.pathMode === "fixed-pitch" ? profile.landing.flarePitchDeg : null,
    landingBrakeNorm: profile.landing.brakeMode === "instant" ? profile.landing.maximumBrakeNorm : null,
    brakeApplication: profile.landing.brakeMode + "; both-main-wheel native WOW gate; " + profile.basis,
  };
}

/** Native WOW is authoritative: signed strut force may be negative or zero in contact. */
export function sf50MainWheelsOnGround(
  wheels: readonly Pick<Wheel, "index" | "weightOnWheels">[],
  mainWheelIndices: readonly number[],
): boolean {
  return mainWheelIndices.length === 2 && new Set(mainWheelIndices).size === 2 &&
    mainWheelIndices.every(index => wheels.some(wheel =>
      wheel.index === index && wheel.weightOnWheels));
}

/** Body axes are forward/right/down. No assumed constant CG-to-wheel offset. */
export function lowestWheelClearanceFt(observation: Pick<Observation, "pitchDeg" | "rollDeg" | "altitudeAglFt" | "wheelContacts">): number {
  if (observation.wheelContacts.length !== 3) throw new Error("SF50 benchmark requires three native bogey contact locations.");
  const pitch = observation.pitchDeg * Math.PI / 180;
  const roll = observation.rollDeg * Math.PI / 180;
  return Math.min(...observation.wheelContacts.map(wheel =>
    observation.altitudeAglFt - (
      -Math.sin(pitch) * wheel.bodyXFt +
      Math.cos(pitch) * Math.sin(roll) * wheel.bodyYFt +
      Math.cos(pitch) * Math.cos(roll) * wheel.bodyZFt
    )));
}

export function sf50AfmInitialState(reference: Reference, fuelLb: readonly number[]): Initial {
  const landing = reference.phase === "landing";
  const calibratedAirspeedKts = landing ?
    sf50KiasToKcas(reference.conditions.referenceSpeedKias!, reference.conditions.flapsNorm) : 0;
  if (calibratedAirspeedKts === null) throw new Error("Reference airspeed is outside the extracted AFM chart.");
  return {
    latitudeDeg: 34, longitudeDeg: -118,
    altitudeMslFt: reference.conditions.pressureAltitudeFt + (landing ? 50 : 4),
    terrainElevationFt: reference.conditions.pressureAltitudeFt,
    calibratedAirspeedKts, headingDeg: 0, pitchDeg: landing ? 3 : 0,
    flightPathAngleDeg: landing ? -3 : 0, fuelLb,
    controls: { ...neutral, flapsNorm: reference.conditions.flapsNorm,
      leftBrakeNorm: landing ? 0 : 1, rightBrakeNorm: landing ? 0 : 1 },
  };
}

function sample(observation: Observation) {
  return {
    timeSec: observation.simTimeSec,
    northFps: observation.northVelocityFps, eastFps: observation.eastVelocityFps,
    anyWheelOnGround: observation.weightOnWheels,
    clearanceFt: lowestWheelClearanceFt(observation),
  };
}

function initializationChecks(initial: Initial, observed: Observation) {
  const checks = [
    { name: "pitch", actual: observed.pitchDeg, expected: initial.pitchDeg, tolerance: 0.01 },
    { name: "flight-path", actual: observed.flightPathAngleDeg, expected: initial.flightPathAngleDeg, tolerance: 0.01 },
    { name: "calibrated-airspeed", actual: observed.calibratedAirspeedKts, expected: initial.calibratedAirspeedKts, tolerance: 0.01 },
    { name: "throttle-command", actual: observed.throttleCommandNorm, expected: initial.controls.throttleNorm, tolerance: 1e-8 },
    { name: "throttle-position", actual: observed.throttlePositionNorm, expected: initial.controls.throttleNorm, tolerance: 1e-8 },
    { name: "zero-time", actual: observed.simTimeSec, expected: 0, tolerance: 1e-8 },
    ...initial.fuelLb.map((fuel, index) => ({
      name: "fuel-" + index, actual: observed.fuelLb[index] ?? NaN, expected: fuel, tolerance: 1e-6,
    })),
  ].map(check => ({ ...check, passed: Number.isFinite(check.actual) && Math.abs(check.actual - check.expected) <= check.tolerance }));
  if (checks.some(check => !check.passed)) throw new Error("Initialization mismatch: " + JSON.stringify(checks.filter(check => !check.passed)));
  return checks;
}

/**
 * Native runway probes supply atmospheric/grade evidence; a selected surface
 * fixture requires matching readbacks. Neither is copied from AFM targets.
 * Surface configuration is not proof of tire-friction calibration.
 */
function measuredConditions(observation: Observation, reference: Reference, survey: Sf50RunwaySurvey) {
  const wind = ["windNorthFps", "windEastFps", "windDownFps"].map(key => observation.diagnostics[key]);
  const surface = auditSf50Surface(observation.diagnostics);
  return {
    conditions: {
      weightLb: observation.weightLb,
      ...survey.conditions,
      ...surface.conditions,
      flapsNorm: observation.flapsPositionNorm,
      ...(Math.abs(observation.gearPositionNorm - 1) < 0.005 ? { gearDown: true as const } : {}),
      ...(wind.every(value => value != null) ? {
        windKts: Math.hypot(...wind as number[]) / 1.687809857,
      } : {}),
      ...(reference.phase === "landing" ? {
        referenceSpeedKias: sf50KcasToKias(observation.calibratedAirspeedKts, reference.conditions.flapsNorm),
        ...(observation.throttleCommandNorm === 0 && observation.throttlePositionNorm === 0 ? { thrust: "idle" as const } : {}),
      } : {}),
    },
    aircraftPressureAltitudeFt: observation.diagnostics.nativePressureAltitudeFt ?? null,
    surfaceEvidence: surface,
    blockers: [...survey.blockers, ...surface.blockers],
  };
}

export function runSf50AfmProcedure(driver: Driver, reference: Reference, fuelLb: readonly number[],
  pilotProfile: Readonly<Sf50PilotProfile> = SF50_DEFAULT_PILOT_PROFILE) {
  const landing = reference.phase === "landing";
  const initialize = (state: Initial) => {
    driver.initialize(state);
    driver.configureGroundSurface(SF50_DRY_PAVED_SURFACE);
    return driver.observe();
  };
  let initial = sf50AfmInitialState(reference, fuelLb);
  const runwaySurvey = surveySf50Runway(position => initialize({
    ...initial, ...position, calibratedAirspeedKts: 0, pitchDeg: 0, flightPathAngleDeg: 0,
    controls: { ...neutral, gearDown: false },
  }), initial);
  let observed = initialize(initial);
  if (landing) {
    initial = { ...initial, altitudeMslFt: initial.altitudeMslFt + 50 - lowestWheelClearanceFt(observed) };
    observed = initialize(initial);
  }
  const initialObservation = observed;
  const checks = initializationChecks(initial, observed);
  const preparation = { idleWarmupSec: 0, takeoffPowerWaitSec: 0, n1Stable: false, fuelFrozenOnlyDuringPreparation: !landing };
  if (!landing) {
    driver.setFuelFrozen(true);
    try {
      const start = observed.simTimeSec;
      while (observed.simTimeSec - start < SF50_AFM_PROCEDURES.takeoff.warmEngineIdleSeconds - 1e-8) {
        observed = driver.step();
        if (observed.groundSpeedFps > 5 || Math.abs(observed.rollDeg) > 10) throw new Error("Brakes-held idle preparation did not remain settled on the runway.");
      }
      preparation.idleWarmupSec = observed.simTimeSec - start;
      driver.applyControls({ ...initial.controls, throttleNorm: 1 });
      const powerStart = observed.simTimeSec;
      let stableSince: number | null = null;
      let previous = observed;
      while (observed.simTimeSec - powerStart < 30) {
        observed = driver.step();
        const dt = observed.simTimeSec - previous.simTimeSec;
        const n1 = observed.diagnostics.n1Percent;
        const priorN1 = previous.diagnostics.n1Percent;
        const stable = n1 != null && priorN1 != null && observed.thrustLb != null && previous.thrustLb != null &&
          Math.abs(n1 - priorN1) / dt < 0.1 && Math.abs(observed.thrustLb - previous.thrustLb) / dt < 2;
        stableSince = stable ? stableSince ?? observed.simTimeSec : null;
        previous = observed;
        if (stableSince !== null && observed.simTimeSec - stableSince >= 1) {
          preparation.n1Stable = true;
          break;
        }
      }
      preparation.takeoffPowerWaitSec = observed.simTimeSec - powerStart;
    } finally {
      driver.setFuelFrozen(false);
    }
    if (!preparation.n1Stable) throw new Error("Takeoff N1/thrust did not establish a stable brakes-held state; target-N1 matching is separately unresolved.");
    if (!observed.weightOnWheels || observed.groundSpeedFps > 1) throw new Error("Brake release requires ground contact and negligible ground speed.");
  }
  const measurementStart = observed;
  const measured = measuredConditions(measurementStart, reference, runwaySurvey);
  const tracker = new RunwayMeasurement(reference.phase, initial.headingDeg, sample(observed));
  const conditionMonitor = new Sf50RunwayConditionMonitor(runwaySurvey);
  conditionMonitor.observe(observed.diagnostics, 0);
  const mainIndices = [...observed.wheelContacts].sort((left, right) => left.bodyXFt - right.bodyXFt).slice(0, 2).map(wheel => wheel.index);
  const blockers = [
    ...measured.blockers,
    "Payload remains concentrated at model empty CG; AFM loading envelope and model datum have not been reconciled.",
    "AFM does not specify the simulated normalized brake/flare control law; controller tracking is diagnostic, not validated average piloting.",
    "Lowest-wheel 50-foot datum and native contact-location/compression semantics need confirmation against AFM and JSBSim definitions.",
    "Dry-paved scenario settings are explicit; SF50 tire friction/brake coefficients remain unvalidated against aircraft data.",
    "AFM airspeed correction is specified at level-flight thrust or MCT, not takeoff/idle.",
    ...(landing ? ["Landing flare and brake-demand parameters are project assumptions; closed-loop braking cannot independently validate tire friction."] :
      ["Stable full throttle does not establish AFM target N1 or bleed-on thrust.",
       "Selected 90 KIAS rotation is within the AFM range, but the weight-specific schedule is unresolved.",
       "Table gear-down configuration versus normal positive-climb retraction timing remains unresolved."]),
  ];
  if (Math.abs(measurementStart.weightLb - reference.conditions.weightLb) > 1) blockers.push("Measured starting weight differs from the published table weight.");
  if (landing && (observed.thrustLb === null || observed.thrustLb > 184.6)) blockers.push("Initial landing thrust is not confirmed near idle.");
  const trace: unknown[] = [];
  let controls = { ...initial.controls, throttleNorm: landing ? 0 : 1, leftBrakeNorm: 0, rightBrakeNorm: 0 };
  const pitchGains = landing ? pilotProfile.landingPitch : pilotProfile.takeoffPitch;
  const pitchController = new Sf50PitchController(pitchGains);
  const landingPilot = landing ? new Sf50LandingPilot(pilotProfile.landing) : null;
  let landingControl: Sf50LandingCommand | null = null;
  const takeoffPitchAudit = landing ? null : new Sf50TakeoffPitchAudit(SF50_AFM_PROCEDURES.takeoff.pitchTargetDeg);
  let pitchControl: Sf50PitchCommand | null = null;
  let targetPitchDeg = landing ? 3 : measurementStart.pitchDeg;
  let rotated = false;
  let touchedDown = false;
  let abortReason: string | null = null;
  const record = () => trace.push({
    observation: observed,
    indicatedAirspeedEstimateKias: sf50KcasToKias(observed.calibratedAirspeedKts, reference.conditions.flapsNorm),
    lowestWheelClearanceFt: lowestWheelClearanceFt(observed),
    alongRunwayFt: tracker.snapshot().alongRunwayFt,
    crossTrackFt: tracker.snapshot().crossTrackFt,
    targetPitchDeg, pitchTrackingErrorDeg: targetPitchDeg - observed.pitchDeg,
    // Command diagnostics refer to the preceding pre-step observation.
    pitchControl: pitchControl === null ? null : { ...pitchControl },
    landingControl: landingControl === null ? null : { ...landingControl },
    controls: { ...controls }, phase: touchedDown ? "landing-roll" : landing ? "approach" : rotated ? "rotation-climb" : "takeoff-roll",
  });
  record();
  const rotationKcas = sf50KiasToKcas(SF50_BENCHMARK_ASSUMPTIONS.rotationKias, reference.conditions.flapsNorm);
  if (!landing && rotationKcas === null) throw new Error("Rotation speed is outside the extracted airspeed chart.");
  for (let tick = 0; tick < 120 * 120; tick++) {
    if (landing && observed.weightOnWheels && !touchedDown) pitchController.reset();
    touchedDown ||= landing && observed.weightOnWheels;
    rotated ||= !landing && observed.calibratedAirspeedKts >= rotationKcas!;
    if (rotated) takeoffPitchAudit?.startRotation(observed.simTimeSec);
    targetPitchDeg = landing ? touchedDown ? 0 : lowestWheelClearanceFt(observed) < 20 ? 5 : 3 :
      rotated ? SF50_AFM_PROCEDURES.takeoff.pitchTargetDeg : measurementStart.pitchDeg;
    if (landingPilot) {
      landingControl = landingPilot.step(observed, lowestWheelClearanceFt(observed),
        sf50MainWheelsOnGround(observed.wheelContacts, mainIndices), touchedDown,
        SF50_BENCHMARK_ASSUMPTIONS.fixedDtSec);
      targetPitchDeg = landingControl.targetPitchDeg;
    }
    // Do not integrate against the ground-constrained attitude before VR.
    pitchControl = landing || rotated ? pitchController.step(
      targetPitchDeg, observed.pitchDeg, observed.pitchRateRadSec, SF50_BENCHMARK_ASSUMPTIONS.fixedDtSec,
    ) : null;
    const bothMainsLoaded = sf50MainWheelsOnGround(observed.wheelContacts, mainIndices);
    const brake = landing && bothMainsLoaded ? landingControl!.brakeNorm : 0;
    controls = {
      ...controls,
      elevatorNorm: pitchControl?.elevatorNorm ?? 0,
      aileronNorm: clamp(-0.02 * observed.rollDeg - 0.15 * observed.rollRateRadSec),
      rudderNorm: clamp(-0.4 * observed.yawRateRadSec),
      leftBrakeNorm: brake, rightBrakeNorm: brake,
    };
    driver.applyControls(controls);
    const priorEvents = tracker.snapshot().events.length;
    observed = driver.step();
    tracker.push(sample(observed));
    if (pitchControl) takeoffPitchAudit?.observe(observed, pitchControl);
    if (pitchControl) landingPilot?.observeResult(observed, pitchControl);
    const state = tracker.snapshot();
    conditionMonitor.observe(observed.diagnostics, state.alongRunwayFt);
    const terminal = state.completed || observed.altitudeAglFt < -2 ||
      Math.abs(observed.rollDeg) > 45 || Math.abs(observed.pitchDeg) > 45 || Math.abs(state.crossTrackFt) > 75;
    if (tick % 24 === 0 || state.events.length !== priorEvents || terminal) record();
    if (terminal) {
      if (!state.completed) abortReason = "Trajectory left the benchmark attitude/height/runway envelope.";
      break;
    }
    if (tick === 120 * 120 - 1) abortReason = "Measurement exceeded 120 seconds.";
  }
  if (abortReason) blockers.push(abortReason);
  const conditionMonitoring = conditionMonitor.snapshot();
  blockers.push(...conditionMonitoring.blockers);
  const measurement = tracker.snapshot();
  const pitchTracking = takeoffPitchAudit?.snapshot(measurement.completed && abortReason === null) ?? null;
  if (pitchTracking) blockers.push(...pitchTracking.blockers);
  const landingTracking = landingPilot?.snapshot(measurement.completed && abortReason === null, measurement.bounces) ?? null;
  if (landingTracking) blockers.push(...landingTracking.blockers);
  return {
    measurement: {
      caseId: reference.id, conditions: measured.conditions,
      groundRollFt: measurement.groundRollFt, totalDistanceFt: measurement.totalDistanceFt,
      completed: measurement.completed && abortReason === null, unmatchedConditions: blockers,
    },
    initialObservation, initializationChecks: checks, preparation, measurementStart,
    pilotEvidence: { controller: pitchGains, profileId: pilotProfile.id,
      takeoffPitchTracking: pitchTracking, landingTracking },
    aircraftPressureAltitudeAtStartFt: measured.aircraftPressureAltitudeFt,
    runwayEvidence: { ...runwaySurvey, surface: measured.surfaceEvidence, monitoring: conditionMonitoring },
    engineEvidence: {
      n1Percent: measurementStart.diagnostics.n1Percent ?? null,
      modelMaxN1Percent: measurementStart.diagnostics.maxN1Percent ?? null,
      modelBleedLossFactor: measurementStart.diagnostics.bleedLossFactor ?? null,
      targetN1Status: landing ? "not-required-by-reference" : "unresolved",
      bleedStateStatus: landing ? "not-specified-by-reference" : "unresolved",
      note: "AFM N1 chart uses inlet PT2/TT2 and anti-ice configuration. Native MaxN1 and generic bleed-loss factor do not establish those conditions.",
    },
    finalObservation: observed, events: measurement.events, bounces: measurement.bounces,
    assumptions: sf50AfmPilotAssumptions(pilotProfile), abortReason, trace,
  };
}
