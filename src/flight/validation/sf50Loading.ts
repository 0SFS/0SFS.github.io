import { SF50_AFM_LOADING } from "./sf50AfmData.ts";

export interface Sf50MassComponent {
  label: string;
  weightLb: number;
  fsIn: number;
}

/**
 * Explicit component accounting only. No invented empty CG or automatic
 * ballast. Callers must distinguish real from synthetic component evidence.
 * This is not a complete aircraft loading-limit validator.
 */
export function sumSf50Loading(components: readonly Sf50MassComponent[]) {
  let weightLb = 0;
  let momentLbIn = 0;
  for (const component of components) {
    if (!component.label.trim() || !Number.isFinite(component.weightLb) ||
      component.weightLb < 0 || !Number.isFinite(component.fsIn)) {
      throw new RangeError("Loading components require a label, finite arm and nonnegative finite weight.");
    }
    weightLb += component.weightLb;
    momentLbIn += component.weightLb * component.fsIn;
  }
  if (weightLb <= 0 || !Number.isFinite(weightLb) || !Number.isFinite(momentLbIn)) {
    throw new RangeError("Loading must have positive finite total weight and finite moment.");
  }
  return { weightLb, momentLbIn, cgFsIn: momentLbIn / weightLb };
}

export interface Sf50DatumEvidence {
  modelForwardCabinBulkheadXIn: number;
  evidenceReference: string;
}

/** Both coordinates increase aft; match the physical bulkhead, not desired CG. */
export function sf50ModelCgToFs(modelCgXIn: number, datum: Sf50DatumEvidence | null): number | null {
  if (!Number.isFinite(modelCgXIn)) throw new RangeError("Model CG must be finite.");
  if (datum === null) return null;
  if (!Number.isFinite(datum.modelForwardCabinBulkheadXIn) || !datum.evidenceReference.trim()) {
    throw new Error("A documented physical datum anchor is required.");
  }
  return SF50_AFM_LOADING.datum.forwardCabinBulkheadFsIn +
    modelCgXIn - datum.modelForwardCabinBulkheadXIn;
}

/** Only exact extracted benchmark weights are supported; no extrapolation. */
export function sf50CgLimitsAtWeight(weightLb: number) {
  return SF50_AFM_LOADING.cgLimits.find(row => row.weightLb === weightLb) ?? null;
}
