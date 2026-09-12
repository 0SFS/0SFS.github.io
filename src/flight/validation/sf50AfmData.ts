/** Historical AFM facts, not a current operational aircraft manual. */
export const SF50_AFM_SOURCE = {
  document: "Cirrus SF50 AFM P/N 31452-001",
  localPath: "planes/Cirrus_Vision_Jet/tests/SF50-POH.pdf",
  sha256: "d83e904dbd6bc3656321c93d793166d4a5c6eddf81852b15767e5c336fc23949",
  pdfPages: 624,
  latestListedRevision: "4",
  latestListedRevisionDate: "2018-11-20",
  scope: "Historical SF50-0005 and subsequent AFM; later configurations are not implied",
} as const;

/** PDF page is 1-based; printed page/revision identify each extracted table. */
export const SF50_AFM_PAGES = {
  normalTakeoff: { pdfPage: 348, printedPage: "4-22", revision: "4" },
  beforeTakeoff: { pdfPage: 347, printedPage: "4-21", revision: "4" },
  normalLanding: { pdfPage: 351, printedPage: "4-25", revision: "4" },
  landingConsiderations: { pdfPage: 352, printedPage: "4-26", revision: "4" },
  performanceBasis: { pdfPage: 364, printedPage: "5-6", revision: "3" },
  airspeedCorrection: { pdfPage: 372, printedPage: "5-14", revision: "4" },
  takeoffPowerSetting: { pdfPage: 379, printedPage: "5-21", revision: "4" },
  takeoffN1AntiIceOn: { pdfPage: 381, printedPage: "5-23", revision: "4" },
  loadingCgTable: { pdfPage: 530, printedPage: "6-8", revision: "Original Issue" },
  loadingFrontSeats: { pdfPage: 531, printedPage: "6-9", revision: "4" },
  loadingCabin: { pdfPage: 532, printedPage: "6-10", revision: "Original Issue" },
  loadingFuel: { pdfPage: 533, printedPage: "6-11", revision: "3" },
  takeoff6000: { pdfPage: 383, printedPage: "5-25", revision: "4", conditionsPdfPage: 382 },
  takeoff5500: { pdfPage: 385, printedPage: "5-27", revision: "4", conditionsPdfPage: 384 },
  landing5550: { pdfPage: 487, printedPage: "5-129", revision: "4", conditionsPdfPage: 486 },
} as const;

export const SF50_AFM_PROCEDURES = {
  takeoff: {
    warmEngineIdleSeconds: 120,
    brakesHeldUntilTakeoffPowerEstablished: true,
    rotationRangeKias: [80, 90],
    pitchTargetDeg: 5,
    normalGearRetraction: "positive climb",
    normalFlapRetractionKias: 115,
    normalFlapRetractionRequiresObstacleClearance: true,
    tableGearConfiguration: "down",
    tableFlapsNorm: 0.5,
    tableBleed: "on",
    obstacleHeightFt: 50,
  },
  landing: {
    normalApproachAdditiveKias: 10,
    tableReferenceKias: 85,
    tableWeightLb: 5550,
    tableFlapsNorm: 1,
    tableThrust: "idle",
    brakingInstruction: "as required",
    exactFlareControlLaw: null,
    exactBrakeCommand: null,
  },
  airspeedCorrectionPowerCondition: "Level-flight thrust or MCT, whichever is less",
  performanceBasis: "Flight-test-derived data using average piloting and published normal procedures",
} as const;

export interface Sf50IsaDistanceRow {
  phase: "takeoff" | "landing";
  weightLb: number;
  pressureAltitudeFt: number;
  groundRollFt: number;
  totalDistanceFt: number;
  source: "takeoff6000" | "takeoff5500" | "landing5550";
}

/** Selected ISA-column rows only. Other temperature cells are not inferred. */
export const SF50_ISA_DISTANCE_ROWS: readonly Sf50IsaDistanceRow[] = [
  ...[[0,2036,3192],[1000,2106,3302],[2000,2175,3411],[5000,2542,4009]].map(
    ([pressureAltitudeFt,groundRollFt,totalDistanceFt]) => ({
      phase: "takeoff" as const, weightLb: 6000, pressureAltitudeFt: pressureAltitudeFt!,
      groundRollFt: groundRollFt!, totalDistanceFt: totalDistanceFt!, source: "takeoff6000" as const,
    })),
  ...[[0,1867,2812],[1000,1931,2910],[2000,1994,3006],[5000,2330,3531]].map(
    ([pressureAltitudeFt,groundRollFt,totalDistanceFt]) => ({
      phase: "takeoff" as const, weightLb: 5500, pressureAltitudeFt: pressureAltitudeFt!,
      groundRollFt: groundRollFt!, totalDistanceFt: totalDistanceFt!, source: "takeoff5500" as const,
    })),
  ...[[0,1628,3011],[1000,1677,3082],[2000,1727,3155],[5000,1889,3394]].map(
    ([pressureAltitudeFt,groundRollFt,totalDistanceFt]) => ({
      phase: "landing" as const, weightLb: 5550, pressureAltitudeFt: pressureAltitudeFt!,
      groundRollFt: groundRollFt!, totalDistanceFt: totalDistanceFt!, source: "landing5550" as const,
    })),
];

/** Each pair is [KIAS, KCAS]. Blank cells in the AFM are deliberately absent. */
export const SF50_AIRSPEED_CORRECTION: Readonly<Record<"0" | "0.5" | "1", readonly (readonly [number, number])[]>> = {
  "0": [[80,81],[90,92],[100,102],[110,112],[120,122],[130,133],[140,143],[150,152],
    [160,161],[170,170],[180,180],[190,190],[200,200],[210,210],[220,220],[230,230],[240,240],[250,250]],
  "0.5": [[70,70],[80,81],[90,91],[100,101],[110,111],[120,121],[130,131],[140,141],
    [150,151],[160,160],[170,169],[180,178],[190,188]],
  "1": [[60,62],[70,70],[80,79],[90,89],[100,98],[110,108],[120,117],[130,127],[140,137],[150,147]],
};

/** Selected facts, not operational loading approval or an empty-weight record. */
export const SF50_AFM_LOADING = {
  sourceSha256: SF50_AFM_SOURCE.sha256,
  cgLimits: [
    { weightLb: 5500, forwardFsIn: 191.35, aftFsIn: 198.15 },
    { weightLb: 5550, forwardFsIn: 191.47, aftFsIn: 198.15 },
    { weightLb: 6000, forwardFsIn: 192.55, aftFsIn: 198.15 },
  ],
  stationsFsIn: {
    frontOccupants: 132.9,
    middleOutboardSeats: 183.2,
    middleOutboardOccupants: 178.4,
    middleInboardSeatForward: 183.2,
    middleInboardSeatMiddle: 197.2,
    middleInboardSeatAft: 211.2,
    middleInboardOccupantForward: 178.4,
    middleInboardOccupantMiddle: 192.4,
    middleInboardOccupantAft: 206.4,
    xcSeats: 217.9,
    xcOccupants: 209.6,
    baggageForward: 238.5,
    baggageAft: 255.5,
    cargoXtend: 282,
    ipsFluid: 249,
    usableFuel: 203,
  },
  maximumZeroFuelWeightLb: 4900,
  maximumRampWeightLb: 6040,
  maximumTakeoffWeightLb: 6000,
  maximumLandingWeightLb: 5550,
  usableFuelCapacityUsGal: 296,
  fuelTableDensityLbPerUsGal: 6.76,
  asDeliveredEmptyWeightLb: null,
  asDeliveredEmptyCgFsIn: null,
  datum: {
    forwardCabinBulkheadFsIn: 89,
    source: "EASA.IM.A.615 issue 6, 2026-06-01, page 9",
    url: "https://www.easa.europa.eu/en/downloads/24242/en",
    modelForwardCabinBulkheadXIn: null,
  },
} as const;
