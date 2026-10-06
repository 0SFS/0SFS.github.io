import type { AircraftId } from "../aircraft/aircraftIds";
import { getExternalTankDefinitions } from "../aircraft/externalTankDefinitions";
import { fuelTankContentsPath, type FuelTankReader, type FuelTankWriter } from "./fuelTanks";

export function readExternalFuelTanks(sdk: FuelTankReader, aircraftId: AircraftId) {
  return getExternalTankDefinitions(aircraftId).map(tank => ({
    ...tank, attached: sdk.getPropertyValue(tank.attachmentProperty) > 0.5,
  }));
}

/** Attach an empty assembly or release it with all of its remaining fuel. */
export function setExternalFuelTankAttached(
  sdk: FuelTankWriter, aircraftId: AircraftId, index: number, attached: boolean,
): boolean {
  const definitions = getExternalTankDefinitions(aircraftId);
  const storeIndex = definitions.findIndex(tank => tank.index === index);
  const tank = definitions[storeIndex];
  if (!tank || (sdk.getPropertyValue(tank.attachmentProperty) > 0.5) === attached) return false;
  sdk.setPropertyValue(fuelTankContentsPath(index), 0);
  sdk.setPropertyValue(tank.attachmentProperty, attached ? 1 : 0);
  sdk.setPropertyValue(`propulsion/tank[${index}]/priority`, attached ? 1 : 0);
  sdk.setPropertyValue(`inertia/pointmass-weight-lbs[${storeIndex}]`, attached ? tank.dryWeightLbs : 0);
  return true;
}
