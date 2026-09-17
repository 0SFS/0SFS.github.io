import { describe, expect, it } from "vitest";
import { AIRCRAFT_FAMILIES } from "../flight/aircraft/aircraftCatalog";
import { INFO_AIRCRAFT } from "./aircraft";

describe("information page aircraft copy", () => {
  it("matches the selectable families in the catalog", () => {
    expect(INFO_AIRCRAFT.map((entry) => ({ id: entry.id, label: entry.label, summary: entry.summary }))).toEqual(
      AIRCRAFT_FAMILIES.map((family) => ({ id: family.id, label: family.label, summary: family.summary })),
    );
    expect(INFO_AIRCRAFT[1]?.developmentNote).toBe(AIRCRAFT_FAMILIES[1]?.developmentNote);
    expect(INFO_AIRCRAFT.map((entry) => entry.thumbnail)).toEqual(
      AIRCRAFT_FAMILIES.map((family) => family.thumbnail.path),
    );
  });
});
