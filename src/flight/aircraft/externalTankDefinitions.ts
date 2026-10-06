import type { AircraftId } from "./aircraftIds";

export const F35B_STRUCTURAL_REFERENCE_IN = { x: 368.52, y: 0, z: -15.36 } as const;

export interface ExternalTankDefinition {
  index: number;
  label: string;
  attachmentProperty: string;
  capacityLbs: number;
  /** Provisional combined tank and pylon weight; both leave the aircraft together. */
  dryWeightLbs: number;
  /** JSBSim structural inches: aft, right, up. */
  locationIn: { x: number; y: number; z: number };
}

// Experimental stores: source fuel capacity, provisional dry mass and mounting.
// Keep these physical definitions consistent with the runtime F-35B XML.
const F35B_TANKS: readonly ExternalTankDefinition[] = [
  { index: 2, label: "Right external", attachmentProperty: "stores/external-tank[0]/attached",
    capacityLbs: 2991, dryWeightLbs: 300, locationIn: { x: 368.52, y: 127.952756, z: -15.36 } },
  { index: 3, label: "Left external", attachmentProperty: "stores/external-tank[1]/attached",
    capacityLbs: 2991, dryWeightLbs: 300, locationIn: { x: 368.52, y: -127.952756, z: -15.36 } },
];

export function getExternalTankDefinitions(aircraftId: AircraftId): readonly ExternalTankDefinition[] {
  return aircraftId === "f-35b" ? F35B_TANKS : [];
}
