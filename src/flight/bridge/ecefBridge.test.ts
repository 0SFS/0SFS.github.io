import { Vector3 } from "@babylonjs/core";
import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { describe, expect, it } from "vitest";
import { flightAttitudeToQuaternion, readFlightState } from "./ecefBridge";

describe("flightAttitudeToQuaternion", () => {
  const aircraftNose = new Vector3(0, 0, 1);

  it("points the aircraft nose north at heading zero", () => {
    const attitude = flightAttitudeToQuaternion(0, 0, 0);
    const forward = Vector3.Zero();
    aircraftNose.rotateByQuaternionToRef(attitude, forward);
    expect(forward.x).toBeCloseTo(0, 5);
    expect(forward.z).toBeCloseTo(1, 5);
  });

  it("points the aircraft nose east at a 90 degree heading", () => {
    const attitude = flightAttitudeToQuaternion(0, 0, Math.PI / 2);
    const forward = Vector3.Zero();
    aircraftNose.rotateByQuaternionToRef(attitude, forward);
    expect(forward.x).toBeCloseTo(1, 5);
    expect(forward.z).toBeCloseTo(0, 5);
  });

  it("raises the nose for positive JSBSim pitch", () => {
    const attitude = flightAttitudeToQuaternion(0, Math.PI / 6, 0);
    const forward = Vector3.Zero();
    aircraftNose.rotateByQuaternionToRef(attitude, forward);
    expect(forward.y).toBeCloseTo(0.5, 5);
  });

  it("banks the model right for positive JSBSim roll", () => {
    const attitude = flightAttitudeToQuaternion(Math.PI / 6, 0, 0);
    const wingAxis = Vector3.Zero();
    new Vector3(1, 0, 0).rotateByQuaternionToRef(attitude, wingAxis);
    expect(wingAxis.y).toBeCloseTo(-0.5, 5);
  });

  it("converts JSBSim down velocity to climb-positive vertical speed", () => {
    const sdk = {
      getPropertyValue: (property: string) => property === "velocities/v-down-fps" ? -12 : 0,
    } as JSBSimSdk;

    expect(readFlightState(sdk).verticalSpeedFps).toBe(12);
  });
});