import { GOOGLE_ERROR_TARGET_BOUNDS } from "foss-earth/mapDetailPolicy";
import { AIRCRAFT_FAMILIES, AIRCRAFT_LOD_IDS } from "../aircraft/aircraftCatalog";
import { AIRCRAFT_IDS } from "../aircraft/aircraftIds";
import { DEFAULT_ENGINE_GAS_AXIAL_SAMPLES, DEFAULT_ENGINE_GAS_RADIAL_SAMPLES } from "../aircraft/engineGasOptics";
import { DEFAULT_MAX_PATTERN_STEP } from "../hud/engineSpoolMotion";
import {
  DEFAULT_GROUND_INTERACTION_SETTINGS,
  GROUND_CHOICE_LABELS,
  GROUND_CHOICES,
  GROUND_FIELD_LABELS,
  GROUND_LOCKABLE_KEYS,
  type GroundLockableKey,
} from "./groundInteractionSettings";
import type {
  NumberRange,
  ParameterSpec,
  ParameterValue,
  SetResult,
  SettingsRegistry,
} from "foss-earth/settings";

/**
 * Every flight parameter: the values 0sfs adds to FOSS Earth's settings
 * registry, each with its unit, bounds, default and the reason for it. This is
 * the only place a flight default is written; code reads the effective value
 * through the registry. Spec: docs/proposals/flight-settings.md.
 */

const PSF = { id: "psf", text: "psf" } as const;
const FEET_PER_SECOND = { id: "ft/s", text: "ft/s" } as const;
const NEWTON_SECONDS = { id: "N·s", text: "N·s" } as const;
const JOULES = { id: "J", text: "J" } as const;
const RADIANS_PER_SECOND_SQUARED = { id: "rad/s²", text: "rad/s²" } as const;
const KNOTS = { id: "kt", text: "kt" } as const;

const MAP_DETAIL = { tab: "map", section: "detail" } as const;
const MODEL = { tab: "aircraft", section: "model" } as const;
const MESH_INSPECTOR = { tab: "aircraft", section: "mesh-inspector" } as const;
const INSTRUMENTS = { tab: "renderer", section: "instruments" } as const;
const EXHAUST = { tab: "exhaust", section: "gas" } as const;
const EXHAUST_SMOKE = { tab: "exhaust", section: "smoke" } as const;
const EXTERNAL_TANKS = { tab: "renderer", section: "external-tanks" } as const;
const FORCES = { tab: "debug", section: "forces" } as const;
const AIRCRAFT_VISUALS = { tab: "debug", section: "aircraft-visuals" } as const;
const CAMERA = { tab: "aircraft", section: "camera" } as const;
const START = { tab: "aircraft", section: "start" } as const;
const REMOTE_CONTROL = { tab: "remote", section: "control" } as const;
const PHONE_CAMERA = { tab: "remote", section: "camera" } as const;
const SOUND = { tab: "sound", section: "sound" } as const;
const AFTERBURNER = { tab: "exhaust", section: "afterburner" } as const;
const ENGINE = { tab: "engine", section: "engine" } as const;
const ENGINE_HISTORY = { tab: "engine", section: "history" } as const;
const ENGINE_TEST = { tab: "engine", section: "test" } as const;
const ASSISTS = { tab: "aircraft", section: "assists" } as const;
const FLIGHT_CONTROLS = { tab: "aircraft", section: "flight-controls" } as const;
const GROUND = { tab: "aircraft", section: "ground" } as const;
const AUTOPILOT = { tab: "autopilot", section: "package" } as const;
const GAMEPAD = { tab: "controls", section: "gamepad" } as const;
const KEYBOARD = { tab: "controls", section: "keyboard" } as const;
const ORBIT = { tab: "controls", section: "orbit" } as const;
const FEEDBACK = { tab: "controls", section: "feedback" } as const;
const STOVL = { tab: "controls", section: "stovl" } as const;

/** Section titles for the sections 0sfs adds, by tab and section id. */
export const FLIGHT_SECTION_TITLES: readonly (readonly [tab: string, section: string, title: string])[] = [
  ["renderer", "instruments", "Instruments"],
  ["exhaust", "gas", "Gas and luminance"],
  ["exhaust", "smoke", "Smoke"],
  ["exhaust", "afterburner", "Afterburner"],
  ["renderer", "external-tanks", "Released fuel tanks"],
  ["aircraft", "model", "Aircraft"],
  ["aircraft", "mesh-inspector", "Mesh inspector"],
  ["aircraft", "camera", "Camera"],
  ["aircraft", "start", "Start"],
  ["remote", "control", "Who flies"],
  ["remote", "camera", "Phone camera trackpad"],
  ["sound", "sound", "Sound"],
  ["engine", "engine", "Engine"],
  ["engine", "history", "History sampling"],
  ["engine", "test", "Test stand conditions"],
  ["aircraft", "assists", "Assists"],
  ["aircraft", "flight-controls", "Flight controls"],
  ["aircraft", "ground", "Ground handling"],
  ["autopilot", "package", "Autopilot"],
  ["controls", "gamepad", "Gamepad"],
  ["controls", "keyboard", "Keyboard response"],
  ["controls", "feedback", "Feedback"],
  ["controls", "stovl", "F-35B STOVL"],
  ["debug", "frame-budget", "Frame budget"],
  ["debug", "forces", "Forces"],
  ["debug", "aircraft-visuals", "Aircraft visuals"],
];

const FAMILY_VARIANTS = AIRCRAFT_FAMILIES.flatMap(family => family.variants);
const AIRCRAFT_CHOICES = AIRCRAFT_IDS.map(id => ({
  id,
  label: FAMILY_VARIANTS.find(variant => variant.aircraftId === id)?.label ?? id,
}));
const GENERATION_CHOICES = AIRCRAFT_FAMILIES.flatMap(family => family.variants.map(variant => ({
  id: variant.id,
  label: family.variants.length > 1 ? `${family.label} ${variant.label}` : variant.label,
})));
const LOD_LABELS: Record<(typeof AIRCRAFT_LOD_IDS)[number], string> = {
  auto: "Auto, by chase distance", hd: "HD, highest detail", lod3: "LOD3, near", lod2: "LOD2, medium", lod1: "LOD1, far", lod0: "LOD0, silhouette",
};

const main = <T extends { tab: string; section: string }>(home: T) => ({ ...home, level: "main" as const });
const all = <T extends { tab: string; section: string }>(home: T) => ({ ...home, level: "all" as const });
const within = (min: number, max: number) => () => ({ min, max });

/** The pre-registry defaults of the keyboard stick, which the migration and the Reset button share. */
const KEYBOARD_STICK_SOURCE = "src/flight/input/keyboardStickResponse.ts";

export const OSFS_PARAMETERS = [
  {
    id: "osfs.aircraft.wireframe", label: "Show polygon edges",
    description: "Draw orange triangle edges over selected parts of the loaded aircraft. Select parts in the mesh tree; deselecting leaves their surfaces visible. Turning this off releases the edge drawing resources.",
    unit: "none", kind: "boolean", default: false,
    defaultReason: "Inspecting model geometry is optional; normal flight needs no extra edge draws.",
    home: main(MESH_INSPECTOR), appliesLive: true, source: "src/flight/createFlightSimApp.ts",
  },
  {
    id: "osfs.debug.renderStowedGear", label: "Render stowed landing gear",
    description: "Keep enclosed wheels and struts drawable at full retraction to inspect their stowed pose. Bay doors remain visible in either mode.",
    unit: "none", kind: "boolean", default: false,
    defaultReason: "Fully enclosed landing gear needs no draw calls during normal flight.",
    home: main(AIRCRAFT_VISUALS), appliesLive: true, source: "src/flight/aircraft/createAircraftModel.ts",
  },
  {
    id: "osfs.forces.enabled", label: "Show aircraft forces",
    description: "Draw native force vectors at their observed application points. Off releases the overlay and stops its native reads.",
    unit: "none", kind: "boolean", default: false,
    defaultReason: "Force arrows are an optional flight-model diagnostic.",
    home: main(FORCES), appliesLive: true, source: "src/flight/diagnostics/createForcesDebugOverlay.ts",
  },
  {
    id: "osfs.forces.newtonsPerMeter", label: "Arrow force scale",
    description: "Force represented by one metre of arrow length. Smaller values magnify forces without changing the simulation.",
    unit: { id: "N/m", text: "N/m" }, kind: "number", step: 100, bounds: within(100, 200000), default: 20000,
    defaultReason: "A 200 kN force is ten metres long; lower this for smaller aircraft.",
    home: main(FORCES), appliesLive: true, source: "src/flight/diagnostics/createForcesDebugOverlay.ts",
  },
  {
    id: "osfs.forces.maxArrowMeters", label: "Maximum arrow length",
    description: "Caps displayed arrows at this length. Labels retain the actual force and mark capped arrows.",
    unit: "m", kind: "number", step: 1, bounds: within(1, 100), default: 20,
    defaultReason: "Keeps diagnostic arrows near the aircraft when a force spikes.",
    home: main(FORCES), appliesLive: true, source: "src/flight/diagnostics/createForcesDebugOverlay.ts",
  },
  {
    id: "osfs.forces.labels", label: "Force labels",
    description: "Show each native force's name and magnitude in kilonewtons beside its arrow.",
    unit: "none", kind: "boolean", default: true,
    defaultReason: "Names distinguish the lift fan, roll posts and aerodynamic components.",
    home: main(FORCES), appliesLive: true, source: "src/flight/diagnostics/createForcesDebugOverlay.ts",
  },
  {
    id: "osfs.forces.labelRefreshHz", label: "Force label refresh",
    description: "Maximum label texture updates per simulation second. Arrows still follow the latest accepted native forces each frame.",
    unit: "Hz", kind: "number", step: 1, bounds: within(1, 20), default: 5,
    defaultReason: "Readable numbers with bounded text and texture upload work; paused native time holds their values.",
    home: main(FORCES), appliesLive: true, source: "src/flight/diagnostics/createForcesDebugOverlay.ts",
  },
  {
    id: "osfs.forces.controlSurfaces", label: "Control surfaces",
    description: "Draw each control surface's own native aerodynamic terms: their force at the aerodynamic reference point, where JSBSim applies them, and their moment as an arc. JSBSim has no surface positions, so nothing is drawn at the surfaces themselves.",
    unit: "none", kind: "boolean", default: true,
    defaultReason: "What the pilot's controls are doing is what a forces view is most often opened to see.",
    home: main(FORCES), appliesLive: true, source: "src/flight/diagnostics/createForcesDebugOverlay.ts",
  },
  {
    id: "osfs.forces.newtonMetersPerDegree", label: "Arc moment scale",
    description: "Moment represented by one degree of arc. Each arc turns about its moment's axis by the right-hand rule. Smaller values magnify moments without changing the simulation.",
    unit: { id: "N·m/deg", text: "N·m/°" }, kind: "number", step: 10, bounds: within(10, 100000), default: 2000,
    defaultReason: "An F-35B elevator moment of 200 kN·m, seen at 300 knots, sweeps 100°; lower this for smaller aircraft.",
    home: main(FORCES), appliesLive: true, source: "src/flight/diagnostics/createForcesDebugOverlay.ts",
  },
  {
    id: "osfs.forces.arcRadiusMeters", label: "Moment arc radius",
    description: "Radius of every moment arc around the point its moment is taken about.",
    unit: "m", kind: "number", step: 0.5, bounds: within(0.5, 20), default: 3,
    defaultReason: "Clear of the arrows that start at the same reference point and CG.",
    home: main(FORCES), appliesLive: true, source: "src/flight/diagnostics/createForcesDebugOverlay.ts",
  },
  {
    id: "osfs.forces.maxArcDegrees", label: "Maximum arc sweep",
    description: "Caps displayed arcs at this sweep. Labels retain the actual moment and mark capped arcs.",
    unit: "deg", kind: "number", step: 5, bounds: within(30, 330), default: 300,
    defaultReason: "Short of a full turn, so the arrowhead's sense stays readable when a moment spikes.",
    home: main(FORCES), appliesLive: true, source: "src/flight/diagnostics/createForcesDebugOverlay.ts",
  },
  // Aircraft: which aircraft flies, and which of its models is drawn.
  {
    id: "osfs.aircraft.id",
    label: "Aircraft",
    description: "The flight model, contact geometry, gauges and visuals that load together.",
    unit: "none",
    kind: "choice",
    choices: AIRCRAFT_CHOICES,
    default: "cessna-172",
    defaultReason: "The original default aircraft.",
    home: all(MODEL),
    appliesLive: false,
    source: "src/flight/createFlightSimApp.ts",
  },
  {
    id: "osfs.aircraft.generation",
    label: "Generation",
    description: "Which package of the aircraft's family flies, such as the Vision Jet's G2+.",
    unit: "none",
    kind: "choice",
    choices: GENERATION_CHOICES,
    default: "cessna-172",
    defaultReason: "The default aircraft's only generation; another aircraft uses its own first generation.",
    home: all(MODEL),
    appliesLive: false,
    source: "src/flight/aircraft/aircraftCatalog.ts",
  },
  {
    id: "osfs.aircraft.lod",
    label: "Model detail",
    description: "Which of the aircraft's models is drawn; Auto picks one by the chase camera's distance.",
    unit: "none",
    kind: "choice",
    choices: AIRCRAFT_LOD_IDS.map(id => ({ id, label: LOD_LABELS[id] })),
    default: "auto",
    defaultReason: "The original default: a distant aircraft draws a coarser model.",
    home: all(MODEL),
    appliesLive: true,
    source: "src/flight/aircraft/aircraftCatalog.ts",
  },

  // Map → Detail: the low-spawn hold, a requirement on World detail.
  {
    id: "osfs.flight.minimum",
    label: "Flight minimum",
    description: "The coarsest Google 3D Tiles detail a spawn near the ground accepts; the hold keeps detail at least this fine until departure.",
    unit: "px",
    kind: "number",
    scale: "log2",
    step: 0.05,
    bounds: () => ({ min: GOOGLE_ERROR_TARGET_BOUNDS.finest, max: GOOGLE_ERROR_TARGET_BOUNDS.coarsest, reason: "The range of Google 3D Tiles error targets" }),
    default: 4_096,
    defaultReason: "2^12 px, the value the low-spawn hold has used since it was added; it has not been tuned against a measurement.",
    home: all(MAP_DETAIL),
    appliesLive: true,
    source: "src/flight/worldDetail.ts",
  },
  {
    id: "osfs.flight.holdBelow",
    label: "Hold detail below",
    description: "A spawn closer than this to the sampled surface holds Google 3D Tiles at the Flight minimum until departure.",
    unit: "m",
    kind: "number",
    step: 5,
    bounds: within(0, 2_000),
    default: 100,
    defaultReason: "The value the low-spawn hold has used since it was added; it has not been tuned against a measurement.",
    home: all(MAP_DETAIL),
    appliesLive: true,
    source: "src/flight/worldDetail.ts",
  },
  {
    id: "osfs.flight.holdReleaseAfter",
    label: "Release the hold after",
    description: "How long the aircraft must fly above the hold height before the hold ends, in simulated seconds.",
    unit: "s",
    kind: "number",
    step: 0.25,
    bounds: within(0, 60),
    default: 1,
    defaultReason: "The original value: one simulated second clear of the hold height counts as a departure.",
    home: all(MAP_DETAIL),
    appliesLive: true,
    source: "src/flight/worldDetail.ts",
  },
  {
    id: "osfs.flight.allowCoarserThisSession",
    label: "Allow coarser terrain for this session",
    description: "Suspends the Flight minimum: a spawn may start below it, and a held requirement ends. Resets when the game reloads.",
    unit: "none",
    kind: "boolean",
    default: false,
    defaultReason: "The Flight minimum is a safety requirement; waiving it is a deliberate, temporary choice.",
    home: main(MAP_DETAIL),
    appliesLive: true,
    source: "src/flight/createFlightSimApp.ts",
    session: true,
  },

  {
    id: "osfs.externalTanks.debrisLifetimeSeconds",
    label: "Released tank lifetime",
    description: "How long a jettisoned fuel tank remains visible, in simulated seconds. Zero hides it as soon as it is released.",
    unit: "s", kind: "number", step: 0.1, bounds: within(0, 120), default: 15,
    defaultReason: "Fifteen seconds shows the separation while bounding the time spent updating falling tanks.",
    home: main(EXTERNAL_TANKS), appliesLive: true, source: "src/flight/aircraft/createExternalTankVisuals.ts",
  },
  {
    id: "osfs.externalTanks.maxDetachedTanks",
    label: "Released tank limit",
    description: "Maximum released fuel tanks kept visible at once. Zero hides released tanks; installed tanks still appear on the aircraft.",
    unit: { id: "tanks", text: "tanks" }, kind: "number", step: 1, bounds: within(0, 2), default: 2,
    defaultReason: "One released tank per station shows both separations and bounds retained geometry and update work.",
    home: main(EXTERNAL_TANKS), appliesLive: true, source: "src/flight/aircraft/createExternalTankVisuals.ts",
  },

  // Exhaust → Gas and luminance. Shared across engines with an optical profile.
  {
    id: "osfs.exhaust.enabled",
    label: "Aircraft exhaust",
    description: "Draw hot exhaust and afterburner on aircraft with an exhaust profile. Turning this off releases its rendering resources.",
    unit: "none",
    kind: "boolean",
    default: true,
    defaultReason: "Show the configured engine's visual state alongside its moving nozzle.",
    home: main(EXHAUST),
    appliesLive: true,
    source: "src/flight/aircraft/createEngineExhaust.ts",
  },
  {
    id: "osfs.exhaust.contributionView",
    label: "Engine light contribution",
    description: "Isolate a contribution on the engine for diagnosis. Thermal and fuel states continue unchanged. Scene exposure and ambient fill are in Renderer → Lighting and exposure.",
    unit: "none", kind: "choice",
    choices: [
      { id: "combined", label: "Combined", description: "All enabled engine light contributions." },
      { id: "solid", label: "Solid emission", description: "Material self-emission with its direct/environment reflection suppressed; gas and nearby light off." },
      { id: "gas", label: "Gas emission", description: "Only gas/particle emission; hot hardware emission/reflection and nearby light off." },
      { id: "reflection", label: "Reflected light", description: "Engine material reflection from the existing scene; gas, self-emission and the exhaust scene light off." },
      { id: "scene-light", label: "Nearby scene light", description: "The exhaust light on other lit scene surfaces; gas and self-emission off. The emitting engine is excluded from this light." },
    ],
    default: "combined",
    defaultReason: "Show normal combined appearance; individual contributions make thermal color and reflected light distinguishable.",
    home: main(EXHAUST), appliesLive: true, source: "src/flight/aircraft/createEngineExhaust.ts",
  },
  {
    id: "osfs.exhaust.sampleCount",
    label: "Exhaust samples",
    description: "Samples through each visible exhaust pixel. Localized emission needs more samples; lower counts can miss narrow regions and alter apparent color. More samples use more GPU time.",
    unit: { id: "samples/pixel", text: "samples/pixel" },
    kind: "number",
    step: 1, bounds: within(4, 128),
    default: 32,
    defaultReason: "Bound the default pixel work at 32 steps; 128 remains available for detailed inspection. The retained posed-ray comparison found up to 18.51% error at 32 versus 0.761% at 128, and GPU cost remains unqualified.",
    home: main(EXHAUST),
    appliesLive: true,
    source: "src/flight/aircraft/createEngineExhaust.ts",
  },
  {
    id: "osfs.exhaust.depthOcclusionEnabled",
    label: "Exhaust opaque occlusion",
    description: "Render an opaque-depth pass to stop gas integration at hardware and scenery. Disabling saves the pass but can show light from behind an opaque surface.",
    unit: "none", kind: "boolean", default: true,
    defaultReason: "Interior gas must stop at the visible metal surface rather than accumulating light behind it.",
    home: main(EXHAUST), appliesLive: true, source: "src/flight/aircraft/engineExhaustDepth.ts",
  },
  {
    id: "osfs.exhaust.depthResolutionScale",
    label: "Exhaust depth resolution",
    description: "Width and height of the exhaust depth buffer relative to the viewport. Smaller buffers use fewer pixels and less memory, but can misplace thin hardware edges.",
    unit: "ratio", kind: "number", step: 0.01, bounds: within(0.25, 1), default: 1,
    defaultReason: "One depth texel per viewport pixel preserves hardware boundaries. This adds one depth pass; GPU cost is unqualified.",
    home: main(EXHAUST), appliesLive: true, source: "src/flight/aircraft/engineExhaustDepth.ts",
  },
  {
    id: "osfs.exhaust.axialFieldSamples",
    label: "Exhaust axial field samples",
    description: "Source-table samples along the plume. More samples resolve localized emission and increase CPU updates and texture memory; ray samples control separate pixel work.",
    unit: { id: "samples/axis", text: "samples/axis" }, kind: "number", step: 1, bounds: within(8, 64), default: DEFAULT_ENGINE_GAS_AXIAL_SAMPLES,
    defaultReason: "Retain 64 axial samples across the combined internal/external field; 64 × 32 RGBA32F samples use 32 KiB per engine. Current checks cover selected rays, not every view or GPU performance.",
    home: main(EXHAUST), appliesLive: true, source: "src/flight/aircraft/createEngineExhaust.ts",
  },
  {
    id: "osfs.exhaust.radialFieldSamples",
    label: "Exhaust radial field samples",
    description: "Source-table samples from plume axis to edge. More samples resolve the annulus and mixing layer, increasing CPU updates and texture memory.",
    unit: { id: "samples/axis", text: "samples/axis" }, kind: "number", step: 1, bounds: within(8, 64), default: DEFAULT_ENGINE_GAS_RADIAL_SAMPLES,
    defaultReason: "Thirty-two radial samples resolve the narrow annulus more closely; axial × radial × 16 bytes gives the texture allocation per engine.",
    home: main(EXHAUST), appliesLive: true, source: "src/flight/aircraft/createEngineExhaust.ts",
  },
  {
    id: "osfs.exhaust.maxDistanceMeters",
    label: "Exhaust draw distance",
    description: "Stop drawing exhaust farther than this distance from the viewing camera.",
    unit: "m",
    kind: "number",
    step: 1, bounds: within(1, 20000),
    default: 2000,
    defaultReason: "Avoid shading a tiny plume at long range while retaining exterior chase and flyby views.",
    home: main(EXHAUST),
    appliesLive: true,
    source: "src/flight/aircraft/createEngineExhaust.ts",
  },
  {
    id: "osfs.exhaust.intensity",
    label: "Exhaust display gain",
    description: "Display gain after physical gas emission has been evaluated. This changes neither emitted physical power nor engine temperature, fuel or afterburner engagement.",
    unit: "ratio",
    kind: "number",
    step: 0.01, bounds: within(0, 8),
    default: 1,
    defaultReason: "Use the profile's reference display brightness; the F135 profile is not radiometrically calibrated.",
    home: main(EXHAUST),
    appliesLive: true,
    source: "src/flight/aircraft/createEngineExhaust.ts",
  },
  {
    id: "osfs.exhaust.gasReferenceNits",
    label: "Gas emission white reference",
    description: "Gas luminance mapped to unit linear scene intensity before shared exposure and tone mapping. The physical emission calculation retains absolute units; this reference changes only display mapping.",
    unit: { id: "cd/m²", text: "cd/m²" }, kind: "number", step: 1, bounds: within(1, 100000), default: 1000,
    defaultReason: "Use the same provisional luminance reference as hot hardware; the scene is not radiometrically calibrated.",
    home: main(EXHAUST), appliesLive: true, source: "src/flight/aircraft/createEngineExhaust.ts",
  },
  {
    id: "osfs.exhaust.dryIntensity",
    label: "Dry exhaust brightness",
    description: "Display multiplier on luminous gas and its nearby light with afterburner off. One preserves the current physical model's output, whose F135 temperature and particle loading remain uncalibrated. Metal glow and afterburner emission are unchanged.",
    unit: "ratio", kind: "number", step: 0.01, bounds: within(0.5, 10), default: 1,
    defaultReason: "Preserve the current model prediction without changing temperature, fuel, spectrum or physical emitted power.",
    home: main(EXHAUST), appliesLive: true, source: "src/flight/aircraft/createEngineExhaust.ts",
  },
  {
    id: "osfs.exhaust.surfaceReferenceNits",
    label: "Nozzle glow white reference",
    description: "Metal luminance mapped to display white. Lower values brighten hot hardware without changing its temperature or the flame. Scene exposure is not physically calibrated.",
    unit: { id: "cd/m²", text: "cd/m²" },
    kind: "number",
    step: 1, bounds: within(1, 100000),
    default: 1000,
    defaultReason: "A provisional display reference for visible thermal emission; tune to the scene lighting, not engine temperature.",
    home: main(EXHAUST),
    appliesLive: true,
    source: "src/flight/aircraft/createEngineHotSurfaceGlow.ts",
  },
  {
    id: "osfs.exhaust.light.enabled",
    label: "Exhaust scene light",
    description: "One unshadowed light per visible engine represents its bounded gas-emission power on other lit scene surfaces. It cannot illuminate the emitting engine itself.",
    unit: "none", kind: "boolean", default: true,
    defaultReason: "Retained night footage shows scene illumination. One isotropic approximation uses the evaluated optical power; geometry, occlusion and engine coefficients remain uncalibrated.",
    home: main(EXHAUST), appliesLive: true, source: "src/flight/aircraft/createEngineExhaust.ts",
  },
  {
    id: "osfs.exhaust.light.gain",
    label: "Exhaust light display gain",
    description: "Gain on the isotropic candela estimate derived from the bounded optical source. This adjusts scene presentation, not physical emitted power or thermal state.",
    unit: "ratio", kind: "number", step: .01, bounds: within(0, 8), default: 1,
    defaultReason: "Use the evaluated optical source with unit gain; no independent arbitrary candela reference.",
    home: main(EXHAUST), appliesLive: true, source: "src/flight/aircraft/createEngineExhaust.ts",
  },
  {
    id: "osfs.exhaust.light.rangeMeters",
    label: "Exhaust light range",
    description: "Maximum scene-light range from each visible engine. Larger ranges involve more nearby surfaces in lighting work.",
    unit: "m", kind: "number", step: 0.1, bounds: within(0, 100), default: 12,
    defaultReason: "Keep the provisional interaction near the aircraft and deck; this is a rendering limit rather than a physical radiation cutoff.",
    home: main(EXHAUST), appliesLive: true, source: "src/flight/aircraft/createEngineExhaust.ts",
  },
  {
    id: "osfs.exhaust.smoke.enabled",
    label: "Exhaust smoke",
    description: "Draws sparse smoke sprites for engines with a smoke profile; off releases the particle resources.",
    unit: "none", kind: "boolean", default: true,
    defaultReason: "A faint short trail complements the nozzle glow; appearance is an approximation, not a soot-emissions measurement.",
    home: main(EXHAUST_SMOKE), appliesLive: true, source: "src/flight/aircraft/createEngineSmoke.ts",
  },
  {
    id: "osfs.exhaust.smoke.maxParticles",
    label: "Smoke particle budget",
    description: "Maximum live smoke sprites per configured engine. This bounds geometry, history memory and particle update work.",
    unit: { id: "particles/engine", text: "particles/engine" }, kind: "number", step: 1,
    bounds: within(0, 512), default: 64,
    defaultReason: "A small fixed pool leaves room for short trails without an unbounded particle history.",
    home: main(EXHAUST_SMOKE), appliesLive: true, source: "src/flight/aircraft/createEngineSmoke.ts",
  },
  {
    id: "osfs.exhaust.smoke.emissionPerSecond",
    label: "Smoke emission",
    description: "Maximum emitted smoke sprites each simulated second per running configured engine.",
    unit: "per-s", kind: "number", step: 0.1, bounds: within(0, 128), default: 8,
    defaultReason: "Sparse emission keeps translucent overlap small at the default short lifetime.",
    home: main(EXHAUST_SMOKE), appliesLive: true, source: "src/flight/aircraft/createEngineSmoke.ts",
  },
  {
    id: "osfs.exhaust.smoke.lifetimeSeconds",
    label: "Smoke lifetime",
    description: "How long a smoke sprite remains in the world before returning to the fixed pool, in simulated seconds.",
    unit: "s", kind: "number", step: 0.1, bounds: within(0.1, 10), default: 2,
    defaultReason: "A short trail limits translucent screen coverage and keeps the main exhaust readable.",
    home: main(EXHAUST_SMOKE), appliesLive: true, source: "src/flight/aircraft/createEngineSmoke.ts",
  },
  {
    id: "osfs.exhaust.smoke.maxDistanceMeters",
    label: "Smoke draw distance",
    description: "Maximum camera distance at which engine smoke is emitted and drawn, in metres.",
    unit: "m", kind: "number", step: 1, bounds: within(1, 20_000), default: 1_000,
    defaultReason: "The sparse default smoke is intended for nearby aircraft views.",
    home: main(EXHAUST_SMOKE), appliesLive: true, source: "src/flight/aircraft/createEngineSmoke.ts",
  },
  {
    id: "osfs.exhaust.smoke.opacity",
    label: "Smoke opacity",
    description: "Peak per-sprite opacity before the engine profile and lifetime fade. Higher values make overlapping sprites more apparent.",
    unit: "ratio", kind: "number", step: 0.001, bounds: within(0, 1), default: 0.025,
    defaultReason: "Modern jet exhaust is not a dense rocket smoke trail; this is a restrained visual approximation.",
    home: main(EXHAUST_SMOKE), appliesLive: true, source: "src/flight/aircraft/createEngineSmoke.ts",
  },

  // Renderer → Instruments.
  {
    id: "osfs.renderer.attitudeIndicator",
    label: "Attitude indicator",
    description: "Which API draws the attitude indicator.",
    unit: "none",
    kind: "choice",
    choices: [
      { id: "auto", label: "Auto", description: "The GPU when the globe runs on WebGPU, Canvas 2D otherwise." },
      { id: "webgpu", label: "WebGPU", description: "On the globe's GPU device." },
      { id: "canvas2d", label: "Canvas 2D", description: "The browser rasterises its lines and text every frame, which costs more." },
    ],
    default: "auto",
    defaultReason: "Uses the GPU whenever the globe already has a WebGPU device to share.",
    home: main(INSTRUMENTS),
    appliesLive: true,
    source: "src/flight/hud/attitudeRenderer.ts",
  },
  {
    id: "osfs.renderer.attitudeView",
    label: "Attitude indicator view",
    description: "Where the attitude indicator looks from. Camera: the ball turns with the 3D view as the camera orbits, and the aircraft symbol moves to where the nose points and turns as the wings lie. Aircraft: the nose stays at the centre and the wings level, as on a cockpit instrument. The stick it also is moves the aircraft the same way in both.",
    unit: "none",
    kind: "choice",
    choices: [
      { id: "camera", label: "Camera", description: "The ball turns with the 3D view; the aircraft symbol shows the nose and the wings against it." },
      { id: "aircraft", label: "Aircraft", description: "The nose at the centre and the wings level, as the instrument always drew." },
    ],
    default: "camera",
    defaultReason: "The ball then agrees with the view on screen, so the aircraft symbol reads against what the pilot sees.",
    home: main(INSTRUMENTS),
    appliesLive: true,
    source: "src/flight/hud/attitudeIndicator.ts",
  },

  {
    id: "osfs.renderer.engineOrbs",
    label: "Engine shaft indicators",
    description: "The graphics API used for the rotating shaft dots; numeric engine readings remain visible when off.",
    unit: "none", kind: "choice",
    choices: [
      { id: "auto", label: "Auto", description: "Shared WebGPU device, then WebGL2, then WebGL1." },
      { id: "webgpu", label: "WebGPU", description: "Uses the shared device where available, with WebGL fallback." },
      { id: "webgl2", label: "WebGL2", description: "Uses WebGL2, falling back to WebGL1." },
      { id: "webgl1", label: "WebGL1", description: "Uses the basic WebGL backend." },
      { id: "off", label: "Off", description: "Static engine readings without an orb rendering context." },
    ],
    default: "auto", defaultReason: "Reuses the globe's GPU device when available.",
    home: main(INSTRUMENTS), appliesLive: true, source: "src/flight/hud/engineSpoolRenderer.ts",
  },

  // Aircraft → Camera.
  {
    id: "osfs.camera.orbitPitchLimits",
    label: "Orbit pitch limits",
    description: "How far below and above the aircraft the chase camera may orbit.",
    unit: "deg",
    kind: "range",
    step: 1,
    bounds: within(-89, 89),
    default: { min: -60, max: 81 },
    defaultReason: "The original limits, π/3 below and 0.45π above the aircraft's horizontal.",
    home: all(CAMERA),
    appliesLive: true,
    source: "src/flight/createFlightSimApp.ts",
  },
  {
    id: "osfs.camera.orbitReturnTime",
    label: "Orbit return time",
    description: "With Return behind aircraft on release, the time constant of the camera's return to its resting place.",
    unit: "s",
    kind: "number",
    step: 0.05,
    bounds: within(0.05, 5),
    default: 0.45,
    defaultReason: "The original value: about 95% of the way back in 1.35 s.",
    home: all(CAMERA),
    appliesLive: true,
    source: "src/flight/createFlightSimApp.ts",
  },
  {
    id: "osfs.camera.orbitRestoreYaw",
    label: "Resting orbit heading",
    description: "Where the chase camera returns to, measured from straight behind the aircraft; positive is to the right.",
    unit: "deg",
    kind: "number",
    step: 1,
    bounds: within(-180, 180),
    default: 0,
    defaultReason: "Straight behind, where the chase camera starts.",
    home: all(CAMERA),
    appliesLive: true,
    source: "src/flight/createFlightSimApp.ts",
  },
  {
    id: "osfs.camera.chaseDistance",
    label: "Chase distance",
    description: "How far behind the aircraft the chase camera starts.",
    unit: "m",
    kind: "number",
    step: 0.5,
    bounds: within(4, 200),
    default: 14,
    defaultReason: "The original chase offset.",
    home: all(CAMERA),
    appliesLive: false,
    source: "src/flight/aircraft/createPlaceholderAircraft.ts",
  },
  {
    id: "osfs.camera.chaseHeight",
    label: "Chase height",
    description: "How far above the aircraft the chase camera starts; with the distance it sets the resting orbit pitch.",
    unit: "m",
    kind: "number",
    step: 0.1,
    bounds: within(-20, 50),
    default: 2.2,
    defaultReason: "The original chase offset.",
    home: all(CAMERA),
    appliesLive: false,
    source: "src/flight/aircraft/createPlaceholderAircraft.ts",
  },
  {
    id: "osfs.camera.chaseZoomLimits",
    label: "Chase zoom limits",
    description: "How close and how far the chase camera may zoom.",
    unit: "m",
    kind: "range",
    scale: "log2",
    step: 0.1,
    bounds: within(2, 5_000),
    default: { min: 8, max: 500 },
    defaultReason: "The original limits.",
    home: all(CAMERA),
    appliesLive: true,
    source: "src/flight/aircraft/createPlaceholderAircraft.ts",
  },
  {
    id: "osfs.camera.nearClipMeters",
    label: "Camera near clip",
    description: "The closest distance either flight camera draws. A small distance keeps the F-35B cockpit panel visible; larger distances reduce depth precision artifacts in distant scenery.",
    unit: "m",
    kind: "number",
    step: 0.01,
    bounds: within(0.01, 2),
    default: 0.05,
    defaultReason: "Five centimetres keeps nearby cockpit geometry visible.",
    home: all(CAMERA),
    appliesLive: true,
    source: "src/flight/aircraft/createPlaceholderAircraft.ts",
  },
  {
    id: "osfs.camera.fieldOfView",
    label: "Field of view",
    description: "The vertical field of view of the cockpit and chase cameras; wider shows and loads more.",
    unit: "deg",
    kind: "number",
    step: 1,
    bounds: within(20, 120),
    default: 1.05 * 180 / Math.PI,
    defaultReason: "1.05 rad, the original field of view of both flight cameras.",
    home: all(CAMERA),
    appliesLive: true,
    source: "src/flight/aircraft/createPlaceholderAircraft.ts",
  },
  {
    id: "osfs.camera.gamepadOrbitYawRate",
    label: "Gamepad orbit yaw rate",
    description: "How fast a fully deflected camera stick turns the chase camera around the aircraft.",
    unit: "deg/s",
    kind: "number",
    step: 1,
    bounds: within(10, 720),
    default: 1.5 * 180 / Math.PI,
    defaultReason: "The original 1.5 rad/s: a full turn in about four seconds.",
    home: all(CAMERA),
    appliesLive: true,
    source: "src/flight/createFlightSimApp.ts",
  },
  {
    id: "osfs.camera.gamepadOrbitPitchRate",
    label: "Gamepad orbit pitch rate",
    description: "How fast a fully deflected camera stick moves the chase camera above or below the aircraft.",
    unit: "deg/s",
    kind: "number",
    step: 1,
    bounds: within(10, 720),
    default: 1.15 * 180 / Math.PI,
    defaultReason: "The original 1.15 rad/s.",
    home: all(CAMERA),
    appliesLive: true,
    source: "src/flight/createFlightSimApp.ts",
  },

  {
    id: "osfs.camera.chaseFrame",
    label: "Chase camera turns with",
    description: "Which of the aircraft's rotations every chase view follows.",
    unit: "none",
    kind: "choice",
    choices: [
      { id: "attitude", label: "Roll, pitch and heading" },
      { id: "no-roll", label: "Pitch and heading", description: "Wings level." },
      { id: "heading", label: "Heading only", description: "Horizon level." },
    ],
    default: "attitude",
    defaultReason: "The original chase camera, which rides on the aircraft.",
    home: main(CAMERA),
    appliesLive: true,
    source: "src/flight/createFlightSimApp.ts",
  },

  // Remote Control → Who flies: how control passes between a paired phone and
  // this computer. Spec: docs/proposals/phone-controller.md → Sharing the controls.
  {
    id: "osfs.remote.sharing",
    label: "Sharing the controls",
    description: "Whether one device flies at a time, or a phone that has taken control flies together with this computer.",
    unit: "none",
    kind: "choice",
    choices: [
      { id: "exclusive", label: "One device at a time", description: "Only the device with control moves the aircraft. Control changes hands says when it passes." },
      { id: "blend", label: "Blend both", description: "Both devices fly at once. Where both move a control, Blend priority wins and the other has what it leaves free; a lever goes where it was last moved." },
    ],
    default: "exclusive",
    defaultReason: "One pilot at a time, as the controller was designed; blending is for two pilots who mean to share.",
    home: main(REMOTE_CONTROL),
    appliesLive: true,
    source: "src/flight/remote/createPhoneControlSession.ts",
  },
  {
    id: "osfs.remote.blendPriority",
    label: "Blend priority",
    description: "With Blend both: whose input wins where both devices move the same control. Full deflection on that device is all of the control.",
    unit: "none",
    kind: "choice",
    choices: [
      { id: "phone", label: "Phone", description: "The phone's input wins; this computer's fills in around it." },
      { id: "computer", label: "This computer", description: "This computer's input wins, as an instructor's would; the phone's fills in around it." },
    ],
    default: "phone",
    defaultReason: "The phone is the remote being flown; this computer's input fills in around it.",
    home: main(REMOTE_CONTROL),
    appliesLive: true,
    source: "src/flight/remote/controlBlend.ts",
  },
  {
    id: "osfs.remote.handover",
    label: "Control changes hands",
    description: "Which device flies when both the phone and this computer could. Take control in this tab always takes it here on purpose.",
    unit: "none",
    kind: "choice",
    choices: [
      { id: "auto", label: "Automatically", description: "Flight input here takes control. It goes back to the phone as soon as these controls rest, this tab is showing and the phone is heard from." },
      { id: "stay", label: "Only when taken", description: "Whichever device has control keeps it until the other takes it: flight input here, or Take control on the phone." },
      { id: "phone", label: "Latched to the phone", description: "The phone flies whenever it is heard from. Flight input here does not take control from it." },
      { id: "computer", label: "Latched to this computer", description: "This computer flies. The phone cannot take control." },
    ],
    default: "auto",
    defaultReason: "A remote that has to be taken back by hand after every stray key, hidden tab or dropped frame cannot be flown.",
    home: main(REMOTE_CONTROL),
    appliesLive: true,
    source: "src/flight/remote/createPhoneControlSession.ts",
  },
  {
    id: "osfs.remote.returnIdle",
    label: "Rest before returning",
    description: "With Automatically: how long this computer's flight controls must rest before control goes back to the phone.",
    unit: "s",
    kind: "number",
    step: 0.1,
    bounds: within(0, 10),
    default: 1,
    defaultReason: "Long enough that keys tapped here keep control between taps; short enough that a stray touch hands it straight back.",
    home: main(REMOTE_CONTROL),
    appliesLive: true,
    source: "src/flight/remote/createPhoneControlSession.ts",
  },
  {
    id: "osfs.remote.holdLast",
    label: "Hold the phone's last command",
    description: "When the phone's input stops arriving, how long its last command stands — a held starter, stick or brake stays held — before they let go and control comes back here. This computer stalling does not count.",
    unit: "s",
    kind: "number",
    step: 0.1,
    bounds: within(0, 10),
    default: 2,
    defaultReason: "Rides out a Wi-Fi stall or a busy phone, so an engine start or a turn carries on through it; short enough that a phone that is really gone does not fly a deflected stick for long.",
    home: main(REMOTE_CONTROL),
    appliesLive: true,
    source: "src/flight/remote/createPhoneControlSession.ts",
  },

  // Remote Control → Phone camera trackpad: an A/B of how a phone's swipe
  // reaches the view. The costs quoted are from docs/phone-controller.md.
  {
    id: "osfs.camera.phone.send",
    label: "Phone sends",
    description: "When the phone sends a control frame. A phone that loaded before this setting existed needs a fresh QR.",
    unit: "none",
    kind: "choice",
    choices: [
      { id: "timer", label: "On each touch, and a 60 Hz timer", description: "At most 120 a second; the original." },
      { id: "batch", label: "Once per touch frame", description: "About 10–17 ms sooner, and steadier." },
    ],
    default: "timer",
    defaultReason: "The original behaviour, so nothing changes until a pilot compares.",
    home: main(PHONE_CAMERA),
    appliesLive: true,
    source: "src/flight/remote/createPhoneControlSession.ts",
  },
  {
    id: "osfs.camera.phone.source",
    label: "Lost or late frames",
    description: "Whether a lost frame's movement is lost, or recovered from the gesture's running total.",
    unit: "none",
    kind: "choice",
    choices: [
      { id: "delta", label: "Lose their movement", description: "The original." },
      { id: "total", label: "Recover it from the running total", description: "No delay." },
    ],
    default: "delta",
    defaultReason: "The original behaviour, so nothing changes until a pilot compares.",
    home: main(PHONE_CAMERA),
    appliesLive: true,
    source: "src/flight/remote/phoneCameraPlayout.ts",
  },
  {
    id: "osfs.camera.phone.present",
    label: "Draw movement",
    description: "Whether arrived movement is drawn at once, or paced on the phone's own timeline.",
    unit: "none",
    kind: "choice",
    choices: [
      { id: "arrival", label: "As soon as it arrives", description: "The original." },
      { id: "playout", label: "Paced on the phone's timeline", description: "Adds the playout buffer, and smooths stalls." },
    ],
    default: "arrival",
    defaultReason: "The original behaviour, so nothing changes until a pilot compares.",
    home: main(PHONE_CAMERA),
    appliesLive: true,
    source: "src/flight/remote/phoneCameraPlayout.ts",
  },
  {
    id: "osfs.camera.phone.bufferMs",
    label: "Playout buffer",
    description: "With paced drawing, how far behind the fastest delivery seen movement is drawn; 0 only smooths stalls.",
    unit: "ms",
    kind: "number",
    step: 1,
    bounds: within(0, 100),
    default: 12,
    defaultReason: "The measured recommendation; 16 ms is smooth on a 120 Hz display.",
    home: main(PHONE_CAMERA),
    appliesLive: true,
    source: "src/flight/remote/phoneCameraPlayout.ts",
  },
  {
    id: "osfs.camera.phone.catchUp",
    label: "Catch-up speed",
    description: "With paced drawing, the fastest a backlog is drawn after a stall, as a multiple of real speed.",
    unit: "ratio",
    kind: "number",
    step: 0.1,
    bounds: within(1, 8),
    named: [{ id: "jump", label: "Jump", description: "Draw the whole backlog at once, as arrival does." }],
    default: 2,
    defaultReason: "The measured recommendation.",
    home: main(PHONE_CAMERA),
    appliesLive: true,
    source: "src/flight/remote/phoneCameraPlayout.ts",
  },
  {
    id: "osfs.camera.phone.predictMs",
    label: "Predict ahead",
    description: "With paced drawing, how far past the newest touch to extrapolate; it overshoots when the finger stops.",
    unit: "ms",
    kind: "number",
    step: 1,
    bounds: within(0, 50),
    default: 0,
    defaultReason: "Off: prediction guesses, and overshoots when the finger stops.",
    home: main(PHONE_CAMERA),
    appliesLive: true,
    source: "src/flight/remote/phoneCameraPlayout.ts",
  },

  // Aircraft → Start.
  {
    id: "osfs.start.latitude",
    label: "Start latitude",
    description: "Where a new flight starts, north of the equator.",
    unit: "deg",
    kind: "number",
    step: 0.0001,
    bounds: within(-90, 90),
    default: 44.977753,
    defaultReason: "Minneapolis, the original start.",
    home: all(START),
    appliesLive: false,
    source: "src/flight/jsbsim/bootstrapC172.ts",
  },
  {
    id: "osfs.start.longitude",
    label: "Start longitude",
    description: "Where a new flight starts, east of Greenwich.",
    unit: "deg",
    kind: "number",
    step: 0.0001,
    bounds: within(-180, 180),
    default: -93.265011,
    defaultReason: "Minneapolis, the original start.",
    home: all(START),
    appliesLive: false,
    source: "src/flight/jsbsim/bootstrapC172.ts",
  },
  {
    id: "osfs.start.heightAboveGround",
    label: "Start height",
    description: "How far above the loaded ground a new flight starts.",
    unit: "m",
    kind: "number",
    step: 10,
    bounds: within(0, 15_000),
    default: 1_524,
    defaultReason: "5,000 ft, the original start height.",
    home: all(START),
    appliesLive: false,
    source: "src/flight/jsbsim/bootstrapC172.ts",
  },
  {
    id: "osfs.start.heading",
    label: "Start heading",
    description: "The true heading a new flight starts on.",
    unit: "deg",
    kind: "number",
    step: 1,
    bounds: within(0, 360),
    default: 300,
    defaultReason: "The original start heading.",
    home: all(START),
    appliesLive: false,
    source: "src/flight/jsbsim/bootstrapC172.ts",
  },
  {
    id: "osfs.start.airspeed",
    label: "Start airspeed",
    description: "The calibrated airspeed a new flight starts at.",
    unit: KNOTS,
    kind: "number",
    step: 1,
    bounds: within(0, 400),
    default: 120,
    defaultReason: "The original start airspeed.",
    home: all(START),
    appliesLive: false,
    source: "src/flight/jsbsim/bootstrapC172.ts",
  },
  {
    id: "osfs.start.throttle",
    label: "Start throttle",
    description: "The throttle a new flight starts with.",
    unit: "fraction",
    kind: "number",
    step: 0.01,
    bounds: within(0, 1),
    default: 0.65,
    defaultReason: "The Cessna 172 profile's start throttle; each aircraft sets its own when it loads (the SF50's is 0.35).",
    home: all(START),
    appliesLive: false,
    source: "src/flight/jsbsim/bootstrapC172.ts",
  },
  {
    id: "osfs.start.resume",
    label: "Resume last flight",
    description: "A new session carries on from the last saved flight: its place, attitude, speed, controls, fuel and pause. Off, or when the page address gives a start position, flights start at the start position.",
    unit: "none",
    kind: "boolean",
    default: true,
    defaultReason: "Reloading the page or changing aircraft should not undo the flight in progress.",
    home: main(START),
    appliesLive: false,
    source: "src/flight/jsbsim/savedFlight.ts",
  },
  {
    id: "osfs.start.saveInterval",
    label: "Save the flight every",
    description: "How often the flight in progress is saved for the next session while it runs. Pausing, and leaving or hiding the page, save it too.",
    unit: "s",
    kind: "number",
    step: 1,
    bounds: within(1, 600),
    default: 5,
    defaultReason: "A browser that crashes loses at most 5 s of flight, for one write of about 2 KB to browser storage each time.",
    home: all(START),
    appliesLive: true,
    source: "src/flight/createFlightSimApp.ts",
  },

  // Aircraft → Assists.
  {
    id: "osfs.assist.autoFlaps",
    label: "Auto flaps",
    description: "Uses the aircraft's automatic flap controls, or a speed-based pilot assist where none is fitted. Moving a flap control takes over manually.",
    unit: "none",
    kind: "boolean",
    default: true,
    defaultReason: "Automatic flaps on every aircraft by default; the HUD Auto button edits this same setting.",
    home: main(ASSISTS),
    appliesLive: true,
    source: "src/flight/input/autoFlaps.ts",
  },
  {
    id: "osfs.assist.autoTrim",
    label: "Auto pitch trim",
    description: "Moves pitch trim to cancel the elevator force the pilot is holding.",
    unit: "none",
    kind: "boolean",
    default: true,
    defaultReason: "On, as it has been since the assist was added.",
    home: main(ASSISTS),
    appliesLive: true,
    source: "src/flight/input/autoTrim.ts",
  },
  {
    id: "osfs.assist.autoRollTrim",
    label: "Auto roll trim",
    description: "Moves roll trim to cancel the aileron force the pilot is holding. Waits while the F-35B's fly-by-wire holds bank itself.",
    unit: "none",
    kind: "boolean",
    default: true,
    defaultReason: "On, as it has been since the assist was added.",
    home: main(ASSISTS),
    appliesLive: true,
    source: "src/flight/input/autoTrim.ts",
  },
  {
    id: "osfs.assist.trimMaxRate",
    label: "Trim rate",
    description: "The fastest the auto trim moves, in full trim travel per second.",
    unit: "per-s",
    kind: "number",
    step: 0.01,
    bounds: within(0.01, 2),
    default: 0.35,
    defaultReason: "The original value: full-scale trim travel in about three seconds.",
    home: all(ASSISTS),
    appliesLive: true,
    source: "src/flight/input/autoTrim.ts",
  },
  {
    id: "osfs.assist.trimDeadband",
    label: "Trim deadband",
    description: "The auto trim leaves a leftover angular acceleration smaller than this alone.",
    unit: RADIANS_PER_SECOND_SQUARED,
    kind: "number",
    step: 0.005,
    bounds: within(0, 0.5),
    default: 0.04,
    defaultReason: "The original value.",
    home: all(ASSISTS),
    appliesLive: true,
    source: "src/flight/input/autoTrim.ts",
  },
  {
    id: "osfs.assist.trimFilter",
    label: "Trim filter",
    description: "The time constant that smooths the leftover acceleration the auto trim cancels.",
    unit: "s",
    kind: "number",
    step: 0.01,
    bounds: within(0.01, 2),
    default: 0.08,
    defaultReason: "The original value.",
    home: all(ASSISTS),
    appliesLive: true,
    source: "src/flight/input/autoTrim.ts",
  },
  {
    id: "osfs.assist.trimGain",
    label: "Trim gain",
    description: "The fraction of the leftover angular acceleration the auto trim cancels per second, before the rate limit.",
    unit: "per-s",
    kind: "number",
    step: 0.05,
    bounds: within(0.05, 10),
    default: 1.25,
    defaultReason: "The original value.",
    home: all(ASSISTS),
    appliesLive: true,
    source: "src/flight/input/autoTrim.ts",
  },
  {
    id: "osfs.assist.trimAuthority",
    label: "Trim authority",
    description: "The dynamic pressure at which the auto trim reaches full authority; below it, its corrections shrink in proportion.",
    unit: PSF,
    kind: "number",
    step: 1,
    bounds: within(1, 200),
    default: 20,
    defaultReason: "The original value, about 77 kt at sea level.",
    home: all(ASSISTS),
    appliesLive: true,
    source: "src/flight/input/autoTrim.ts",
  },
  {
    id: "osfs.assist.trimMinAirspeed",
    label: "Trim damping airspeed floor",
    description: "The lowest true airspeed the auto trim assumes when it estimates aerodynamic damping, so the estimate stays bounded at low speed.",
    unit: FEET_PER_SECOND,
    kind: "number",
    step: 1,
    bounds: within(0, 400),
    default: 80,
    defaultReason: "The original value, about 47 kt.",
    home: all(ASSISTS),
    appliesLive: true,
    source: "src/flight/input/autoTrim.ts",
  },

  // Autopilot: what the HUD's AP button engages.
  {
    id: "osfs.autopilot.backend",
    label: "Autopilot backend",
    description: "Which autopilot flies the automated axes: the one built in, or ArduPilot when it is connected.",
    unit: "none",
    kind: "choice",
    choices: [
      { id: "ours", label: "Built in" },
      { id: "ardupilot", label: "ArduPilot" },
    ],
    default: "ours",
    defaultReason: "The built-in autopilot needs nothing else running.",
    home: main(AUTOPILOT),
    appliesLive: true,
    source: "src/flight/autopilot/controlArbiter.ts",
  },
  autopilotAxis("roll", "Roll", "Stabilizes bank with the ailerons."),
  autopilotAxis("pitch", "Pitch", "Holds pitch attitude with the elevator."),
  autopilotAxis("yaw", "Yaw / rudder", "Yaw damper and heading hold with the rudder."),
  autopilotAxis("throttle", "Throttle", "Auto-throttle using the throttle behaviour."),
  autopilotAxis("gear", "Landing gear", "Holds the gear lever while the autopilot is engaged."),
  autopilotAxis("flaps", "Flaps", "Holds flap position while the autopilot is engaged."),
  {
    id: "osfs.autopilot.throttleMode",
    label: "Throttle behaviour",
    description: "Airspeed holds the speed at engagement with the throttle; Hold keeps the lever where it was.",
    unit: "none",
    kind: "choice",
    choices: [
      { id: "airspeed", label: "Hold airspeed" },
      { id: "hold", label: "Hold lever" },
    ],
    default: "airspeed",
    defaultReason: "The original behaviour.",
    home: main(AUTOPILOT),
    appliesLive: true,
    source: "src/flight/autopilot/ourAutopilot.ts",
  },
  {
    id: "osfs.autopilot.stickOverride",
    label: "Stick override",
    description: "The autopilot yields roll, pitch or yaw while the pilot deflects that control further than this, and recaptures the attitude on release.",
    unit: "fraction",
    kind: "number",
    step: 0.01,
    bounds: within(0.01, 0.5),
    default: 0.05,
    defaultReason: "The original value.",
    home: all(AUTOPILOT),
    appliesLive: true,
    source: "src/flight/autopilot/ourAutopilot.ts",
  },

  // Aircraft → Ground handling.
  {
    id: "osfs.ground.arcadeLaunches",
    label: "Arcade ground launches",
    description: "Exaggerated bounces: with this off, deep ground impacts stop the flight before the gear springs can launch it.",
    unit: "none",
    kind: "boolean",
    default: false,
    defaultReason: "Off, as before: a deep impact ends the flight.",
    home: main(GROUND),
    appliesLive: true,
    source: "src/flight/physics/fixedStepLoop.ts",
  },

  // Sound: the tiers are separate synthesis engines, so the tier is a choice
  // (docs/sound.md). A stored preference never restores louder sound than the
  // pilot last heard, and a downgrade persists until an explicit re-test.
  {
    id: "osfs.sound.enabled",
    label: "Sound",
    description: "The master switch: off releases the sound engine and silences the engine and tyres.",
    unit: "none",
    kind: "boolean",
    default: true,
    defaultReason: "Sound is on by default at the pilot's request; a normal interaction unlocks browser audio, and an explicit saved off preference is respected.",
    home: main(SOUND),
    appliesLive: true,
    source: "src/flight/audio/createFlightAudio.ts",
  },
  {
    id: "osfs.sound.quality",
    label: "Sound tier",
    description: "Which synthesis engine runs; Auto chooses the highest supported tier, with live overload fallback and editable resource limits.",
    unit: "none",
    kind: "choice",
    choices: [
      { id: "off", label: "Off" },
      { id: "low", label: "Low", description: "Procedural, light." },
      { id: "med", label: "Med", description: "Procedural, with a cabin impulse response." },
      { id: "high", label: "High", description: "Procedural engine spectra and directionality." },
      { id: "auto", label: "Auto" },
    ],
    default: "med",
    defaultReason: "Med is the pilot's chosen default; Low, Med and High have been accepted in listening tests.",
    home: main(SOUND),
    appliesLive: true,
    source: "src/flight/audio/audioQuality.ts",
  },
  soundVolume("masterVolume", "Master volume", "Scales the flight sound mix up to eight times the previous master maximum, before output limiting.", 2,
    "Twice the previous master maximum, chosen by the pilot after testing all volume sliders at maximum.", 8),
  soundVolume("engineVolume", "Engine volume", "Scales the engine and its afterburner sound, independently of the airframe, up to eight times its original level.", 0.8,
    "The original level is preserved; extra headroom is available for a quiet engine.", 8),
  soundVolume("afterburnerVolume", "Afterburner volume", "Scales the combustion-driven afterburner roar and its spectrum changes. Zero removes those additions; native thrust, shaft speed and fuel can still change the underlying engine sound.", 0.5,
    "Retain the pilot's preferred 50% control value; the combustion-driven sound contribution remains uncalibrated."),
  soundVolume("airframeVolume", "Airframe volume", "Scales wind and gear and flap turbulence, independently of the engine.", 0.6),
  {
    id: "osfs.sound.listenerCockpitBlend",
    label: "Sound position",
    description: "Blends the acoustic viewpoint from Camera (0) to Cockpit (1), including listener position, motion and cabin/exterior treatment. Intermediate viewpoints are artistic.",
    unit: "fraction",
    kind: "number",
    step: 0.01,
    bounds: within(0, 1),
    default: 1,
    defaultReason: "Cockpit sound stays at the pilot even when the visual camera moves outside the aircraft.",
    home: main(SOUND),
    appliesLive: true,
    source: "src/flight/audio/audioPose.ts",
  },
  {
    id: "osfs.sound.engineMuted",
    label: "Mute engine",
    description: "Silences the engine and keeps the airframe and tyres.",
    unit: "none",
    kind: "boolean",
    default: false,
    defaultReason: "The engine is heard.",
    home: main(SOUND),
    appliesLive: true,
    source: "src/flight/audio/createFlightAudio.ts",
  },
  {
    id: "osfs.sound.reducedDynamicRange",
    label: "Reduced dynamic range",
    description: "Narrows the difference between loud and quiet sounds.",
    unit: "none",
    kind: "boolean",
    default: false,
    defaultReason: "The full range the synthesis produces.",
    home: main(SOUND),
    appliesLive: true,
    source: "src/flight/audio/createFlightAudio.ts",
  },
  {
    id: "osfs.sound.downgradedFrom",
    label: "Downgraded from",
    description: "Set when a fallback dropped the tier, recording what was asked for; cleared only by Re-test.",
    unit: "none",
    kind: "choice",
    choices: [
      { id: "none", label: "Not downgraded" },
      { id: "off", label: "Off" },
      { id: "low", label: "Low" },
      { id: "med", label: "Med" },
      { id: "high", label: "High" },
      { id: "auto", label: "Auto" },
    ],
    default: "none",
    defaultReason: "Nothing has been dropped yet.",
    home: all(SOUND),
    appliesLive: true,
    source: "src/flight/audio/createFlightAudio.ts",
  },

  // Sound → what each tier may use at most. The caps are the tier budgets of
  // sound.md §1; these can only lower them, and shedding under load works
  // down from here.
  soundLimit("low", "partials", "Low: engine oscillators", "How many engine partials Low synthesises; the N1 and N2 fundamentals come first.", "count", 2, 4, 1),
  soundLimit("low", "noiseBands", "Low: noise sources", "How many engine and airframe noise bands Low synthesises, excluding the separate tire source.", "count", 0, 5, 1),
  soundLimit("med", "partials", "Med: engine oscillators", "How many engine partials Med synthesises; the N1 and N2 fundamentals come first.", "count", 2, 12, 1),
  soundLimit("med", "noiseBands", "Med: noise sources", "How many engine and airframe noise bands Med synthesises, excluding the separate tire source.", "count", 0, 6, 1),
  soundLimit("med", "irMs", "Med: cabin impulse response", "The length of the cabin and airframe colouring Med convolves with.", "ms", 0, 20, 1),
  soundLimit("high", "partials", "High: engine oscillators", "How many engine partials High synthesises; the N1 and N2 fundamentals come first.", "count", 2, 12, 1),
  soundLimit("high", "noiseBands", "High: noise sources", "How many engine and airframe noise bands High synthesises, excluding the separate tire source.", "count", 0, 8, 1),
  soundLimit("high", "irMs", "High: cabin impulse response", "The length of the cabin and airframe colouring High convolves with.", "ms", 0, 40, 1),

  // Engine.
  {
    id: "osfs.engineTest.zoomLimits", label: "Test stand zoom limits",
    description: "The nearest and farthest inspection camera distances from the isolated engine assembly.",
    unit: "m", kind: "range", scale: "log2", step: 0.1, bounds: within(0.2, 1000), default: { min: 1, max: 100 },
    defaultReason: "The isolated nozzle can be inspected much closer than the full aircraft.",
    home: main(ENGINE_TEST), appliesLive: true, source: "src/flight/aircraft/createPlaceholderAircraft.ts",
  },
  {
    id: "osfs.engineTest.viewDistanceMeters", label: "Test stand starting view distance",
    description: "Initial camera distance from the isolated engine geometry when opening the test stand. Normal orbit and zoom controls remain available.",
    unit: { id: "m", text: "m" }, kind: "number", step: 0.1, bounds: within(1, 100), default: 6,
    defaultReason: "Six metres frames the nozzle and its exhaust for inspection.",
    home: main(ENGINE_TEST), appliesLive: false, source: "src/flight/createFlightSimApp.ts",
  },
  {
    id: "osfs.engineMonitor.historySeconds", label: "Engine history window",
    description: "Simulation time retained for the Engine tab's plots and CSV export. The buffer is bounded by this window and the sampling rate; resetting simulation time starts a new history.",
    unit: { id: "s", text: "s" }, kind: "number", step: 1, bounds: within(1, 600), default: 60,
    defaultReason: "One minute shows spool transients while bounding diagnostic memory.",
    home: main(ENGINE_HISTORY), appliesLive: true, source: "src/flight/hud/engineHistory.ts",
  },
  {
    id: "osfs.engineMonitor.historyHz", label: "Engine history sampling ceiling",
    description: "Maximum samples per simulated second, limited by available model updates. Zero clears and disables history. Hidden plots do not draw; pause adds no samples.",
    unit: { id: "Hz", text: "Hz" }, kind: "number", step: 0.5, bounds: within(0, 30), default: 5,
    defaultReason: "Five samples per second resolve slow spool and thermal trends with a small buffer. These plots do not measure combustion or acoustic oscillations.",
    home: main(ENGINE_HISTORY), appliesLive: true, source: "src/flight/hud/engineHistory.ts",
  },
  {
    id: "osfs.engineMonitor.thermalHistory", label: "Record solid heat balances",
    description: "Add available native per-solid heat rates, bath temperatures and timestep energy receipts to plots and CSV. Changing the recorded columns clears the history. Display samples cannot reconstruct every fixed-step energy transfer.",
    unit: "none", kind: "boolean", default: false,
    defaultReason: "Keep ordinary history compact; enable the additional series when diagnosing native heating. The live values remain in Solid heat balances.",
    home: main(ENGINE_HISTORY), appliesLive: true, source: "src/flight/hud/engineHistory.ts",
  },
  {
    id: "osfs.engineMonitor.fuelFlowUnit",
    label: "Fuel flow unit",
    description: "The unit the HUD engine line and the Engine tab show fuel flow in; clicking the HUD's fuel flow switches it.",
    unit: "none",
    kind: "choice",
    choices: [
      { id: "lb/h", label: "lb/h", description: "Pounds per hour." },
      { id: "gal/h", label: "gal/h", description: "US gallons per hour." },
    ],
    default: "lb/h",
    defaultReason: "The original unit.",
    home: main(ENGINE),
    appliesLive: true,
    source: "src/flight/hud/engineMonitor.ts",
  },

  {
    id: "osfs.engineMonitor.orbFps", label: "Shaft animation FPS ceiling",
    description: "Shaft dots follow this screen's animation frames up to this ceiling, independently of globe drawing and numeric readouts. Zero disables their renderer. Hidden, paused and unchanged indicators do not draw.",
    unit: { id: "frames/s", text: "frames/s" }, kind: "number", step: 1, bounds: within(0, 1000), default: 1000,
    defaultReason: "A high ceiling lets the browser use the screen's refresh cadence, including 60, 120, 144 and 240 Hz. It does not request 1000 frames/s from the browser; lower it to spend less GPU work.",
    home: main(ENGINE), appliesLive: true, source: "src/flight/hud/engineSpoolRenderer.ts",
  },
  {
    id: "osfs.engineMonitor.orbTurnsPerSecond", label: "Maximum displayed shaft speed",
    description: "Requested upper limit in visual revolutions per simulated second at maximum modeled speed. Both shafts share a scale limited by this client's actual drawing cadence and the hotspot pattern step limit; the Engine tab shows the effective speed and reason. This is a scaled speed cue, not real turbine RPM.",
    unit: { id: "rev/s", text: "rev/s" }, kind: "number", step: 0.05, bounds: within(0, 4), default: 2,
    defaultReason: "A two-revolution ceiling makes high engine speed visibly fast; the pattern step limit protects the two rotating hotspots when the client draws too slowly to show that speed.",
    home: main(ENGINE), appliesLive: true, source: "src/flight/hud/engineSpoolMotion.ts",
  },
  {
    id: "osfs.engineMonitor.orbMaxPatternStep", label: "Maximum hotspot pattern step per frame",
    description: "Maximum advance of the two-hotspot pattern per actual drawn frame, in pattern pitches. One pitch is half a revolution. Both shafts share the resulting speed scale. Staying below half a pitch preserves the hotspot cue's forward direction between submitted frames; individual blades may still alias. The Engine tab shows the effective limit.",
    unit: { id: "pattern pitches/frame", text: "pattern pitches/frame" }, kind: "number", step: 0.01, bounds: within(0.05, 0.49), default: DEFAULT_MAX_PATTERN_STEP,
    defaultReason: "A 0.45-pitch limit uses most of the available hotspot motion range while leaving a margin below the ambiguous half-pitch boundary.",
    home: main(ENGINE), appliesLive: true, source: "src/flight/hud/engineSpoolMotion.ts",
  },
  {
    id: "osfs.engineMonitor.orbPixelRatio", label: "Shaft indicator resolution",
    description: "Maximum drawing pixels per CSS pixel for the shaft dots, capped by the display's pixel density. More pixels increase GPU work and memory.",
    unit: { id: "px/CSSpx", text: "px/CSSpx" }, kind: "number", step: 0.1, bounds: within(1, 3), default: 2,
    defaultReason: "A two-times density cap keeps the small dots clear with a small drawing surface.",
    home: main(ENGINE), appliesLive: true, source: "src/flight/hud/engineSpoolRenderer.ts",
  },

  // Aircraft → Ground handling: requests; what runs is resolved against what
  // is implemented, and reported beside each choice.
  {
    id: "osfs.ground.selection",
    label: "Ground interaction selection",
    description: "Auto substitutes a cheaper implemented choice when a request cannot run, never during a landing; Manual leaves it inactive.",
    unit: "none",
    kind: "choice",
    choices: [
      { id: "auto", label: "Auto within my choices" },
      { id: "manual", label: "Manual" },
    ],
    default: DEFAULT_GROUND_INTERACTION_SETTINGS.selection,
    defaultReason: "Nothing runs that the pilot did not choose.",
    home: all(GROUND),
    appliesLive: true,
    source: "src/flight/settings/groundInteractionSettings.ts",
  },
  groundChoice("rotation", "How the wheels spin up and roll; applies when paused or reset."),
  groundChoice("forceModel", "Which model computes the forces between wheels and ground; applies when paused or reset."),
  groundChoice("contactModel", "Where each wheel meets the ground; applies when paused or reset."),
  groundChoice("backend", "Where ground interaction is computed; applies when paused or reset."),
  groundChoice("tireAudio", "Which tyre sounds play."),
  groundChoice("haptics", "Which ground events vibrate a gamepad or phone."),
  groundChoice("wheelVisuals", "Whether the aircraft's wheel meshes turn."),
  groundLevel("tireAudioVolume", "Tire audio volume", "Scales the tyre sounds.", DEFAULT_GROUND_INTERACTION_SETTINGS.tireAudioVolume),
  groundLevel("hapticStrength", "Haptic strength", "Scales every ground vibration.", DEFAULT_GROUND_INTERACTION_SETTINGS.hapticStrength),
  ...GROUND_LOCKABLE_KEYS.map(groundLock),

  {
    id: "osfs.aircraft.stovlConversion",
    label: "STOVL conversion",
    description: "F-35B only: 0% is conventional flight; 100% opens the lift fan and turns the rear nozzle downward. Conversion takes time. Throttle controls lift; the stick and rudder control attitude. Experimental flight model.",
    unit: "fraction",
    kind: "number",
    step: 0.01,
    bounds: within(0, 1),
    default: 0,
    defaultReason: "Start in conventional flight with the lift fan closed.",
    home: all(STOVL),
    appliesLive: true,
    source: "src/flight/input/applyFlightControls.ts",
  },

  {
    id: "osfs.aircraft.controlLaw",
    label: "Aircraft control law",
    description: "Auto uses the aircraft's default law. Manual sends stick, rudder and trim through the actuators without aircraft stabilization. Fly-by-wire enables the aircraft's native stabilization. Available on the F-35B; autopilot and input assists have their own settings.",
    unit: "none",
    kind: "choice",
    choices: [
      { id: "auto", label: "Auto" },
      { id: "manual", label: "Manual" },
      { id: "fly-by-wire", label: "Fly-by-wire" },
    ],
    default: "auto",
    defaultReason: "Use each aircraft's standard control law; the F-35B defaults to fly-by-wire.",
    home: main(FLIGHT_CONTROLS),
    appliesLive: true,
    source: "src/flight/input/applyFlightControls.ts",
  },
  {
    id: "osfs.aircraft.fullStickRollRate",
    label: "Full-stick roll rate",
    description: "F-35B fly-by-wire: the roll rate full stick asks for, and half stick half of it. The jet flies it to within about 10% between 200 and 600 kt, until the ailerons run out near 150°/s at 200 kt. With the stick centred the law holds bank. Manual, the autopilot and the hover roll posts do not use it.",
    unit: "deg/s",
    kind: "number",
    step: 1,
    bounds: within(15, 165),
    default: 30,
    defaultReason: "Chosen in flight. At 300 kt the earlier stick gains of 0.05, 0.1 and 0.5 flew about 16, 33 and 165°/s at full stick; the source asks for 637°/s, far past what the ailerons give.",
    home: main(FLIGHT_CONTROLS),
    appliesLive: true,
    source: "src/flight/input/applyFlightControls.ts",
  },
  {
    id: "osfs.aircraft.rollTrimRange",
    label: "Roll trim range",
    description: "How far full roll trim reaches, as a share of what full stick asks for: at 1, 100% trim asks what holding A or D, or a controller's stick full over, asks; at 0.2, a fifth of it. Under the F-35B's fly-by-wire that is a share of the full-stick roll rate; under Manual and on the other aircraft, of full aileron.",
    unit: "ratio",
    kind: "number",
    step: 0.05,
    bounds: within(0.05, 1),
    default: 1,
    defaultReason: "The stick's own range. Under fly-by-wire roll trim had asked for up to 637°/s, the source gradient, against 30°/s at full stick, so a few percent of trim outrolled the stick.",
    home: main(FLIGHT_CONTROLS),
    appliesLive: true,
    source: "src/flight/input/applyFlightControls.ts",
  },

  // Controls → Gamepad.
  {
    id: "osfs.input.gamepadPollingRate",
    label: "Gamepad polling rate",
    description: "How often the application reads the controller, not the controller's own report rate.",
    unit: "Hz",
    kind: "number",
    step: 1,
    bounds: within(10, 240),
    named: [{ id: "frame", label: "Every frame", description: "Reads input before each flight frame, with no timer cap." }],
    default: "frame",
    defaultReason: "A fixed rate below the frame rate can introduce visible stepping; the browser's frame rate stays the upper limit.",
    home: main(GAMEPAD),
    appliesLive: true,
    source: "src/flight/input/gamepadPolling.ts",
  },
  {
    id: "osfs.input.gamepadResponse",
    label: "Analog response",
    description: "Smooth eases pitch, roll and yaw toward each report every flight frame; Direct holds each report unchanged.",
    unit: "none",
    kind: "choice",
    choices: [
      { id: "smooth", label: "Smooth" },
      { id: "direct", label: "Direct" },
    ],
    default: "smooth",
    defaultReason: "The original behaviour.",
    home: main(GAMEPAD),
    appliesLive: true,
    source: "src/flight/input/flightInputManager.ts",
  },
  {
    id: "osfs.input.gamepadResponseTime",
    label: "Response time",
    description: "With Smooth, the time to approach 95% of a held stick command.",
    unit: "s",
    kind: "number",
    step: 0.025,
    bounds: within(0.05, 2),
    default: 0.375,
    defaultReason: "The original filter, min(1, 8·dt) per frame.",
    home: main(GAMEPAD),
    appliesLive: true,
    source: "src/flight/input/flightInputManager.ts",
  },
  {
    id: "osfs.input.gamepadDeadzoneMode",
    label: "Stick deadzone behaviour",
    description: "Cutoff ignores the centre zone and keeps the stick's magnitude outside it; Rescaled subtracts the zone from the remaining travel.",
    unit: "none",
    kind: "choice",
    choices: [
      { id: "cutoff", label: "Cutoff" },
      { id: "scaled", label: "Rescaled" },
    ],
    default: "cutoff",
    defaultReason: "The original behaviour.",
    home: main(GAMEPAD),
    appliesLive: true,
    source: "src/flight/input/flightInputManager.ts",
  },
  {
    id: "osfs.input.stickDeadzone",
    label: "Stick deadzone",
    description: "Stick deflection below this is read as centred: built into a controller profile when it is created, and used by bindings without their own.",
    unit: "fraction",
    kind: "number",
    step: 0.01,
    bounds: within(0, 0.5),
    default: 0.08,
    defaultReason: "The original deadzone of the Xbox and Classic profiles.",
    home: all(GAMEPAD),
    appliesLive: false,
    source: "src/flight/input/gamepadToolsAdapter.ts",
  },
  {
    id: "osfs.input.gamepadSmoothing",
    label: "Controller smoothing rate",
    description: "On the input path without controller bindings, the fraction of the remaining distance the stick and throttle close per second.",
    unit: "per-s",
    kind: "number",
    step: 0.5,
    bounds: within(0.5, 60),
    default: 8,
    defaultReason: "The original filter, min(1, 8·dt) per frame: about 95% of a held command in 0.375 s.",
    home: all(GAMEPAD),
    appliesLive: true,
    source: "src/flight/input/flightInputManager.ts",
  },
  {
    id: "osfs.input.takeoverDeadband",
    label: "Takeover deadband",
    description: "How far a control must move from where it rested before it takes over from another input.",
    unit: "fraction",
    kind: "number",
    step: 0.01,
    bounds: within(0.01, 0.5),
    default: 0.12,
    defaultReason: "The original value.",
    home: all(GAMEPAD),
    appliesLive: true,
    source: "src/flight/input/flightInputManager.ts",
  },
  {
    id: "osfs.input.throttleRate",
    label: "Throttle rate",
    description: "How fast held throttle keys and buttons move the throttle, in full travel per second.",
    unit: "per-s",
    kind: "number",
    step: 0.05,
    bounds: within(0.05, 5),
    default: 0.5,
    defaultReason: "The original value: idle to full in two seconds.",
    home: all(GAMEPAD),
    appliesLive: true,
    source: "src/flight/input/flightInputManager.ts",
  },

  // Controls → Keyboard response.
  {
    id: "osfs.input.keyboard.mode",
    label: "Response mode",
    description: "How held keys move the simulated stick.",
    unit: "none",
    kind: "choice",
    choices: [
      { id: "direct", label: "Direct", description: "Keys snap the stick to full deflection immediately." },
      { id: "smooth", label: "Smooth target", description: "Keys set a target; the stick eases toward it exponentially." },
      { id: "rate", label: "Rate ramp", description: "Keys move the stick at a tunable rate that can accelerate with hold time." },
      { id: "assist", label: "Flight assist", description: "Keys command pitch, roll and yaw rates; a PID drives the stick to match them." },
    ],
    default: "smooth",
    defaultReason: "Reproduces the original exponential filter.",
    home: main(KEYBOARD),
    appliesLive: true,
    source: KEYBOARD_STICK_SOURCE,
  },
  keyboardNumber("expo", "Expo", "Softens small keyboard deflections while keeping full range; 0 is linear.", "fraction", 0, 1, 0.05, 0, "The original, linear response."),
  keyboardNumber("smoothResponseSec", "Smooth response time", "Smooth: the time to reach about 95% of a held deflection.", "s", 0.05, 3, 0.025, 0.375, "The original filter, min(1, 8·dt) per frame."),
  keyboardNumber("smoothReturnSec", "Smooth return time", "Smooth: the time to centre after release.", "s", 0.05, 3, 0.025, 0.375, "The original filter, min(1, 8·dt) per frame."),
  keyboardNumber("rateTimeToFull", "Rate time to full", "Rate: seconds from centre to full deflection at the base hold rate.", "s", 0.1, 5, 0.05, 0.6, "The original value."),
  keyboardNumber("rateTimeToCenter", "Rate time to centre", "Rate: seconds from full deflection back to centre after release.", "s", 0.05, 3, 0.05, 0.25, "The original value."),
  keyboardNumber("rateAccelAfterSec", "Rate acceleration after", "Rate: how long a key is held before the ramp speeds up.", "s", 0, 3, 0.05, 0.35, "The original value."),
  keyboardNumber("rateAccelMultiplier", "Rate acceleration", "Rate: the peak ramp speed after a long hold, as a multiple of the base rate.", "ratio", 1, 8, 0.1, 2.5, "The original value."),
  keyboardNumber("rateMaxDeflection", "Rate maximum deflection", "Rate: the largest deflection the keyboard may reach.", "fraction", 0.1, 1, 0.05, 1, "The original value: full authority."),
  keyboardNumber("assistRollRateDeg", "Assist roll rate", "Assist: the roll rate a held aileron key commands.", "deg/s", 5, 180, 1, 45, "The original value."),
  keyboardNumber("assistPitchRateDeg", "Assist pitch rate", "Assist: the pitch rate a held elevator key commands.", "deg/s", 5, 90, 1, 20, "The original value."),
  keyboardNumber("assistYawRateDeg", "Assist yaw rate", "Assist: the yaw rate a held rudder key commands.", "deg/s", 5, 90, 1, 20, "The original value."),
  keyboardNumber("assistKp", "Assist proportional gain", "Assist: stick deflection per unit of rate error.", "ratio", 0, 5, 0.05, 0.8, "The original value."),
  keyboardNumber("assistKi", "Assist integral gain", "Assist: how fast a lasting rate error builds deflection.", "ratio", 0, 2, 0.01, 0.15, "The original value."),
  keyboardNumber("assistKd", "Assist derivative gain", "Assist: damping on how fast the rate error changes.", "ratio", 0, 1, 0.005, 0.02, "The original value."),
  keyboardNumber("assistMaxDeflection", "Assist maximum deflection", "Assist: the largest deflection the assist may command.", "fraction", 0.1, 1, 0.05, 1, "The original value: full authority."),

  // Controls → Orbit (FOSS Earth's section, beside its orbit inversion).
  {
    id: "osfs.input.touchWheelCooldown",
    label: "Touch wheel cooldown",
    description: "After a touch gesture ends, wheel pans are ignored for this long, so the browser's late synthetic ones do not orbit the camera.",
    unit: "ms",
    kind: "number",
    step: 10,
    bounds: within(0, 1_000),
    default: 180,
    defaultReason: "The original value, chosen to outlast the late wheel pans a browser synthesises after a touch ends.",
    home: all(ORBIT),
    appliesLive: true,
    source: "src/flight/input/flightCameraInput.ts",
  },

  // Controls → Feedback.
  {
    id: "osfs.feedback.hapticInterval",
    label: "Haptic interval",
    description: "Wheel contact is summarised into one vibration this often.",
    unit: "ms",
    kind: "number",
    step: 5,
    bounds: within(10, 500),
    default: 50,
    defaultReason: "The original value: one envelope per 50 ms window, never queued.",
    home: all(FEEDBACK),
    appliesLive: true,
    source: "src/flight/feedback/haptics.ts",
  },
  {
    id: "osfs.feedback.hapticMaxDuration",
    label: "Haptic maximum duration",
    description: "The longest one vibration may last.",
    unit: "ms",
    kind: "number",
    step: 5,
    bounds: within(10, 1_000),
    default: 60,
    defaultReason: "The original value, a little longer than the interval so pulses join.",
    home: all(FEEDBACK),
    appliesLive: true,
    source: "src/flight/feedback/haptics.ts",
  },
  {
    id: "osfs.feedback.minMagnitude",
    label: "Haptic threshold",
    description: "Weaker vibrations than this are not sent.",
    unit: "fraction",
    kind: "number",
    step: 0.01,
    bounds: within(0, 0.5),
    default: 0.03,
    defaultReason: "The original value.",
    home: all(FEEDBACK),
    appliesLive: true,
    source: "src/flight/feedback/haptics.ts",
  },
  {
    id: "osfs.feedback.touchdownReference",
    label: "Touchdown reference",
    description: "The strut impulse in one interval that gives a full-strength touchdown vibration.",
    unit: NEWTON_SECONDS,
    kind: "number",
    step: 10,
    scale: "log2",
    bounds: within(10, 10_000),
    default: 300,
    defaultReason: "An authored scale: roughly the main-gear strut impulse in the first 60 ms of a firm Cessna 172 touchdown.",
    home: all(FEEDBACK),
    appliesLive: true,
    source: "src/flight/feedback/haptics.ts",
  },
  {
    id: "osfs.feedback.slipReference",
    label: "Spin-up reference",
    description: "The tyre slip work in one interval that gives a full-strength spin-up vibration.",
    unit: JOULES,
    kind: "number",
    step: 10,
    scale: "log2",
    bounds: within(10, 100_000),
    default: 1_200,
    defaultReason: "An authored scale: roughly one 50 ms interval of the modelled gentle-touchdown spin-up.",
    home: all(FEEDBACK),
    appliesLive: true,
    source: "src/flight/feedback/haptics.ts",
  },
] as const satisfies readonly ParameterSpec[];

function groundChoice<Key extends GroundLockableKey>(key: Key, description: string) {
  const labels = GROUND_CHOICE_LABELS[key] as Record<string, string>;
  return {
    id: `osfs.ground.${key}` as const,
    label: GROUND_FIELD_LABELS[key],
    description,
    unit: "none" as const,
    kind: "choice" as const,
    choices: (GROUND_CHOICES[key] as readonly string[]).map(id => ({ id, label: labels[id] })),
    default: DEFAULT_GROUND_INTERACTION_SETTINGS[key] as string,
    defaultReason: "The Minimal profile: the ground as JSBSim models it, with nothing added.",
    home: all(GROUND),
    appliesLive: true,
    source: "src/flight/settings/groundInteractionSettings.ts",
  };
}

function groundLevel<Field extends string>(field: Field, label: string, description: string, value: number) {
  return {
    id: `osfs.ground.${field}` as const,
    label,
    description,
    unit: "fraction" as const,
    kind: "number" as const,
    step: 0.05,
    bounds: within(0, 1),
    default: value,
    defaultReason: "The original level.",
    home: all(GROUND),
    appliesLive: true,
    source: "src/flight/createFlightSimApp.ts",
  };
}

function groundLock<Key extends GroundLockableKey>(key: Key) {
  return {
    id: `osfs.ground.lock.${key}` as const,
    label: `Lock ${GROUND_FIELD_LABELS[key].toLowerCase()}`,
    description: "Auto cannot substitute another choice for a locked one.",
    unit: "none" as const,
    kind: "boolean" as const,
    default: false,
    defaultReason: "Nothing locked: Auto may substitute any choice that cannot run.",
    home: all(GROUND),
    appliesLive: true,
    source: "src/flight/settings/groundInteractionSettings.ts",
  };
}

function soundLimit<Tier extends string, Field extends string>(
  tier: Tier, field: Field, label: string, description: string,
  unit: "count" | "ms" | "per-s", min: number, cap: number, step: number,
) {
  return {
    id: `osfs.sound.${tier}.${field}` as const,
    label,
    description,
    unit,
    kind: "number" as const,
    step,
    bounds: () => ({ min, max: cap, reason: "The tier's budget in docs/sound.md §1" }),
    default: cap,
    defaultReason: "The tier's full budget; shedding lowers it under load.",
    home: all(SOUND),
    appliesLive: true,
    source: "src/flight/audio/dsp/core.cpp",
  };
}

function soundVolume<Field extends string>(field: Field, label: string, description: string, value: number,
  defaultReason = "The original level.", maximum = 1) {
  return {
    id: `osfs.sound.${field}` as const,
    label,
    description,
    unit: "fraction" as const,
    kind: "number" as const,
    step: 0.05,
    bounds: within(0, maximum),
    default: value,
    defaultReason,
    home: main(field === "afterburnerVolume" ? AFTERBURNER : SOUND),
    appliesLive: true,
    source: "src/flight/audio/createFlightAudio.ts",
  };
}

function autopilotAxis<Axis extends string>(axis: Axis, label: string, description: string) {
  return {
    id: `osfs.autopilot.axes.${axis}` as const,
    label: `Automate ${label.toLowerCase()}`,
    description,
    unit: "none" as const,
    kind: "boolean" as const,
    default: true,
    defaultReason: "The full package, as the AP button has always engaged it.",
    home: main(AUTOPILOT),
    appliesLive: true,
    source: "src/flight/autopilot/controlArbiter.ts",
  };
}

function keyboardNumber<Field extends string>(
  field: Field, label: string, description: string,
  unit: "s" | "fraction" | "ratio" | "deg/s",
  min: number, max: number, step: number, value: number, defaultReason: string,
) {
  return {
    id: `osfs.input.keyboard.${field}` as const,
    label,
    description,
    unit,
    kind: "number" as const,
    step,
    bounds: within(min, max),
    default: value,
    defaultReason,
    home: all(KEYBOARD),
    appliesLive: true,
    source: KEYBOARD_STICK_SOURCE,
  };
}

export type FlightParameterId = (typeof OSFS_PARAMETERS)[number]["id"];

type ValueOf<Spec> = Spec extends { kind: "boolean" } ? boolean
  : Spec extends { kind: "range" } ? NumberRange
  : Spec extends { kind: "choice"; choices: readonly { id: infer Choice }[] } ? Choice
  : Spec extends { kind: "number"; named: readonly { id: infer Named }[] } ? number | Named
  : Spec extends { kind: "number" } ? number
  : string;

/** The effective value of each flight parameter, by id. */
export type FlightParameterValues = {
  [Spec in (typeof OSFS_PARAMETERS)[number] as Spec["id"]]: ValueOf<Spec>;
};

/** What code reads flight parameters through: the registry, or its defaults in a test. */
export interface FlightParameters {
  get<Id extends FlightParameterId>(id: Id): FlightParameterValues[Id];
}

/** Reads, writes and watches flight parameters, typed by id. */
export interface FlightParameterStore extends FlightParameters {
  set<Id extends FlightParameterId>(id: Id, value: FlightParameterValues[Id]): SetResult;
  /** Several values at once: all are applied, or none. */
  setMany(values: Partial<FlightParameterValues>): SetResult;
  reset(id: FlightParameterId): void;
  /** Called with the effective value whenever it changes. */
  watch<Id extends FlightParameterId>(id: Id, listener: (value: FlightParameterValues[Id]) => void): () => void;
  /** Why values will not survive a reload, or null when they are being saved. */
  storageError(): string | null;
}

type Registry = Pick<SettingsRegistry, "get" | "set" | "setMany" | "reset" | "watch" | "getStorageError">;

/** The registry, typed for the flight's own parameters. */
export function flightParameterStore(registry: Registry): FlightParameterStore {
  return {
    get: id => registry.get(id) as never,
    set: (id, value) => registry.set(id, value as ParameterValue),
    setMany: values => registry.setMany(values as Record<string, ParameterValue>),
    reset: id => registry.reset(id),
    watch: (id, listener) => registry.watch(id, value => listener(value as never)),
    storageError: () => registry.getStorageError(),
  };
}

const SPECS = new Map<string, (typeof OSFS_PARAMETERS)[number]>(OSFS_PARAMETERS.map(spec => [spec.id, spec]));

type FlightParameterSpec<Id extends FlightParameterId> = Extract<(typeof OSFS_PARAMETERS)[number], { id: Id }>;

/** The spec of one flight parameter. */
export function flightParameterSpec<Id extends FlightParameterId>(id: Id): FlightParameterSpec<Id> {
  const spec = SPECS.get(id);
  if (!spec) throw new Error(`Unknown flight parameter ${id}`);
  return spec as FlightParameterSpec<Id>;
}

function catalogueDefault<Id extends FlightParameterId>(id: Id): FlightParameterValues[Id] {
  const value = flightParameterSpec(id).default;
  return (typeof value === "object" ? { ...value } : value) as FlightParameterValues[Id];
}

/**
 * The catalogue's defaults in memory, for code that runs without a registry,
 * such as a unit test. Overrides stand in for values the test sets. Writes are
 * not validated and not saved.
 */
export function flightParameterDefaults(overrides: Partial<FlightParameterValues> = {}): FlightParameterStore {
  const values = new Map<string, unknown>(Object.entries(overrides));
  const listeners = new Map<string, Set<(value: never) => void>>();
  const notify = (id: string): void => {
    for (const listener of [...listeners.get(id) ?? []]) listener(store.get(id as FlightParameterId) as never);
  };
  const store: FlightParameterStore = {
    get(id) {
      return (values.has(id) ? values.get(id) : catalogueDefault(id)) as never;
    },
    set(id, value) {
      values.set(id, value);
      notify(id);
      return { ok: true };
    },
    setMany(next) {
      for (const [id, value] of Object.entries(next)) values.set(id, value);
      for (const id of Object.keys(next)) notify(id);
      return { ok: true };
    },
    reset(id) {
      values.delete(id);
      notify(id);
    },
    watch(id, listener) {
      const set = listeners.get(id) ?? new Set();
      set.add(listener as (value: never) => void);
      listeners.set(id, set);
      return () => { set.delete(listener as (value: never) => void); };
    },
    storageError: () => null,
  };
  return store;
}
