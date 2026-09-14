import { getFdmProfile } from "../jsbsim/fdmProfiles";
import { SF50_VARIANTS } from "./sf50Variants";
import {
  AIRCRAFT_FAMILY_IDS,
  AIRCRAFT_IDS,
  type AircraftFamilyId,
  type AircraftId,
  isAircraftFamilyId,
  isAircraftId,
} from "./aircraftIds";

export { AIRCRAFT_FAMILY_IDS, AIRCRAFT_IDS, isAircraftFamilyId, isAircraftId };
export type { AircraftFamilyId, AircraftId };

/**
 * Selectable aircraft and their level-of-detail meshes.
 *
 * Model axis convention: the sim's body frame is +X left, +Y up, +Z nose
 * (see `flightAttitudeToQuaternion`). glTF's own convention is -Z forward, so
 * an asset authored the standard way needs a 180 deg yaw to line up. That is
 * a pure rotation, not a mirror, so chirality (propeller twist) is preserved.
 */

/** Drop each visual root to align with its profile's settled ground stance. */
const modelOffsetY = (id: AircraftId): number => -getFdmProfile(id).stance.staticMeters;

// Level NUMBERS run coarsest-first: lod0 is the silhouette and each step up
// adds detail, so a bigger number is always a better mesh. That is the
// direction the generators number their `--lod` argument in, and it is chosen
// so that adding or removing a level at the bottom of a ladder does not
// renumber the ones above it - a renumbering is a silent change to every asset
// path and to every stored preference. It also means the two airframes agree
// on what "lod3" means - their best procedural mesh - even though the C172
// carries one level below the Vision Jet's coarsest.
//
// The ARRAYS below still run FINEST first, because that is the order
// `selectAutoLod` walks and the order the panel offers. "hd" sits above lod3
// and is not always ours: an airframe can carry a level by another artist,
// which is why the credit belongs to the LEVEL rather than to the airframe.
export const AIRCRAFT_LOD_IDS = ["auto", "hd", "lod3", "lod2", "lod1", "lod0"] as const;
export type AircraftLodId = (typeof AIRCRAFT_LOD_IDS)[number];
export type AircraftLodMeshId = Exclude<AircraftLodId, "auto">;

/** Who made a mesh, and whatever its licence requires be shown with it. */
export interface AircraftModelCredit {
  artist: string;
  /** One line on what this mesh is for. Shown next to it in the panel. */
  note: string;
  licence?: string;
  sourceUrl?: string;
}

export interface AircraftFamilyDefinition {
  id: AircraftFamilyId;
  label: string;
  summary: string;
  thumbnail: {
    /** Static image path relative to the Vite base URL. */
    path: string;
    credit: AircraftModelCredit;
  };
  defaultAircraftId: AircraftId;
  variants: readonly AircraftFamilyVariantDefinition[];
  /** Present only when this family offers a variant selector. */
  variantLabel?: string;
  developmentNote?: string;
}

export interface AircraftFamilyVariantDefinition {
  id: string;
  aircraftId: AircraftId;
  label: string;
}

/** One complete choice, applied atomically when the runtime aircraft changes. */
export interface AircraftSelection {
  aircraftId: AircraftId;
  lodId: AircraftLodId;
  optInLodsEnabled: boolean;
  generationId?: string;
}

export interface AircraftLodDefinition {
  id: AircraftLodMeshId;
  label: string;
  /** Triangle count as reported by that airframe's validate_*.py. */
  triangles: number;
  /** Path relative to the Vite base URL. */
  path: string;
  /** Chase-camera distance (m) at or beyond which "Auto" picks this level. */
  autoFromMeters: number;
  credit: AircraftModelCredit;
  /**
   * Levels that are off until the user asks for them. A level is opt-in when
   * loading it is a decision rather than a default - a third-party mesh whose
   * licence has to be honoured, or one heavy enough that nobody should pay for
   * it without choosing to. While it is off it is neither offered in the panel
   * nor reachable from "Auto".
   */
  optIn?: boolean;
}

export interface AircraftDefinition {
  id: AircraftId;
  familyId: AircraftFamilyId;
  label: string;
  summary: string;
  /** Yaw applied to the imported glTF so its -Z nose faces the sim's +Z nose. */
  modelYawRad: number;
  /**
   * Model offset in body axes. The sim keeps the aircraft reference point
   * above the terrain by the profile-dependent stance, while exported meshes
   * sit near the ground plane.
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

const PROCEDURAL: AircraftModelCredit = {
  artist: "felipegalin0",
  note: "Measured reconstruction, designed explicitly for max runtime speed.",
};

const THUMBNAIL_CREDIT: AircraftModelCredit = {
  artist: PROCEDURAL.artist,
  note: "Static render of the existing procedural LOD3 aircraft mesh.",
};

const SF50_FAMILY_VARIANTS: readonly AircraftFamilyVariantDefinition[] = [
  ...SF50_VARIANTS.map((variant): AircraftFamilyVariantDefinition => ({
    id: variant.id,
    aircraftId: variant.aircraftId,
    label: variant.id.toUpperCase(),
  })),
  { id: "g2+", aircraftId: "cirrus-vision-jet-g2", label: "G2+" },
];

/** Family cards choose an airframe; variants below the gallery choose its package. */
export const AIRCRAFT_FAMILIES: readonly AircraftFamilyDefinition[] = [
  {
    id: "cessna-172",
    label: "Cessna 172 Skyhawk",
    summary: "High-wing trainer. Flight model and visuals both available.",
    thumbnail: { path: "aircraft/thumbnails/cessna-172.png", credit: THUMBNAIL_CREDIT },
    defaultAircraftId: "cessna-172",
    variants: [{ id: "cessna-172", aircraftId: "cessna-172", label: "Cessna 172 Skyhawk" }],
  },
  {
    id: "cirrus-vision-jet",
    label: "Cirrus Vision Jet",
    summary: "Single-engine personal jet. G1, G2, G2+ and G3 variants.",
    thumbnail: { path: "aircraft/thumbnails/cirrus-vision-jet.png", credit: THUMBNAIL_CREDIT },
    defaultAircraftId: "cirrus-vision-jet",
    variants: SF50_FAMILY_VARIANTS,
    variantLabel: "Generation",
    developmentNote: "G1, G2 and G3 have separate runtime packages. G2+ is currently mapped to the G2 runtime while separate physics/package support is not yet implemented. Choosing a generation does not provide calibrated generation-specific performance, a new cabin or complete generation-specific avionics.",
  },
];

/**
 * https://sketchfab.com/3d-models/cirrus-vision-sf50-d46dd06b4b5646acaed90993db34d639
 * CC Attribution, so it ships with the credit shown in the panel. Aligned to
 * the POH three view by
 * planes/Cirrus_Vision_Jet/agent_workspace/scripts/reorient_ref.py and put
 * into the export convention by prepare_third_party.py, which is why it lands
 * in the same place as ours; nothing about its geometry was touched.
 */
const HILOS_RUN: AircraftModelCredit = {
  artist: "hilos run",
  note: "Sketchfab model, textured. Higher detail, but modelled gear-up.",
  licence: "CC Attribution",
  sourceUrl:
    "https://sketchfab.com/3d-models/cirrus-vision-sf50-d46dd06b4b5646acaed90993db34d639",
};

const CIRRUS_LODS: readonly AircraftLodDefinition[] = [
  // Off by default: 3.4 MB of textured mesh, and a licence to honour.
  { id: "hd", label: "HD — highest detail", triangles: 7294, path: "aircraft/cirrus-vision-jet/Cirrus_Vision_Jet_HilosRun.glb", autoFromMeters: 0, credit: HILOS_RUN, optIn: true },
  // 40 m rather than 0 because HD covers the close range when it is switched
  // on. With it off, the finest level available always covers the close range,
  // so this still starts at the camera - see selectAutoLod.
  { id: "lod3", label: "LOD3 — near", triangles: 1514, path: "aircraft/cirrus-vision-jet/Cirrus_Vision_Jet_LOD3.glb", autoFromMeters: 40, credit: PROCEDURAL },
  { id: "lod2", label: "LOD2 — medium", triangles: 856, path: "aircraft/cirrus-vision-jet/Cirrus_Vision_Jet_LOD2.glb", autoFromMeters: 65, credit: PROCEDURAL },
  // The bottom of this ladder, and it runs all the way out: there is no
  // silhouette level under it. The one that used to be there was 98 triangles,
  // and the level above it was little better - both painted their glazing on
  // as one band down each side, so the aeroplane had no windscreen at all.
  // This one cuts the windscreen and the three cabin windows as real panes,
  // which is what makes it read as this aeroplane rather than a white dart.
  { id: "lod1", label: "LOD1 — far", triangles: 442, path: "aircraft/cirrus-vision-jet/Cirrus_Vision_Jet_LOD1.glb", autoFromMeters: 170, credit: PROCEDURAL },
];

const C172_LODS: readonly AircraftLodDefinition[] = [
  { id: "lod3", label: "LOD3 — near", triangles: 1016, path: "aircraft/cessna-172/Cessna_172_LOD3.glb", autoFromMeters: 0, credit: PROCEDURAL },
  { id: "lod2", label: "LOD2 — medium", triangles: 778, path: "aircraft/cessna-172/Cessna_172_LOD2.glb", autoFromMeters: 60, credit: PROCEDURAL },
  { id: "lod1", label: "LOD1 — far", triangles: 288, path: "aircraft/cessna-172/Cessna_172_LOD1.glb", autoFromMeters: 160, credit: PROCEDURAL },
  { id: "lod0", label: "LOD0 — silhouette", triangles: 130, path: "aircraft/cessna-172/Cessna_172_LOD0.glb", autoFromMeters: 320, credit: PROCEDURAL },
];

export const AIRCRAFT_CATALOG: readonly AircraftDefinition[] = [
  {
    id: "cessna-172",
    familyId: "cessna-172",
    label: "Cessna 172 Skyhawk",
    summary: "High-wing trainer. Flight model and visuals both available.",
    modelYawRad: Math.PI,
    modelOffset: { x: 0, y: modelOffsetY("cessna-172"), z: 0 },
    propellerBlades: 2,
    lods: C172_LODS,
  },
  ...SF50_VARIANTS.map((variant): AircraftDefinition => ({
    id: variant.aircraftId,
    familyId: "cirrus-vision-jet",
    label: variant.label,
    summary: variant.summary,
    modelYawRad: Math.PI,
    modelOffset: { x: 0, y: modelOffsetY(variant.aircraftId), z: 0 },
    propellerBlades: 0,
    lods: CIRRUS_LODS,
  })),
];

export function getAircraftDefinition(id: AircraftId): AircraftDefinition {
  return AIRCRAFT_CATALOG.find((entry) => entry.id === id) ?? AIRCRAFT_CATALOG[0];
}

export function getAircraftFamily(id: AircraftFamilyId): AircraftFamilyDefinition {
  return AIRCRAFT_FAMILIES.find((family) => family.id === id) ?? AIRCRAFT_FAMILIES[0];
}

/** Includes the legacy Vision Jet runtime ID, which continues to select G1. */
export function getAircraftFamilyForAircraft(id: AircraftId): AircraftFamilyDefinition {
  return getAircraftFamily(getAircraftDefinition(id).familyId);
}

export function isAircraftLodId(value: unknown): value is AircraftLodId {
  return typeof value === "string" && (AIRCRAFT_LOD_IDS as readonly string[]).includes(value);
}

/** The levels the user can actually get right now, finest first. */
export function availableLods(
  definition: AircraftDefinition,
  optInEnabled: boolean,
): readonly AircraftLodDefinition[] {
  return optInEnabled ? definition.lods : definition.lods.filter((lod) => !lod.optIn);
}

/** Keep staged and restored presentation choices valid for the selected package. */
export function normalizeAircraftSelection(selection: AircraftSelection): AircraftSelection {
  const definition = getAircraftDefinition(selection.aircraftId);
  const family = getAircraftFamily(definition.familyId);
  const familyVariant = family.variants.find((entry) => entry.id === selection.generationId)
    ?? family.variants.find((entry) => entry.aircraftId === selection.aircraftId)
    ?? family.variants[0];
  const normalizedDefinition = getAircraftDefinition(familyVariant.aircraftId);
  // This existing preference survives families without optional meshes; their
  // hidden flag has no effect, and returning to an opted-in family retains it.
  const optInLodsEnabled = selection.optInLodsEnabled;
  const lodId = selection.lodId === "auto"
    || availableLods(normalizedDefinition, optInLodsEnabled).some((lod) => lod.id === selection.lodId)
    ? selection.lodId
    : "auto";
  return {
    aircraftId: normalizedDefinition.id,
    lodId,
    optInLodsEnabled,
    generationId: familyVariant.id,
  };
}

/**
 * Coarsest available level whose `autoFromMeters` threshold the distance has
 * reached, and the finest available one inside that.
 *
 * The finest level available always covers the close range, whatever its own
 * threshold says. That is what lets an opt-in level be switched on and off
 * without rewriting the thresholds under it: with HD on, LOD3 starts at its
 * own 40 m; with HD off, LOD3 is the finest there is and starts at the camera.
 */
export function selectAutoLod(
  definition: AircraftDefinition,
  chaseDistanceMeters: number,
  optInEnabled = false,
): AircraftLodDefinition | null {
  const lods = availableLods(definition, optInEnabled);
  let selected: AircraftLodDefinition | null = lods[0] ?? null;
  for (const lod of lods) {
    if (chaseDistanceMeters >= lod.autoFromMeters) selected = lod;
  }
  return selected;
}

/** Resolve a UI selection to a concrete mesh, or null when none is available. */
export function resolveLod(
  definition: AircraftDefinition,
  lodId: AircraftLodId,
  chaseDistanceMeters: number,
  optInEnabled = false,
): AircraftLodDefinition | null {
  const lods = availableLods(definition, optInEnabled);
  if (lods.length === 0) return null;
  if (lodId === "auto") return selectAutoLod(definition, chaseDistanceMeters, optInEnabled);
  // A level that was chosen and then switched off falls back to the finest one
  // still available rather than leaving the aircraft invisible.
  return lods.find((lod) => lod.id === lodId) ?? lods[0] ?? null;
}
