import { SF50_AFM_LOADING } from "./sf50AfmData.ts";
import { sf50CgLimitsAtWeight, sumSf50Loading, type Sf50MassComponent } from "./sf50Loading.ts";

/**
 * Explicit guesses for the next loading experiment, not an aircraft W&B
 * record. Kept separate from native loading while the pilot change is isolated.
 */
export const SF50_SYNTHETIC_LOADING_ASSUMPTIONS = {
  version: "synthetic-loading-v1",
  emptyWeightLb: 3550,
  emptyCgFsIn: 195,
  fuelLb: 1500,
  removableSeatWeightLb: 30,
  status: "proposed-not-applied-to-native-model",
  physicalDatumEstablished: false,
  emptyWeightBasis: "Retained existing model mass to isolate loading from other changes; not a recovered weighing record",
  emptyCgBasis: "Project estimate only, not inferred from the broker's weight or a desired runway distance",
  publishedMassContext: {
    aircraft: "2018 G1 SF50 PH-WKM, S/N 0071",
    brokerListedEmptyWeightLb: 3588,
    url: "https://lonemountainaircraft.com/wp-content/uploads/2024/02/PH-WKM-Spec-Sheet-5-9-24-1.pdf",
    pdfPage: 2,
    limitation: "Aircraft-specific broker listing; no empty CG, moment or included-equipment record",
  },
  seatAccountingContext: {
    aircraft: "SF50 S/N 0009, N124MW at delivery",
    entryDate: "2017-05-05",
    url: "https://tkaviation.net/wp-content/uploads/2022/07/n313bn-airframe-logs-final.pdf",
    pdfPage: 7,
    limitation: "Factory entry excludes removable seats 3-7 from delivered empty weight; individual seat weights are not established here",
  },
} as const;

export function makeSf50SyntheticLoading(weightLb: number) {
  if (![5500, 5550, 6000].includes(weightLb)) {
    throw new RangeError("Synthetic SF50 loading supports only the three extracted benchmark weights.");
  }
  const a = SF50_SYNTHETIC_LOADING_ASSUMPTIONS;
  const fs = SF50_AFM_LOADING.stationsFsIn;
  const payloadComponents: Sf50MassComponent[] = [
    { label: "Estimated front occupant 1", weightLb: 170, fsIn: fs.frontOccupants },
    { label: "Estimated front occupant 2", weightLb: 170, fsIn: fs.frontOccupants },
  ];
  if (weightLb === 6000) {
    payloadComponents.push(
      { label: "Estimated middle outboard seat 1", weightLb: a.removableSeatWeightLb, fsIn: fs.middleOutboardSeats },
      { label: "Estimated middle outboard seat 2", weightLb: a.removableSeatWeightLb, fsIn: fs.middleOutboardSeats },
      { label: "Estimated middle outboard occupant 1", weightLb: 170, fsIn: fs.middleOutboardOccupants },
      { label: "Estimated middle outboard occupant 2", weightLb: 170, fsIn: fs.middleOutboardOccupants },
      { label: "Estimated middle inboard seat, aft position", weightLb: a.removableSeatWeightLb, fsIn: fs.middleInboardSeatAft },
      { label: "Estimated middle inboard occupant, aft position", weightLb: 165, fsIn: fs.middleInboardOccupantAft },
      { label: "Estimated forward baggage", weightLb: 15, fsIn: fs.baggageForward },
    );
  } else {
    payloadComponents.push(
      { label: "Estimated middle outboard seat", weightLb: a.removableSeatWeightLb, fsIn: fs.middleOutboardSeats },
      { label: "Estimated middle outboard occupant", weightLb: weightLb === 5550 ? 130 : 80, fsIn: fs.middleOutboardOccupants },
    );
  }
  const components: Sf50MassComponent[] = [
    { label: "Estimated delivered empty aircraft, front seats included", weightLb: a.emptyWeightLb, fsIn: a.emptyCgFsIn },
    ...payloadComponents,
    { label: "Usable fuel, AFM nominal arm", weightLb: a.fuelLb, fsIn: fs.usableFuel },
  ];
  const loading = sumSf50Loading(components);
  const payload = sumSf50Loading(payloadComponents);
  const limits = sf50CgLimitsAtWeight(weightLb)!;
  return {
    assumptions: a, components, ...loading, payloadWeightLb: payload.weightLb,
    zeroFuelWeightLb: loading.weightLb - a.fuelLb,
    selectedCgEnvelope: limits,
    withinSelectedCgEnvelope: loading.cgFsIn >= limits.forwardFsIn && loading.cgFsIn <= limits.aftFsIn,
    emptyCgSensitivity: [a.emptyCgFsIn - 2, a.emptyCgFsIn, a.emptyCgFsIn + 2].map(emptyCgFsIn => ({
      emptyCgFsIn,
      loadedCgFsIn: loading.cgFsIn + a.emptyWeightLb / loading.weightLb * (emptyCgFsIn - a.emptyCgFsIn),
      basis: "Illustrative +/-2 inch assumption sweep, not an evidence-derived confidence interval",
    })),
    limitations: [
      "Masses and empty CG are synthetic; source station arms do not make this an actual weighing record.",
      "No physical native-model datum anchor has been established; no conversion or aircraft XML update is applied.",
      "Seat inclusion and weights, lateral/vertical CG, inertia, fluids and complete loading limits remain unverified.",
      "Separate payload manifests with fixed 1500 lb fuel are independent test fixtures, not a continuous takeoff-to-landing mission.",
    ],
  };
}
