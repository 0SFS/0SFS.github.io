import type { JSBSimSdk } from "@felipegalind0/jsbsim";
import { AVAILABILITY, type AudioSnapshotInit } from "./audioSnapshot";
import { propertyInCatalog } from "../diagnostics/flightRecorder";

/**
 * Reads the properties the audio core needs, once per accepted physics step.
 *
 * Availability comes from the property catalog, never from a zero: JSBSim
 * returns 0 for a property that does not exist, and a silent engine is
 * indistinguishable from a missing one unless the catalog is consulted.
 */

export const AUDIO_PROPERTIES = [
  "simulation/sim-time-sec",
  "propulsion/engine[0]/n1",
  "propulsion/engine[0]/n2",
  "propulsion/engine[0]/thrust-lbs",
  "propulsion/engine[0]/fuel-flow-rate-pps",
  "propulsion/engine[0]/set-running",
  "propulsion/starter_cmd",
  "propulsion/cutoff_cmd",
  "fcs/throttle-cmd-norm",
  "velocities/vc-kts",
  "velocities/v-north-fps",
  "velocities/v-east-fps",
  "velocities/v-down-fps",
  "gear/gear-pos-norm",
  "fcs/flap-pos-norm",
  "atmosphere/a-fps",
] as const;

const SLOT = Object.fromEntries(AUDIO_PROPERTIES.map((path, index) => [path, index])) as
  Record<typeof AUDIO_PROPERTIES[number], number>;

const FPS_TO_MPS = 0.3048;
const INCH_TO_METRE = 0.0254;

/**
 * Fuel flow above this counts as combustion.
 *
 * Evidence: docs/validation/evidence/audio/sf50-start-trace-2026-09-14.txt, a
 * real fork.7 start. Fuel flow is exactly 0 while motoring on the starter with
 * cutoff still commanded, steps to 0.0103 lbm/s the moment cutoff is released,
 * and returns to 0 on the same step as shutdown. Idle flow is 76 lbm/h =
 * 0.0211 lbm/s, so this threshold is two orders below idle and above nothing.
 */
const COMBUSTION_FUEL_PPS = 1e-4;

export type CombustionSource = "fuel-flow" | "running-only" | "unavailable";

export interface AudioAdapterDiagnostics {
  /** Catalog paths the model does not publish; those fields report unavailable. */
  missing: readonly string[];
  combustionSource: CombustionSource;
  /** Engine acoustic centre in the aircraft visual frame (metres). */
  sourceOffset: readonly [number, number, number];
}

export interface AudioAdapter {
  /** Reads after an accepted step. Never allocates; reuses one owned buffer. */
  read(): AudioAdapterReading;
  readonly diagnostics: AudioAdapterDiagnostics;
  /** Frees the native batch. Must run before SDK teardown. */
  dispose(): void;
}

export interface AudioAdapterReading {
  simTimeS: number;
  availability: number;
  n1Pct: number;
  n2Pct: number;
  thrustLbf: number;
  fuelFlowPps: number;
  throttleNorm: number;
  combustion: boolean;
  running: boolean;
  starter: boolean;
  cutoff: boolean;
  kias: number;
  gearNorm: number;
  flapNorm: number;
  /** Aircraft velocity in the Babylon world frame (east / up / south), m/s. */
  velocity: [number, number, number];
  soundSpeedMps: number;
}

/**
 * Combustion decision.
 *
 * sound.md §3 is explicit that native `set-running` must not gate ignition, and
 * the recorded start trace shows why: fuel burns for 14.5 s of a cold start
 * while `set-running` is still 0. Fuel flow is the signal that actually tracks
 * the burner, so it decides; `running` only ever adds confidence.
 *
 * NOT YET VALIDATED against abort, starvation and relight traces. Until FDM
 * supplies those, `combustionSource` reports which rule produced the answer.
 */
export function decideCombustion(input: {
  fuelFlowAvailable: boolean; fuelFlowPps: number;
  runningAvailable: boolean; running: boolean;
}): { combustion: boolean; source: CombustionSource } {
  if (input.fuelFlowAvailable) {
    const burning = Number.isFinite(input.fuelFlowPps) && input.fuelFlowPps > COMBUSTION_FUEL_PPS;
    return {
      combustion: burning || (input.runningAvailable && input.running),
      source: "fuel-flow",
    };
  }
  if (input.runningAvailable) return { combustion: input.running, source: "running-only" };
  return { combustion: false, source: "unavailable" };
}

/**
 * Engine acoustic centre relative to the aircraft visual origin.
 *
 * JSBSim structural inches (+X aft, +Y right, +Z up) to the Babylon aircraft
 * frame (+X left, +Y up, +Z nose-forward). The visual origin sits on the ground
 * below the CG, `gearHeightMetres` under it, which is the convention
 * fdmProfiles.ts already uses for the stance.
 *
 * Fuel burn moves the CG by centimetres over a flight; that is taken once at
 * load rather than tracked, because it is acoustically irrelevant and a moving
 * source origin would add an invented Doppler term.
 *
 * The nacelle placement in the model XML is approximate (sound.md §3): this is
 * a geometric reading of the installed model, not a measured acoustic centre.
 */
export function engineSourceOffsetMetres(
  engineInches: readonly [number, number, number],
  cgInches: readonly [number, number, number],
  gearHeightMetres: number,
): [number, number, number] {
  return [
    -(engineInches[1] - cgInches[1]) * INCH_TO_METRE,
    (engineInches[2] - cgInches[2]) * INCH_TO_METRE + gearHeightMetres,
    -(engineInches[0] - cgInches[0]) * INCH_TO_METRE,
  ];
}

type CatalogReader = Parameters<typeof propertyInCatalog>[0];

export interface AudioAdapterOptions {
  /** Aircraft static ground clearance, from the FDM profile stance. */
  gearHeightMetres: number;
}

/**
 * Creates the adapter. Call after `loadModel()`; dispose and re-create it when
 * the model is replaced, because a PropertyBatch resolves nodes once.
 */
export function createJsbsimAudioAdapter(sdk: JSBSimSdk, options: AudioAdapterOptions): AudioAdapter {
  // Property creation stays disabled: audio observes the model, it never
  // extends the property tree, and a created property would read as 0 forever.
  const batch = sdk.createPropertyBatch(AUDIO_PROPERTIES, { create: false });
  // Owned storage. `read()` without a target returns an ephemeral wasm view
  // that the next SDK call can invalidate.
  const values = new Float64Array(AUDIO_PROPERTIES.length);
  // The same reader the flight recorder uses: the SDK object exposes the catalog query.
  const reader = sdk as unknown as CatalogReader;

  const present = (path: string): boolean => {
    if (batch.missing.includes(path)) return false;
    try { return propertyInCatalog(reader, path); } catch { return false; }
  };

  const has = Object.fromEntries(
    AUDIO_PROPERTIES.map((path) => [path, present(path)]),
  ) as Record<string, boolean>;

  const inches = (path: string): number => {
    const value = sdk.getPropertyValue(path);
    return Number.isFinite(value) ? value : 0;
  };
  const sourceOffset = engineSourceOffsetMetres(
    [inches("propulsion/engine[0]/x-position"), inches("propulsion/engine[0]/y-position"),
      inches("propulsion/engine[0]/z-position")],
    [inches("inertia/cg-x-in"), inches("inertia/cg-y-in"), inches("inertia/cg-z-in")],
    options.gearHeightMetres,
  );

  const combustionProbe = decideCombustion({
    fuelFlowAvailable: has["propulsion/engine[0]/fuel-flow-rate-pps"],
    fuelFlowPps: 0,
    runningAvailable: has["propulsion/engine[0]/set-running"],
    running: false,
  });

  const diagnostics: AudioAdapterDiagnostics = {
    missing: AUDIO_PROPERTIES.filter((path) => !has[path]),
    combustionSource: combustionProbe.source,
    sourceOffset,
  };

  const reading: AudioAdapterReading = {
    simTimeS: 0, availability: 0, n1Pct: 0, n2Pct: 0, thrustLbf: 0, fuelFlowPps: 0,
    throttleNorm: 0, combustion: false, running: false, starter: false, cutoff: false,
    kias: 0, gearNorm: 0, flapNorm: 0, velocity: [0, 0, 0], soundSpeedMps: 343,
  };

  let disposed = false;

  const at = (path: typeof AUDIO_PROPERTIES[number]): number => {
    const value = values[SLOT[path]];
    return Number.isFinite(value) ? value : Number.NaN;
  };
  /** A non-finite read is refused: it means unavailable, never zero. */
  const bit = (path: typeof AUDIO_PROPERTIES[number], flag: number): number =>
    has[path] && Number.isFinite(values[SLOT[path]]) ? flag : 0;

  return {
    diagnostics,
    read(): AudioAdapterReading {
      if (disposed) return reading;
      batch.read(values);
      let availability = 0;
      availability |= bit("propulsion/engine[0]/n1", AVAILABILITY.N1);
      availability |= bit("propulsion/engine[0]/n2", AVAILABILITY.N2);
      availability |= bit("propulsion/engine[0]/thrust-lbs", AVAILABILITY.THRUST);
      availability |= bit("propulsion/engine[0]/fuel-flow-rate-pps", AVAILABILITY.FUEL_FLOW);
      availability |= bit("propulsion/engine[0]/set-running", AVAILABILITY.RUNNING);
      availability |= bit("velocities/vc-kts", AVAILABILITY.AIRSPEED);
      if (has["propulsion/starter_cmd"] && has["propulsion/cutoff_cmd"]) {
        availability |= AVAILABILITY.COMMANDS;
      }
      if (has["gear/gear-pos-norm"] && has["fcs/flap-pos-norm"]) {
        availability |= AVAILABILITY.CONFIG;
      }
      if (diagnostics.combustionSource !== "unavailable") availability |= AVAILABILITY.COMBUSTION;

      const running = at("propulsion/engine[0]/set-running") > 0.5;
      const fuelFlowPps = at("propulsion/engine[0]/fuel-flow-rate-pps");
      const decision = decideCombustion({
        fuelFlowAvailable: (availability & AVAILABILITY.FUEL_FLOW) !== 0,
        fuelFlowPps,
        runningAvailable: (availability & AVAILABILITY.RUNNING) !== 0,
        running,
      });

      const simTime = at("simulation/sim-time-sec");
      reading.simTimeS = Number.isFinite(simTime) ? simTime : reading.simTimeS;
      reading.availability = availability;
      reading.n1Pct = at("propulsion/engine[0]/n1");
      reading.n2Pct = at("propulsion/engine[0]/n2");
      reading.thrustLbf = at("propulsion/engine[0]/thrust-lbs");
      reading.fuelFlowPps = fuelFlowPps;
      reading.throttleNorm = at("fcs/throttle-cmd-norm");
      reading.combustion = decision.combustion;
      reading.running = running;
      reading.starter = at("propulsion/starter_cmd") > 0.5;
      reading.cutoff = at("propulsion/cutoff_cmd") > 0.5;
      reading.kias = at("velocities/vc-kts");
      reading.gearNorm = at("gear/gear-pos-norm");
      reading.flapNorm = at("fcs/flap-pos-norm");
      // Babylon world axes are east / up / south (see ecefBridge.ts), so north
      // maps to -Z. Getting this wrong would reverse every flyby.
      const north = at("velocities/v-north-fps");
      const east = at("velocities/v-east-fps");
      const down = at("velocities/v-down-fps");
      reading.velocity[0] = Number.isFinite(east) ? east * FPS_TO_MPS : 0;
      reading.velocity[1] = Number.isFinite(down) ? -down * FPS_TO_MPS : 0;
      reading.velocity[2] = Number.isFinite(north) ? -north * FPS_TO_MPS : 0;
      const soundFps = at("atmosphere/a-fps");
      reading.soundSpeedMps = Number.isFinite(soundFps) && soundFps > 50
        ? soundFps * FPS_TO_MPS : 343;
      return reading;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      batch.dispose();
    },
  };
}

/** Maps a reading plus pose into the transport snapshot. */
export function toSnapshot(
  reading: AudioAdapterReading,
  pose: {
    sequence: number; epoch: number;
    source: readonly [number, number, number];
    sourceVelocity: readonly [number, number, number];
    listenerVelocity: readonly [number, number, number];
    exterior: number;
    groundReflectionM: number;
    poseValid: boolean;
  },
): AudioSnapshotInit {
  return {
    sequence: pose.sequence,
    epoch: pose.epoch,
    simTimeS: reading.simTimeS,
    availability: reading.availability | (pose.poseValid ? AVAILABILITY.POSE : 0),
    n1Pct: reading.n1Pct,
    n2Pct: reading.n2Pct,
    thrustLbf: reading.thrustLbf,
    fuelFlowPps: reading.fuelFlowPps,
    throttleNorm: reading.throttleNorm,
    combustion: reading.combustion,
    running: reading.running,
    starter: reading.starter,
    cutoff: reading.cutoff,
    kias: reading.kias,
    gearNorm: reading.gearNorm,
    flapNorm: reading.flapNorm,
    source: pose.source,
    sourceVelocity: pose.sourceVelocity,
    listenerVelocity: pose.listenerVelocity,
    soundSpeedMps: reading.soundSpeedMps,
    exterior: pose.exterior,
    groundReflectionM: pose.groundReflectionM,
  };
}
