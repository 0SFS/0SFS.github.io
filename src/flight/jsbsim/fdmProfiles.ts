import type { AircraftId } from "../aircraft/aircraftIds";
import { C172_ROTOR_BLADES, FJ33_ROTOR_BLADES, F135_ROTOR_BLADES, type EngineRotorBladeCounts } from "../aircraft/engineRotorDefinitions";
import type { AutomaticFlaps } from "../input/autoFlaps";
import { getSf50Variant, type Sf50VariantId } from "../aircraft/sf50Variants";
import { BODY_COLLISION_PROBES, SF50_BODY_COLLISION_PROBES, type BodyCollisionProbe } from "../physics/collisionGeometry";
import type { ControlSurfaceTerms, ExternalForceTerms } from "../diagnostics/aircraftForces";

export interface RunwayConfiguration {
  airspeedKts: number;
  throttleNorm: number;
  flapsNorm: number;
  pitchDeg: number;
}

export type FlightControlLawMode = "auto" | "manual" | "fly-by-wire";
export const CONTROL_LAW_MODE_VALUES: Readonly<Record<FlightControlLawMode, number>> = {
  auto: 0, manual: 1, "fly-by-wire": 2,
};

/** How an engine is simulated: JSBSim's coupled engine plant, or its empirical tables. */
export const ENGINE_MODEL_IDS = ["plant", "empirical"] as const;
export type EngineModelId = (typeof ENGINE_MODEL_IDS)[number];

/** One way an aircraft's engine can be simulated, and the profile fields that change with it. */
export interface FdmEngineModel {
  id: EngineModelId;
  label: string;
  /** What someone flying one model after the other should know about this one. */
  summary: string;
  profile?: Partial<Pick<FdmProfile,
    "model" | "dataPackage" | "forceEngineLabels" | "forceExternalForces" | "initialProperties">>;
}

export interface FdmProfile {
  sf50VariantId?: Sf50VariantId;
  /** Published operating envelope metadata, not an artificial physics clamp. */
  maxOperatingAltitudeFt?: number;
  /** JSBSim model name: `aircraft/<model>/<model>.xml` in MEMFS. */
  model: string;
  /** Its files in public/jsbsim-data/manifest.json. Default: the aircraft id. */
  dataPackage?: string;
  /**
   * Engine models the aircraft can fly with, chosen in Engine → Simulation. The
   * first is the one the rest of this profile describes. Absent: no choice.
   */
  engineModels?: readonly FdmEngineModel[];
  /** Model-local dependency directories, relative to the SDK data root. */
  dataPaths?: { enginePath: string; systemsPath: string };
  /** Optional pilot conversion command and the physical conversion position. */
  stovl?: { commandProperty: string; positionProperty: string };
  /** Native aircraft control law; absent aircraft keep their own direct controls. */
  controlLaw?: {
    commandProperty: string;
    enabledProperty: string;
    automaticMode: Exclude<FlightControlLawMode, "auto">;
  };
  /**
   * A fly-by-wire roll-rate command: the native property holding the rate full
   * stick asks for, deg/s, and the source model's own, which an autopilot flies.
   */
  fullStickRollRate?: { property: string; sourceDegPerSec: number };
  engine: "piston" | "turbine";
  /** Rated piston RPM for its instrument scale; turbine limits are read from the native engine. */
  maxEngineRpm?: number;
  /** Representative rotor-row marker counts, with explicit evidence status. */
  rotorBlades?: EngineRotorBladeCounts;
  /**
   * The shaft speed at which JSBSim calls a start finished, which the
   * throttle's start ring fills toward: a turbine runs once N2 reaches its
   * idle N2, and a piston with spark and fuel runs above 80% of its idle RPM.
   * Both come from the engine's definition file.
   */
  startSpeed: { property: string; runningAt: number };
  /** Optional diagnostic names; native engine indices and force data remain authoritative. */
  forceEngineLabels?: Readonly<Record<number, string>>;
  /**
   * Each control surface's own aerodynamic terms in the model, for Debug → Forces.
   * Only increments that vanish with the surface centred belong here, never a
   * whole-wing table or a derivative the surface schedules. fdmProfiles.test.ts
   * holds every term, and every surface-dependent term left out, to the model file.
   */
  forceControlSurfaces: readonly ControlSurfaceTerms[];
  /** External forces Debug → Forces draws, such as engine outlets the model applies outside the engine. */
  forceExternalForces?: readonly ExternalForceTerms[];
  /** Sign applied to the normalized yaw command at the physics boundary. */
  rudderSign: 1 | -1;
  stance: {
    staticMeters: number;
    staticPitchRad: number;
    pitchArmMeters: number;
    rollArmMeters: number;
  };
  /** Property spellings the HUD reads for this engine type. */
  gauges: {
    primary: string;
    secondary: string | null;
    label: string;
  };
  initialThrottleNorm: number;
  /** Development airborne start; not an aircraft operating limit. */
  initialAirspeedKts?: number;
  /** Initial attitude/trim for the aircraft's airborne development start. */
  initialPitchDeg?: number;
  /** Aircraft-specific controls restored before zero-time engine initialization. */
  initialProperties?: Readonly<Record<string, number>>;
  /** Native getter-only observations required to evaluate this aircraft model. */
  requiredReadOnlyModelProperties?: readonly string[];
  initialGearDown: boolean;
  flapPosition: { property: string; fullTravel: number; minNorm?: number };
  /** Native automation or an explicitly simulated pilot assist, never a shared aircraft law. */
  automaticFlaps: AutomaticFlaps;
  runwayPresets: Record<"departure" | "arrival", RunwayConfiguration>;
  bodyCollisionProbes: readonly BodyCollisionProbe[];
}

const C172_STATI = {
  staticMeters: 1.33,
  staticPitchRad: 2.48 * Math.PI / 180,
  pitchArmMeters: 4.5,
  rollArmMeters: 5.5,
};

// The SF50 visual origin sits on the ground directly below its CG. The 44 in
// FDM CG-to-wheel-contact distance therefore also places that origin correctly
// when the host renders a physics state at the CG.
const SF50_STATI = {
  staticMeters: 1.12,
  staticPitchRad: 0,
  pitchArmMeters: 4.68,
  rollArmMeters: 5.9,
};

const coefficient = (name: string): string => `aero/coefficient/${name}`;

/** The SF50 models keep each ruddervator and aileron in its own terms. */
const SF50_CONTROL_SURFACES: readonly ControlSurfaceTerms[] = [
  ...(["left", "right"] as const).map(side => ({
    id: `${side}-ruddervator`, label: `${side === "left" ? "Left" : "Right"} ruddervator`,
    terms: { side: coefficient(`CY${side}-ruddervator`), lift: coefficient(`CL${side}-ruddervator`),
      pitch: coefficient(`Cm${side}-ruddervator`), yaw: coefficient(`Cn${side}-ruddervator`) },
  })),
  ...(["left", "right"] as const).map(side => ({
    id: `${side}-aileron`, label: `${side === "left" ? "Left" : "Right"} aileron`,
    terms: { roll: coefficient(`Cl${side}-aileron`) },
  })),
  { id: "flaps", label: "Flaps", terms: { drag: coefficient("CDflap"), lift: coefficient("CLflap") } },
];

function createSf50Profile(variantId: Sf50VariantId): FdmProfile {
  const variant = getSf50Variant(variantId);
  return {
    model: variant.model,
    sf50VariantId: variant.id,
    maxOperatingAltitudeFt: variant.maxOperatingAltitudeFt,
    engine: "turbine",
    rotorBlades: FJ33_ROTOR_BLADES,
    // fj33_5a.xml: idlen2 53.4.
    startSpeed: { property: "propulsion/engine[0]/n2", runningAt: 53.4 },
    rudderSign: 1,
    stance: SF50_STATI,
    gauges: {
      primary: "propulsion/engine[0]/n1",
      secondary: "propulsion/engine[0]/n2",
      label: "N1 %",
    },
    initialThrottleNorm: 0.35,
    initialGearDown: false,
    forceControlSurfaces: SF50_CONTROL_SURFACES,
    flapPosition: { property: "fcs/flap-pos-norm", fullTravel: 1 },
    automaticFlaps: {
      kind: "assist",
      // Conservative assist curve, not a Cirrus automatic-flap system.
      // G1 AFM limits: half 190 KIAS, full 150 KIAS. See flight-settings.md.
      approach: [[0, 1], [100, 1], [140, 0.5], [160, 0.5], [180, 0]],
      takeoffNorm: 0.5, takeoffRetractionKts: [110, 115],
      climbThrottleNorm: 0.7, retractWithGear: true,
    },
    // Development presets, not performance-validation cases. The available
    // AFM takeoff/landing procedures use half/full flap respectively; the
    // 85-knot approach is not a clean-wing or all-weight VREF claim.
    runwayPresets: {
      departure: { airspeedKts: 0, throttleNorm: 0, flapsNorm: 0.5, pitchDeg: 0 },
      arrival: { airspeedKts: 85, throttleNorm: 0.35, flapsNorm: 1, pitchDeg: 3 },
    },
    bodyCollisionProbes: SF50_BODY_COLLISION_PROBES,
  };
}

// The F-35B's external stores' drag and pushback, under either engine model.
const F35B_STORE_AND_PUSHBACK_FORCES: readonly ExternalForceTerms[] = [
  { name: "external-tank-0-drag", label: "Right store drag", frame: "wind", magnitude: "stores/external-tank[0]/drag-lbs" },
  { name: "external-tank-1-drag", label: "Left store drag", frame: "wind", magnitude: "stores/external-tank[1]/drag-lbs" },
  { name: "pushback", label: "Pushback", frame: "body" },
];

const F35B_INITIAL_PROPERTIES: Readonly<Record<string, number>> = {
  "fcs/stovl-cmd-norm": 0,
  "fcs/stovl-pos-norm": 0,
  // A new flight clears the FCS zero-time conversion interlock latch.
  "fcs/stovl-augmentation-inhibit": 0,
  "fcs/mixture-cmd-norm": 1,
  "fcs/pitch-trim-cmd-norm": -0.059,
  "fcs/roll-trim-cmd-norm": 0,
  "propulsion/engine[0]/pitch-angle-rad": 0,
  "propulsion/engine[0]/yaw-angle-rad": 0,
};

const F35B_ENGINE_MODELS: readonly FdmEngineModel[] = [
  {
    id: "plant", label: "Coupled engine plant",
    summary: "JSBSim's coupled engine plant: fuel, ignition, combustion, gas path, shafts, nozzle, metal temperatures and the lift fan advance together. Reheat thrust exists only while reheat fuel burns.",
  },
  {
    id: "empirical", label: "Empirical tables (before the plant)",
    summary: "The F-35B as it flew before the plant, unchanged: JSBSim's table-driven turbine, with the lift fan and roll posts as force carriers sharing the main engine's upward force. After a cold start it gives reheat thrust for about 4 s before any reheat fuel burns.",
    profile: {
      model: "F-35B-jsbsim-empirical",
      dataPackage: "f-35b-empirical-engine",
      forceEngineLabels: { 0: "Main engine", 1: "Lift fan", 2: "Right roll post", 3: "Left roll post" },
      forceExternalForces: F35B_STORE_AND_PUSHBACK_FORCES,
      // The force carriers' throttles, which the model's FCS holds at full.
      initialProperties: { ...F35B_INITIAL_PROPERTIES, "fcs/throttle1": 0, "fcs/throttle2": 0, "fcs/throttle3": 0 },
    },
  },
];

export const FDM_PROFILES: Record<AircraftId, FdmProfile> = {
  "cessna-172": {
    model: "c172p",
    engine: "piston",
    rotorBlades: C172_ROTOR_BLADES,
    // Installed JSBSim eng_io320.xml <maxrpm>; an instrument scale, not a physics clamp.
    maxEngineRpm: 2700,
    // eng_io320.xml: idlerpm 550, and JSBSim runs it above 80% of that.
    startSpeed: { property: "propulsion/engine[0]/engine-rpm", runningAt: 0.8 * 550 },
    rudderSign: -1,
    stance: C172_STATI,
    gauges: {
      primary: "propulsion/engine[0]/propeller-rpm",
      secondary: "propulsion/engine[0]/engine-rpm",
      label: "RPM",
    },
    initialThrottleNorm: 0.65,
    initialGearDown: true,
    // One aileron position drives both ailerons' terms.
    forceControlSurfaces: [
      { id: "elevator", label: "Elevator",
        terms: { drag: coefficient("CDDe"), lift: coefficient("CLDe"), pitch: coefficient("Cmde") } },
      { id: "ailerons", label: "Ailerons",
        terms: { side: coefficient("CYda"), roll: coefficient("ClDa"), yaw: coefficient("Cnda") } },
      { id: "rudder", label: "Rudder",
        terms: { side: coefficient("CYdr"), roll: coefficient("Cldr"), yaw: coefficient("Cndr") } },
      { id: "flaps", label: "Flaps",
        terms: { drag: coefficient("CDDf"), lift: coefficient("CLDf"), pitch: coefficient("Cmdf") } },
    ],
    flapPosition: { property: "fcs/flap-pos-deg", fullTravel: 30 },
    automaticFlaps: {
      kind: "assist",
      // 172P POH limits: 10 degrees 110 KIAS; greater travel 85 KIAS.
      approach: [[0, 1], [65, 1], [80, 1 / 3], [95, 1 / 3], [105, 0]],
      takeoffNorm: 0, takeoffRetractionKts: [65, 75],
      climbThrottleNorm: 0.7, retractWithGear: false,
    },
    runwayPresets: {
      departure: { airspeedKts: 0, throttleNorm: 0, flapsNorm: 0, pitchDeg: 2.48 },
      arrival: { airspeedKts: 75, throttleNorm: 0.35, flapsNorm: 0, pitchDeg: 3 },
    },
    bodyCollisionProbes: BODY_COLLISION_PROBES,
  },
  "cirrus-vision-jet": createSf50Profile("g1"),
  "cirrus-vision-jet-g2": createSf50Profile("g2"),
  "cirrus-vision-jet-g3": createSf50Profile("g3"),
  "f-35b": {
    model: "F-35B-jsbsim",
    engineModels: F35B_ENGINE_MODELS,
    requiredReadOnlyModelProperties: ["propulsion/engine[0]/body-force-z-lbs"],
    forceEngineLabels: { 0: "Main engine" },
    // Every external force of the model: the F135 plant's LiftSystem outlets and
    // inlet ram drag, the external stores' drag, and pushback.
    forceExternalForces: [
      { name: "lift-fan", label: "Lift fan", frame: "body", magnitude: "propulsion/lift-fan-force-lbs" },
      { name: "roll-post-right", label: "Right roll post", frame: "body", magnitude: "propulsion/roll-post-right-force-lbs" },
      { name: "roll-post-left", label: "Left roll post", frame: "body", magnitude: "propulsion/roll-post-left-force-lbs" },
      { name: "engine-ram-drag", label: "Engine inlet ram drag", frame: "wind", magnitude: "propulsion/engine-ram-drag-lbs" },
      { name: "lift-fan-ram-drag", label: "Lift-fan inlet ram drag", frame: "wind", magnitude: "propulsion/lift-fan-ram-drag-lbs" },
      ...F35B_STORE_AND_PUSHBACK_FORCES,
    ],
    // One aileron position drives both ailerons' terms, and one rudder both fins'.
    // The model gives neither a force, only moments.
    forceControlSurfaces: [
      { id: "elevator", label: "Elevator",
        terms: { drag: coefficient("CDde"), lift: coefficient("CLde"), pitch: coefficient("Cmde") } },
      { id: "ailerons", label: "Ailerons", terms: { roll: coefficient("Clda"), yaw: coefficient("Cnda") } },
      { id: "rudders", label: "Rudders", terms: { roll: coefficient("Cldr"), yaw: coefficient("Cndr") } },
      { id: "flaps", label: "Trailing-edge flaps", terms: { drag: coefficient("CDflap"), lift: coefficient("dCLflap") } },
      { id: "speedbrake", label: "Speed brake", terms: { drag: coefficient("CDsb"), lift: coefficient("dCLsb") } },
    ],
    dataPaths: {
      enginePath: "aircraft/F-35B-jsbsim/Engines",
      systemsPath: "aircraft/F-35B-jsbsim/Systems",
    },
    stovl: { commandProperty: "fcs/stovl-cmd-norm", positionProperty: "fcs/stovl-pos-norm" },
    automaticFlaps: { kind: "native", commandProperty: "fcs/flaps-auto-enabled" },
    controlLaw: {
      commandProperty: "fcs/control-law-mode", enabledProperty: "fcs/fbw-enabled", automaticMode: "fly-by-wire",
    },
    // The source normalizes roll rate as 0.09 per rad/s, so full stick asked for 1/0.09 rad/s.
    fullStickRollRate: { property: "fcs/full-stick-roll-rate-deg_sec", sourceDegPerSec: 180 / Math.PI / 0.09 },
    engine: "turbine",
    rotorBlades: F135_ROTOR_BLADES,
    // F135-PW-600.xml: the plant runs at its idle corrected N2, 0.60. The lift fan has no start of its own.
    startSpeed: { property: "propulsion/engine[0]/n2", runningAt: 60 },
    rudderSign: -1,
    // Prior FlightGear smoke settling observation, not new ground qualification.
    stance: {
      staticMeters: 1.267,
      staticPitchRad: 1.18 * Math.PI / 180,
      pitchArmMeters: 6.5,
      rollArmMeters: 5.350764,
    },
    gauges: {
      primary: "propulsion/engine[0]/n1",
      secondary: "propulsion/engine[0]/n2",
      label: "N1 %",
    },
    initialThrottleNorm: 0.48,
    initialAirspeedKts: 300,
    initialPitchDeg: 1.92,
    initialGearDown: false,
    initialProperties: F35B_INITIAL_PROPERTIES,
    flapPosition: { property: "fcs/flap-pos-norm", fullTravel: 1, minNorm: -0.1 },
    runwayPresets: {
      departure: { airspeedKts: 0, throttleNorm: 0, flapsNorm: 0, pitchDeg: 1.18 },
      arrival: { airspeedKts: 160, throttleNorm: 0.5, flapsNorm: 0, pitchDeg: 5 },
    },
    // Ground/body collision geometry is owned by the separate ground work.
    bodyCollisionProbes: [],
  },
};

/**
 * The engine model an aircraft flies with: the one asked for when the aircraft
 * offers it, otherwise its first. Null for an aircraft with no choice.
 */
export function resolveEngineModel(aircraftId: AircraftId, requested?: EngineModelId): FdmEngineModel | null {
  const offered = FDM_PROFILES[aircraftId].engineModels;
  return offered?.find(model => model.id === requested) ?? offered?.[0] ?? null;
}

const engineModelProfiles = new Map<string, FdmProfile>();

/** The aircraft's profile, with the fields its engine model changes. */
export function getFdmProfile(aircraftId: AircraftId, engineModel?: EngineModelId): FdmProfile {
  const base = FDM_PROFILES[aircraftId];
  const chosen = resolveEngineModel(aircraftId, engineModel);
  if (!chosen?.profile) return base;
  const key = aircraftId + "|" + chosen.id;
  let profile = engineModelProfiles.get(key);
  if (!profile) engineModelProfiles.set(key, profile = { ...base, ...chosen.profile });
  return profile;
}
