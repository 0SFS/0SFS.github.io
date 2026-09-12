import type { AircraftId } from "./aircraftIds";

export type Sf50VariantId = "g1" | "g2" | "g3";

/**
 * Public facts, not a calibrated installed-engine map. The nominal fuel mass
 * is the AFM's rounded value at 6.76 lb/US gal, not a universal fuel density.
 */
export const SF50_PUBLIC_MODEL_INPUTS = {
  ratedThrustLbf: 1846,
  usableFuelLb: 2001,
  usableFuelUsGal: 296,
  nominalFuelDensityLbPerUsGal: 6.76,
  wingAreaSqFt: 195.7,
  wingMacIn: 62.2,
  sources: {
    engineAndFuel: {
      file: "planes/Cirrus_Vision_Jet/tests/SF50-POH.pdf",
      sha256: "d83e904dbd6bc3656321c93d793166d4a5c6eddf81852b15767e5c336fc23949",
      document: "31452-001", pdfPage: 23, printedPage: "1-7",
    },
    wingMac: {
      file: "planes/Cirrus_Vision_Jet/tests/public-evidence/raw/ntsb-stations.pdf",
      document: "AMM 6-00-2, 2018-07-09, reproduced in WPR20FA051",
      pdfPage: 13, figure: 15,
    },
  },
} as const;

export interface Sf50VariantDefinition {
  id: Sf50VariantId;
  aircraftId: AircraftId;
  model: string;
  label: string;
  /** Operating limit metadata, not an artificial physics altitude clamp. */
  maxOperatingAltitudeFt: number;
  summary: string;
  evidenceScope: string;
  sources: readonly string[];
  physicsStatus: "development-baseline";
  independentlyValidated: false;
}

export const SF50_VARIANTS: readonly Sf50VariantDefinition[] = [
  {
    id: "g1", aircraftId: "cirrus-vision-jet", model: "sf50",
    label: "Cirrus Vision Jet G1", maxOperatingAltitudeFt: 28000,
    summary: "G1 development model. Public AFM inputs applied; calibration ongoing. Shared exterior mesh.",
    evidenceScope: "Historical AFM 31452-001 Rev 4 and explicitly identified G1 recordings.",
    sources: ["https://flightsimcoach.com/wp-content/uploads/2020/12/SF50-POH.pdf"],
    physicsStatus: "development-baseline", independentlyValidated: false,
  },
  {
    id: "g2", aircraftId: "cirrus-vision-jet-g2", model: "sf50-g2",
    label: "Cirrus Vision Jet G2", maxOperatingAltitudeFt: 31000,
    summary: "G2, not G2+. G1-based development physics and shared mesh; G2 performance is not yet calibrated.",
    evidenceScope: "G2/FL310 configuration. G2+ updated-thrust tables are kept separate.",
    sources: ["https://cirrusaircraft.com/story/cirrus-aircraft-unveils-generation-2-vision-jet/"],
    physicsStatus: "development-baseline", independentlyValidated: false,
  },
  {
    id: "g3", aircraftId: "cirrus-vision-jet-g3", model: "sf50-g3",
    label: "Cirrus Vision Jet G3", maxOperatingAltitudeFt: 31000,
    summary: "G3 development profile. Shared G1-based physics and mesh, not yet a calibrated G3 engine, cabin or avionics simulation.",
    evidenceScope: "2026 manufacturer specifications only; no approved G3 AFM performance matrix acquired.",
    sources: [
      "https://cirrusaircraft.com/story/cirrus-unveils-new-g3-vision-jet/",
      "https://cirrusaircraft.com/aircraft/vision-jet/",
    ],
    physicsStatus: "development-baseline", independentlyValidated: false,
  },
];

/** Never fall back to a different generation's evidence. */
export function getSf50Variant(id: Sf50VariantId): Sf50VariantDefinition {
  const variant = SF50_VARIANTS.find(entry => entry.id === id);
  if (!variant) throw new RangeError("Unsupported SF50 generation: " + String(id));
  return variant;
}

/**
 * Context only: published website figures omit the full test conditions.
 * In particular, max cruise and runway figures are not one simultaneous case.
 */
export const SF50_G3_PUBLISHED_PERFORMANCE = {
  source: "https://cirrusaircraft.com/aircraft/vision-jet/",
  retrievedDate: "2026-09-12",
  takeoffGroundRollFt: 1910,
  takeoffOver50FtFt: 2815,
  maxCruiseTasKt: 317,
  landingGroundRollFt: 1622,
  conditionsKnown: false,
  eligibleForCalibration: false,
  eligibleForIndependentValidation: false,
} as const;
