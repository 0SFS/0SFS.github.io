export const AIRCRAFT_IDS = ["cessna-172", "cirrus-vision-jet"] as const;
export type AircraftId = (typeof AIRCRAFT_IDS)[number];

export function isAircraftId(value: unknown): value is AircraftId {
  return typeof value === "string" && (AIRCRAFT_IDS as readonly string[]).includes(value);
}
