
export interface FlightWheelObservation {
  readonly index: number;
  readonly weightOnWheels: boolean;
  readonly bodyXFt: number;
  readonly bodyYFt: number;
  readonly bodyZFt: number;
  readonly compressionFt: number;
  readonly strutForceLb: number;
  readonly frictionCoefficients: Readonly<{
    static: number | null;
    dynamic: number | null;
    rolling: number | null;
  }>;
}

export interface GroundSurfaceConfiguration {
  solid: boolean;
  bumpiness: number;
  staticFrictionFactor: number;
  rollingFrictionFactor: number;
  maximumForceLb: number;
}
/**
 * Headless dynamics boundary. Only the composition root sees a backend.
 * The presentation layer receives copied observations, never a native handle.
 */
export interface FlightDynamicsBackend {
  createGearContactReader?(): {
    readonly count: number;
    readUnit(index: number): {
      isBogey: number; wow: number;
      bodyXFt: number; bodyYFt: number; bodyZFt: number;
      compressionFt: number; strutForceLbs: number;
    };
  };

  writeDataFile(path: string, data: string): string;
  loadModelOrThrow(model: string): unknown;
  queryPropertyCatalog(check: string): string;
  getPropertyValue(path: string): number;
  setPropertyValue(path: string, value: number): void;
  setDt(seconds: number): void;
  getDeltaT(): number;
  getSimTime(): number;
  resetToInitialConditions(mode: number): void;
  runIc(): boolean;
  run(): boolean;
  setHoldDown(enabled: boolean): void;
  destroy(): void;
}

export interface FlightModelDefinition {
  modelName: string;
  fixedDtSec: number;
  rudderSign: 1 | -1;
  flapPosition: { property: string; fullTravel: number };
}

export interface FlightControlCommand {
  elevatorNorm: number;
  aileronNorm: number;
  rudderNorm: number;
  throttleNorm: number;
  flapsNorm: number;
  gearDown: boolean;
  leftBrakeNorm: number;
  rightBrakeNorm: number;
}

export interface FlightInitialConditions {
  latitudeDeg: number;
  longitudeDeg: number;
  altitudeMslFt: number;
  terrainElevationFt: number;
  calibratedAirspeedKts: number;
  headingDeg: number;
  pitchDeg: number;
  flightPathAngleDeg: number;
  controls: FlightControlCommand;
  fuelLb?: readonly number[];
}

export interface FlightObservation {
  simTimeSec: number;
  northVelocityFps: number;
  eastVelocityFps: number;
  downVelocityFps: number;
  wheelContacts: readonly FlightWheelObservation[];
  diagnostics: Readonly<Record<string, number | null>>;

  latitudeDeg: number;
  longitudeDeg: number;
  altitudeMslFt: number;
  altitudeAglFt: number;
  calibratedAirspeedKts: number;
  groundSpeedFps: number;
  rollDeg: number;
  pitchDeg: number;
  headingDeg: number;
  flightPathAngleDeg: number;
  throttleCommandNorm: number;
  throttlePositionNorm: number;
  rollRateRadSec: number;
  pitchRateRadSec: number;
  yawRateRadSec: number;
  weightLb: number;
  temperatureC: number;
  gearPositionNorm: number;
  flapsPositionNorm: number;
  weightOnWheels: boolean;
  thrustLb: number | null;
  fuelLb: readonly number[];
}

const observedPaths = {
  northVelocityFps: "velocities/v-north-fps",
  eastVelocityFps: "velocities/v-east-fps",
  downVelocityFps: "velocities/v-down-fps",

  latitudeDeg: "position/lat-geod-deg",
  longitudeDeg: "position/long-gc-deg",
  altitudeMslFt: "position/h-sl-ft",
  altitudeAglFt: "position/h-agl-ft",
  calibratedAirspeedKts: "velocities/vc-kts",
  groundSpeedFps: "velocities/vg-fps",
  rollDeg: "attitude/phi-deg",
  pitchDeg: "attitude/theta-deg",
  headingDeg: "attitude/psi-deg",
  flightPathAngleDeg: "flight-path/gamma-deg",
  throttleCommandNorm: "fcs/throttle-cmd-norm",
  throttlePositionNorm: "fcs/throttle-pos-norm",
  rollRateRadSec: "velocities/p-rad_sec",
  pitchRateRadSec: "velocities/q-rad_sec",
  yawRateRadSec: "velocities/r-rad_sec",
  weightLb: "inertia/weight-lbs",
} as const;

const controlPaths = {
  elevatorNorm: "fcs/elevator-cmd-norm",
  aileronNorm: "fcs/aileron-cmd-norm",
  rudderNorm: "fcs/rudder-cmd-norm",
  throttleNorm: "fcs/throttle-cmd-norm",
  flapsNorm: "fcs/flap-cmd-norm",
  leftBrakeNorm: "fcs/left-brake-cmd-norm",
  rightBrakeNorm: "fcs/right-brake-cmd-norm",
} as const;

function canonical(path: string): string { return path.replace(/\[0\]/g, ""); }
function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(label + " must be finite.");
  return value;
}
function bounded(value: number, min: number, max: number, label: string): number {
  finite(value, label);
  if (value < min || value > max) throw new RangeError(label + " is outside its allowed range.");
  return value;
}

export class FlightModelDriver {
  #backend: FlightDynamicsBackend;
  #definition: FlightModelDefinition;
  #catalog: Set<string>;
  #fuelPaths: string[];
  #wowPaths: string[];
  #disposed = false;
  #initialized = false;

  /** Transfers exclusive backend ownership, including cleanup on failure. */
  static create(backend: FlightDynamicsBackend, definition: FlightModelDefinition, files: Readonly<Record<string, string>>): FlightModelDriver {
    try {
      bounded(definition.fixedDtSec, 0.000001, 1, "fixedDtSec");
      if (definition.flapPosition.fullTravel <= 0) throw new RangeError("Flap travel must be positive.");
      finite(definition.flapPosition.fullTravel, "flap travel");
      if (definition.rudderSign !== 1 && definition.rudderSign !== -1) throw new RangeError("Invalid rudder sign.");
      for (const [path, data] of Object.entries(files)) backend.writeDataFile(path, data);
      backend.loadModelOrThrow(definition.modelName);
      backend.setDt(definition.fixedDtSec);
      if (Math.abs(backend.getDeltaT() - definition.fixedDtSec) > 1e-12) throw new Error("Native timestep does not match the driver.");
      return new FlightModelDriver(backend, definition);
    } catch (cause) {
      try { backend.destroy(); }
      catch (cleanupError) { throw new AggregateError([cause, cleanupError], "Flight model creation and cleanup failed."); }
      throw cause;
    }
  }

  private constructor(backend: FlightDynamicsBackend, definition: FlightModelDefinition) {
    this.#backend = backend;
    this.#definition = { ...definition, flapPosition: { ...definition.flapPosition } };
    this.#catalog = new Set(backend.queryPropertyCatalog("").split(/\r?\n/)
      .map(line => canonical(line.trim().split(/\s+/)[0] ?? "")).filter(Boolean));
    this.#fuelPaths = [...this.#catalog].filter(path => /^propulsion\/tank(?:\[\d+\])?\/contents-lbs$/.test(path))
      .sort((a, b) => Number(a.match(/\[(\d+)\]/)?.[1] ?? 0) - Number(b.match(/\[(\d+)\]/)?.[1] ?? 0));
    this.#wowPaths = [...this.#catalog].filter(path => /^gear\/unit(?:\[\d+\])?\/WOW$/.test(path));
    for (const path of [...Object.values(observedPaths), ...Object.values(controlPaths), "gear/gear-cmd-norm",
      "gear/gear-pos-norm", "atmosphere/T-R", definition.flapPosition.property]) this.#requireProperty(path);
    if (!this.#wowPaths.length) throw new Error("The model exposes no wheel contact observations.");
  }

  get fixedDtSec(): number { return this.#definition.fixedDtSec; }

  initialize(initial: FlightInitialConditions): Readonly<FlightObservation> {
    this.#requireAlive();
    const writes: Record<string, number> = {
      "ic/lat-geod-deg": bounded(initial.latitudeDeg, -90, 90, "latitude"),
      "ic/long-gc-deg": bounded(initial.longitudeDeg, -180, 180, "longitude"),
      "ic/h-sl-ft": finite(initial.altitudeMslFt, "altitude"),
      "ic/terrain-elevation-ft": finite(initial.terrainElevationFt, "terrain"),
      "ic/vc-kts": bounded(initial.calibratedAirspeedKts, 0, 1000, "airspeed"),
      "ic/psi-true-deg": finite(initial.headingDeg, "heading"),
      "ic/phi-deg": 0,
      "ic/theta-deg": finite(initial.pitchDeg, "pitch"),
      "ic/gamma-deg": finite(initial.flightPathAngleDeg, "flight path angle"),
      // For this wings-level, calm-air initializer, theta = gamma + alpha.
      // JSBSim's gamma setter may change theta. Set alpha last to preserve
      // the requested descent path while recovering the requested pitch.
      "ic/alpha-deg": finite(initial.pitchDeg - initial.flightPathAngleDeg, "angle of attack"),
      "atmosphere/delta-T": 0,
      "atmosphere/wind-north-fps": 0,
      "atmosphere/wind-east-fps": 0,
      "atmosphere/wind-down-fps": 0,
      "gear/gear-pos-norm": initial.controls.gearDown ? 1 : 0,
      [this.#definition.flapPosition.property]: initial.controls.flapsNorm * this.#definition.flapPosition.fullTravel,
    };
    this.#validateControls(initial.controls);
    if (initial.fuelLb) {
      if (initial.fuelLb.length !== this.#fuelPaths.length) throw new Error("Fuel loading must specify every discovered tank.");
      initial.fuelLb.forEach((value, index) => { writes[this.#fuelPaths[index]!] = bounded(value, 0, 100000, "fuel"); });
    }
    for (const path of Object.keys(writes)) this.#requireProperty(path);
    this.#requireProperty("propulsion/set-running");
    const wasInitialized = this.#initialized;
    this.#initialized = false;
    if (wasInitialized) this.#backend.resetToInitialConditions(2);
    this.#backend.setDt(this.fixedDtSec);
    for (const [path, value] of Object.entries(writes)) this.#backend.setPropertyValue(path, value);
    this.#writeControls(initial.controls);
    if (!this.#backend.runIc()) throw new Error("JSBSim could not initialize the flight scenario.");
    this.#backend.setPropertyValue("propulsion/set-running", -1);
    this.#writeControls(initial.controls);
    // Native InitRunning forces propulsion throttle inputs to full power.
    // Re-evaluate FCS/propulsion at dt=0 after restoring the command. This
    // also refreshes initial accelerations without spending simulation time
    // or fuel; the next accepted step starts from the requested power state.
    if (!this.#backend.runIc()) throw new Error("JSBSim could not initialize the requested engine power state.");
    this.#initialized = true;
    return this.observe();
  }

  applyControls(command: FlightControlCommand): void {
    this.#requireReady();
    this.#validateControls(command);
    this.#writeControls(command);
  }

  /** Native hold-down for static engine measurements, not a wall-clock pause. */
  setHoldDown(enabled: boolean): void {
    this.#requireReady();
    this.#backend.setHoldDown(enabled);
  }

  /** Advances exactly one accepted native step. No renderer clock is involved. */
  step(): Readonly<FlightObservation> {
    this.#requireReady();
    if (Math.abs(this.#backend.getDeltaT() - this.fixedDtSec) > 1e-12) throw new Error("Native timestep changed outside the driver.");
    if (!this.#backend.run()) throw new Error("JSBSim declined a physics step.");
    return this.observe();
  }

  #nativeGearReader: ReturnType<NonNullable<FlightDynamicsBackend["createGearContactReader"]>> | null | undefined;

  /** Configure environmental surface factors, never aircraft tire coefficients. */
  configureGroundSurface(configuration: GroundSurfaceConfiguration): void {
    this.#requireReady();
    const { solid, bumpiness, staticFrictionFactor, rollingFrictionFactor, maximumForceLb } = configuration;
    if (typeof solid !== "boolean" ||
      ![bumpiness, staticFrictionFactor, rollingFrictionFactor, maximumForceLb].every(Number.isFinite) ||
      bumpiness < 0 || bumpiness > 1 || staticFrictionFactor < 0 ||
      rollingFrictionFactor < 0 || maximumForceLb <= 0) {
      throw new RangeError("Invalid ground surface configuration.");
    }
    const writes = [
      ["ground/solid", Number(solid)],
      ["ground/bumpiness", bumpiness],
      ["ground/static-friction-factor", staticFrictionFactor],
      ["ground/rolling_friction-factor", rollingFrictionFactor],
      ["ground/maximum-force-lbs", maximumForceLb],
    ] as const;
    for (const [property] of writes) this.#requireProperty(property);
    for (const [property, value] of writes) this.#backend.setPropertyValue(property, value);
  }

  /** Preparation-only fuel freeze. Normal scenario measurement must unfreeze. */
  setFuelFrozen(frozen: boolean): void {
    this.#requireReady();
    if (typeof frozen !== "boolean") throw new TypeError("Fuel freeze must be boolean.");
    this.#requireProperty("propulsion/fuel_freeze");
    this.#backend.setPropertyValue("propulsion/fuel_freeze", frozen ? 1 : 0);
  }

  #readWheelContacts(): readonly FlightWheelObservation[] {
    this.#requireReady();
    if (this.#nativeGearReader === undefined) {
      this.#nativeGearReader = this.#backend.createGearContactReader?.() ?? null;
    }
    const wheels: FlightWheelObservation[] = [];
    if (this.#nativeGearReader) {
      for (let index = 0; index < this.#nativeGearReader.count; index++) {
        const contact = this.#nativeGearReader.readUnit(index);
        if (!contact.isBogey) continue;
        const numbers = [contact.bodyXFt, contact.bodyYFt, contact.bodyZFt, contact.compressionFt, contact.strutForceLbs];
        if (!numbers.every(Number.isFinite)) throw new Error("Nonfinite native wheel contact telemetry.");
        wheels.push(Object.freeze({
          index, weightOnWheels: Boolean(contact.wow),
          bodyXFt: contact.bodyXFt, bodyYFt: contact.bodyYFt, bodyZFt: contact.bodyZFt,
          compressionFt: contact.compressionFt, strutForceLb: contact.strutForceLbs,
          frictionCoefficients: Object.freeze({
            static: this.#readOptionalProperty("gear/unit[" + index + "]/static_friction_coeff"),
            dynamic: this.#readOptionalProperty("gear/unit[" + index + "]/dynamic_friction_coeff"),
            rolling: this.#readOptionalProperty("gear/unit[" + index + "]/rolling_friction_coeff"),
          }),
        }));
      }
    }
    return Object.freeze(wheels);
  }

  #readOptionalProperty(property: string): number | null {
    return this.#catalog.has(property.replace(/\[0\]/g, "")) ? this.#read(property) : null;
  }

  #readDiagnostics(): Readonly<Record<string, number | null>> {
    const properties = {
      n1Percent: "propulsion/engine/n1",
      maxN1Percent: "propulsion/engine/MaxN1",
      bleedLossFactor: "propulsion/engine/bleed-factor",
      nativePressureAltitudeFt: "atmosphere/pressure-altitude",
      terrainElevationFt: "position/terrain-elevation-asl-ft",
      groundSolid: "ground/solid",
      groundBumpiness: "ground/bumpiness",
      groundStaticFrictionFactor: "ground/static-friction-factor",
      groundRollingFrictionFactor: "ground/rolling_friction-factor",
      groundMaximumForceLb: "ground/maximum-force-lbs",
      alphaDeg: "aero/alpha-deg",
      aeroForceXLb: "forces/fbx-aero-lbs",
      aeroForceZLb: "forces/fbz-aero-lbs",
      propulsionForceXLb: "forces/fbx-prop-lbs",
      gearForceXLb: "forces/fbx-gear-lbs",
      cgXIn: "inertia/cg-x-in", cgYIn: "inertia/cg-y-in", cgZIn: "inertia/cg-z-in",
      pressurePsf: "atmosphere/P-psf",
      windNorthFps: "atmosphere/wind-north-fps",
      windEastFps: "atmosphere/wind-east-fps",
      windDownFps: "atmosphere/wind-down-fps",
    };
    return Object.freeze(Object.fromEntries(Object.entries(properties).map(([name, property]) => [
      name, this.#readOptionalProperty(property),
    ])));
  }



  observe(): Readonly<FlightObservation> {
    this.#requireReady();
    const numbers = Object.fromEntries(Object.entries(observedPaths).map(([key, path]) => [key, this.#read(path)])) as Pick<FlightObservation, keyof typeof observedPaths>;
    return Object.freeze({
      wheelContacts: this.#readWheelContacts(),
      diagnostics: this.#readDiagnostics(),

      ...numbers,
      simTimeSec: finite(this.#backend.getSimTime(), "simulation time"),
      temperatureC: this.#read("atmosphere/T-R") * 5 / 9 - 273.15,
      gearPositionNorm: this.#read("gear/gear-pos-norm"),
      flapsPositionNorm: this.#read(this.#definition.flapPosition.property) / this.#definition.flapPosition.fullTravel,
      weightOnWheels: this.#wowPaths.some(path => this.#read(path) > 0.5),
      thrustLb: this.#catalog.has("propulsion/engine/thrust-lbs") ? this.#read("propulsion/engine/thrust-lbs") : null,
      fuelLb: Object.freeze(this.#fuelPaths.map(path => this.#read(path))),
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#backend.destroy();
  }

  #read(path: string): number { return finite(this.#backend.getPropertyValue(path), path); }
  #requireProperty(path: string): void {
    if (!this.#catalog.has(canonical(path))) throw new Error("Required flight model capability is absent: " + path);
  }
  #requireAlive(): void { if (this.#disposed) throw new Error("Flight model driver has been disposed."); }
  #requireReady(): void {
    this.#requireAlive();
    if (!this.#initialized) throw new Error("Flight model driver has not been initialized.");
  }
  #validateControls(command: FlightControlCommand): void {
    for (const key of Object.keys(controlPaths) as (keyof typeof controlPaths)[]) {
      bounded(command[key], ["elevatorNorm", "aileronNorm", "rudderNorm"].includes(key) ? -1 : 0, 1, key);
    }
    if (typeof command.gearDown !== "boolean") throw new TypeError("gearDown must be boolean.");
  }
  #writeControls(command: FlightControlCommand): void {
    for (const [key, path] of Object.entries(controlPaths) as [keyof typeof controlPaths, string][]) {
      this.#backend.setPropertyValue(path, command[key] * (key === "rudderNorm" ? this.#definition.rudderSign : 1));
    }
    this.#backend.setPropertyValue("gear/gear-cmd-norm", command.gearDown ? 1 : 0);
  }
}
