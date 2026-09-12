import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import type { AircraftId } from "../aircraft/aircraftIds";
import { FIXED_DT } from "../physics/fixedStepLoop";
import { getFdmProfile } from "./fdmProfiles";

export interface C172BootstrapOptions {
  /** Geodetic latitude in degrees. Default: KMSP area. */
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
}

type JsbsimTimingApi = JSBSimSdk & {
  setDt?: (deltaSeconds: number) => void;
  getDeltaT?: () => number;
};

export const START_ALTITUDE_AGL_METERS = 5000 * 0.3048;
export const DEFAULT_FLIGHT_START = { latDeg: 44.977753, lonDeg: -93.265011 };

const DEFAULT_OPTIONS: Required<C172BootstrapOptions> = {
  ...DEFAULT_FLIGHT_START,
  // Temporary initial state; flight placement adds the loaded ground height.
  altFt: 5_000,
  headingDeg: 300,
  airspeedKts: 120,
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
  const isPiston = profile.engine === "piston";

  sdk.configurePaths({
    rootDir: "/runtime",
    aircraftPath: "aircraft",
    enginePath: "engine",
    systemsPath: "systems",
  });

  if (!sdk.loadModel(profile.model)) {
    throw new Error(`JSBSim failed to load the ${aircraftId} aircraft model (${profile.model}).`);
  }

  applyFixedDeltaT(sdk, FIXED_DT);
  sdk.setPropertyValue("ic/lat-geod-deg", opts.latDeg);
  sdk.setPropertyValue("ic/long-gc-deg", opts.lonDeg);
  sdk.setPropertyValue("ic/h-sl-ft", opts.altFt);
  sdk.setPropertyValue("ic/psi-true-deg", opts.headingDeg);
  sdk.setPropertyValue("ic/theta-deg", 0);
  sdk.setPropertyValue("ic/phi-deg", 0);
  sdk.setPropertyValue("ic/vc-kts", opts.airspeedKts);
  // Commands and physical actuator positions must agree before RunIC, which
  // already evaluates the FCS and ground contacts. These are not IC properties.
  sdk.setPropertyValue("gear/gear-cmd-norm", profile.initialGearDown ? 1 : 0);
  sdk.setPropertyValue("gear/gear-pos-norm", profile.initialGearDown ? 1 : 0);
  sdk.setPropertyValue("fcs/flap-cmd-norm", 0);
  sdk.setPropertyValue(profile.flapPosition.property, 0);

  if (!sdk.runIc()) {
    throw new Error(`JSBSim RunIC failed for ${aircraftId} initial conditions.`);
  }

  sdk.setPropertyValue("fcs/throttle-cmd-norm", profile.initialThrottleNorm);
  if (opts.engineRunning) sdk.setPropertyValue("propulsion/set-running", -1);
  else sdk.setPropertyValue("propulsion/engine/set-running", 0);
  if (isPiston) {
    sdk.setPropertyValue("propulsion/magneto_cmd", opts.engineRunning ? 3 : 0);
    sdk.setPropertyValue("fcs/mixture-cmd-norm", mixtureForAltitude(opts.altFt));
  }
}

export async function bootstrapC172p(sdk: JSBSimSdk, options: C172BootstrapOptions = {}): Promise<void> {
  return bootstrapAircraft(sdk, "cessna-172", options);
}
