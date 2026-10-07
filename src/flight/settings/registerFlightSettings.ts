import { frameProfilingParameters } from "foss-earth/perf";
import type { SettingsRegistry } from "foss-earth/settings";
import { OSFS_LEGACY_MIGRATIONS } from "./flightMigrations";
import { FLIGHT_PRESETS } from "./flightPresets";
import { groundProfilesMigration } from "./groundInteractionSettings";
import {
  FLIGHT_SECTION_TITLES,
  flightParameterStore,
  OSFS_PARAMETERS,
  type FlightParameterStore,
} from "./flightParameters";

/** Where the files that read osfs.* parameters are browsable. */
export const OSFS_SOURCE_BASE = "https://github.com/0SFS/0SFS.github.io/blob/main/";

/** The aircraft's id among FOSS Earth's focus points (`map.focus.point`). */
export const AIRCRAFT_FOCUS_POINT = "aircraft";

/**
 * Adds the flight's parameters and presets to the app's settings registry,
 * once, with their section titles, source links and the migration of the keys
 * they replace, and sets the FOSS Earth defaults the flight wants.
 */
export function registerFlightSettings(registry: SettingsRegistry): FlightParameterStore {
  if (!registry.has(OSFS_PARAMETERS[0].id)) {
    registry.register(OSFS_PARAMETERS);
    // Debug → Frame budget is the frame profiling's one home in the flight.
    registry.register(frameProfilingParameters({ tab: "debug", section: "frame-budget" }));
    for (const [tab, section, title] of FLIGHT_SECTION_TITLES) registry.setSectionTitle(tab, section, title);
    registry.setSourceBase("osfs.", OSFS_SOURCE_BASE);
    // Google's mesh refines by distance from the aircraft, not the chase camera.
    registry.setHostDefault("map.focus.refineFrom", "focus", "0sfs: refine around the aircraft");
    // The flight registers the aircraft as a focus point once the renderer
    // exists; until then this default waits for its option.
    registry.setHostDefault("map.focus.point", AIRCRAFT_FOCUS_POINT, "0sfs: the aircraft");
    // The ground under the aircraft is its collision surface, and the cockpit
    // view does not look at it: load it in every direction, as well as the view.
    registry.setHostDefault("map.focus.mode", "both", "0sfs: the ground around the aircraft, as well as the view");
    // The toolbar's altitude stands in for the HUD's feet tape, beside knots and feet per minute.
    registry.setHostDefault("interface.position.altitudeUnit", "ft", "0sfs: the unit of the altitude tape it replaces");
    registry.registerPresets(FLIGHT_PRESETS);
    registry.migrateLegacy([...OSFS_LEGACY_MIGRATIONS, groundProfilesMigration(registry)]);
  }
  return flightParameterStore(registry);
}
