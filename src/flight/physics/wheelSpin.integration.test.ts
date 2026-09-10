import { readFileSync } from "node:fs";
import { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { wasmBinaryUrl, wasmModuleUrl } from "@0x62/jsbsim-wasm/wasm";
import { afterEach, describe, expect, it } from "vitest";
import { readFlightState } from "../bridge/ecefBridge";
import { FIXED_DT } from "./fixedStepLoop";
import { createWheelSpinExperiment } from "./createWheelSpinExperiment";

const METERS_PER_FOOT = 0.3048;
const instances: JSBSimSdk[] = [];
afterEach(() => { for (const sdk of instances.splice(0)) sdk.destroy(); });

async function setup() {
  const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false } });
  instances.push(sdk);
  const manifest = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8")) as { files: string[] };
  for (const file of manifest.files) sdk.writeDataFile(file, readFileSync(`public/jsbsim-data/${file}`, "utf8"));
  sdk.configurePaths({ rootDir: "/runtime", aircraftPath: "aircraft", enginePath: "engine", systemsPath: "systems" });
  expect(sdk.loadModel("c172p")).toBe(true);
  for (const [property, value] of Object.entries({ "simulation/dt": FIXED_DT, "ic/lat-geod-deg": 34,
    "ic/long-gc-deg": -118.3, "ic/h-sl-ft": 301.6 / METERS_PER_FOOT,
    "ic/terrain-elevation-ft": 300 / METERS_PER_FOOT, "ic/psi-true-deg": 0,
    "ic/theta-deg": 2.48, "ic/phi-deg": 0, "ic/vc-kts": 50,
    "ic/vd-fps": 0.5 / METERS_PER_FOOT, "fcs/mixture-cmd-norm": 0,
    "fcs/throttle-cmd-norm": 0 })) sdk.setPropertyValue(property, value);
  expect(sdk.runIc()).toBe(true);
  return sdk;
}

async function touchdown(mode: "off" | "instant" | "inertia") {
  const sdk = await setup();
  const experiment = mode === "off" ? null : createWheelSpinExperiment(sdk);
  const samples = [];
  for (let step = 0; step < 480; step++) {
    expect(sdk.run()).toBe(true);
    if (mode !== "off") experiment!.step(FIXED_DT, mode);
    samples.push({
      flight: readFlightState(sdk),
      // Include motion and controls beyond the presentation snapshot to catch
      // accidental forces, angular impulses, and changes to braking or power.
      dynamics: ["velocities/u-fps", "velocities/v-fps", "velocities/w-fps",
        "velocities/p-rad_sec", "velocities/q-rad_sec", "velocities/r-rad_sec",
        "fcs/left-brake-cmd-norm", "fcs/right-brake-cmd-norm",
        "fcs/mixture-cmd-norm", "propulsion/engine/engine-rpm"].map(property => sdk.getPropertyValue(property)),
      contacts: [0, 1, 2].map(index => ({
        wow: sdk.getPropertyValue(`gear/unit[${index}]/WOW`) > 0.5,
        compressionMeters: sdk.getPropertyValue(`gear/unit[${index}]/compression-ft`) * METERS_PER_FOOT,
        speedMetersPerSecond: sdk.getPropertyValue(`gear/unit[${index}]/wheel-speed-fps`) * METERS_PER_FOOT,
      })),
      wheels: experiment?.getStates().map(wheel => ({ ...wheel })) ?? [],
    });
  }
  return samples;
}

describe("wheel spin feedback with real JSBSim", () => {
  it("leaves the complete landing trajectory unchanged in both A/B modes", async () => {
    const baseline = await touchdown("off");
    for (const mode of ["instant", "inertia"] as const) {
      const feedback = await touchdown(mode);
      expect(feedback.map(({ flight, dynamics, contacts }) => ({ flight, dynamics, contacts })))
        .toEqual(baseline.map(({ flight, dynamics, contacts }) => ({ flight, dynamics, contacts })));
    }
    // The fixture must include both airborne and grounded motion, rather than
    // accidentally proving equivalence during an entire flight with no contact.
    expect(baseline.some(sample => sample.contacts.every(contact => !contact.wow))).toBe(true);
    expect(baseline.some(sample => sample.contacts[1].wow && sample.contacts[2].wow)).toBe(true);
  });

  it("uses actual wheel contact telemetry to spin up gradually during a gentle touchdown", async () => {
    const samples = await touchdown("inertia");
    const firstMainContact = samples.findIndex(sample => sample.contacts[1].wow);
    expect(firstMainContact).toBeGreaterThan(0);
    const airborne = samples.slice(0, firstMainContact);
    expect(airborne.every(sample => sample.wheels[1].omegaRadSec === 0 && !sample.wheels[1].onGround)).toBe(true);

    const touching = samples[firstMainContact];
    expect(touching.contacts[1].compressionMeters).toBeGreaterThan(0);
    expect(touching.contacts[1].speedMetersPerSecond).toBeGreaterThan(15);
    expect(touching.wheels[1].onGround).toBe(true);
    expect(touching.wheels[1].compressionMeters).toBeCloseTo(touching.contacts[1].compressionMeters, 8);
    expect(touching.wheels[1].omegaRadSec).toBeGreaterThan(0);
    expect(touching.wheels[1].slipMetersSec).toBeGreaterThan(1);
    expect(touching.wheels[1].slipPowerWatts).toBeGreaterThan(0);

    // With sustained contact, inertia catches up and the brief spin-up slip
    // disappears; ongoing contact alone must not produce a permanent chirp.
    const caughtUp = samples.slice(firstMainContact + 1).find(sample =>
      sample.wheels[1].onGround && sample.wheels[1].omegaRadSec > 50 && Math.abs(sample.wheels[1].slipMetersSec) < 0.25);
    expect(caughtUp).toBeDefined();
    expect(samples.every(sample => sample.wheels.every(wheel =>
      Number.isFinite(wheel.omegaRadSec) && Number.isFinite(wheel.slipPowerWatts) && wheel.slipPowerWatts >= 0))).toBe(true);
  });
});
