import { GOOGLE_ERROR_TARGET_BOUNDS } from "foss-earth/mapDetailPolicy";
import { AIRCRAFT_FAMILIES, AIRCRAFT_LOD_IDS } from "../aircraft/aircraftCatalog";
import { AIRCRAFT_IDS } from "../aircraft/aircraftIds";
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
const INSTRUMENTS = { tab: "renderer", section: "instruments" } as const;
const CAMERA = { tab: "aircraft", section: "camera" } as const;
const START = { tab: "aircraft", section: "start" } as const;
const PHONE_CAMERA = { tab: "remote", section: "camera" } as const;
const SOUND = { tab: "sound", section: "sound" } as const;
const ENGINE = { tab: "engine", section: "engine" } as const;
const ASSISTS = { tab: "aircraft", section: "assists" } as const;
const GROUND = { tab: "aircraft", section: "ground" } as const;
const AUTOPILOT = { tab: "autopilot", section: "package" } as const;
const GAMEPAD = { tab: "controls", section: "gamepad" } as const;
const KEYBOARD = { tab: "controls", section: "keyboard" } as const;
const ORBIT = { tab: "controls", section: "orbit" } as const;
const FEEDBACK = { tab: "controls", section: "feedback" } as const;

/** Section titles for the sections 0sfs adds, by tab and section id. */
export const FLIGHT_SECTION_TITLES: readonly (readonly [tab: string, section: string, title: string])[] = [
  ["renderer", "instruments", "Instruments"],
  ["aircraft", "model", "Aircraft"],
  ["aircraft", "camera", "Camera"],
  ["aircraft", "start", "Start"],
  ["remote", "camera", "Phone camera trackpad"],
  ["sound", "sound", "Sound"],
  ["engine", "engine", "Engine"],
  ["aircraft", "assists", "Assists"],
  ["aircraft", "ground", "Ground handling"],
  ["autopilot", "package", "Autopilot"],
  ["controls", "gamepad", "Gamepad"],
  ["controls", "keyboard", "Keyboard response"],
  ["controls", "feedback", "Feedback"],
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
  {
    id: "osfs.aircraft.optInLods",
    label: "Opt-in models",
    description: "Offers the models an aircraft marks as opt-in, such as the Vision Jet's HD mesh, to Auto and to the model choice.",
    unit: "none",
    kind: "boolean",
    default: false,
    defaultReason: "Opt-in models cost more to download and draw; the pilot chooses them.",
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

  // Aircraft → Assists.
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
    description: "Moves roll trim to cancel the aileron force the pilot is holding.",
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
    default: false,
    defaultReason: "Off: a saved preference cannot satisfy the browser's autoplay rule, so sound starts from a gesture.",
    home: main(SOUND),
    appliesLive: true,
    source: "src/flight/audio/createFlightAudio.ts",
  },
  {
    id: "osfs.sound.quality",
    label: "Sound tier",
    description: "Which synthesis engine runs; Auto starts at Low and moves up only to a tier qualified on this device.",
    unit: "none",
    kind: "choice",
    choices: [
      { id: "off", label: "Off" },
      { id: "low", label: "Low", description: "Procedural, light." },
      { id: "med", label: "Med", description: "Procedural, with a cabin impulse response." },
      { id: "high", label: "High", description: "Hybrid granular, with recorded grains." },
      { id: "auto", label: "Auto" },
    ],
    default: "auto",
    defaultReason: "No tier is qualified on a device yet, so the program starts at the cheapest and waits for evidence.",
    home: main(SOUND),
    appliesLive: true,
    source: "src/flight/audio/audioQuality.ts",
  },
  soundVolume("masterVolume", "Master volume", "Scales every flight sound.", 0.7),
  soundVolume("engineVolume", "Engine volume", "Scales the engine, independently of the airframe.", 0.8),
  soundVolume("airframeVolume", "Airframe volume", "Scales wind and gear and flap turbulence, independently of the engine.", 0.6),
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
  soundLimit("low", "noiseBands", "Low: noise sources", "How many engine and airframe noise bands Low synthesises.", "count", 0, 4, 1),
  soundLimit("med", "partials", "Med: engine oscillators", "How many engine partials Med synthesises; the N1 and N2 fundamentals come first.", "count", 2, 12, 1),
  soundLimit("med", "noiseBands", "Med: noise sources", "How many engine and airframe noise bands Med synthesises.", "count", 0, 5, 1),
  soundLimit("med", "irMs", "Med: cabin impulse response", "The length of the cabin and airframe colouring Med convolves with.", "ms", 0, 20, 1),
  soundLimit("high", "partials", "High: engine oscillators", "How many engine partials High synthesises; the N1 and N2 fundamentals come first.", "count", 2, 12, 1),
  soundLimit("high", "noiseBands", "High: noise sources", "How many engine and airframe noise bands High synthesises.", "count", 0, 5, 1),
  soundLimit("high", "grains", "High: grains", "How many recorded grains High plays at once.", "count", 0, 12, 1),
  soundLimit("high", "grainStarts", "High: grain starts", "How many grains High starts per second at most.", "per-s", 0, 160, 5),
  soundLimit("high", "irMs", "High: cabin impulse response", "The length of the cabin and airframe colouring High convolves with.", "ms", 0, 40, 1),

  // Engine.
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

function soundVolume<Field extends string>(field: Field, label: string, description: string, value: number) {
  return {
    id: `osfs.sound.${field}` as const,
    label,
    description,
    unit: "fraction" as const,
    kind: "number" as const,
    step: 0.05,
    bounds: within(0, 1),
    default: value,
    defaultReason: "The original level.",
    home: main(SOUND),
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
