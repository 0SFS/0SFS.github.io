import {
  AbstractMesh,
  Color3,
  Mesh,
  MeshBuilder,
  Quaternion,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  type Scene,
} from "@babylonjs/core";
import type { JSBSimSdk } from "@0x62/jsbsim-wasm";

/**
 * Drives the model's moving parts from JSBSim.
 *
 * Axes: the exported nodes keep glTF's own frame — +X starboard, +Y up,
 * +Z aft (the nose points along -Z). So a hinge that runs spanwise is local X,
 * the rudder hinge is local Y, and the propeller turns about local Z.
 *
 * Signs come from the c172p aero tables rather than guesswork:
 * - `Cmde = -1.122 * elevator-pos-rad`, so a positive value pitches the nose
 *   down, which is trailing edge down.
 * - `Clda = +0.229 * left-aileron-pos-rad` rolls right, which is left aileron
 *   trailing edge down. The right aileron's FCS gain is already negated, so
 *   both surfaces share one convention: positive means trailing edge down.
 * - `Cndr = -0.043 * rudder-pos-rad` yaws the nose left, so positive means
 *   trailing edge left.
 *
 * A positive rotation about +X carries the trailing edge (+Z) toward -Y, i.e.
 * downward, so the pitch/roll/flap surfaces map straight through. A positive
 * rotation about +Y carries +Z toward +X (starboard), so the rudder is negated.
 */

/** Deflections in radians, plus propeller rate in rad/s. */
export interface ControlSurfaceState {
  aileronLeftRad: number;
  aileronRightRad: number;
  elevatorRad: number;
  rudderRad: number;
  ruddervatorLeftRad: number;
  ruddervatorRightRad: number;
  flapRad: number;
  propellerRadPerSec: number;
  /** Physical gear position: 1 is down and locked, 0 is retracted. */
  gearDownNorm: number;
  /** Ground speed in m/s; what the tyres roll at when they are on the ground. */
  groundSpeedMps: number;
  /** True while any gear unit carries weight. */
  onGround: boolean;
}

export const NEUTRAL_CONTROL_SURFACES: ControlSurfaceState = {
  aileronLeftRad: 0, aileronRightRad: 0, elevatorRad: 0,
  rudderRad: 0, ruddervatorLeftRad: 0, ruddervatorRightRad: 0,
  flapRad: 0, propellerRadPerSec: 0, gearDownNorm: 1,
  groundSpeedMps: 0, onGround: false,
};

const DEG_TO_RAD = Math.PI / 180;
const RPM_TO_RAD_PER_SEC = (2 * Math.PI) / 60;
const FEET_TO_METERS = 0.3048;
// Any unit carrying weight means the tyres are turning. Three is every gear a
// tricycle has, and a model with more simply reports the first three.
const WOW_PROPERTIES = [
  "gear/unit[0]/WOW", "gear/unit[1]/WOW", "gear/unit[2]/WOW",
] as const;

// JSBSim engine RPM lives under a different property depending on how the
// propulsion block is written, so try the usual spellings and keep the first
// that answers with a number.
const RPM_PROPERTIES = [
  "propulsion/engine[0]/propeller-rpm",
  "propulsion/engine[0]/engine-rpm",
  "propulsion/engine/propeller-rpm",
  "propulsion/engine/engine-rpm",
] as const;

let resolvedRpmProperty: string | null = null;

function readNumber(sdk: JSBSimSdk, property: string): number {
  try {
    const value = sdk.getPropertyValue(property);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function readPropellerRpm(sdk: JSBSimSdk): number {
  if (resolvedRpmProperty) {
    const value = readNumber(sdk, resolvedRpmProperty);
    if (value !== 0) return value;
  }
  // JSBSim answers an unknown property with 0 rather than raising, so "the
  // first one that returns a number" would happily latch onto a property that
  // does not exist. Only a non-zero reading proves a spelling is the live one;
  // until then, re-probe each frame. A stopped engine simply reads zero.
  for (const property of RPM_PROPERTIES) {
    const value = readNumber(sdk, property);
    if (value !== 0) {
      resolvedRpmProperty = property;
      return value;
    }
  }
  return 0;
}

/** Reads a legacy command only when no physical gear position is available. */
function readGearCommand(sdk: JSBSimSdk): number {
  try {
    const value = sdk.getPropertyValue("gear/gear-cmd-norm");
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
  } catch {
    return 1;
  }
}

/**
 * Gear presentation follows the FDM's physical observation. Fixed-gear or
 * legacy models can omit it, in which case the commanded state is the explicit
 * fallback rather than an independent visual timer.
 */
function readGearPosition(sdk: JSBSimSdk): number {
  try {
    const value = sdk.getPropertyValue("gear/gear-pos-norm");
    if (Number.isFinite(value)) return Math.min(1, Math.max(0, value));
  } catch {
    // Fall through to the command-only fallback below.
  }
  return readGearCommand(sdk);
}

/** Test seam: forget the cached RPM property name. */
export function resetPropellerRpmProperty(): void {
  resolvedRpmProperty = null;
}

export function readControlSurfaceState(sdk: JSBSimSdk): ControlSurfaceState {
  return {
    aileronLeftRad: readNumber(sdk, "fcs/left-aileron-pos-rad"),
    aileronRightRad: readNumber(sdk, "fcs/right-aileron-pos-rad"),
    elevatorRad: readNumber(sdk, "fcs/elevator-pos-rad"),
    rudderRad: readNumber(sdk, "fcs/rudder-pos-rad"),
    ruddervatorLeftRad: readNumber(sdk, "fcs/left-ruddervator-pos-rad"),
    ruddervatorRightRad: readNumber(sdk, "fcs/right-ruddervator-pos-rad"),
    flapRad: readNumber(sdk, "fcs/flap-pos-deg") * DEG_TO_RAD,
    propellerRadPerSec: readPropellerRpm(sdk) * RPM_TO_RAD_PER_SEC,
    gearDownNorm: readGearPosition(sdk),
    // Wheels roll at ground speed, not airspeed: a headwind does not spin them.
    groundSpeedMps: readNumber(sdk, "velocities/vg-fps") * FEET_TO_METERS,
    onGround: WOW_PROPERTIES.some((property) => readNumber(sdk, property) > 0),
  };
}

type SurfaceKey = keyof Omit<ControlSurfaceState,
  "propellerRadPerSec" | "gearDownNorm" | "groundSpeedMps" | "onGround">;

interface HingedPart {
  node: TransformNode;
  rest: Quaternion;
  axis: Vector3;
  sign: number;
  key: SurfaceKey;
}

interface RetractingGear {
  node: TransformNode;
  rest: Quaternion;
  axis: Vector3;
  sign: number;
  /** Full travel in radians; a leg turns a quarter, a door rather less. */
  rad: number;
  /** The slice of the gear cycle this part moves in. */
  window: readonly [number, number];
}

/**
 * A rolling wheel.
 *
 * `radius` is measured off the node's own bounding box rather than carried in
 * the catalog, the same way the propeller disc sizes itself: the mesh already
 * knows how big its tyre is, and a second copy of that number is a second
 * thing to keep in step.
 */
interface RollingWheel {
  node: TransformNode;
  rest: Quaternion;
  radius: number;
}

interface Propeller {
  node: TransformNode;
  rest: Quaternion;
  /** Stand-in shown once the blades turn too fast to read. */
  disc: TransformNode | null;
  /** True when the disc came from the mesh and must not be disposed here. */
  discFromMesh: boolean;
  blades: number;
}

export interface AircraftRig {
  parts: HingedPart[];
  wheels: RollingWheel[];
  /** Where the tyres are in their roll, radians. */
  wheelAngleRad: number;
  /**
   * The tyres' atlases: the band on one half, the band averaged over a turn on
   * the other (planes/shared/tyres.py). Blurring a tyre is moving its texture
   * half a width along - the same mesh, the same draw, one number. A level
   * whose tyres are plain rubber has none, and its tyres never blur.
   */
  tyreTextures: Texture[];
  /** True while the tyres are drawing the blurred half of their atlas. */
  wheelBlurred: boolean;
  gear: RetractingGear[];
  propeller: Propeller | null;
  propellerAngleRad: number;
  /** Smoothed frame interval; the sampling rate the blades are judged against. */
  frameSeconds: number;
  discVisible: boolean;
  /** Node names present in the loaded mesh, for diagnostics. */
  bound: string[];
}

export interface BindRigOptions {
  /** Needed only to build the propeller disc. */
  scene?: Scene;
  propellerBlades?: number;
}

/** Hysteresis, so a propeller sitting on the threshold does not flicker. */
const DISC_HYSTERESIS = 0.8;
const FRAME_SMOOTHING = 0.15;
const DEFAULT_FRAME_SECONDS = 1 / 60;

/**
 * Fastest the blades can turn and still be readable, in rad/s.
 *
 * The image repeats every `2*PI / blades`, and reading a repeating signal needs
 * two samples per repeat, so the blades may advance at most half a repeat per
 * frame. For a two-blade propeller at 60 fps that is 90 deg per frame, about
 * 900 rpm — below a Cessna's idle, so in practice the disc is shown almost
 * whenever the engine is running, which is also how a real propeller looks.
 */
export function maxReadableRadPerSec(repeats: number, frameSeconds: number): number {
  // `repeats` is how many times the image repeats in one turn, not how many
  // parts there are: two blades repeat twice, one tyre stripe repeats once.
  // The guard is < 1, not < 2 - a single stripe DOES alias, at half the rate a
  // two-blade propeller does, and guarding at 2 quietly returned Infinity and
  // made the wheel blur unreachable. Zero means no repeating image at all,
  // which is a jet's propeller: nothing to alias, no limit.
  if (repeats < 1 || frameSeconds <= 0) return Number.POSITIVE_INFINITY;
  return Math.PI / repeats / frameSeconds;
}

function propellerRadius(node: TransformNode): number {
  const radius = nodeRadius(node);
  return radius > 0.05 ? radius : 1;
}

/** Largest half-extent across the node's own axis of rotation, or 0. */
function nodeRadius(node: TransformNode): number {
  if (!(node instanceof AbstractMesh)) return 0;
  const extend = node.getBoundingInfo().boundingBox.extendSize;
  // A wheel turns about local X, a propeller about local Z; in both cases the
  // radius is the larger of the two extents that are NOT along that axis, and
  // taking the max of Y and Z would read a propeller's chord. Y is common to
  // both, so pair it with whichever of X and Z is larger.
  return Math.max(extend.y, Math.min(extend.x, extend.z));
}

function buildPropellerDisc(node: TransformNode, scene: Scene): Mesh {
  // The propeller turns about local Z, so a disc in the local XY plane — which
  // is how CreateDisc is oriented — already lies in the propeller's plane.
  const disc = MeshBuilder.CreateDisc(
    "propeller-disc",
    { radius: propellerRadius(node), tessellation: 24, sideOrientation: Mesh.DOUBLESIDE },
    scene,
  );
  disc.parent = node.parent;
  disc.position.copyFrom(node.position);
  disc.rotationQuaternion = node.rotationQuaternion?.clone() ?? Quaternion.Identity();
  disc.isPickable = false;

  const material = new StandardMaterial("propeller-disc-mat", scene);
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.emissiveColor = new Color3(0.07, 0.08, 0.09);
  material.disableLighting = true;
  material.alpha = 0.28;
  material.backFaceCulling = false;
  disc.material = material;
  disc.setEnabled(false);
  return disc;
}

const SPAN_AXIS = new Vector3(1, 0, 0);
const VERTICAL_AXIS = new Vector3(0, 1, 0);
const THRUST_AXIS = new Vector3(0, 0, 1);
// The two V-tail hinge lines are measured from the SF50 three-view geometry.
// Mesh nodes retain global axes after export, so these are not cardinal axes.
const LEFT_RUDDERVATOR_HINGE_AXIS = new Vector3(-2.2405, -1.025, 1.792).normalize();
const RIGHT_RUDDERVATOR_HINGE_AXIS = new Vector3(2.2405, -1.025, 1.792).normalize();

/**
 * Retracting gear parts. Each leg's origin is on its own retraction hinge and
 * its wheel — and, on the main legs, its door — is a child of it, so one
 * rotation per leg carries the whole assembly. See
 * `planes/Cirrus_Vision_Jet/agent_workspace/scripts/generate_sf50.py`, which
 * places those pivots, and verify_rig.py, which checks them.
 *
 * The main legs fold inboard about the fore-aft axis, mirrored, so their signs
 * are opposite; the nose leg folds aft about the span axis. All three take
 * exactly a quarter turn, which is what pins each hinge to one point.
 *
 * An airframe with fixed gear simply has no such nodes and binds nothing.
 */
/**
 * The nose bay doors' hinge line, which is NOT one of the three cardinal axes.
 * Their hinged edge is the mouth's own long edge, and the mouth is on the
 * belly, which rises about 9.3 deg toward the nose. Turning them about the
 * plain fore-aft axis does not hold that edge still: it lifts the door off the
 * mouth, and the open pair end up lying parallel to the GROUND while the body
 * they hang from is pitched up.
 *
 * Printed by the generator as `###DOORAXIS###`, already in glTF axes, and it
 * has to be re-read whenever the mouth moves along the belly.
 */
const NOSE_DOOR_HINGE = new Vector3(0, 0.16248, -0.9867);

/**
 * The wing bay doors' hinge line: the door's outboard fore-aft edge, which
 * carries the wing's dihedral and the lower surface's slope between the two
 * chord fractions the door is cut at (0.29 and 0.635). Hinging them on the
 * spanwise edge instead swings the panel forward like a speed brake. Printed
 * by the generator as `###DOORAXIS###` like the nose pair's, and re-read when
 * the door moved forward off the flap hinge.
 */
const WING_DOOR_HINGE = new Vector3(0, 0.05638, 0.99841);
// 125 deg, not the nose pair's 88: the wing doors open PAST vertical so they
// lean outboard and clear the extended wheel - at 82 the panel hung in the
// tyre's own plane and the two z-fought. It is 125 rather than the 112 it was
// because the door is now its measured 0.75 m: hinged ~0.8 m up, a panel that
// long reaches the ground at 90 deg, and the one photograph that shows it from
// the front has its free edge splayed out level with the axle.

/**
 * How many times a banded tyre's image repeats in one turn. The band runs
 * straight through the hub, so it looks the same every half turn: TWO, and the
 * tyre aliases at `PI / 2 / frameSeconds` - 15 rev/s at 60 fps, about 35 kt on
 * a 0.19 m tyre, and proportionally more on a faster display. That is the rate
 * at which the tyre switches to the blurred half of its texture. See
 * docs/drawing-fast-rotation.md, and planes/shared/tyres.py for the band.
 */
const TYRE_STRIPE_REPEATS = 2;
/**
 * The atlas's u offset for the band and for its blur. The sharp tyre sits at
 * 1, not 0 - the same picture, since the sampler repeats - because at 0 the
 * texture has no transform and Babylon compiles the material without one; the
 * first blur would then recompile it, mid take-off roll. Held off zero, both
 * states are one shader and switching is a uniform.
 */
export const TYRE_SHARP_U = 1;
export const TYRE_BLURRED_U = 1.5;

const GEAR_RETRACT_RAD = Math.PI / 2;
const DOOR_RAD = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Where in the gear's travel each part moves, as [start, end] fractions of it.
 *
 * The legs and the doors do NOT move together. Retracting, the leg has to be
 * most of the way in before the doors can shut over it; extending, the doors
 * have to be open before the leg comes through. Driving both off the same
 * fraction folds and closes at once, which looks like the door passing through
 * the leg. Overlapping the two windows slightly keeps it continuous rather
 * than making the gear stop and wait.
 *
 * `travel` runs 0 (down) to 1 (up), so reading the same windows backwards is
 * what makes extension sequence correctly without a second table.
 */
const LEG_WINDOW: readonly [number, number] = [0, 0.78];
const DOOR_WINDOW: readonly [number, number] = [0.62, 1];

const GEAR_BINDINGS: readonly {
  name: string; axis: Vector3; sign: number; rad?: number;
  window?: readonly [number, number];
}[] = [
  { name: "LandingGear_Left", axis: THRUST_AXIS, sign: 1 },
  { name: "LandingGear_Right", axis: THRUST_AXIS, sign: -1 },
  // The nose leg folds FORWARD, not aft, so its sign is the opposite of what
  // it was: photo_N124MW_gear_down.jpg shows a 1.1 m door hanging open ahead
  // of the leg. See the generator's NOSE_SENSE.
  { name: "LandingGear_Nose", axis: SPAN_AXIS, sign: 1 },
  // Nose bay doors: a pair that parts in the middle and opens sideways, so
  // they mirror. There is no main-gear bay door - the main wheels retract into
  // the wing root and stay visible, and the panel beside each one is the
  // strut-mounted `GearDoor_*`, which is a child of its leg and needs no
  // binding of its own.
  //
  // These are exported OPEN, because the mesh always ships gear down, so they
  // travel the way the legs do but from the other end: at `gearDownNorm` 1
  // they sit where they were authored and at 0 they are shut. The angle is the
  // generator's own `GEAR_BAYS[...]["open"]` and is not a quarter turn - a
  // door that stops at 90 deg has swung through the skin.
  { name: "BayDoor_Nose_Left", axis: NOSE_DOOR_HINGE, sign: -1, rad: DOOR_RAD(88), window: DOOR_WINDOW },
  { name: "BayDoor_Nose_Right", axis: NOSE_DOOR_HINGE, sign: 1, rad: DOOR_RAD(88), window: DOOR_WINDOW },
  { name: "BayDoor_Main_Left", axis: WING_DOOR_HINGE, sign: 1, rad: DOOR_RAD(125), window: DOOR_WINDOW },
  { name: "BayDoor_Main_Right", axis: WING_DOOR_HINGE, sign: -1, rad: DOOR_RAD(125), window: DOOR_WINDOW },
];
const SURFACE_BINDINGS: readonly { name: string; key: SurfaceKey; axis: Vector3; sign: number }[] = [
  { name: "Aileron_Left", key: "aileronLeftRad", axis: SPAN_AXIS, sign: 1 },
  { name: "Aileron_Right", key: "aileronRightRad", axis: SPAN_AXIS, sign: 1 },
  { name: "Elevator", key: "elevatorRad", axis: SPAN_AXIS, sign: 1 },
  { name: "Flap_Left", key: "flapRad", axis: SPAN_AXIS, sign: 1 },
  { name: "Flap_Right", key: "flapRad", axis: SPAN_AXIS, sign: 1 },
  { name: "Rudder", key: "rudderRad", axis: VERTICAL_AXIS, sign: -1 },
  // Positive surface deflection is trailing-edge down on both sides.
  { name: "Ruddervator_Left", key: "ruddervatorLeftRad", axis: LEFT_RUDDERVATOR_HINGE_AXIS, sign: -1 },
  { name: "Ruddervator_Right", key: "ruddervatorRightRad", axis: RIGHT_RUDDERVATOR_HINGE_AXIS, sign: 1 },
];

/** Strip Babylon's de-duplication suffix, e.g. "Elevator.001" -> "Elevator". */
function baseName(name: string): string {
  return name.replace(/\.\d+$/, "");
}

function restRotation(node: TransformNode): Quaternion {
  return node.rotationQuaternion?.clone() ?? Quaternion.FromEulerVector(node.rotation);
}

/**
 * Bind the moving parts of a freshly loaded mesh. Absent parts are skipped, so
 * the coarse levels — which merge the control surfaces into their panels and
 * keep only the propeller — bind cleanly without special cases.
 */
export function bindAircraftRig(
  nodes: readonly TransformNode[],
  options: BindRigOptions = {},
): AircraftRig {
  const byName = new Map<string, TransformNode>();
  for (const node of nodes) {
    const key = baseName(node.name);
    if (!byName.has(key)) byName.set(key, node);
  }

  const parts: HingedPart[] = [];
  const bound: string[] = [];

  for (const binding of SURFACE_BINDINGS) {
    const node = byName.get(binding.name);
    if (!node) continue;
    parts.push({
      node, rest: restRotation(node), axis: binding.axis, sign: binding.sign, key: binding.key,
    });
    bound.push(binding.name);
  }

  const wheels: RollingWheel[] = [];
  const tyreTextures = new Set<Texture>();
  for (const [key, node] of byName) {
    if (!key.startsWith("Wheel_")) continue;
    const radius = nodeRadius(node);
    if (radius <= 0) continue;
    wheels.push({ node, rest: restRotation(node), radius });
    bound.push(key);
    for (const texture of tyreAtlases(node)) tyreTextures.add(texture);
  }
  for (const texture of tyreTextures) texture.uOffset = TYRE_SHARP_U;

  const gear: RetractingGear[] = [];
  for (const binding of GEAR_BINDINGS) {
    const node = byName.get(binding.name);
    if (!node) continue;
    gear.push({
      node, rest: restRotation(node), axis: binding.axis, sign: binding.sign,
      rad: binding.rad ?? GEAR_RETRACT_RAD,
      window: binding.window ?? LEG_WINDOW,
    });
    bound.push(binding.name);
  }

  const propNode = byName.get("Propeller");
  if (propNode) bound.push("Propeller");

  const blades = options.propellerBlades ?? 0;
  // A model can ship a solid swept from its own blade sections, which stays
  // correct edge-on. Only fall back to a flat disc when it does not.
  const baked = byName.get("Propeller_Disc") ?? null;
  if (baked) {
    baked.setEnabled(false);
    bound.push("Propeller_Disc");
  }
  const disc = baked
    ?? (propNode && options.scene && blades >= 2
      ? buildPropellerDisc(propNode, options.scene)
      : null);

  return {
    parts,
    wheels,
    wheelAngleRad: 0,
    tyreTextures: [...tyreTextures],
    wheelBlurred: false,
    gear,
    propeller: propNode
      ? { node: propNode, rest: restRotation(propNode), disc, discFromMesh: baked !== null, blades }
      : null,
    propellerAngleRad: 0,
    frameSeconds: DEFAULT_FRAME_SECONDS,
    discVisible: false,
    bound,
  };
}

/**
 * Every texture on a tyre's own meshes. The tyre's material carries the atlas
 * and nothing else, and several tyres share one material, hence the caller's
 * set.
 */
function tyreAtlases(node: TransformNode): Texture[] {
  const meshes = [
    ...(node instanceof AbstractMesh ? [node] : []),
    ...node.getChildMeshes(true),
  ];
  const found: Texture[] = [];
  for (const mesh of meshes) {
    for (const texture of mesh.material?.getActiveTextures() ?? []) {
      if (texture instanceof Texture) found.push(texture);
    }
  }
  return found;
}

/** Free only a disc this module built; a baked one belongs to the AssetContainer. */
export function disposeAircraftRig(rig: AircraftRig): void {
  const propeller = rig.propeller;
  if (!propeller?.disc || propeller.discFromMesh) return;
  if (propeller.disc instanceof Mesh) propeller.disc.material?.dispose();
  propeller.disc.dispose();
}

/**
 * Pose the legs and doors from the physical actuator observation. Render
 * frequency and paused camera movement must not advance a second gear clock.
 */
function applyGear(rig: AircraftRig, position: number): void {
  if (rig.gear.length === 0) return;
  const physical = Number.isFinite(position) ? Math.min(1, Math.max(0, position)) : 1;
  const travel = 1 - physical;
  for (const leg of rig.gear) {
    const [from, to] = leg.window;
    const part = Math.min(1, Math.max(0, (travel - from) / (to - from)));
    leg.node.rotationQuaternion = leg.rest.multiply(
      Quaternion.RotationAxis(leg.axis, part * leg.rad * leg.sign),
    );
  }
}

/**
 * Roll the tyres, and move their texture to its blurred half once they turn
 * faster than the frame rate can show. `docs/drawing-fast-rotation.md` is the
 * argument; this is the wheel half of it, and the propeller below is the other.
 *
 * One decision for all of them: they are the same size to within a centimetre
 * and rolling on the same ground, and a nose tyre blurring a frame before the
 * mains would be a flicker nobody could explain. They also share one material,
 * so one decision is all the texture could carry anyway.
 */
function applyWheels(
  rig: AircraftRig,
  state: ControlSurfaceState,
  deltaSeconds: number,
  held: boolean,
): void {
  if (rig.wheels.length === 0) return;
  // Airborne the tyres hold whatever angle they stopped at rather than being
  // driven by an airspeed no wheel is touching.
  const speed = state.onGround ? state.groundSpeedMps : 0;
  let fastest = 0;
  for (const wheel of rig.wheels) {
    fastest = Math.max(fastest, Math.abs(speed) / wheel.radius);
  }
  if (!held && Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
    // Rolling forward carries the top of the tyre toward the nose, -Z. A
    // positive rotation about +X carries +Y toward +Z, so the angle decreases.
    rig.wheelAngleRad = (rig.wheelAngleRad - fastest * Math.sign(speed) * deltaSeconds)
      % (2 * Math.PI);
  }
  for (const wheel of rig.wheels) {
    wheel.node.rotationQuaternion = wheel.rest.multiply(
      Quaternion.RotationAxis(SPAN_AXIS, rig.wheelAngleRad),
    );
  }

  const limit = maxReadableRadPerSec(TYRE_STRIPE_REPEATS, rig.frameSeconds);
  const blurred = rig.wheelBlurred
    ? fastest > limit * DISC_HYSTERESIS
    : fastest > limit;
  if (blurred === rig.wheelBlurred) return;
  rig.wheelBlurred = blurred;
  for (const texture of rig.tyreTextures) {
    texture.uOffset = blurred ? TYRE_BLURRED_U : TYRE_SHARP_U;
  }
}

export interface ApplyRigOptions {
  /**
   * True while the simulation is not advancing: paused, faulted, or waiting
   * for terrain. Orbiting the camera still renders frames then, and their
   * interval is display time, not flight time - so the tyres, propeller and
   * gear transit hold, and only the frame interval is measured.
   */
  simulationHeld?: boolean;
}

export function applyAircraftRig(
  rig: AircraftRig,
  state: ControlSurfaceState,
  deltaSeconds: number,
  options: ApplyRigOptions = {},
): void {
  const held = options.simulationHeld === true;
  for (const part of rig.parts) {
    const angle = state[part.key] * part.sign;
    part.node.rotationQuaternion = part.rest.multiply(Quaternion.RotationAxis(part.axis, angle));
  }

  // The display's frame interval sets the alias limit for EVERYTHING that
  // spins, so it is measured whether or not there is a propeller. It used to
  // live inside the propeller branch, and a jet's tyres were judged against a
  // hard-coded 60 fps whatever the display was doing.
  if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
    rig.frameSeconds += (deltaSeconds - rig.frameSeconds) * FRAME_SMOOTHING;
  }

  applyGear(rig, state.gearDownNorm);
  applyWheels(rig, state, deltaSeconds, held);

  const propeller = rig.propeller;
  if (!propeller) return;

  if (!held && Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
    // A Lycoming turns clockwise seen from the cockpit. Looking forward is
    // looking down -Z, and a positive rotation about +Z reads anticlockwise
    // from there, so the angle decreases.
    rig.propellerAngleRad -= state.propellerRadPerSec * deltaSeconds;
    rig.propellerAngleRad %= 2 * Math.PI;
  }

  if (propeller.disc) {
    const limit = maxReadableRadPerSec(propeller.blades, rig.frameSeconds);
    const rate = Math.abs(state.propellerRadPerSec);
    // Once the blades alias there is nothing to be gained by drawing them, so
    // swap in the disc rather than showing a strobing propeller.
    rig.discVisible = rig.discVisible ? rate > limit * DISC_HYSTERESIS : rate > limit;
    propeller.disc.setEnabled(rig.discVisible);
    propeller.node.setEnabled(!rig.discVisible);
    if (rig.discVisible) return;
  }

  propeller.node.rotationQuaternion = propeller.rest.multiply(
    Quaternion.RotationAxis(THRUST_AXIS, rig.propellerAngleRad),
  );
}
