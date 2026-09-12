import type { AircraftId } from "../aircraft/aircraftIds";

export interface FdmProfile {
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
}

const C172_STATI = {
  staticMeters: 1.33,
  staticPitchRad: 2.48 * Math.PI / 180,
  pitchArmMeters: 4.5,
  rollArmMeters: 5.5,
};

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
  },
  "cirrus-vision-jet": {
    // Placeholder profile until the SF50 package lands. Explicitly keeps this
    // airframe bound to a physical model instead of hidden C172 inheritance.
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
  },
};

export function getFdmProfile(aircraftId: AircraftId): FdmProfile {
  return FDM_PROFILES[aircraftId];
}
