import type { JSBSimSdk } from "@felipegalind0/jsbsim";

/**
 * Compute controls of JSBSim's coupled turbine plant (the F135), applied to
 * every plant engine of the loaded aircraft. Empirical engines have none of
 * these properties and are left untouched. JSBSim validates each value and
 * applies it at the next step; doc/turbine-plant-model.md in JSBSim has the
 * meaning of each.
 */
export interface EnginePlantSettings {
  /** Tabulated gas and Jacobian reuse, or the component reference on every step. */
  algorithm: "reduced" | "component";
  /** Newton iterations per accepted step, every solve and the fallback included. */
  iterationCap: number;
  /** Substeps a failing step may be divided into. */
  subdivisionCap: number;
  /** Scaled residual a solve must reach. */
  tolerance: number;
  /** Memory the reduced algorithm may use for its tables, KiB. */
  closureBudgetKiB: number;
}

export const ENGINE_PLANT_PARAMETER_IDS = [
  "osfs.enginePlant.algorithm", "osfs.enginePlant.iterationCap", "osfs.enginePlant.subdivisionCap",
  "osfs.enginePlant.tolerance", "osfs.enginePlant.closureBudgetKiB",
] as const;

type Reader = { get(id: string): unknown };

export function readEnginePlantSettings(parameters: Reader): EnginePlantSettings {
  return {
    algorithm: parameters.get("osfs.enginePlant.algorithm") === "component" ? "component" : "reduced",
    iterationCap: Number(parameters.get("osfs.enginePlant.iterationCap")),
    subdivisionCap: Number(parameters.get("osfs.enginePlant.subdivisionCap")),
    tolerance: Number(parameters.get("osfs.enginePlant.tolerance")),
    closureBudgetKiB: Number(parameters.get("osfs.enginePlant.closureBudgetKiB")),
  };
}

const plantEngines = new WeakMap<JSBSimSdk, readonly string[]>();

/** The `propulsion/engine[n]/plant/settings/` prefix of each plant engine, in the catalog's spelling. */
export function enginePlantSettingsPrefixes(sdk: JSBSimSdk): readonly string[] {
  const cached = plantEngines.get(sdk);
  if (cached) return cached;
  const prefixes = typeof sdk.queryPropertyCatalog === "function"
    ? sdk.queryPropertyCatalog("propulsion/engine").split(/\r?\n/).flatMap(line =>
      /^(propulsion\/engine(?:\[\d+\])?\/plant\/settings\/)algorithm\s/.exec(line.trim())?.[1] ?? [])
    : [];
  plantEngines.set(sdk, prefixes);
  return prefixes;
}

/** Writes the settings to every plant engine and returns what each engine now holds. */
export function applyEnginePlantSettings(sdk: JSBSimSdk, settings: EnginePlantSettings): EnginePlantSettings[] {
  return enginePlantSettingsPrefixes(sdk).map(prefix => {
    sdk.setPropertyValue(prefix + "algorithm", settings.algorithm === "component" ? 0 : 1);
    sdk.setPropertyValue(prefix + "iteration-cap", settings.iterationCap);
    sdk.setPropertyValue(prefix + "subdivision-cap", settings.subdivisionCap);
    sdk.setPropertyValue(prefix + "tolerance", settings.tolerance);
    sdk.setPropertyValue(prefix + "closure-budget-bytes", settings.closureBudgetKiB * 1024);
    return {
      algorithm: sdk.getPropertyValue(prefix + "algorithm") === 0 ? "component" : "reduced",
      iterationCap: sdk.getPropertyValue(prefix + "iteration-cap"),
      subdivisionCap: sdk.getPropertyValue(prefix + "subdivision-cap"),
      tolerance: sdk.getPropertyValue(prefix + "tolerance"),
      closureBudgetKiB: sdk.getPropertyValue(prefix + "closure-budget-bytes") / 1024,
    };
  });
}
