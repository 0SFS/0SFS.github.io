import { SF50_PITCH_CONTROLLER, type Sf50PitchControllerGains } from "./sf50PilotController.ts";
import { SF50_LANDING_PILOT_DEFAULTS, type Sf50LandingPilotSettings } from "./sf50LandingPilot.ts";

export interface Sf50PilotProfile {
  id: string;
  basis: string;
  takeoffPitch: Readonly<Sf50PitchControllerGains>;
  landingPitch: Readonly<Sf50PitchControllerGains>;
  landing: Readonly<Sf50LandingPilotSettings>;
}

function frozen(profile: Sf50PilotProfile): Readonly<Sf50PilotProfile> {
  return Object.freeze({
    ...profile, takeoffPitch: Object.freeze({ ...profile.takeoffPitch }),
    landingPitch: Object.freeze({ ...profile.landingPitch }),
    landing: Object.freeze({ ...profile.landing }),
  });
}

export const SF50_DEFAULT_PILOT_PROFILE = frozen({
  id: "development-v6",
  basis: "Sea-level pilot-response tuning; brake demand is a provisional ground-roll fit, not aircraft/friction validation",
  takeoffPitch: { ...SF50_PITCH_CONTROLLER,
    pitchToRateGainPerSec: 2.4, maximumCommandedPitchRateDegSec: 4, pitchRateIntegralGain: 0.24 },
  landingPitch: { ...SF50_PITCH_CONTROLLER,
    pitchToRateGainPerSec: 1.8, maximumCommandedPitchRateDegSec: 3, pitchRateIntegralGain: 0.18 },
  landing: SF50_LANDING_PILOT_DEFAULTS,
});

const profiles: Readonly<Record<string, Readonly<Sf50PilotProfile>>> = Object.freeze({
  "development-v6": SF50_DEFAULT_PILOT_PROFILE,
  "baseline-v5": frozen({
    id: "baseline-v5", basis: "Preserved v5 pilot controls for same-artifact A/B comparisons",
    takeoffPitch: SF50_PITCH_CONTROLLER, landingPitch: SF50_PITCH_CONTROLLER,
    landing: { ...SF50_LANDING_PILOT_DEFAULTS, pathMode: "fixed-pitch",
      flareHeightFt: 20, brakeMode: "instant", brakeDelaySec: 0 },
  }),
  "landing-full-brake": frozen({
    ...SF50_DEFAULT_PILOT_PROFILE, id: "landing-full-brake",
    basis: "Open-loop full-brake ramp diagnostic, not a normal-landing instruction",
    landing: { ...SF50_LANDING_PILOT_DEFAULTS, brakeMode: "ramp" },
  }),
  "landing-gentle": frozen({
    ...SF50_DEFAULT_PILOT_PROFILE, id: "landing-gentle",
    basis: "0.14 g pilot-demand sensitivity case, not independent validation",
    landing: { ...SF50_LANDING_PILOT_DEFAULTS, decelerationG: 0.14 },
  }),
  "landing-firm": frozen({
    ...SF50_DEFAULT_PILOT_PROFILE, id: "landing-firm",
    basis: "0.22 g pilot-demand sensitivity case, not independent validation",
    landing: { ...SF50_LANDING_PILOT_DEFAULTS, decelerationG: 0.22 },
  }),
});

export function getSf50PilotProfile(id = "development-v6"): Readonly<Sf50PilotProfile> {
  if (!Object.hasOwn(profiles, id)) throw new Error("Unknown SF50 pilot profile: " + id);
  return profiles[id]!;
}
