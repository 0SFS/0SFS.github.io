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
    // The coarse levels merge the control surfaces into their panels and keep
    // the prop.
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

/**
 * The SF50's gear, in glTF axes (+X starboard, +Y up, +Z aft), straight out of
 * generate_sf50.py: each leg's pivot, its wheel's extended centre, and where
 * the generator's own `--gear 0` build puts that wheel once the leg has turned
 * its quarter. Getting the axis or the sign wrong swings a leg the wrong way
 * and is invisible in a still, so the check is that the wheel lands on the
 * stowed point the model was designed around.
 */
const SF50_GEAR = [
  { leg: "LandingGear_Left", pivot: [-1.4835, 1.0535, 0.406], wheel: [-1.707, 0.190, 0.434], stowed: [-0.620, 0.830, 0.434] },
  { leg: "LandingGear_Right", pivot: [1.4835, 1.0535, 0.406], wheel: [1.707, 0.190, 0.434], stowed: [0.620, 0.830, 0.434] },
  { leg: "LandingGear_Nose", pivot: [0, 0.9005, -2.9015], wheel: [0, 0.179, -2.862], stowed: [0, 0.940, -2.180] },
] as const;

function gearRig(target: Scene) {
  const wheels: TransformNode[] = [];
  const nodes: TransformNode[] = [];
  for (const { leg, pivot, wheel } of SF50_GEAR) {
    const legNode = new TransformNode(leg, target);
    legNode.position = new Vector3(...pivot);
    const wheelNode = new TransformNode(leg.replace("LandingGear", "Wheel"), target);
    wheelNode.parent = legNode;
    wheelNode.position = new Vector3(...wheel).subtract(legNode.position);
    nodes.push(legNode);
    wheels.push(wheelNode);
  }
  return { rig: bindAircraftRig(nodes), wheels };
}

function worldPositions(wheels: readonly TransformNode[]) {
  return wheels.map((wheel) => wheel.computeWorldMatrix(true).getTranslation());
}

describe("retractable gear", () => {
  it("binds the three legs and starts down", () => {
    const s = scene();
    const { rig } = gearRig(s.scene);
    expect(rig.gear).toHaveLength(3);
    expect(rig.gearNorm).toBe(1);
    s.scene.dispose(); s.engine.dispose();
  });

  it("swings each leg onto its stowed position", () => {
    const s = scene();
    const { rig, wheels } = gearRig(s.scene);
    applyAircraftRig(rig, { ...NEUTRAL_CONTROL_SURFACES, gearDownNorm: 0 }, 0);
    const stowedAt = worldPositions(wheels);
    SF50_GEAR.forEach(({ stowed, leg }, index) => {
      const got = stowedAt[index];
      expect(`${leg} ${got.x.toFixed(3)} ${got.y.toFixed(3)} ${got.z.toFixed(3)}`)
        .toBe(`${leg} ${stowed[0].toFixed(3)} ${stowed[1].toFixed(3)} ${stowed[2].toFixed(3)}`);
    });
    s.scene.dispose(); s.engine.dispose();
  });

  it("puts the wheels back exactly where they were when it is lowered again", () => {
    const s = scene();
    const { rig, wheels } = gearRig(s.scene);
    const down = worldPositions(wheels);
    applyAircraftRig(rig, { ...NEUTRAL_CONTROL_SURFACES, gearDownNorm: 0 }, 0);
    applyAircraftRig(rig, NEUTRAL_CONTROL_SURFACES, 0);
    worldPositions(wheels).forEach((got, index) => {
      expect(Vector3.Distance(got, down[index])).toBeLessThan(1e-6);
    });
    s.scene.dispose(); s.engine.dispose();
  });

  it("takes the transit time to travel rather than snapping", () => {
    const s = scene();
    const { rig } = gearRig(s.scene);
    const up = { ...NEUTRAL_CONTROL_SURFACES, gearDownNorm: 0 };
    applyAircraftRig(rig, up, 1);
    expect(rig.gearNorm).toBeGreaterThan(0.8);
    expect(rig.gearNorm).toBeLessThan(1);
    for (let step = 0; step < 20; step += 1) applyAircraftRig(rig, up, 1);
    expect(rig.gearNorm).toBe(0);
    s.scene.dispose(); s.engine.dispose();
  });

  it("snaps to the commanded position when no time has passed", () => {
    // A paused sim, or the first frame after a model swap: half-retracted gear
    // that never finishes is worse than gear that is simply where it is told.
    const s = scene();
    const { rig } = gearRig(s.scene);
    applyAircraftRig(rig, { ...NEUTRAL_CONTROL_SURFACES, gearDownNorm: 0 }, 0);
    expect(rig.gearNorm).toBe(0);
    s.scene.dispose(); s.engine.dispose();
  });

  it("leaves a fixed-gear airframe alone", () => {
    const s = scene();
    const rig = rigOf(["Propeller"], s.scene);
    expect(rig.gear).toHaveLength(0);
    expect(() => applyAircraftRig(rig, { ...NEUTRAL_CONTROL_SURFACES, gearDownNorm: 0 }, 1))
      .not.toThrow();
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
      "gear/gear-cmd-norm": 0,
    };
    const sdk = { getPropertyValue: (name: string) => values[name] ?? NaN } as unknown as JSBSimSdk;
    const state = readControlSurfaceState(sdk);
    expect(state.aileronLeftRad).toBe(0.2);
    expect(state.aileronRightRad).toBe(-0.2);
    expect(state.elevatorRad).toBe(-0.1);
    expect(state.flapRad).toBeCloseTo(Math.PI / 6, 6);
    expect(state.propellerRadPerSec).toBeCloseTo((2400 * 2 * Math.PI) / 60, 6);
    expect(state.gearDownNorm).toBe(0);
  });

  it("answers 'down' when the gear lever cannot be read", () => {
    // The property is absent on some models and reads NaN; gear that will not
    // come up is a better failure than gear that is not there on landing.
    const sdk = { getPropertyValue: () => NaN } as unknown as JSBSimSdk;
    expect(readControlSurfaceState(sdk).gearDownNorm).toBe(1);
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


describe("baked swept disc", () => {
  it("prefers a disc swept from the blade over the flat fallback, and leaves it to the container", () => {
    const s = scene();
    const prop = new TransformNode("Propeller", s.scene);
    const baked = new TransformNode("Propeller_Disc", s.scene);
    const rig = bindAircraftRig([prop, baked], { scene: s.scene, propellerBlades: 2 });

    expect(rig.propeller!.disc).toBe(baked);
    expect(rig.propeller!.discFromMesh).toBe(true);
    expect(baked.isEnabled()).toBe(false);

    applyAircraftRig(rig, { ...NEUTRAL_CONTROL_SURFACES, propellerRadPerSec: 300 }, 1 / 60);
    expect(baked.isEnabled()).toBe(true);
    expect(prop.isEnabled()).toBe(false);

    // The mesh owns it, so the rig must not dispose it.
    disposeAircraftRig(rig);
    expect(baked.isDisposed()).toBe(false);
    s.scene.dispose(); s.engine.dispose();
  });
});
