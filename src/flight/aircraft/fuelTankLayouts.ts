import type { AircraftFamilyId } from "./aircraftIds";
import { AIRCRAFT_TOP_VIEWS } from "./generated/aircraftTopViews";

/**
 * How the Fuel tab draws each family's tanks over its top view. The flight
 * model gives every tank a point, not a shape, so each tank is a box around
 * that point: `spanIn` across the aircraft and `chordIn` along it, sized to sit
 * inside the airframe and to leave room for the slider inside it.
 */
export interface FuelTankShape {
  label: string;
  spanIn: number;
  chordIn: number;
}

export interface AircraftFuelLayout {
  /** Silhouettes in JSBSim structural inches, [x aft, y right]. */
  outlines: readonly (readonly (readonly [number, number])[])[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** Credit owed for the outline, when it was traced from someone else's model. */
  credit?: string;
  /** Aircraft equipment credit and the notice's path relative to the app base URL. */
  equipmentCredit?: { text: string; url: string };
  /** Indexed by JSBSim tank number. */
  tanks: readonly FuelTankShape[];
  /** What the panel should say about how the flight model holds this aircraft's fuel. */
  note?: string;
}

const FUEL_TANK_SHAPES: Record<AircraftFamilyId, Pick<AircraftFuelLayout, "tanks" | "note" | "equipmentCredit">> = {
  "cessna-172": {
    tanks: [
      { label: "Left wing", spanIn: 104, chordIn: 42 },
      { label: "Right wing", spanIn: 104, chordIn: 42 },
    ],
  },
  "cirrus-vision-jet": {
    tanks: [{ label: "Wing tanks", spanIn: 260, chordIn: 26 }],
    note: "The flight model holds both wings' fuel as one tank at the centreline.",
  },
  "f-35b": {
    equipmentCredit: {
      text: "External tank and pylon by FlightGear F-35B contributors, GPLv3.",
      url: "aircraft/f-35b/ExternalTank_FlightGear.NOTICE.md",
    },
    tanks: [
      { label: "Right internal", spanIn: 30, chordIn: 170 },
      { label: "Left internal", spanIn: 30, chordIn: 170 },
      { label: "Right external", spanIn: 26, chordIn: 150 },
      { label: "Left external", spanIn: 26, chordIn: 150 },
    ],
  },
};

export function getAircraftFuelLayout(familyId: AircraftFamilyId): AircraftFuelLayout {
  const view = AIRCRAFT_TOP_VIEWS[familyId];
  return {
    outlines: view.outlines,
    bounds: view.bounds,
    credit: "credit" in view ? view.credit : undefined,
    ...FUEL_TANK_SHAPES[familyId],
  };
}

/** A tank the layout does not name, as a new aircraft's would be: named for its side. */
export function fuelTankShape(layout: AircraftFuelLayout, index: number, yIn: number): FuelTankShape {
  const shape = layout.tanks[index];
  if (shape) return shape;
  const side = Math.abs(yIn) < 1 ? "Centre" : yIn < 0 ? "Left" : "Right";
  return { label: `${side} tank ${index + 1}`, spanIn: 30, chordIn: 30 };
}
