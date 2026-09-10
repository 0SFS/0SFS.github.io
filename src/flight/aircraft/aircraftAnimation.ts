import {
  AbstractMesh,
  Color3,
  Mesh,
  MeshBuilder,
  Quaternion,
  StandardMaterial,
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
  flapRad: number;
  propellerRadPerSec: number;
  /** Commanded gear position: 1 is down and locked, 0 is up. */
  gearDownNorm: number;
}

export const NEUTRAL_CONTROL_SURFACES: ControlSurfaceState = {
  aileronLeftRad: 0, aileronRightRad: 0, elevatorRad: 0,
  rudderRad: 0, flapRad: 0, propellerRadPerSec: 0, gearDownNorm: 1,
};

const DEG_TO_RAD = Math.PI / 180;
const RPM_TO_RAD_PER_SEC = (2 * Math.PI) / 60;

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

/**
 * The gear LEVER, not the gear position.
 *
 * `gear/gear-pos-norm` is the one that would be right, and it is the one that
 * never moves: it and `gear/gear-cmd-norm` are both plain FGFCS properties, and
 * what drives one from the other is a retraction system in the aircraft
 * config. The c172p — still the flight model every airframe here flies — has
 * fixed gear and no such system, so `gear-pos-norm` sits at 1 for ever however
 * the command is set. Measured against the wasm build, not assumed. So the
 * lever is what is read, and `applyAircraftRig` runs the transit itself.
 *
 * An unknown or unreadable property answers "down", which is the failure worth
 * having: gear that will not come up beats gear that is not there on landing.
 */
function readGearCommand(sdk: JSBSimSdk): number {
  try {
    const value = sdk.getPropertyValue("gear/gear-cmd-norm");
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
  } catch {
    return 1;
  }
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
    flapRad: readNumber(sdk, "fcs/flap-pos-deg") * DEG_TO_RAD,
    propellerRadPerSec: readPropellerRpm(sdk) * RPM_TO_RAD_PER_SEC,
    gearDownNorm: readGearCommand(sdk),
  };
}

type SurfaceKey = keyof Omit<ControlSurfaceState, "propellerRadPerSec" | "gearDownNorm">;

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
  gear: RetractingGear[];
  /** Where the gear actually is, 1 down to 0 up; it chases the lever. */
  gearNorm: number;
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
export function maxReadableRadPerSec(blades: number, frameSeconds: number): number {
  if (blades < 2 || frameSeconds <= 0) return Number.POSITIVE_INFINITY;
  return Math.PI / blades / frameSeconds;
}

function propellerRadius(node: TransformNode): number {
  if (node instanceof AbstractMesh) {
    const extend = node.getBoundingInfo().boundingBox.extendSize;
    const radius = Math.max(extend.x, extend.y);
    if (radius > 0.05) return radius;
  }
  return 1;
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

const GEAR_RETRACT_RAD = Math.PI / 2;
const DOOR_RAD = (deg: number): number => (deg * Math.PI) / 180;

const GEAR_BINDINGS: readonly {
  name: string; axis: Vector3; sign: number; rad?: number;
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
  { name: "BayDoor_Nose_Left", axis: NOSE_DOOR_HINGE, sign: -1, rad: DOOR_RAD(88) },
  { name: "BayDoor_Nose_Right", axis: NOSE_DOOR_HINGE, sign: 1, rad: DOOR_RAD(88) },
];
/**
 * Seconds end to end. The SF50's AFM gives 8 s for a normal extension; nothing
 * here depends on the exact figure, only on the gear not snapping between
 * states in one frame.
 */
const GEAR_TRANSIT_SECONDS = 8;

const SURFACE_BINDINGS: readonly { name: string; key: SurfaceKey; axis: Vector3; sign: number }[] = [
  { name: "Aileron_Left", key: "aileronLeftRad", axis: SPAN_AXIS, sign: 1 },
  { name: "Aileron_Right", key: "aileronRightRad", axis: SPAN_AXIS, sign: 1 },
  { name: "Elevator", key: "elevatorRad", axis: SPAN_AXIS, sign: 1 },
  { name: "Flap_Left", key: "flapRad", axis: SPAN_AXIS, sign: 1 },
  { name: "Flap_Right", key: "flapRad", axis: SPAN_AXIS, sign: 1 },
  { name: "Rudder", key: "rudderRad", axis: VERTICAL_AXIS, sign: -1 },
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

  const gear: RetractingGear[] = [];
  for (const binding of GEAR_BINDINGS) {
    const node = byName.get(binding.name);
    if (!node) continue;
    gear.push({
      node, rest: restRotation(node), axis: binding.axis, sign: binding.sign,
      rad: binding.rad ?? GEAR_RETRACT_RAD,
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
    gear,
    gearNorm: 1,
    propeller: propNode
      ? { node: propNode, rest: restRotation(propNode), disc, discFromMesh: baked !== null, blades }
      : null,
    propellerAngleRad: 0,
    frameSeconds: DEFAULT_FRAME_SECONDS,
    discVisible: false,
    bound,
  };
}

/** Free only a disc this module built; a baked one belongs to the AssetContainer. */
export function disposeAircraftRig(rig: AircraftRig): void {
  const propeller = rig.propeller;
  if (!propeller?.disc || propeller.discFromMesh) return;
  if (propeller.disc instanceof Mesh) propeller.disc.material?.dispose();
  propeller.disc.dispose();
}

/**
 * Drive the legs toward the lever at a fixed rate.
 *
 * The transit is run here rather than read from the flight model because no
 * flight model in this project has a retraction system to run it — see
 * `readGearCommand`. A zero or negative delta (a paused sim, the first frame)
 * snaps to the commanded position rather than stalling half way.
 */
function applyGear(rig: AircraftRig, command: number, deltaSeconds: number): void {
  if (rig.gear.length === 0) return;
  const target = Number.isFinite(command) ? Math.min(1, Math.max(0, command)) : 1;
  if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
    const step = deltaSeconds / GEAR_TRANSIT_SECONDS;
    rig.gearNorm += Math.min(step, Math.max(-step, target - rig.gearNorm));
  } else {
    rig.gearNorm = target;
  }
  const travel = 1 - rig.gearNorm;
  for (const leg of rig.gear) {
    leg.node.rotationQuaternion = leg.rest.multiply(
      Quaternion.RotationAxis(leg.axis, travel * leg.rad * leg.sign),
    );
  }
}

export function applyAircraftRig(
  rig: AircraftRig,
  state: ControlSurfaceState,
  deltaSeconds: number,
): void {
  for (const part of rig.parts) {
    const angle = state[part.key] * part.sign;
    part.node.rotationQuaternion = part.rest.multiply(Quaternion.RotationAxis(part.axis, angle));
  }

  applyGear(rig, state.gearDownNorm, deltaSeconds);

  const propeller = rig.propeller;
  if (!propeller) return;

  if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
    // A Lycoming turns clockwise seen from the cockpit. Looking forward is
    // looking down -Z, and a positive rotation about +Z reads anticlockwise
    // from there, so the angle decreases.
    rig.propellerAngleRad -= state.propellerRadPerSec * deltaSeconds;
    rig.propellerAngleRad %= 2 * Math.PI;
    rig.frameSeconds += (deltaSeconds - rig.frameSeconds) * FRAME_SMOOTHING;
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
