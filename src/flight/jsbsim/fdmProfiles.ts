import type { AircraftId } from "../aircraft/aircraftIds";
import { getSf50Variant, type Sf50VariantId } from "../aircraft/sf50Variants";
import { BODY_COLLISION_PROBES, SF50_BODY_COLLISION_PROBES, type BodyCollisionProbe } from "../physics/collisionGeometry";

export interface RunwayConfiguration {
  airspeedKts: number;
  throttleNorm: number;
  flapsNorm: number;
  pitchDeg: number;
}

export interface FdmProfile {
  sf50VariantId?: Sf50VariantId;
  /** Published operating envelope metadata, not an artificial physics clamp. */
  maxOperatingAltitudeFt?: number;
  /** JSBSim model name: `aircraft/<model>/<model>.xml` in MEMFS. */
  model: string;
  engine: "piston" | "turbine";
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
  initialGearDown: boolean;
  flapPosition: { property: string; fullTravel: number };
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

function createSf50Profile(variantId: Sf50VariantId): FdmProfile {
  const variant = getSf50Variant(variantId);
  return {
    model: variant.model,
    sf50VariantId: variant.id,
    maxOperatingAltitudeFt: variant.maxOperatingAltitudeFt,
    engine: "turbine",
    rudderSign: 1,
    stance: SF50_STATI,
    gauges: {
      primary: "propulsion/engine[0]/n1",
      secondary: "propulsion/engine[0]/n2",
      label: "N1 %",
    },
    initialThrottleNorm: 0.35,
    initialGearDown: false,
    flapPosition: { property: "fcs/flap-pos-norm", fullTravel: 1 },
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

export const FDM_PROFILES: Record<AircraftId, FdmProfile> = {
  "cessna-172": {
    model: "c172p",
    engine: "piston",
    rudderSign: -1,
    stance: C172_STATI,
    gauges: {
      primary: "propulsion/engine[0]/propeller-rpm",
      secondary: "propulsion/engine[0]/engine-rpm",
      label: "RPM",
    },
    initialThrottleNorm: 0.65,
    initialGearDown: true,
    flapPosition: { property: "fcs/flap-pos-deg", fullTravel: 30 },
    runwayPresets: {
      departure: { airspeedKts: 0, throttleNorm: 0, flapsNorm: 0, pitchDeg: 2.48 },
      arrival: { airspeedKts: 75, throttleNorm: 0.35, flapsNorm: 0, pitchDeg: 3 },
    },
    bodyCollisionProbes: BODY_COLLISION_PROBES,
  },
  "cirrus-vision-jet": createSf50Profile("g1"),
  "cirrus-vision-jet-g2": createSf50Profile("g2"),
  "cirrus-vision-jet-g3": createSf50Profile("g3"),
};

export function getFdmProfile(aircraftId: AircraftId): FdmProfile {
  return FDM_PROFILES[aircraftId];
}
