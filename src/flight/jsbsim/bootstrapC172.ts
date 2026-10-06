import type { JSBSimSdk } from "@felipegalind0/jsbsim";
import type { AircraftId } from "../aircraft/aircraftIds";
import { FIXED_DT } from "../physics/fixedStepLoop";
import { flightParameterDefaults } from "../settings/flightParameters";
import { getFdmProfile } from "./fdmProfiles";

export interface C172BootstrapOptions {
  /** Geodetic latitude in degrees. Default: osfs.start.latitude's. */
  latDeg?: number;
  /** Geodetic longitude in degrees. */
  lonDeg?: number;
  /** Altitude MSL in feet. */
  altFt?: number;
  /** True heading in degrees. */
  headingDeg?: number;
  /** Calibrated airspeed in knots. */
  airspeedKts?: number;
  /** Start with engine running. */
  engineRunning?: boolean;
  /** Throttle command, 0..1. Default: the aircraft profile's. */
  throttleNorm?: number;
}

type JsbsimTimingApi = JSBSimSdk & {
  setDt?: (deltaSeconds: number) => void;
  getDeltaT?: () => number;
};

const catalogue = flightParameterDefaults();
const DEFAULT_OPTIONS: Required<Omit<C172BootstrapOptions, "throttleNorm">> = {
  latDeg: catalogue.get("osfs.start.latitude"),
  lonDeg: catalogue.get("osfs.start.longitude"),
  // Temporary initial state; flight placement adds the loaded ground height.
  altFt: 5_000,
  headingDeg: catalogue.get("osfs.start.heading"),
  airspeedKts: catalogue.get("osfs.start.airspeed"),
  engineRunning: true,
};

function mixtureForAltitude(altitudeFt: number): number {
  const pressureRatio = Math.pow(Math.max(0, 1 - 6.87535e-6 * altitudeFt), 5.2561);
  return Math.min(1, Math.max(0, pressureRatio * 1.3));
}

function applyFixedDeltaT(sdk: JSBSimSdk, deltaSeconds: number): void {
  const timing = sdk as JsbsimTimingApi;
  if (typeof timing.setDt !== "function") {
    throw new Error("JSBSim SDK is missing setDt(); cannot configure the simulation timestep.");
  }
  timing.setDt(deltaSeconds);
  const actual = timing.getDeltaT?.();
  if (actual !== undefined && Number.isFinite(actual) && Math.abs(actual - deltaSeconds) > 1e-9) {
    throw new Error(`JSBSim dt mismatch: expected ${deltaSeconds}s, got ${actual}s.`);
  }
}

export async function bootstrapAircraft(
  sdk: JSBSimSdk,
  aircraftId: AircraftId,
  options: C172BootstrapOptions = {},
): Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const profile = getFdmProfile(aircraftId);
  const throttleNorm = options.throttleNorm ?? profile.initialThrottleNorm;
  const isPiston = profile.engine === "piston";

  sdk.configurePaths({
    rootDir: "/runtime",
    aircraftPath: "aircraft",
    enginePath: profile.dataPaths?.enginePath ?? "engine",
    systemsPath: profile.dataPaths?.systemsPath ?? "systems",
  });

  if (!sdk.loadModel(profile.model)) {
    throw new Error(`JSBSim failed to load the ${aircraftId} aircraft model (${profile.model}).`);
  }

  if (profile.requiredReadOnlyModelProperties?.length) {
    // A model expression can create an absent native property as an ordinary
    // writable zero. Only a getter-only catalog entry proves the native tie exists.
    const normalize = (path: string): string => path.replace(/\[0\]/g, "");
    const readOnly = new Set(sdk.getPropertyCatalog().flatMap(entry => {
      const match = /^(.*?)\s+\(R\)$/.exec(entry.trim());
      return match ? [normalize(match[1])] : [];
    }));
    const missing = profile.requiredReadOnlyModelProperties.filter(path => !readOnly.has(normalize(path)));
    if (missing.length) {
      throw new Error(`JSBSim cannot initialize ${aircraftId}: required native read-only model properties are unavailable: ${missing.join(", ")}. Install a compatible JSBSim SDK and matching aircraft data.`);
    }
  }

  applyFixedDeltaT(sdk, FIXED_DT);
  sdk.setPropertyValue("ic/lat-geod-deg", opts.latDeg);
  sdk.setPropertyValue("ic/long-gc-deg", opts.lonDeg);
  sdk.setPropertyValue("ic/h-sl-ft", opts.altFt);
  sdk.setPropertyValue("ic/psi-true-deg", opts.headingDeg);
  sdk.setPropertyValue("ic/theta-deg", profile.initialPitchDeg ?? 0);
  sdk.setPropertyValue("ic/phi-deg", 0);
  sdk.setPropertyValue("ic/vc-kts", options.airspeedKts ?? profile.initialAirspeedKts ?? opts.airspeedKts);
  if (profile.initialPitchDeg !== undefined) {
    sdk.setPropertyValue("ic/gamma-deg", 0);
    sdk.setPropertyValue("ic/alpha-deg", profile.initialPitchDeg);
  }
  // Commands and physical actuator positions must agree before RunIC, which
  // already evaluates the FCS and ground contacts. These are not IC properties.
  sdk.setPropertyValue("gear/gear-cmd-norm", profile.initialGearDown ? 1 : 0);
  sdk.setPropertyValue("gear/gear-pos-norm", profile.initialGearDown ? 1 : 0);
  sdk.setPropertyValue("fcs/flap-cmd-norm", 0);
  sdk.setPropertyValue(profile.flapPosition.property, 0);
  const restoreAircraftControls = (): void => {
    for (const [property, value] of Object.entries(profile.initialProperties ?? {})) sdk.setPropertyValue(property, value);
  };
  restoreAircraftControls();

  if (!sdk.runIc()) {
    throw new Error(`JSBSim RunIC failed for ${aircraftId} initial conditions.`);
  }

  sdk.setPropertyValue("fcs/throttle-cmd-norm", throttleNorm);
  restoreAircraftControls();
  if (opts.engineRunning) sdk.setPropertyValue("propulsion/set-running", -1);
  else sdk.setPropertyValue("propulsion/engine/set-running", 0);
  if (isPiston) {
    sdk.setPropertyValue("propulsion/magneto_cmd", opts.engineRunning ? 3 : 0);
    sdk.setPropertyValue("fcs/mixture-cmd-norm", mixtureForAltitude(opts.altFt));
  }
  // Starting engines evaluates a full-power steady state internally. Restore
  // the requested command and evaluate normal zero-time FCS/propulsion before
  // exposing the first sample; native JSBSim owns the turbine state update.
  sdk.setPropertyValue("fcs/throttle-cmd-norm", throttleNorm);
  restoreAircraftControls();
  if (!sdk.runIc()) {
    throw new Error(`JSBSim RunIC failed for ${aircraftId} engine initial conditions.`);
  }
}

export async function bootstrapC172p(sdk: JSBSimSdk, options: C172BootstrapOptions = {}): Promise<void> {
  return bootstrapAircraft(sdk, "cessna-172", options);
}
