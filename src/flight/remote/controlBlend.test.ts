import { describe, expect, it } from "vitest";
import { createControlBlend, mixAxis } from "./controlBlend";
import type { ControlSurfaceState } from "../input/flightInputManager";

const START: ControlSurfaceState = {
  elevator: 0, aileron: 0, rudder: 0, throttle: 0.6, pitchTrim: -0.1, rollTrim: 0.05, flaps: 1 / 3, brake: 0,
};

describe("blending two pilots", () => {
  it("gives the other pilot what authority the priority leaves free, and no more than full travel", () => {
    expect(mixAxis(0, 0.7)).toBeCloseTo(0.7);
    expect(mixAxis(0.5, 0.5)).toBeCloseTo(0.75);
    expect(mixAxis(1, -1)).toBe(1);
    expect(mixAxis(-1, 1)).toBe(-1);
    expect(mixAxis(-0.5, 1)).toBeCloseTo(0);
    // Continuous as the priority leaves centre: no jump when it starts to move.
    expect(mixAxis(0.001, 0.8)).toBeCloseTo(0.8, 2);
    for (const priority of [-1, -0.6, 0, 0.3, 1]) for (const other of [-1, -0.2, 0, 0.9, 1]) {
      expect(Math.abs(mixAxis(priority, other))).toBeLessThanOrEqual(1);
    }
  });

  it("mixes the sticks, rudder and brake with the chosen priority", () => {
    const phone = { ...START, elevator: 0.5, aileron: -1, brake: 1 };
    const local = { ...START, elevator: 0.5, aileron: 1, rudder: 0.4 };
    expect(createControlBlend(START, 0).step(phone, local, 0, "phone"))
      .toMatchObject({ elevator: 0.75, aileron: -1, rudder: 0.4, brake: 1 });
    expect(createControlBlend(START, 0).step(phone, local, 0, "computer"))
      .toMatchObject({ elevator: 0.75, aileron: 1, rudder: 0.4, brake: 1 });
  });

  it("puts a lever where it was last moved, by either pilot", () => {
    const blend = createControlBlend(START, 0);
    expect(blend.step(START, START, 0, "phone").throttle).toBe(0.6);
    // The computer moves the throttle; the phone, still at its old value, does not undo it.
    expect(blend.step(START, { ...START, throttle: 0.8 }, 0, "phone").throttle).toBe(0.8);
    expect(blend.step(START, { ...START, throttle: 0.8 }, 0, "phone").throttle).toBe(0.8);
    // Then the phone moves its own.
    expect(blend.step({ ...START, throttle: 0.3 }, { ...START, throttle: 0.8 }, 0, "phone").throttle).toBe(0.3);
    // Its levers follow, and catching up is no move at all.
    expect(blend.step({ ...START, throttle: 0.3 }, { ...START, throttle: 0.3 }, 0, "computer").throttle).toBe(0.3);
    expect(blend.levers()).toEqual({ throttle: 0.3, pitchTrim: -0.1, rollTrim: 0.05, flaps: 1 / 3 });
  });

  it("settles a lever both pilots move at once by the priority", () => {
    const phone = { ...START, pitchTrim: 0.2 };
    const local = { ...START, pitchTrim: -0.4 };
    expect(createControlBlend(START, 0).step(phone, local, 0, "phone").pitchTrim).toBe(0.2);
    expect(createControlBlend(START, 0).step(phone, local, 0, "computer").pitchTrim).toBe(-0.4);
  });

  it("lets automation here reach the levers, but takes flaps from this pilot only by their input", () => {
    const blend = createControlBlend(START, 7);
    // Trim assist writes this computer's trim: it is the trim now.
    expect(blend.step(START, { ...START, pitchTrim: -0.12 }, 7, "phone").pitchTrim).toBe(-0.12);
    // Automatic flaps write the actual travel back here every frame; that is not a flap move.
    expect(blend.step(START, { ...START, pitchTrim: -0.12, flaps: 0.5 }, 7, "phone").flaps).toBe(1 / 3);
    // The pilot's own flap input is, by its revision.
    expect(blend.step(START, { ...START, pitchTrim: -0.12, flaps: 2 / 3 }, 8, "phone").flaps).toBe(2 / 3);
  });
});
