import { describe, expect, it } from "vitest";
import { lowestWheelClearanceFt, sf50AfmInitialState, sf50MainWheelsOnGround } from "./sf50AfmBenchmark";

describe("AFM benchmark geometry and initialization", () => {
  const wheel = (index: number, bodyXFt: number, bodyZFt: number) => ({
    index, bodyXFt, bodyYFt: 0, bodyZFt, weightOnWheels: false,
    compressionFt: 0, strutForceLb: 0,
  });
  it.each([[-1033.5610194791234, -961.2637679254291], [0, 0]])(
    "allows braking with both mains grounded and native strut forces %s/%s",
    (leftForce, rightForce) => {
      // Negative touchdown loads and zero settled loads from the real-Wasm trace.
      const contacts = [
        wheel(0, 5, 3),
        { ...wheel(1, -2, 4), weightOnWheels: true, strutForceLb: leftForce },
        { ...wheel(2, -2, 4), weightOnWheels: true, strutForceLb: rightForce },
      ];
      expect(sf50MainWheelsOnGround(contacts, [1, 2])).toBe(true);
    },
  );
  it("does not enable braking for nose-wheel contact alone", () => {
    expect(sf50MainWheelsOnGround([
      { ...wheel(0, 5, 3), weightOnWheels: true },
      wheel(1, -2, 4), wheel(2, -2, 4),
    ], [1, 2])).toBe(false);
  });
  it("disables braking when either main loses contact, regardless of retained force", () => {
    const contacts = [
      { ...wheel(0, 5, 3), weightOnWheels: true },
      { ...wheel(1, -2, 4), weightOnWheels: true, strutForceLb: -1000 },
      { ...wheel(2, -2, 4), weightOnWheels: true, strutForceLb: -1000 },
    ];
    for (const liftedIndex of [1, 2]) {
      expect(sf50MainWheelsOnGround(contacts.map(contact => ({
        ...contact, weightOnWheels: contact.index !== liftedIndex,
      })), [1, 2])).toBe(false);
    }
  });
  it("requires two distinct, present main wheels", () => {
    const contacts = [{ ...wheel(1, -2, 4), weightOnWheels: true }];
    expect(sf50MainWheelsOnGround(contacts, [])).toBe(false);
    expect(sf50MainWheelsOnGround(contacts, [1])).toBe(false);
    expect(sf50MainWheelsOnGround(contacts, [1, 1])).toBe(false);
    expect(sf50MainWheelsOnGround(contacts, [1, 2])).toBe(false);
  });
  it("uses transformed native contact positions rather than CG altitude", () => {
    expect(lowestWheelClearanceFt({
      pitchDeg: 0, rollDeg: 0, altitudeAglFt: 50,
      wheelContacts: [wheel(0, 5, 3), wheel(1, -2, 4), wheel(2, -2, 4)],
    })).toBe(46);
  });
  it("refuses to substitute guessed geometry for missing native contacts", () => {
    expect(() => lowestWheelClearanceFt({
      pitchDeg: 0, rollDeg: 0, altitudeAglFt: 50, wheelContacts: [],
    })).toThrow(/three native/);
  });
  it("initializes 85 KIAS full-flap landing as 84 KCAS at idle", () => {
    const state = sf50AfmInitialState({
      id: "landing", phase: "landing", conditions: {
        pressureAltitudeFt: 0, weightLb: 5550, temperatureC: 15,
        flapsNorm: 1, referenceSpeedKias: 85,
      },
    }, [1500]);
    expect(state.calibratedAirspeedKts).toBe(84);
    expect(state.controls.throttleNorm).toBe(0);
    expect(state.pitchDeg).toBe(3);
    expect(state.flightPathAngleDeg).toBe(-3);
  });
});
