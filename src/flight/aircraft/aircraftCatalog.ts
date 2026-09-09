/**
 * Selectable aircraft and their level-of-detail meshes.
 *
 * Model axis convention: the sim's body frame is +X left, +Y up, +Z nose
 * (see `flightAttitudeToQuaternion`). glTF's own convention is -Z forward, so
 * an asset authored the standard way needs a 180 deg yaw to line up. That is
 * a pure rotation, not a mirror, so chirality (propeller twist) is preserved.
 */

export const AIRCRAFT_IDS = ["cessna-172", "cirrus-vision-jet"] as const;
export type AircraftId = (typeof AIRCRAFT_IDS)[number];

export const AIRCRAFT_LOD_IDS = ["auto", "lod0", "lod1", "lod2", "lod3"] as const;
export type AircraftLodId = (typeof AIRCRAFT_LOD_IDS)[number];
export type AircraftLodMeshId = Exclude<AircraftLodId, "auto">;

export interface AircraftLodDefinition {
  id: AircraftLodMeshId;
  label: string;
  /** Triangle count as reported by that airframe's validate_*.py. */
  triangles: number;
  /** Path relative to the Vite base URL. */
  path: string;
  /** Chase-camera distance (m) at or beyond which "Auto" picks this level. */
  autoFromMeters: number;
}

export interface AircraftDefinition {
  id: AircraftId;
  label: string;
  summary: string;
  /** Yaw applied to the imported glTF so its -Z nose faces the sim's +Z nose. */
  modelYawRad: number;
  /**
   * Model offset in body axes. The sim keeps the aircraft reference point
   * `aircraftClearanceMeters()` above the terrain - 1.33 m level, the stance
   * the c172p gear actually settles at - while the exported models put their
   * origin on the ground between the wheels, so the visual is dropped by that
   * stance to stand on the runway rather than sunk into it.
   */
  modelOffset: { x: number; y: number; z: number };
  /**
   * Blades on the propeller, or 0 for a jet. Sets how fast the blades can turn
   * before they alias and have to be swapped for a blurred disc: the image
   * repeats every `2*PI / blades`, so two samples per repeat is the limit.
   */
  propellerBlades: number;
  lods: readonly AircraftLodDefinition[];
}

const CIRRUS_LODS: readonly AircraftLodDefinition[] = [
  { id: "lod0", label: "LOD0 — near", triangles: 1552, path: "aircraft/cirrus-vision-jet/Cirrus_Vision_Jet_LOD0.glb", autoFromMeters: 0 },
  { id: "lod1", label: "LOD1 — medium", triangles: 970, path: "aircraft/cirrus-vision-jet/Cirrus_Vision_Jet_LOD1.glb", autoFromMeters: 65 },
  { id: "lod2", label: "LOD2 — far", triangles: 246, path: "aircraft/cirrus-vision-jet/Cirrus_Vision_Jet_LOD2.glb", autoFromMeters: 170 },
  { id: "lod3", label: "LOD3 — silhouette", triangles: 98, path: "aircraft/cirrus-vision-jet/Cirrus_Vision_Jet_LOD3.glb", autoFromMeters: 340 },
];

const C172_LODS: readonly AircraftLodDefinition[] = [
  { id: "lod0", label: "LOD0 — near", triangles: 1016, path: "aircraft/cessna-172/Cessna_172_LOD0.glb", autoFromMeters: 0 },
  { id: "lod1", label: "LOD1 — medium", triangles: 778, path: "aircraft/cessna-172/Cessna_172_LOD1.glb", autoFromMeters: 60 },
  { id: "lod2", label: "LOD2 — far", triangles: 288, path: "aircraft/cessna-172/Cessna_172_LOD2.glb", autoFromMeters: 160 },
  { id: "lod3", label: "LOD3 — silhouette", triangles: 130, path: "aircraft/cessna-172/Cessna_172_LOD3.glb", autoFromMeters: 320 },
];

export const AIRCRAFT_CATALOG: readonly AircraftDefinition[] = [
  {
    id: "cessna-172",
    label: "Cessna 172 Skyhawk",
    summary: "High-wing trainer. Flight model and visuals both available.",
    modelYawRad: Math.PI,
    modelOffset: { x: 0, y: -1.33, z: 0 },
    propellerBlades: 2,
    lods: C172_LODS,
  },
  {
    id: "cirrus-vision-jet",
    label: "Cirrus Vision Jet",
    summary: "Single-engine V-tail jet. Visuals only — it flies the C172's model.",
    modelYawRad: Math.PI,
    // Same -1.33 as the C172, and for the same reason rather than by
    // coincidence: this mesh also puts its origin on the ground between the
    // wheels, so it has to be dropped by exactly the stance the simulator
    // holds the reference point at. That stance is the C172's, because the
    // flight model is; a real SF50 sits lower on its own gear, so the parked
    // attitude here is a compromise until an SF50 flight model exists.
    modelOffset: { x: 0, y: -1.33, z: 0 },
    // A jet: the propeller-disc logic must never engage.
    propellerBlades: 0,
    lods: CIRRUS_LODS,
  },
];

export function getAircraftDefinition(id: AircraftId): AircraftDefinition {
  return AIRCRAFT_CATALOG.find((entry) => entry.id === id) ?? AIRCRAFT_CATALOG[0];
}

export function isAircraftId(value: unknown): value is AircraftId {
  return typeof value === "string" && (AIRCRAFT_IDS as readonly string[]).includes(value);
}

export function isAircraftLodId(value: unknown): value is AircraftLodId {
  return typeof value === "string" && (AIRCRAFT_LOD_IDS as readonly string[]).includes(value);
}

/** Coarsest level whose `autoFromMeters` threshold the distance has reached. */
export function selectAutoLod(
  definition: AircraftDefinition,
  chaseDistanceMeters: number,
): AircraftLodDefinition | null {
  let selected: AircraftLodDefinition | null = null;
  for (const lod of definition.lods) {
    if (chaseDistanceMeters >= lod.autoFromMeters) selected = lod;
  }
  return selected ?? definition.lods[0] ?? null;
}

/** Resolve a UI selection to a concrete mesh, or null when none is available. */
export function resolveLod(
  definition: AircraftDefinition,
  lodId: AircraftLodId,
  chaseDistanceMeters: number,
): AircraftLodDefinition | null {
  if (definition.lods.length === 0) return null;
  if (lodId === "auto") return selectAutoLod(definition, chaseDistanceMeters);
  return definition.lods.find((lod) => lod.id === lodId) ?? definition.lods[0] ?? null;
}
