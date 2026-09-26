import type { FlightParameterId, FlightParameters, FlightParameterValues } from "../settings/flightParameters";
import { isAircraftLodId, normalizeAircraftSelection, type AircraftSelection } from "./aircraftCatalog";
import { isAircraftId } from "./aircraftIds";

/** The osfs.aircraft.* parameters the aircraft chooser edits. */
export const AIRCRAFT_SELECTION_PARAMETER_IDS: readonly FlightParameterId[] = [
  "osfs.aircraft.id",
  "osfs.aircraft.generation",
  "osfs.aircraft.lod",
  "osfs.aircraft.optInLods",
];

/** The saved aircraft choice, kept consistent with the aircraft's package. */
export function readAircraftSelection(parameters: FlightParameters): AircraftSelection {
  const aircraftId = parameters.get("osfs.aircraft.id");
  const lodId = parameters.get("osfs.aircraft.lod");
  // The registry accepts only the catalogue's choices; these checks narrow the type.
  return normalizeAircraftSelection({
    aircraftId: isAircraftId(aircraftId) ? aircraftId : "cessna-172",
    generationId: parameters.get("osfs.aircraft.generation"),
    lodId: isAircraftLodId(lodId) ? lodId : "auto",
    optInLodsEnabled: parameters.get("osfs.aircraft.optInLods"),
  });
}

/** A choice as parameter values, to write with `setMany`. */
export function aircraftSelectionValues(selection: AircraftSelection): Partial<FlightParameterValues> {
  const normalized = normalizeAircraftSelection(selection);
  return {
    "osfs.aircraft.id": normalized.aircraftId,
    ...(normalized.generationId !== undefined ? { "osfs.aircraft.generation": normalized.generationId } : {}),
    "osfs.aircraft.lod": normalized.lodId,
    "osfs.aircraft.optInLods": normalized.optInLodsEnabled,
  };
}
