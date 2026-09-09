import { Quaternion, TransformNode, Vector3 } from "@babylonjs/core";
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
}

export const NEUTRAL_CONTROL_SURFACES: ControlSurfaceState = {
  aileronLeftRad: 0, aileronRightRad: 0, elevatorRad: 0,
  rudderRad: 0, flapRad: 0, propellerRadPerSec: 0,
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

let resolvedRpmProperty: string | null | undefined;

function readNumber(sdk: JSBSimSdk, property: string): number {
  try {
    const value = sdk.getPropertyValue(property);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function readPropellerRpm(sdk: JSBSimSdk): number {
  if (resolvedRpmProperty === undefined) {
    resolvedRpmProperty = null;
    for (const property of RPM_PROPERTIES) {
      try {
        if (Number.isFinite(sdk.getPropertyValue(property))) {
          resolvedRpmProperty = property;
          break;
        }
      } catch {
        // try the next spelling
      }
    }
  }
  return resolvedRpmProperty ? readNumber(sdk, resolvedRpmProperty) : 0;
}

/** Test seam: forget the cached RPM property name. */
export function resetPropellerRpmProperty(): void {
  resolvedRpmProperty = undefined;
}

export function readControlSurfaceState(sdk: JSBSimSdk): ControlSurfaceState {
  return {
    aileronLeftRad: readNumber(sdk, "fcs/left-aileron-pos-rad"),
    aileronRightRad: readNumber(sdk, "fcs/right-aileron-pos-rad"),
    elevatorRad: readNumber(sdk, "fcs/elevator-pos-rad"),
    rudderRad: readNumber(sdk, "fcs/rudder-pos-rad"),
    flapRad: readNumber(sdk, "fcs/flap-pos-deg") * DEG_TO_RAD,
    propellerRadPerSec: readPropellerRpm(sdk) * RPM_TO_RAD_PER_SEC,
  };
}

type SurfaceKey = keyof Omit<ControlSurfaceState, "propellerRadPerSec">;

interface HingedPart {
  node: TransformNode;
  rest: Quaternion;
  axis: Vector3;
  sign: number;
  key: SurfaceKey;
}

export interface AircraftRig {
  parts: HingedPart[];
  propeller: { node: TransformNode; rest: Quaternion } | null;
  propellerAngleRad: number;
  /** Node names present in the loaded mesh, for diagnostics. */
  bound: string[];
}

const SPAN_AXIS = new Vector3(1, 0, 0);
const VERTICAL_AXIS = new Vector3(0, 1, 0);
const THRUST_AXIS = new Vector3(0, 0, 1);

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
export function bindAircraftRig(nodes: readonly TransformNode[]): AircraftRig {
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

  const propNode = byName.get("Propeller");
  if (propNode) bound.push("Propeller");

  return {
    parts,
    propeller: propNode ? { node: propNode, rest: restRotation(propNode) } : null,
    propellerAngleRad: 0,
    bound,
  };
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

  if (!rig.propeller) return;
  if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
    // A Lycoming turns clockwise seen from the cockpit. Looking forward is
    // looking down -Z, and a positive rotation about +Z reads anticlockwise
    // from there, so the angle decreases.
    rig.propellerAngleRad -= state.propellerRadPerSec * deltaSeconds;
    rig.propellerAngleRad %= 2 * Math.PI;
  }
  rig.propeller.node.rotationQuaternion = rig.propeller.rest.multiply(
    Quaternion.RotationAxis(THRUST_AXIS, rig.propellerAngleRad),
  );
}
