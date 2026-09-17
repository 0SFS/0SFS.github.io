export interface InfoAircraft {
  id: "cessna-172" | "cirrus-vision-jet";
  label: string;
  summary: string;
  thumbnail: string;
  developmentNote?: string;
}

/** Display copy kept in sync with `AIRCRAFT_FAMILIES` — do not import the catalog here. */
export const INFO_AIRCRAFT: readonly InfoAircraft[] = [
  {
    id: "cessna-172",
    label: "Cessna 172 Skyhawk",
    summary: "High-wing trainer. Flight model and visuals both available.",
    thumbnail: "aircraft/thumbnails/cessna-172.png",
  },
  {
    id: "cirrus-vision-jet",
    label: "Cirrus Vision Jet",
    summary: "Single-engine personal jet. G1, G2, G2+ and G3 variants.",
    thumbnail: "aircraft/thumbnails/cirrus-vision-jet.png",
    developmentNote:
      "G1, G2 and G3 have separate runtime packages. G2+ is currently mapped to the G2 runtime while separate physics/package support is not yet implemented. Choosing a generation does not provide calibrated generation-specific performance, a new cabin or complete generation-specific avionics.",
  },
];
