import type { JSBSimSdk } from "@felipegalind0/jsbsim";
import { AVAILABILITY, type AudioSnapshotInit } from "./audioSnapshot";
import { propertyInCatalog } from "../diagnostics/flightRecorder";
import type { ResolvedEngineSoundSource } from "./aircraftAudioProfiles";
import type { EngineAcousticDefinition, EngineTelemetryField } from "./engineAcousticDefinitions";

/**
 * Reads the properties the audio core needs, once per accepted physics step.
 *
 * Availability comes from the property catalog, never from a zero: JSBSim
 * returns 0 for a property that does not exist, and a silent engine is
 * indistinguishable from a missing one unless the catalog is consulted.
 */

const FLIGHT_PROPERTIES = {
  simTimeS: "simulation/sim-time-sec", kias: "velocities/vc-kts",
  northFps: "velocities/v-north-fps", eastFps: "velocities/v-east-fps", downFps: "velocities/v-down-fps",
  gearNorm: "gear/gear-pos-norm", flapNorm: "fcs/flap-pos-norm", soundSpeedFps: "atmosphere/a-fps",
} as const;
type AudioField = EngineTelemetryField | keyof typeof FLIGHT_PROPERTIES | "commandSelection" | "nozzlePitchRad" | "nozzleYawRad";

const FPS_TO_MPS = 0.3048;
const INCH_TO_METRE = 0.0254;

export type CombustionSource = "fuel-flow" | "running-only" | "unavailable";

export interface AudioAdapterDiagnostics {
  /** Catalog paths the model does not publish; those fields report unavailable. */
  missing: readonly string[];
  combustionSource: CombustionSource;
  /** Engine acoustic centre in the aircraft visual frame (metres). */
  sourceOffset: readonly [number, number, number];
  /** The installed engine definition, independent of aircraft identity. */
  profile?: EngineAcousticDefinition;
  sourceId?: string;
  engineIndex?: number;
  /** Required schema fields exist in the catalog and have finite native values. */
  telemetryAvailable?: boolean;
}

export interface AudioAdapter {
  /** Reads after an accepted step; reuses the owned reading and native buffer. */
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
  /** Genuine native observer; availability is separate from an inactive value. */
  augmentation: boolean;
  /** Native actually burned reheat fuel; unavailable/invalid thermal state is NaN. */
  afterburnerBurnedFuelFlowKgSec?: number;
  /** Native thruster's exhaust axis in the aircraft visual frame; NaNs mean unavailable. */
  sourceAxis?: [number, number, number];
}

/**
 * Combustion decision.
 *
 * sound.md §3 is explicit that native `set-running` must not gate ignition, and
 * the recorded start trace shows why: fuel burns for 14.5 s of a cold start
 * while `set-running` is still 0. Fuel flow is the signal that actually tracks
 * the burner, so it decides; `running` only ever adds confidence.
 *
 * The native schema explicitly supplies the fuel-flow threshold. Its current
 * value is trace-led for SF50; a real F135 cold start also verifies dry
 * motoring and fueled lightoff before running. F135 abort/relight remains
 * unvalidated.
 * `combustionSource` reports which native signal produced the answer.
 */
export function decideCombustion(input: {
  fuelFlowAvailable: boolean; fuelFlowPps: number;
  runningAvailable: boolean; running: boolean;
}, minimumFuelFlowPps: number): { combustion: boolean; source: CombustionSource } {
  if (input.fuelFlowAvailable) {
    const burning = Number.isFinite(input.fuelFlowPps) && input.fuelFlowPps > minimumFuelFlowPps;
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
  /** Explicit installation and native contract; there is no engine-zero fallback. */
  source: ResolvedEngineSoundSource;
}

/**
 * Creates the adapter. Call after `loadModel()`; dispose and re-create it when
 * the model is replaced, because a PropertyBatch resolves nodes once.
 */
export function createJsbsimAudioAdapter(sdk: JSBSimSdk, options: AudioAdapterOptions): AudioAdapter {
  if (!options.source) throw new Error("Engine audio requires an explicit resolved source installation");
  const { installation, definition } = options.source;
  const engineIndex = installation.engineIndex;
  if (!installation.id || installation.engineDefinitionId !== definition.id
    || !Number.isInteger(engineIndex) || engineIndex < 0 || installation.position.kind !== "native-engine") {
    throw new Error(`Invalid native engine sound installation ${installation.id}`);
  }
  const schema = definition.telemetry;
  if (schema.combustion.rule !== "fuel-flow-or-running" || !Number.isFinite(schema.combustion.minimumFuelFlowPps)
    || schema.combustion.minimumFuelFlowPps < 0) throw new Error(`Unsupported combustion interpretation in ${schema.id}`);
  const paths: Partial<Record<AudioField, string>> = { ...FLIGHT_PROPERTIES };
  for (const [field, template] of Object.entries(schema.paths)) {
    if (!template) continue;
    const path = template.replaceAll("{engineIndex}", String(engineIndex));
    if (/[{}]/.test(path)) throw new Error(`Unsupported telemetry path token in ${template}`);
    paths[field as EngineTelemetryField] = path;
  }
  for (const field of schema.required) {
    if (!paths[field]) throw new Error(`Telemetry schema ${schema.id} lacks required field ${field}`);
  }
  if (schema.commandScope) paths.commandSelection = schema.commandScope.selectionPath;

  const reader = sdk as unknown as CatalogReader;
  const catalogHas = (path: string): boolean => {
    try { return propertyInCatalog(reader, path); } catch { return false; }
  };
  for (const field of schema.required) {
    if (!catalogHas(paths[field]!)) {
      throw new Error(`Engine sound source ${installation.id} lacks required native telemetry ${paths[field]}`);
    }
  }
  const geometry = (path: string): number => {
    if (!catalogHas(path)) throw new Error(`Engine sound source ${installation.id} requires native geometry ${path}`);
    const value = sdk.getPropertyValue(path);
    if (!Number.isFinite(value)) throw new Error(`Engine sound source ${installation.id} has non-finite geometry ${path}`);
    return value;
  };
  if (!Number.isFinite(options.gearHeightMetres)) throw new Error("Engine sound source requires finite aircraft stance");
  const enginePath = `propulsion/engine[${engineIndex}]`;
  paths.nozzlePitchRad = `${enginePath}/pitch-angle-rad`;
  paths.nozzleYawRad = `${enginePath}/yaw-angle-rad`;
  const sourceOffset = engineSourceOffsetMetres(
    [geometry(`${enginePath}/x-position`), geometry(`${enginePath}/y-position`), geometry(`${enginePath}/z-position`)],
    [geometry("inertia/cg-x-in"), geometry("inertia/cg-y-in"), geometry("inertia/cg-z-in")],
    options.gearHeightMetres,
  );

  const fields = Object.keys(paths) as AudioField[];
  const propertyPaths = fields.map(field => paths[field]!);
  // Audio never creates nodes. A created property would read as a silent zero.
  const batch = sdk.createPropertyBatch(propertyPaths, { create: false });
  const values = new Float64Array(propertyPaths.length);
  const slots = Object.fromEntries(fields.map((field, index) => [field, index])) as Partial<Record<AudioField, number>>;
  const has = Object.fromEntries(fields.map(field => [field,
    !batch.missing.includes(paths[field]!) && catalogHas(paths[field]!)])) as Partial<Record<AudioField, boolean>>;
  // Read into owned storage; a bare batch.read() returns an ephemeral WASM view.
  const at = (field: AudioField): number => {
    const slot = slots[field];
    if (!has[field] || slot === undefined) return Number.NaN;
    const value = values[slot];
    return Number.isFinite(value) ? value : Number.NaN;
  };
  const available = (field: AudioField): boolean => Number.isFinite(at(field));
  const requiredAvailable = (): boolean => schema.required.every(available);
  try {
    batch.read(values);
    for (const field of schema.required) {
      if (!available(field)) throw new Error(`Engine sound source ${installation.id} has unavailable required telemetry ${paths[field]}`);
    }
  } catch (error) {
    batch.dispose();
    throw error;
  }

  // Global JSBSim starter/cutoff getters refer to active_engine, or aggregate
  // all engines when it is -1. The aggregate describes one source only when
  // the catalog confirms there is a single native engine.
  let onlyNativeEngine = false;
  try {
    const engines = reader.queryPropertyCatalog?.("x-position").split("\n")
      .map(line => /^propulsion\/engine(?:\[(\d+)\])?\/x-position\s/.exec(line.trim()))
      .filter(match => match !== null);
    onlyNativeEngine = engineIndex === 0 && engines?.length === 1 && Number(engines[0]?.[1] ?? 0) === 0;
  } catch { /* A failed catalog query cannot confirm a single-engine command scope. */ }
  const commandScoped = (): boolean => !schema.commandScope
    || at("commandSelection") === engineIndex
    || (onlyNativeEngine && at("commandSelection") === schema.commandScope.allEnginesValue);
  const combustionProbe = decideCombustion({
    fuelFlowAvailable: available("fuelFlowPps"), fuelFlowPps: at("fuelFlowPps"),
    runningAvailable: available("running"), running: at("running") > 0.5,
  }, schema.combustion.minimumFuelFlowPps);
  const diagnostics: AudioAdapterDiagnostics = {
    missing: fields.filter(field => !has[field] && field !== "augmentation"
      && field !== "thermalValid" && field !== "afterburnerBurnedFuelFlowKgSec"
      && field !== "nozzlePitchRad" && field !== "nozzleYawRad").map(field => paths[field]!),
    combustionSource: combustionProbe.source, sourceOffset, profile: definition,
    sourceId: installation.id, engineIndex, telemetryAvailable: requiredAvailable(),
  };
  const reading: AudioAdapterReading = {
    simTimeS: 0, availability: 0, n1Pct: Number.NaN, n2Pct: Number.NaN,
    thrustLbf: Number.NaN, fuelFlowPps: Number.NaN, throttleNorm: Number.NaN,
    combustion: false, running: false, starter: false, cutoff: false,
    kias: Number.NaN, gearNorm: Number.NaN, flapNorm: Number.NaN,
    velocity: [Number.NaN, Number.NaN, Number.NaN], soundSpeedMps: Number.NaN, augmentation: false,
    afterburnerBurnedFuelFlowKgSec: Number.NaN,
    sourceAxis: [Number.NaN, Number.NaN, Number.NaN],
  };
  let disposed = false;
  const bit = (field: AudioField, flag: number): number => available(field) ? flag : 0;

  return {
    diagnostics,
    read(): AudioAdapterReading {
      if (disposed) return reading;
      batch.read(values);
      let availability = 0;
      availability |= bit("n1Pct", AVAILABILITY.N1);
      availability |= bit("n2Pct", AVAILABILITY.N2);
      availability |= bit("thrustLbf", AVAILABILITY.THRUST);
      availability |= bit("fuelFlowPps", AVAILABILITY.FUEL_FLOW);
      availability |= bit("running", AVAILABILITY.RUNNING);
      availability |= bit("augmentation", AVAILABILITY.AUGMENTATION);
      const burnedFuel = at("afterburnerBurnedFuelFlowKgSec");
      const thermalValid = available("thermalValid") && at("thermalValid") > 0.5;
      const burnedFuelAvailable = thermalValid && Number.isFinite(burnedFuel) && burnedFuel >= 0;
      if (burnedFuelAvailable) availability |= AVAILABILITY.AFTERBURNER_BURNED_FUEL;
      availability |= bit("kias", AVAILABILITY.AIRSPEED);
      const commandsAvailable = commandScoped() && available("starter") && available("cutoff")
        && at("starter") >= 0 && at("cutoff") >= 0;
      if (commandsAvailable) availability |= AVAILABILITY.COMMANDS;
      if (available("gearNorm") && available("flapNorm")) availability |= AVAILABILITY.CONFIG;

      const running = at("running") > 0.5;
      const fuelFlowPps = at("fuelFlowPps");
      const decision = decideCombustion({
        fuelFlowAvailable: (availability & AVAILABILITY.FUEL_FLOW) !== 0, fuelFlowPps,
        runningAvailable: (availability & AVAILABILITY.RUNNING) !== 0, running,
      }, schema.combustion.minimumFuelFlowPps);
      if (decision.source !== "unavailable") availability |= AVAILABILITY.COMBUSTION;
      diagnostics.telemetryAvailable = requiredAvailable();
      diagnostics.combustionSource = decision.source;

      const simTime = at("simTimeS");
      reading.simTimeS = Number.isFinite(simTime) ? simTime : reading.simTimeS;
      reading.availability = availability;
      reading.n1Pct = at("n1Pct");
      reading.n2Pct = at("n2Pct");
      reading.thrustLbf = at("thrustLbf");
      reading.fuelFlowPps = fuelFlowPps;
      reading.throttleNorm = at("throttleNorm");
      reading.combustion = decision.combustion;
      reading.running = running;
      reading.starter = commandsAvailable && at("starter") > 0.5;
      reading.cutoff = commandsAvailable && at("cutoff") > 0.5;
      reading.augmentation = at("augmentation") > 0.5;
      reading.afterburnerBurnedFuelFlowKgSec = burnedFuelAvailable ? burnedFuel : Number.NaN;
      // Native thrust points (cos(p)cos(y), cos(p)sin(y), -sin(p)) in
      // body forward/right/down. Exhaust is its opposite, then mapped to
      // visual left/up/forward. A vertical nozzle therefore points down.
      const pitch = at("nozzlePitchRad"), yaw = at("nozzleYawRad");
      const axis = reading.sourceAxis!;
      axis[0] = Math.cos(pitch) * Math.sin(yaw);
      axis[1] = -Math.sin(pitch);
      axis[2] = -Math.cos(pitch) * Math.cos(yaw);
      reading.kias = at("kias");
      reading.gearNorm = at("gearNorm");
      reading.flapNorm = at("flapNorm");
      // Babylon world axes are east / up / south; north therefore maps to -Z.
      reading.velocity[0] = at("eastFps") * FPS_TO_MPS;
      reading.velocity[1] = -at("downFps") * FPS_TO_MPS;
      reading.velocity[2] = -at("northFps") * FPS_TO_MPS;
      const soundFps = at("soundSpeedFps");
      reading.soundSpeedMps = soundFps > 50 ? soundFps * FPS_TO_MPS : Number.NaN;
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
    sourceAxis?: readonly [number, number, number];
    sourceAxisValid?: boolean;
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
    availability: (reading.availability & ~(AVAILABILITY.POSE | AVAILABILITY.SOURCE_AXIS))
      | (pose.poseValid ? AVAILABILITY.POSE : 0)
      | (pose.poseValid && pose.sourceAxisValid ? AVAILABILITY.SOURCE_AXIS : 0),
    n1Pct: reading.n1Pct,
    n2Pct: reading.n2Pct,
    thrustLbf: reading.thrustLbf,
    fuelFlowPps: reading.fuelFlowPps,
    throttleNorm: reading.throttleNorm,
    combustion: reading.combustion,
    running: reading.running,
    starter: reading.starter,
    cutoff: reading.cutoff,
    augmentation: reading.augmentation,
    afterburnerBurnedFuelFlowKgSec: reading.afterburnerBurnedFuelFlowKgSec,
    kias: reading.kias,
    gearNorm: reading.gearNorm,
    flapNorm: reading.flapNorm,
    source: pose.source,
    sourceAxis: pose.sourceAxis,
    sourceVelocity: pose.sourceVelocity,
    listenerVelocity: pose.listenerVelocity,
    soundSpeedMps: reading.soundSpeedMps,
    exterior: pose.exterior,
    groundReflectionM: pose.groundReflectionM,
  };
}
