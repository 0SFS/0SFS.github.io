import { getFdmProfile } from "../jsbsim/fdmProfiles";
import { SF50_VARIANTS } from "./sf50Variants";
import { getEngineExhaustOpticalProfile } from "./engineExhaustProfiles";
import { F135_ENGINE_GEOMETRY } from "./generated/f135EngineData";
import { F135_ENGINE_GAS_SUPPORT, type EngineGasSupportDefinition } from "./engineGasSupport";
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
  generationId?: string;
}

export interface AircraftLodDefinition {
  id: AircraftLodMeshId;
  label: string;
  /** Total displayed triangles, including the selected installed engine export. */
  triangles: number;
  /** Path relative to the Vite base URL. */
  path: string;
  /** Chase-camera distance (m) at or beyond which "Auto" picks this level. */
  autoFromMeters: number;
  credit: AircraftModelCredit;
  /**
   * A level "Auto" never picks. A level is opt-in when loading it is a
   * decision rather than a default - a third-party mesh whose licence has to be
   * honoured, or one heavy enough that nobody should pay for it without
   * choosing to. Choosing it in the level list is that decision: it is offered
   * there like any other level, and loads only when chosen.
   */
  optIn?: boolean;
}

export interface AircraftTemperatureObservation {
  readonly property: string;
  readonly unit: "K" | "degC" | "degF";
  /** Native validity/initialization flags which must all be present and true. */
  readonly availableWhen?: readonly string[];
}

export interface AircraftExhaustInstallation {
  id: string;
  engineIndex: number;
  opticalProfileId: string;
  attachmentNode: string;
  /** One connected interior/exterior gas domain, following the actual rigid duct. */
  gasSupport?: EngineGasSupportDefinition;
  /** Scope thermal glow to matching materials under this nozzle only. */
  hotSurfaceMaterialNames?: readonly string[];
  /** Optional common hardware root when hot solids sit upstream of the exhaust attachment. */
  hotSurfaceAttachmentNode?: string;
  /** Native temperature observation used by the declared hardware's optical profile. */
  hotSurfaceTemperature?: AircraftTemperatureObservation;
  /** Independent native solid regions; array order is shared with the optical consumer. */
  hotSurfaceRegions?: readonly {
    materialNames: readonly string[];
    temperature: AircraftTemperatureObservation;
  }[];
  /** Separate gas observation for the flame's temperature-indexed optical table. */
  gasTemperature?: AircraftTemperatureObservation;
  /** Upstream of augmentation; distinct from the mixed downstream gas bath. */
  upstreamGasTemperature?: AircraftTemperatureObservation;
  /** Optional artistic aerosol appearance; independent of the optical plume. */
  smokeProfileId?: string;
  /** Position/direction in the authored attachment's local coordinates. */
  exitPosition: readonly [number, number, number];
  direction: readonly [number, number, number];
  /** Display geometry in metres; not a performance model of the plume. */
  closedRadiusMeters: number;
  openRadiusMeters: number;
  lengthMeters: number;
  /** Native operating observation used for plume extent and smoke emission. */
  powerProperty: string;
  powerFullScale: number;
  fuelFlowProperty: string;
  /** Native burned augmentation fuel, kg/s; distinct from total supplied fuel. */
  afterburnerBurnedFuelFlowProperty?: string;
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
  /** Pilot eye in the sim's body axes, relative to the aircraft reference point. */
  cockpitOffset?: { x: number; y: number; z: number };
  /** The exterior asset includes an interior that can be drawn in cockpit view. */
  cockpitMesh?: boolean;
  /** Native nozzle-position observer driving the model's optional petal rig. */
  nozzlePositionEngineIndex?: number;
  /** Authored wheel/arm geometry hidden at native gear position zero; doors stay visible. */
  stowedGearNodeNames?: readonly string[];
  /** Authored assembly roots retained in an isolated engine-test view; this may be only a nozzle. */
  engineTestNodeNames?: readonly string[];
  /** Generated from one source; full engine bytes are requested only by the stand. */
  engineAssets?: {
    full: { path: string; triangles: number };
    installed: { path: string; triangles: number };
    rig?: import("./engineNozzleRig").EngineNozzleRigDefinition;
  };
  /** Camera focus in aircraft body axes, measured in the authored rest pose including model offset. */
  engineTestFocusOffset?: { x: number; y: number; z: number };
  exhaustSources?: readonly AircraftExhaustInstallation[];
  /** Engines whose native augmentation state lights the throttle indicator. */
  afterburner?: {
    engineIndices: readonly number[];
    /** Representative plume hue for the HUD, not a fixed physical flame color. */
    accentColor: string;
  };
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

const F35B_CREDIT: AircraftModelCredit = {
  artist: "AF267",
  note: "Sketchfab model, converted from the author's Blender source.",
  licence: "CC BY 4.0",
  sourceUrl: "https://sketchfab.com/3d-models/lockheed-martin-f-35b-lightning-ii-5d54a6af45974ad386ae74d42b33374a",
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
  {
    id: "f-35b",
    label: "Lockheed Martin F-35B Lightning II",
    summary: "STOVL fighter. Experimental flight model and AF267 exterior model.",
    thumbnail: {
      path: "aircraft/thumbnails/f-35b.png",
      credit: { ...F35B_CREDIT, note: "Static render of AF267's F-35B model." },
    },
    defaultAircraftId: "f-35b",
    variants: [{ id: "f-35b", aircraftId: "f-35b", label: "F-35B" }],
    developmentNote: "Experimental F-16/Aeromatic-derived JSBSim flight model. F-35B performance and STOVL behavior are not validated.",
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
  // Loaded only when chosen: 3.4 MB of textured mesh, and a licence to honour.
  { id: "hd", label: "HD — highest detail", triangles: 7294, path: "aircraft/cirrus-vision-jet/Cirrus_Vision_Jet_HilosRun.glb", autoFromMeters: 0, credit: HILOS_RUN, optIn: true },
  { id: "lod3", label: "LOD3 — near", triangles: 1654, path: "aircraft/cirrus-vision-jet/Cirrus_Vision_Jet_LOD3.glb", autoFromMeters: 0, credit: PROCEDURAL },
  { id: "lod2", label: "LOD2 — medium", triangles: 926, path: "aircraft/cirrus-vision-jet/Cirrus_Vision_Jet_LOD2.glb", autoFromMeters: 65, credit: PROCEDURAL },
  // The bottom of this ladder, and it runs all the way out: there is no
  // silhouette level under it. The one that used to be there was 98 triangles,
  // and the level above it was little better - both painted their glazing on
  // as one band down each side, so the aeroplane had no windscreen at all.
  // This one cuts the windscreen and the three cabin windows as real panes,
  // which is what makes it read as this aeroplane rather than a white dart.
  { id: "lod1", label: "LOD1 — far", triangles: 438, path: "aircraft/cirrus-vision-jet/Cirrus_Vision_Jet_LOD1.glb", autoFromMeters: 170, credit: PROCEDURAL },
];

const C172_LODS: readonly AircraftLodDefinition[] = [
  { id: "lod3", label: "LOD3 — near", triangles: 1016, path: "aircraft/cessna-172/Cessna_172_LOD3.glb", autoFromMeters: 0, credit: PROCEDURAL },
  { id: "lod2", label: "LOD2 — medium", triangles: 778, path: "aircraft/cessna-172/Cessna_172_LOD2.glb", autoFromMeters: 60, credit: PROCEDURAL },
  { id: "lod1", label: "LOD1 — far", triangles: 288, path: "aircraft/cessna-172/Cessna_172_LOD1.glb", autoFromMeters: 160, credit: PROCEDURAL },
  { id: "lod0", label: "LOD0 — silhouette", triangles: 130, path: "aircraft/cessna-172/Cessna_172_LOD0.glb", autoFromMeters: 320, credit: PROCEDURAL },
];

// This is the F-35B's only exterior mesh, so Auto must be able to select it.
const F35B_LODS: readonly AircraftLodDefinition[] = [
  { id: "hd", label: "HD — reconstructed engine", triangles: F135_ENGINE_GEOMETRY.assets[2].triangles + F135_ENGINE_GEOMETRY.assets[1].triangles,
    path: F135_ENGINE_GEOMETRY.assets[2].path, autoFromMeters: 0, credit: {
      ...F35B_CREDIT, note: "Airframe from the author's Blender source (CC BY 4.0); original 0sfs engine reconstruction (AGPL-3.0-only).",
    } },
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
  {
    id: "f-35b",
    familyId: "f-35b",
    label: "Lockheed Martin F-35B Lightning II",
    summary: "STOVL fighter. Experimental flight model and AF267 exterior model.",
    modelYawRad: Math.PI,
    modelOffset: { x: 0, y: modelOffsetY("f-35b"), z: 0 },
    // Geometry fit inside AF267's canopy, behind its panel; not a published
    // pilot-eye datum. The exported mesh's coordinates are ground-relative.
    cockpitOffset: { x: 0, y: 3.18098 + modelOffsetY("f-35b"), z: 6.30018 },
    cockpitMesh: true,
    nozzlePositionEngineIndex: 0,
    engineTestNodeNames: ["F135_Engine"],
    engineAssets: {
      full: F135_ENGINE_GEOMETRY.assets[0], installed: F135_ENGINE_GEOMETRY.assets[1],
      rig: { bearingNames: ["F135_Bearing1", "F135_Bearing2", "F135_Bearing3"],
        bearingInclinationRad: F135_ENGINE_GEOMETRY.bearingTiltDegrees * Math.PI / 180,
        apertureMechanism: F135_ENGINE_GEOMETRY.aperture },
    },
    // Whole-engine framing; both exports have identical authored placement.
    engineTestFocusOffset: { x: 0, y: F135_ENGINE_GEOMETRY.attachment[1] + modelOffsetY("f-35b"), z: -1.66 },
    stowedGearNodeNames: [
      "leftGear", "leftPiston", "leftStrutT", "leftSuspension", "leftStrutB", "leftWheel",
      "rightGear", "rightPiston", "rightStrutT", "rightSuspension", "rightStrutB", "rightWheel",
      "noseGear", "nosePiston", "noseStrutT", "noseSuspension", "noseStrutB", "noseWheel",
    ],
    afterburner: {
      engineIndices: [0],
      accentColor: getEngineExhaustOpticalProfile("f135-visible-approximation-v1")!.hudAccentHex,
    },
    exhaustSources: [{
      id: "main-exhaust", engineIndex: 0, opticalProfileId: "f135-visible-approximation-v1",
      attachmentNode: "F135_Exhaust", exitPosition: [0, 0, 0], direction: [0, 0, 1],
      gasSupport: F135_ENGINE_GAS_SUPPORT,
      hotSurfaceAttachmentNode: "F135_Engine",
      hotSurfaceTemperature: { property: "propulsion/engine[0]/thermal/metal-temperature-k", unit: "K",
        availableWhen: ["propulsion/engine[0]/thermal/initialized", "propulsion/engine[0]/thermal/valid"] },
      hotSurfaceRegions: [
        { materialNames: ["F135_CoreHot"], temperature: {
          property: "propulsion/engine[0]/thermal/core/metal-temperature-k", unit: "K",
          availableWhen: ["propulsion/engine[0]/thermal/core/initialized", "propulsion/engine[0]/thermal/valid"],
        } },
        { materialNames: ["F135_LinerHot"], temperature: {
          property: "propulsion/engine[0]/thermal/metal-temperature-k", unit: "K",
          availableWhen: ["propulsion/engine[0]/thermal/initialized", "propulsion/engine[0]/thermal/valid"],
        } },
      ],
      gasTemperature: { property: "propulsion/engine[0]/thermal/nozzle-gas-temperature-k", unit: "K",
        availableWhen: ["propulsion/engine[0]/thermal/valid"] },
      upstreamGasTemperature: { property: "propulsion/engine[0]/egt-degc", unit: "degC",
        availableWhen: ["propulsion/engine[0]/thermal/valid"] },
      smokeProfileId: "faint-aircraft-aerosol-v1",
      // Exit A9 visual geometry, not the separately authored throat A8 or native FADEC area.
      closedRadiusMeters: F135_ENGINE_GEOMETRY.closedExitRadius, openRadiusMeters: F135_ENGINE_GEOMETRY.openExitRadius, lengthMeters: 6,
      powerProperty: "propulsion/engine[0]/n2", powerFullScale: 100,
      fuelFlowProperty: "propulsion/engine[0]/fuel-flow-rate-pps",
      afterburnerBurnedFuelFlowProperty: "propulsion/engine[0]/thermal/afterburner-burned-fuel-flow-kg-sec",
    }],
    propellerBlades: 0,
    lods: F35B_LODS,
  },
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

/** The levels "Auto" chooses between, finest first: every level but the opt-in ones. */
export function autoLods(definition: AircraftDefinition): readonly AircraftLodDefinition[] {
  return definition.lods.filter((lod) => !lod.optIn);
}

/** Keep staged and restored presentation choices valid for the selected package. */
export function normalizeAircraftSelection(selection: AircraftSelection): AircraftSelection {
  const definition = getAircraftDefinition(selection.aircraftId);
  const family = getAircraftFamily(definition.familyId);
  const familyVariant = family.variants.find((entry) => entry.id === selection.generationId)
    ?? family.variants.find((entry) => entry.aircraftId === selection.aircraftId)
    ?? family.variants[0];
  const normalizedDefinition = getAircraftDefinition(familyVariant.aircraftId);
  const lodId = selection.lodId === "auto"
    || normalizedDefinition.lods.some((lod) => lod.id === selection.lodId)
    ? selection.lodId
    : "auto";
  return {
    aircraftId: normalizedDefinition.id,
    lodId,
    generationId: familyVariant.id,
  };
}

/**
 * Coarsest level "Auto" uses whose `autoFromMeters` threshold the distance has
 * reached, and the finest one inside that. The finest always covers the close
 * range, whatever its own threshold says.
 */
export function selectAutoLod(
  definition: AircraftDefinition,
  chaseDistanceMeters: number,
): AircraftLodDefinition | null {
  const lods = autoLods(definition);
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
): AircraftLodDefinition | null {
  if (lodId === "auto") return selectAutoLod(definition, chaseDistanceMeters);
  // A level this airframe does not have, such as the Cessna asked for "hd",
  // falls back to the finest one it has rather than leaving it invisible.
  return definition.lods.find((lod) => lod.id === lodId) ?? autoLods(definition)[0] ?? definition.lods[0] ?? null;
}
