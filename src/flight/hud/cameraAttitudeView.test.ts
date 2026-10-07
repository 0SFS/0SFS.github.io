import { NullEngine, Quaternion, Scene, TransformNode, UniversalCamera, Vector3 } from "@babylonjs/core";
import { afterEach, describe, expect, it } from "vitest";
import { flightAttitudeToQuaternion } from "../bridge/ecefBridge";
import { bodyToLocal } from "./attitudeIndicator";
import { cameraAttitudeView } from "./cameraAttitudeView";

const engines: NullEngine[] = [];
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); });

/** The flight's scene: right-handed, its world east/up/south at the aircraft. */
function flightScene(): Scene {
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  return scene;
}

const DEG = Math.PI / 180;
const close = (actual: readonly number[] | null, expected: readonly number[], digits = 6) => {
  expect(actual).not.toBeNull();
  actual!.forEach((value, index) => expect(value).toBeCloseTo(expected[index], digits));
};

describe("cameraAttitudeView", () => {
  it("is the frame of a camera that looks north, level, or east", () => {
    const scene = flightScene();
    // South of the origin, looking at it: north.
    const camera = new UniversalCamera("north", new Vector3(0, 0, 10), scene);
    camera.setTarget(Vector3.Zero());
    // setTarget turns the camera a ten-thousandth off the exact direction.
    close(cameraAttitudeView(camera), bodyToLocal(0, 0, 0), 3);
    // West of it: east.
    camera.position = new Vector3(-10, 0, 0);
    camera.setTarget(Vector3.Zero());
    close(cameraAttitudeView(camera), bodyToLocal(0, 0, 90 * DEG), 3);
  });

  /**
   * The cockpit camera rides the aircraft, turned to look along its nose:
   * drawn from its frame, the instrument is the aircraft's own, as before.
   */
  it("is the aircraft's frame for a camera that rides the aircraft along its nose", () => {
    const scene = flightScene();
    const root = new TransformNode("aircraft-root", scene);
    const camera = new UniversalCamera("cockpit", Vector3.Zero(), scene);
    camera.parent = root;
    camera.rotationQuaternion = Quaternion.RotationYawPitchRoll(Math.PI, 0, 0);
    for (const [roll, pitch, heading] of [[0, 0, 0], [30, 10, 45], [-60, -20, 200], [170, 5, 300]]) {
      // The aircraft moved after Babylon last placed the camera: the view still follows it.
      root.rotationQuaternion = flightAttitudeToQuaternion(roll * DEG, pitch * DEG, heading * DEG);
      close(cameraAttitudeView(camera), bodyToLocal(roll * DEG, pitch * DEG, heading * DEG));
    }
  });

  it("has no frame without a camera", () => {
    expect(cameraAttitudeView(null)).toBeNull();
  });
});
