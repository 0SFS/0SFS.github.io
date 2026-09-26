import type { SettingsRegistry } from "foss-earth/settings";
import { OSFS_LEGACY_MIGRATIONS } from "./flightMigrations";
import {
  FLIGHT_SECTION_TITLES,
  flightParameterStore,
  OSFS_PARAMETERS,
  type FlightParameterStore,
} from "./flightParameters";

/** Where the files that read osfs.* parameters are browsable. */
export const OSFS_SOURCE_BASE = "https://github.com/0SFS/0SFS.github.io/blob/main/";

/**
 * Adds the flight's parameters to the app's settings registry, once, with
 * their section titles, source links and the migration of the keys they
 * replace, and sets the FOSS Earth defaults the flight wants.
 */
export function registerFlightSettings(registry: SettingsRegistry): FlightParameterStore {
  if (!registry.has(OSFS_PARAMETERS[0].id)) {
    registry.register(OSFS_PARAMETERS);
    for (const [tab, section, title] of FLIGHT_SECTION_TITLES) registry.setSectionTitle(tab, section, title);
    registry.setSourceBase("osfs.", OSFS_SOURCE_BASE);
    // Google's mesh refines by distance from the aircraft, not the chase camera.
    // Set before migrating: a migrated value equal to the default is not saved,
    // and an old "camera" must survive as the pilot's choice.
    registry.setHostDefault("map.focus.refineFrom", "focus", "0sfs: refine around the aircraft");
    registry.migrateLegacy(OSFS_LEGACY_MIGRATIONS);
  }
  return flightParameterStore(registry);
}
