import { NullEngine, Quaternion, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { beforeEach, describe, expect, it } from "vitest";
import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import {
  applyAircraftRig,
  bindAircraftRig,
  disposeAircraftRig,
  maxReadableRadPerSec,
  NEUTRAL_CONTROL_SURFACES,
  readControlSurfaceState,
  resetPropellerRpmProperty,
} from "./aircraftAnimation";

const PART_NAMES = [
  "Aileron_Left", "Aileron_Right", "Elevator", "Flap_Left", "Flap_Right", "Rudder", "Propeller",
];

function scene() {
  const engine = new NullEngine();
  return { engine, scene: new Scene(engine) };
}

function rigOf(names: readonly string[], target: Scene) {
  return bindAircraftRig(names.map((name) => new TransformNode(name, target)));
}

/** Where a trailing-edge point ends up after the node's rotation is applied. */
function trailingEdgeAfter(node: TransformNode): Vector3 {
  return Vector3.Zero().copyFrom(new Vector3(0, 0, 1))
    .rotateByQuaternionToRef(node.rotationQuaternion!, Vector3.Zero());
}

describe("aircraft rig binding", () => {
  it("binds every moving part the full-detail mesh exposes", () => {
    const s = scene();
    const rig = rigOf(PART_NAMES, s.scene);
    expect(rig.bound).toEqual(PART_NAMES);
    expect(rig.parts).toHaveLength(6);
    expect(rig.propeller).not.toBeNull();
    s.scene.dispose(); s.engine.dispose();
  });

  it("skips absent parts, so the coarse levels bind without special cases", () => {
    const s = scene();
    // LOD2/LOD3 merge the control surfaces into their panels and keep the prop.
    const rig = rigOf(["Propeller"], s.scene);
    expect(rig.parts).toHaveLength(0);
    expect(rig.propeller).not.toBeNull();
    expect(() => applyAircraftRig(rig, NEUTRAL_CONTROL_SURFACES, 0.016)).not.toThrow();
    s.scene.dispose(); s.engine.dispose();
  });

  it("tolerates the de-duplication suffix Babylon adds on name collisions", () => {
    const s = scene();
    const rig = rigOf(["Elevator.001"], s.scene);
    expect(rig.bound).toEqual(["Elevator"]);
    s.scene.dispose(); s.engine.dispose();
  });

  it("preserves a part's authored rest rotation", () => {
    const s = scene();
    const node = new TransformNode("Elevator", s.scene);
    node.rotationQuaternion = Quaternion.RotationAxis(new Vector3(0, 1, 0), 0.3);
    const rig = bindAircraftRig([node]);
    applyAircraftRig(rig, NEUTRAL_CONTROL_SURFACES, 0);
    // A neutral deflection must return the part exactly to where it was authored.
    expect(node.rotationQuaternion!.y).toBeCloseTo(Math.sin(0.15), 6);
    s.scene.dispose(); s.engine.dispose();
  });
});

describe("control surface geometry", () => {
  it("drops the trailing edge for a positive elevator deflection", () => {
    // Cmde is negative, so positive elevator-pos-rad pitches the nose down,
    // which is trailing edge down.
    const s = scene();
    const rig = rigOf(["Elevator"], s.scene);
    applyAircraftRig(rig, { ...NEUTRAL_CONTROL_SURFACES, elevatorRad: 0.3 }, 0);
    const te = trailingEdgeAfter(rig.parts[0].node);
    expect(te.y).toBeLessThan(-0.2);
    s.scene.dispose(); s.engine.dispose();
  });

  it("moves the ailerons in opposite directions for a roll input", () => {
    const s = scene();
    const rig = rigOf(["Aileron_Left", "Aileron_Right"], s.scene);
    // JSBSim already negates the right aileron's gain, so a roll command
    // arrives as equal and opposite radian positions.
    applyAircraftRig(rig, {
      ...NEUTRAL_CONTROL_SURFACES, aileronLeftRad: 0.25, aileronRightRad: -0.25,
    }, 0);
    const left = trailingEdgeAfter(rig.parts[0].node);
    const right = trailingEdgeAfter(rig.parts[1].node);
    expect(left.y).toBeLessThan(-0.1);
    expect(right.y).toBeGreaterThan(0.1);
    expect(left.y).toBeCloseTo(-right.y, 6);
    s.scene.dispose(); s.engine.dispose();
  });

  it("swings the rudder trailing edge to port for a positive deflection", () => {
    // Cndr is negative, so positive rudder-pos-rad yaws the nose left.
    const s = scene();
    const rig = rigOf(["Rudder"], s.scene);
    applyAircraftRig(rig, { ...NEUTRAL_CONTROL_SURFACES, rudderRad: 0.25 }, 0);
    const te = trailingEdgeAfter(rig.parts[0].node);
    expect(te.x).toBeLessThan(-0.1);   // -X is port
    expect(Math.abs(te.y)).toBeLessThan(1e-6);
    s.scene.dispose(); s.engine.dispose();
  });

  it("lowers both flaps together", () => {
    const s = scene();
    const rig = rigOf(["Flap_Left", "Flap_Right"], s.scene);
    applyAircraftRig(rig, { ...NEUTRAL_CONTROL_SURFACES, flapRad: 0.52 }, 0);
    for (const part of rig.parts) expect(trailingEdgeAfter(part.node).y).toBeLessThan(-0.4);
    s.scene.dispose(); s.engine.dispose();
  });
});

describe("propeller", () => {
  it("advances with elapsed time and turns clockwise seen from the cockpit", () => {
    const s = scene();
    const rig = rigOf(["Propeller"], s.scene);
    const state = { ...NEUTRAL_CONTROL_SURFACES, propellerRadPerSec: 10 };
    applyAircraftRig(rig, state, 0.1);
    expect(rig.propellerAngleRad).toBeCloseTo(-1, 6);
    applyAircraftRig(rig, state, 0.1);
    expect(rig.propellerAngleRad).toBeCloseTo(-2, 6);
    s.scene.dispose(); s.engine.dispose();
  });

  it("holds its angle when the engine is stopped or the sim is paused", () => {
    const s = scene();
    const rig = rigOf(["Propeller"], s.scene);
    applyAircraftRig(rig, { ...NEUTRAL_CONTROL_SURFACES, propellerRadPerSec: 10 }, 0.1);
    const held = rig.propellerAngleRad;
    applyAircraftRig(rig, { ...NEUTRAL_CONTROL_SURFACES, propellerRadPerSec: 10 }, 0);
    expect(rig.propellerAngleRad).toBe(held);
    applyAircraftRig(rig, { ...NEUTRAL_CONTROL_SURFACES, propellerRadPerSec: 0 }, 0.1);
    expect(rig.propellerAngleRad).toBe(held);
    s.scene.dispose(); s.engine.dispose();
  });
});

describe("reading JSBSim", () => {
  beforeEach(() => resetPropellerRpmProperty());

  it("maps positions, converts flap degrees and engine rpm", () => {
    const values: Record<string, number> = {
      "fcs/left-aileron-pos-rad": 0.2,
      "fcs/right-aileron-pos-rad": -0.2,
      "fcs/elevator-pos-rad": -0.1,
      "fcs/rudder-pos-rad": 0.05,
      "fcs/flap-pos-deg": 30,
      "propulsion/engine[0]/propeller-rpm": 2400,
    };
    const sdk = { getPropertyValue: (name: string) => values[name] ?? NaN } as unknown as JSBSimSdk;
    const state = readControlSurfaceState(sdk);
    expect(state.aileronLeftRad).toBe(0.2);
    expect(state.aileronRightRad).toBe(-0.2);
    expect(state.elevatorRad).toBe(-0.1);
    expect(state.flapRad).toBeCloseTo(Math.PI / 6, 6);
    expect(state.propellerRadPerSec).toBeCloseTo((2400 * 2 * Math.PI) / 60, 6);
  });

  it("falls back through the alternative rpm property spellings", () => {
    const sdk = {
      getPropertyValue: (name: string) =>
        name === "propulsion/engine/engine-rpm" ? 1200 : NaN,
    } as unknown as JSBSimSdk;
    expect(readControlSurfaceState(sdk).propellerRadPerSec).toBeCloseTo((1200 * 2 * Math.PI) / 60, 6);
  });

  it("reads zero rather than throwing when a property is missing", () => {
    const sdk = {
      getPropertyValue: () => { throw new Error("no such property"); },
    } as unknown as JSBSimSdk;
    expect(readControlSurfaceState(sdk)).toEqual(NEUTRAL_CONTROL_SURFACES);
  });
});

describe("propeller disc", () => {
  const RPM = (rpm: number) => (rpm * 2 * Math.PI) / 60;

  function discRig(blades = 2) {
    const s = scene();
    const node = new TransformNode("Propeller", s.scene);
    const rig = bindAircraftRig([node], { scene: s.scene, propellerBlades: blades });
    return { ...s, node, rig };
  }

  it("puts the readable limit at half a blade repeat per frame", () => {
    // Two blades at 60 fps: 90 deg per frame, about 900 rpm.
    expect(maxReadableRadPerSec(2, 1 / 60)).toBeCloseTo(Math.PI * 30, 6);
    expect(maxReadableRadPerSec(2, 1 / 60) * (60 / (2 * Math.PI))).toBeCloseTo(900, 3);
    // More blades repeat sooner, so they alias earlier.
    expect(maxReadableRadPerSec(4, 1 / 60)).toBeCloseTo(Math.PI * 15, 6);
    // A higher refresh rate can resolve more.
    expect(maxReadableRadPerSec(2, 1 / 120)).toBeCloseTo(Math.PI * 60, 6);
    // A jet has no blades to alias.
    expect(maxReadableRadPerSec(0, 1 / 60)).toBe(Number.POSITIVE_INFINITY);
  });

  it("shows the blades at idle and the disc once they alias", () => {
    const t = discRig();
    const disc = t.rig.propeller!.disc!;

    for (let i = 0; i < 40; i += 1) {
      applyAircraftRig(t.rig, { ...NEUTRAL_CONTROL_SURFACES, propellerRadPerSec: RPM(700) }, 1 / 60);
    }
    expect(t.rig.discVisible).toBe(false);
    expect(disc.isEnabled()).toBe(false);
    expect(t.node.isEnabled()).toBe(true);

    for (let i = 0; i < 40; i += 1) {
      applyAircraftRig(t.rig, { ...NEUTRAL_CONTROL_SURFACES, propellerRadPerSec: RPM(2300) }, 1 / 60);
    }
    expect(t.rig.discVisible).toBe(true);
    expect(disc.isEnabled()).toBe(true);
    expect(t.node.isEnabled()).toBe(false);

    t.scene.dispose(); t.engine.dispose();
  });

  it("does not flicker for a propeller sitting on the threshold", () => {
    const t = discRig();
    const limit = maxReadableRadPerSec(2, 1 / 60);
    for (let i = 0; i < 30; i += 1) {
      applyAircraftRig(t.rig, { ...NEUTRAL_CONTROL_SURFACES, propellerRadPerSec: limit * 1.05 }, 1 / 60);
    }
    expect(t.rig.discVisible).toBe(true);
    // Dropping just below the limit keeps the disc; hysteresis holds until 0.8x.
    applyAircraftRig(t.rig, { ...NEUTRAL_CONTROL_SURFACES, propellerRadPerSec: limit * 0.95 }, 1 / 60);
    expect(t.rig.discVisible).toBe(true);
    applyAircraftRig(t.rig, { ...NEUTRAL_CONTROL_SURFACES, propellerRadPerSec: limit * 0.5 }, 1 / 60);
    expect(t.rig.discVisible).toBe(false);
    t.scene.dispose(); t.engine.dispose();
  });

  it("aliases sooner on a slower display", () => {
    const t = discRig();
    const rate = RPM(1200);
    for (let i = 0; i < 40; i += 1) {
      applyAircraftRig(t.rig, { ...NEUTRAL_CONTROL_SURFACES, propellerRadPerSec: rate }, 1 / 144);
    }
    expect(t.rig.discVisible).toBe(false);   // 144 fps still resolves 1200 rpm
    for (let i = 0; i < 40; i += 1) {
      applyAircraftRig(t.rig, { ...NEUTRAL_CONTROL_SURFACES, propellerRadPerSec: rate }, 1 / 30);
    }
    expect(t.rig.discVisible).toBe(true);    // 30 fps cannot
    t.scene.dispose(); t.engine.dispose();
  });

  it("builds no disc for a jet or when no scene is supplied", () => {
    const jet = discRig(0);
    expect(jet.rig.propeller!.disc).toBeNull();
    expect(() => applyAircraftRig(jet.rig, NEUTRAL_CONTROL_SURFACES, 1 / 60)).not.toThrow();
    jet.scene.dispose(); jet.engine.dispose();

    const s = scene();
    const rig = bindAircraftRig([new TransformNode("Propeller", s.scene)]);
    expect(rig.propeller!.disc).toBeNull();
    s.scene.dispose(); s.engine.dispose();
  });

  it("disposes the disc it created", () => {
    const t = discRig();
    const disc = t.rig.propeller!.disc!;
    disposeAircraftRig(t.rig);
    expect(disc.isDisposed()).toBe(true);
    t.scene.dispose(); t.engine.dispose();
  });
});
