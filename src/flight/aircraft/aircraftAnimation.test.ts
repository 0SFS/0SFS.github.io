import {
  MeshBuilder, NullEngine, PBRMaterial, Quaternion, Scene, Texture, TransformNode, Vector3,
} from "@babylonjs/core";
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
  TYRE_BLURRED_U,
  TYRE_SHARP_U,
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
  // Stowed at the MEASURED well, 0.90 m off the centreline (it was 1.110 for a
  // build, which made the leg 0.60 m where the aeroplane's is 0.71).
  { leg: "LandingGear_Left", pivot: [-1.607, 0.897, 0.406], wheel: [-1.707, 0.190, 0.434], stowed: [-0.900, 0.797, 0.434] },
  { leg: "LandingGear_Right", pivot: [1.607, 0.897, 0.406], wheel: [1.707, 0.190, 0.434], stowed: [0.900, 0.797, 0.434] },
  { leg: "LandingGear_Nose", pivot: [0, 0.8235, -2.6055], wheel: [0, 0.179, -2.862], stowed: [0, 1.080, -3.250] },
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
    const { rig, wheels } = gearRig(s.scene);
    expect(rig.gear).toHaveLength(3);
    applyAircraftRig(rig, NEUTRAL_CONTROL_SURFACES, 0);
    worldPositions(wheels).forEach((got, index) => {
      expect(Vector3.Distance(got, new Vector3(...SF50_GEAR[index].wheel))).toBeLessThan(1e-6);
    });
    s.scene.dispose(); s.engine.dispose();
  });

  it("shuts the nose bay doors as the gear comes up, and only then", () => {
    // The doors are exported OPEN, so gear-down has to leave them exactly
    // where they were authored: any rotation at all at gearDownNorm 1 would
    // stand them proud of a skin they are meant to be flush against.
    const s = scene();
    const names = ["BayDoor_Nose_Left", "BayDoor_Nose_Right"];
    const doors = names.map((name) => new TransformNode(name, s.scene));
    const rig = bindAircraftRig(doors);
    expect(rig.gear).toHaveLength(2);

    applyAircraftRig(rig, NEUTRAL_CONTROL_SURFACES, 0);
    for (const door of doors) {
      expect(Quaternion.Identity().subtract(door.rotationQuaternion!).length())
        .toBeLessThan(1e-9);
    }

    applyAircraftRig(rig, { ...NEUTRAL_CONTROL_SURFACES, gearDownNorm: 0 }, 0);
    // 88 deg, and mirrored: they part in the middle and open sideways. A door
    // that turned a quarter would swing through the skin.
    const angles = doors.map((door) => 2 * Math.acos(
      Math.min(1, Math.abs(door.rotationQuaternion!.w))) * (180 / Math.PI));
    expect(angles[0]).toBeCloseTo(88, 4);
    expect(angles[1]).toBeCloseTo(88, 4);
    expect(doors[0].rotationQuaternion!.z)
      .toBeCloseTo(-doors[1].rotationQuaternion!.z, 6);
    s.scene.dispose(); s.engine.dispose();
  });

  it("shuts each nose door onto the mouth the generator shuts it onto", () => {
    // Straight out of the generator, in glTF axes: where a door's free edge
    // sits relative to its hinge with the gear down (as exported) and with the
    // gear up (`--gear 0`). Getting the hinge AXIS wrong still produces a door
    // that swings the right number of degrees, so the angle check above passes
    // and the panel still ends up somewhere else entirely. This is the check
    // that caught it lying parallel to the ground instead of to the belly.
    const CASES = [
      { name: "BayDoor_Nose_Left", down: [0.0165, -0.2345, 0.3705], up: [0.1716, -0.0552, 0.4000] },
      { name: "BayDoor_Nose_Right", down: [-0.0165, -0.2345, 0.3705], up: [-0.1716, -0.0552, 0.4000] },
      { name: "BayDoor_Main_Left", down: [-0.4845, -0.5947, -0.3096], up: [0.7500, -0.0856, -0.3383] },
      { name: "BayDoor_Main_Right", down: [0.4845, -0.5947, -0.3096], up: [-0.7500, -0.0856, -0.3383] },
    ] as const;
    const s = scene();
    for (const { name, down, up } of CASES) {
      const node = new TransformNode(name, s.scene);
      const free = new TransformNode(`${name}_free`, s.scene);
      free.parent = node;
      free.position = new Vector3(...down);
      const rig = bindAircraftRig([node]);
      applyAircraftRig(rig, { ...NEUTRAL_CONTROL_SURFACES, gearDownNorm: 0 }, 0);
      const got = free.computeWorldMatrix(true).getTranslation();
      expect(Vector3.Distance(got, new Vector3(...up))).toBeLessThan(2e-3);
    }
    s.scene.dispose(); s.engine.dispose();
  });

  it("folds the leg before it shuts the doors, and opens them before it drops", () => {
    const s = scene();
    const leg = new TransformNode("LandingGear_Nose", s.scene);
    const door = new TransformNode("BayDoor_Nose_Left", s.scene);
    const rig = bindAircraftRig([leg, door]);
    const turned = (node: TransformNode): number => 2 * Math.acos(
      Math.min(1, Math.abs(node.rotationQuaternion!.w)));

    // A third of the way up the leg is well on its way and the doors have not
    // started: shutting them over a leg still coming through is the failure.
    applyAircraftRig(rig, { ...NEUTRAL_CONTROL_SURFACES, gearDownNorm: 2 / 3 }, 0);
    expect(turned(leg)).toBeGreaterThan(0.2);
    expect(turned(door)).toBeLessThan(1e-9);

    // Near the top the doors are moving and the leg is finished.
    applyAircraftRig(rig, { ...NEUTRAL_CONTROL_SURFACES, gearDownNorm: 0.1 }, 0);
    expect(turned(door)).toBeGreaterThan(0.2);
    expect(turned(leg)).toBeCloseTo(Math.PI / 2, 6);

    // Both ends of the cycle still land exactly where they are authored.
    applyAircraftRig(rig, NEUTRAL_CONTROL_SURFACES, 0);
    expect(turned(leg)).toBeLessThan(1e-9);
    expect(turned(door)).toBeLessThan(1e-9);
    applyAircraftRig(rig, { ...NEUTRAL_CONTROL_SURFACES, gearDownNorm: 0 }, 0);
    expect(turned(leg)).toBeCloseTo(Math.PI / 2, 6);
    expect(turned(door)).toBeCloseTo((88 * Math.PI) / 180, 6);
    s.scene.dispose(); s.engine.dispose();
  });

  it("leaves an airframe whose level has no bays alone", () => {
    // Only the finest level cuts the openings, so the coarse ones ship legs
    // and no doors. Binding whatever is there is what makes that free.
    const s = scene();
    const { rig } = gearRig(s.scene);
    expect(rig.bound.filter((name) => name.startsWith("BayDoor"))).toEqual([]);
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

  it("poses a partial physical extension without advancing it with display time", () => {
    const s = scene();
    const { rig, wheels } = gearRig(s.scene);
    const halfway = { ...NEUTRAL_CONTROL_SURFACES, gearDownNorm: 0.5 };
    applyAircraftRig(rig, halfway, 1 / 60);
    const positions = worldPositions(wheels);
    expect(Vector3.Distance(positions[0], new Vector3(...SF50_GEAR[0].wheel))).toBeGreaterThan(0.1);
    for (const fps of [10, 30, 60, 120]) {
      for (let frame = 0; frame < fps; frame += 1) applyAircraftRig(rig, halfway, 1 / fps);
      worldPositions(wheels).forEach((got, index) => {
        expect(Vector3.Distance(got, positions[index])).toBeLessThan(1e-9);
      });
    }
    s.scene.dispose(); s.engine.dispose();
  });

  it("shows the latest physical position on the first frame", () => {
    const s = scene();
    const { rig, wheels } = gearRig(s.scene);
    applyAircraftRig(rig, { ...NEUTRAL_CONTROL_SURFACES, gearDownNorm: 0 }, 0);
    worldPositions(wheels).forEach((got, index) => {
      expect(Vector3.Distance(got, new Vector3(...SF50_GEAR[index].stowed))).toBeLessThan(1e-6);
    });
    s.scene.dispose(); s.engine.dispose();
  });

  it("holds a transit under way while the simulation is held", () => {
    // Paused, with the camera orbiting: frames still arrive with a real
    // interval, and the gear must neither keep moving nor snap to its end.
    const s = scene();
    const { rig, wheels } = gearRig(s.scene);
    const halfway = { ...NEUTRAL_CONTROL_SURFACES, gearDownNorm: 0.5 };
    const up = { ...NEUTRAL_CONTROL_SURFACES, gearDownNorm: 0 };
    applyAircraftRig(rig, halfway, 1);
    const midway = worldPositions(wheels);
    for (let frame = 0; frame < 20; frame += 1) applyAircraftRig(rig, halfway, 1, { simulationHeld: true });
    worldPositions(wheels).forEach((got, index) => {
      expect(Vector3.Distance(got, midway[index])).toBeLessThan(1e-9);
    });
    applyAircraftRig(rig, up, 1);
    expect(Vector3.Distance(worldPositions(wheels)[0], midway[0])).toBeGreaterThan(0.1);
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

describe("rolling wheels", () => {
  // Three tyres sharing one material and its atlas, as the exporter writes
  // them (planes/shared/tyres.py). `textured` false is a coarse level's plain
  // rubber tyre, which has no atlas.
  function wheelRig(speed: number, onGround = true, textured = true) {
    const s = scene();
    const material = new PBRMaterial("SF50_Tyre", s.scene);
    const atlas = textured ? new Texture(null, s.scene) : null;
    if (atlas) material.albedoTexture = atlas;
    const nodes: TransformNode[] = [];
    for (const side of ["Left", "Right", "Nose"]) {
      const mesh = MeshBuilder.CreateCylinder(`Wheel_${side}`, { diameter: 0.38, height: 0.14 }, s.scene);
      mesh.rotation.z = Math.PI / 2;              // axle along X, as exported
      mesh.bakeCurrentTransformIntoVertices();
      mesh.material = material;
      nodes.push(mesh);
    }
    const rig = bindAircraftRig(nodes, { scene: s.scene });
    return {
      ...s, rig, nodes, atlas,
      state: { ...NEUTRAL_CONTROL_SURFACES, groundSpeedMps: speed, onGround },
    };
  }

  it("measures each tyre's radius off its own mesh, and finds their one atlas", () => {
    const t = wheelRig(0);
    expect(t.rig.wheels).toHaveLength(3);
    for (const wheel of t.rig.wheels) expect(wheel.radius).toBeCloseTo(0.19, 2);
    // One texture however many tyres share it: blurring is one number.
    expect(t.rig.tyreTextures).toEqual([t.atlas]);
    // Held at the sharp half from the start, and NOT at zero - see TYRE_SHARP_U.
    expect(t.atlas?.uOffset).toBe(TYRE_SHARP_U);
    expect(TYRE_SHARP_U).not.toBe(0);
    t.scene.dispose(); t.engine.dispose();
  });

  it("blurs a tyre without a second mesh", () => {
    // The blur used to be a twin of every tyre, hidden until needed. It is the
    // same mesh reading the other half of its texture now, so the loaded nodes
    // are exactly the tyres and nothing is ever hidden to make it work.
    const t = wheelRig(40);
    applyAircraftRig(t.rig, t.state, 1 / 60);
    expect(t.rig.wheelBlurred).toBe(true);
    expect(t.nodes.map((node) => node.name)).toEqual(["Wheel_Left", "Wheel_Right", "Wheel_Nose"]);
    for (const node of t.nodes) expect(node.isEnabled()).toBe(true);
    t.scene.dispose(); t.engine.dispose();
  });

  it("rolls at ground speed over radius, and not at all in the air", () => {
    const t = wheelRig(1.9);                      // 10 rad/s on a 0.19 m tyre
    applyAircraftRig(t.rig, t.state, 0.1);
    expect(Math.abs(t.rig.wheelAngleRad)).toBeCloseTo(1, 3);
    const rolled = t.rig.wheelAngleRad;
    applyAircraftRig(t.rig, { ...t.state, onGround: false }, 0.1);
    expect(t.rig.wheelAngleRad).toBe(rolled);     // held, not driven
    t.scene.dispose(); t.engine.dispose();
  });

  it("rolls forward: the top of the tyre moves toward the nose", () => {
    // The nose is -Z (see the module header). A tyre rolling without slip
    // carries its top tread forward and its contact patch stays put, so after
    // a short roll the point that was on top has moved toward -Z.
    const t = wheelRig(1.9);
    applyAircraftRig(t.rig, t.state, 0.05);       // half a radian
    for (const node of t.nodes) {
      const top = Vector3.TransformCoordinates(new Vector3(0, 0.19, 0), node.computeWorldMatrix(true));
      expect(top.z).toBeLessThan(-0.05);
      const bottom = Vector3.TransformCoordinates(new Vector3(0, -0.19, 0), node.computeWorldMatrix(true));
      expect(bottom.z).toBeGreaterThan(0.05);
    }
    t.scene.dispose(); t.engine.dispose();
  });

  it("holds the tyres while the simulation is held, however the camera renders", () => {
    // Paused on the runway at speed: JSBSim still reports that ground speed,
    // and orbiting the camera renders frames with a real interval.
    const t = wheelRig(10);
    applyAircraftRig(t.rig, t.state, 1 / 60);
    const angle = t.rig.wheelAngleRad;
    for (let frame = 0; frame < 30; frame += 1) {
      applyAircraftRig(t.rig, t.state, 1 / 60, { simulationHeld: true });
    }
    expect(t.rig.wheelAngleRad).toBe(angle);
    // Display time is still display time: the alias limit keeps tracking it.
    for (let frame = 0; frame < 200; frame += 1) {
      applyAircraftRig(t.rig, t.state, 1 / 144, { simulationHeld: true });
    }
    expect(t.rig.frameSeconds).toBeCloseTo(1 / 144, 4);
    t.scene.dispose(); t.engine.dispose();
  });

  it("moves the atlas to its blurred half once the band aliases, and back", () => {
    // The band runs through the hub, so the image repeats TWICE per turn and
    // the limit is PI / 2 / frame: 15 rev/s at 60 fps, about 35 kt on this
    // tyre. Just under it the band is still the truth.
    const t = wheelRig(17);                       // 89 rad/s, limit 94
    applyAircraftRig(t.rig, t.state, 1 / 60);
    expect(t.rig.wheelBlurred).toBe(false);
    expect(t.atlas?.uOffset).toBe(TYRE_SHARP_U);

    applyAircraftRig(t.rig, { ...t.state, groundSpeedMps: 25 }, 1 / 60);
    expect(t.rig.wheelBlurred).toBe(true);
    expect(t.atlas?.uOffset).toBe(TYRE_BLURRED_U);
    // Half the atlas along: the other square, whichever way it wraps.
    expect(Math.abs(TYRE_BLURRED_U - TYRE_SHARP_U) % 1).toBe(0.5);

    // Hysteresis: sitting just under the limit on the way down stays blurred
    // rather than flickering between the two.
    applyAircraftRig(t.rig, { ...t.state, groundSpeedMps: 17 }, 1 / 60);
    expect(t.rig.wheelBlurred).toBe(true);
    applyAircraftRig(t.rig, { ...t.state, groundSpeedMps: 0 }, 1 / 60);
    expect(t.rig.wheelBlurred).toBe(false);
    expect(t.atlas?.uOffset).toBe(TYRE_SHARP_U);
    t.scene.dispose(); t.engine.dispose();
  });

  it("judges the limit against the real frame rate, with or without a propeller", () => {
    // A jet has no propeller, and the frame interval used to be measured only
    // in the propeller branch - so its tyres were held to 60 fps on any display.
    const t = wheelRig(25);
    for (let i = 0; i < 200; i += 1) applyAircraftRig(t.rig, t.state, 1 / 144);
    // At 144 Hz the limit is 2.4x higher and 25 m/s no longer aliases.
    expect(t.rig.frameSeconds).toBeCloseTo(1 / 144, 4);
    expect(t.rig.wheelBlurred).toBe(false);
    t.scene.dispose(); t.engine.dispose();
  });

  it("still rolls a plain rubber tyre, which has nothing to blur", () => {
    const t = wheelRig(40, true, false);
    applyAircraftRig(t.rig, t.state, 1 / 60);
    expect(t.rig.tyreTextures).toHaveLength(0);
    expect(t.rig.wheelAngleRad).not.toBe(0);
    for (const node of t.nodes) expect(node.isEnabled()).toBe(true);
    t.scene.dispose(); t.engine.dispose();
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
    // Paused with the camera orbiting: real frame intervals, engine still at rpm.
    applyAircraftRig(rig, { ...NEUTRAL_CONTROL_SURFACES, propellerRadPerSec: 10 }, 0.1, { simulationHeld: true });
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
