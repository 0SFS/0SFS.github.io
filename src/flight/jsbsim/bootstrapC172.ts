import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { PHYSICS_HZ } from "../physics/fixedStepLoop";

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

export async function bootstrapC172p(
  sdk: JSBSimSdk,
  options: C172BootstrapOptions = {},
): Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  sdk.configurePaths({
    rootDir: "/runtime",
    aircraftPath: "aircraft",
    enginePath: "engine",
    systemsPath: "systems",
  });

  if (!sdk.loadModel("c172p")) {
    throw new Error("JSBSim failed to load the c172p aircraft model.");
  }

  sdk.setPropertyValue("simulation/dt", 1 / PHYSICS_HZ);
  sdk.setPropertyValue("ic/lat-gc-deg", opts.latDeg);
  sdk.setPropertyValue("ic/long-gc-deg", opts.lonDeg);
  sdk.setPropertyValue("ic/h-sl-ft", opts.altFt);
  sdk.setPropertyValue("ic/psi-true-deg", opts.headingDeg);
  sdk.setPropertyValue("ic/theta-deg", 0);
  sdk.setPropertyValue("ic/phi-deg", 0);
  sdk.setPropertyValue("ic/vc-kts", opts.airspeedKts);
  sdk.setPropertyValue("ic/gear-gear-pos-norm", 0);
  sdk.setPropertyValue("ic/flap-pos-norm", 0);

  if (!sdk.runIc()) {
    throw new Error("JSBSim RunIC failed for c172p initial conditions.");
  }

  sdk.setPropertyValue("fcs/throttle-cmd-norm", 0.65);
  sdk.setPropertyValue("propulsion/set-running", opts.engineRunning ? -1 : 0);
  sdk.setPropertyValue("propulsion/magneto_cmd", opts.engineRunning ? 3 : 0);
  sdk.setPropertyValue("fcs/mixture-cmd-norm", mixtureForAltitude(opts.altFt));
}
