export const AIRCRAFT_IDS = ["cessna-172", "cirrus-vision-jet", "cirrus-vision-jet-g2", "cirrus-vision-jet-g3"] as const;
export type AircraftId = (typeof AIRCRAFT_IDS)[number];

/** Gallery choices group runtime variants without changing their saved IDs. */
export const AIRCRAFT_FAMILY_IDS = ["cessna-172", "cirrus-vision-jet"] as const;
export type AircraftFamilyId = (typeof AIRCRAFT_FAMILY_IDS)[number];

export function isAircraftId(value: unknown): value is AircraftId {
  return typeof value === "string" && (AIRCRAFT_IDS as readonly string[]).includes(value);
}

export function isAircraftFamilyId(value: unknown): value is AircraftFamilyId {
  return typeof value === "string" && (AIRCRAFT_FAMILY_IDS as readonly string[]).includes(value);
}
