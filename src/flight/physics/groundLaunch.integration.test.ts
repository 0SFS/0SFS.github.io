import { readFileSync } from "node:fs";
import { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { wasmBinaryUrl, wasmModuleUrl } from "@0x62/jsbsim-wasm/wasm";
import { afterEach, describe, expect, it } from "vitest";
import type { SurfaceHit, SurfaceQuery } from "foss-earth/runtime";
import { createTerrainContact } from "./terrainContact";
import { createFixedStepPhysicsLoop, FIXED_DT } from "./fixedStepLoop";
import { getFdmProfile } from "../jsbsim/fdmProfiles";

const METERS_PER_FOOT = 0.3048;
const INITIAL_GROUND_METERS = 300;
const C172_STATIC_METERS = getFdmProfile("cessna-172").stance.staticMeters;
const instances: JSBSimSdk[] = [];
afterEach(() => { for (const sdk of instances.splice(0)) sdk.destroy(); });

async function setup(altitude = INITIAL_GROUND_METERS + C172_STATIC_METERS, speedKts = 10, descentFps = 0) {
  const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false } });
  instances.push(sdk);
  const manifest = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8")) as { files: string[] };
  for (const file of manifest.files) sdk.writeDataFile(file, readFileSync(`public/jsbsim-data/${file}`, "utf8"));
  sdk.configurePaths({ rootDir: "/runtime", aircraftPath: "aircraft", enginePath: "engine", systemsPath: "systems" });
  sdk.loadModel("c172p");
  sdk.setDt(FIXED_DT);
  for (const [property, value] of Object.entries({ "ic/lat-geod-deg": 34,
    "ic/long-gc-deg": -118.3, "ic/h-sl-ft": altitude / METERS_PER_FOOT,
    "ic/terrain-elevation-ft": INITIAL_GROUND_METERS / METERS_PER_FOOT,
    "ic/psi-true-deg": 0, "ic/theta-deg": 2.48, "ic/vc-kts": speedKts, "ic/vd-fps": descentFps,
    "fcs/mixture-cmd-norm": 0, "fcs/throttle-cmd-norm": 0 })) sdk.setPropertyValue(property, value);
  expect(sdk.runIc()).toBe(true);
  return sdk;
}

function telemetry(sdk: JSBSimSdk, ground = INITIAL_GROUND_METERS) {
  const speed = Math.hypot(...["north", "east", "down"].map(axis => sdk.getPropertyValue(`velocities/v-${axis}-fps`) * METERS_PER_FOOT));
  const altitude = sdk.getPropertyValue("position/h-sl-ft") * METERS_PER_FOOT;
  return { speed, altitude, up: -sdk.getPropertyValue("velocities/v-down-fps") * METERS_PER_FOOT,
    // Energy per unit mass; the refined surface changes the coordinate reference,
    // so measure potential energy relative to the current surface in refinement tests.
    energy: 0.5 * speed * speed + 9.81 * (altitude - ground),
    rpm: sdk.getPropertyValue("propulsion/engine/engine-rpm"),
    compression: [0, 1, 2].map(index => sdk.getPropertyValue(`gear/unit[${index}]/compression-ft`) * METERS_PER_FOOT) };
}

function terrain() {
  const state = { height: INITIAL_GROUND_METERS, revision: 0 };
  const surface: SurfaceQuery = { raycast: () => null,
    sample: () => ({ heightMeters: state.height, revision: state.revision, quality: 15 } as SurfaceHit) };
  return { state, surface };
}

function advance(sdk: JSBSimSdk, loop: ReturnType<typeof createFixedStepPhysicsLoop>,
  contact: ReturnType<typeof createTerrainContact>, steps: number, ground = INITIAL_GROUND_METERS) {
  let maxUp = -Infinity, maxSpeed = 0, maxEnergy = -Infinity, maxCompression = 0;
  for (let step = 0; step < steps; step++) {
    loop.update(FIXED_DT, contact.update);
    const state = telemetry(sdk, ground);
    maxUp = Math.max(maxUp, state.up);
    maxSpeed = Math.max(maxSpeed, state.speed);
    maxEnergy = Math.max(maxEnergy, state.energy);
    maxCompression = Math.max(maxCompression, ...state.compression);
  }
  return { maxUp, maxSpeed, maxEnergy, maxCompression };
}

describe("ground contact energy regressions with real JSBSim", () => {
  it.each([{ speedKts: 10, rise: 0.6 }, { speedKts: 10, rise: 1 }, { speedKts: 10, rise: 2 }, { speedKts: 10, rise: 5 },
    { speedKts: 100, rise: 5 }, { speedKts: 150, rise: 5 }])("stops a known $rise m barrier at $speedKts kt before its penetration fires the gear springs", async ({ speedKts, rise }) => {
    const sdk = await setup(INITIAL_GROUND_METERS + C172_STATIC_METERS, speedKts);
    const { state, surface } = terrain();
    const contact = createTerrainContact(sdk, surface);
    const loop = createFixedStepPhysicsLoop(sdk);
    // At 150kt a one-second roll lifts the aircraft over a 5m barrier. Establish
    // contact immediately for fast-impact cases so the fixture actually hits it.
    advance(sdk, loop, contact, speedKts >= 100 ? 1 : 120);
    expect(loop.getFault()).toBeNull();
    const before = telemetry(sdk);
    state.height += rise; // Same revision: terrain is an obstacle, not a refined measurement.
    advance(sdk, loop, contact, 120);
    const after = telemetry(sdk);
    expect(loop.getFault()).not.toBeNull();
    expect(after.speed).toBeCloseTo(before.speed, 5);
    expect(after.up).toBeCloseTo(before.up, 5);
    expect(after.energy).toBeCloseTo(before.energy, 5);
  });

  it("allows the historical launch only with arcade ground launches enabled", async () => {
    const sdk = await setup();
    const { state, surface } = terrain();
    const contact = createTerrainContact(sdk, surface);
    const loop = createFixedStepPhysicsLoop(sdk, undefined, { getArcadeGroundLaunches: () => true });
    advance(sdk, loop, contact, 120);
    state.height += 5;
    const result = advance(sdk, loop, contact, 360);
    // The previous bug: a 5m height discontinuity at a 10kt taxi speed launches
    // the aircraft upward at about 76m/s without tripping the old 200kt guard.
    expect(loop.getFault()).toBeNull();
    expect(result.maxUp).toBeGreaterThan(60);
    expect(result.maxUp).toBeLessThan(100);
    expect(result.maxEnergy).toBeGreaterThan(2000);
  });

  it.each([0.1, 0.6, 1, 5])("adopts a %sm surface refinement without a velocity impulse or starting the engine", async rise => {
    const sdk = await setup();
    const { state, surface } = terrain();
    const contact = createTerrainContact(sdk, surface);
    const loop = createFixedStepPhysicsLoop(sdk);
    advance(sdk, loop, contact, 120);
    const before = telemetry(sdk);
    expect(before.rpm).toBe(0);
    state.height += rise;
    state.revision += 1;
    expect(contact.update()).toBe("reset");
    const placed = telemetry(sdk, state.height);
    expect(placed.speed).toBeCloseTo(before.speed, 5);
    expect(placed.up).toBeCloseTo(0, 6);
    expect(placed.rpm).toBe(0);
    expect(placed.altitude - state.height).toBeGreaterThan(1.3);
    expect(placed.altitude - state.height).toBeLessThan(1.4);
    const result = advance(sdk, loop, contact, 360, state.height);
    expect(loop.getFault()).toBeNull();
    expect(result.maxUp).toBeLessThan(0.2);
    expect(result.maxEnergy).toBeLessThan(before.energy + 0.25);
    expect(result.maxCompression).toBeLessThan(0.15);
  });

  it.each([0, 35, 50])("retains JSBSim's dissipative touchdown response at %skt", async speedKts => {
    const sdk = await setup(301.6, speedKts, 5);
    const { surface } = terrain();
    const contact = createTerrainContact(sdk, surface);
    const loop = createFixedStepPhysicsLoop(sdk);
    const before = telemetry(sdk);
    const result = advance(sdk, loop, contact, 1200);
    const after = telemetry(sdk);
    expect(loop.getFault()).toBeNull();
    expect(result.maxUp).toBeLessThan(0.5);
    // Account for integration error, without suppressing the physical spring rebound.
    expect(result.maxEnergy).toBeLessThan(before.energy + 0.1);
    expect(after.energy).toBeLessThan(before.energy);
    expect(after.altitude).toBeCloseTo(INITIAL_GROUND_METERS + C172_STATIC_METERS, 1);
    expect(sdk.getPropertyValue("gear/unit[1]/WOW")).toBe(1);
  });
  it("keeps a powered engine running across a surface refinement", async () => {
    const sdk = await setup();
    sdk.setPropertyValue("fcs/mixture-cmd-norm", 1);
    sdk.setPropertyValue("fcs/throttle-cmd-norm", 0.4);
    sdk.setPropertyValue("propulsion/magneto_cmd", 3);
    sdk.setPropertyValue("propulsion/set-running", -1);
    const { state, surface } = terrain();
    const contact = createTerrainContact(sdk, surface);
    const loop = createFixedStepPhysicsLoop(sdk);
    advance(sdk, loop, contact, 120);
    const before = telemetry(sdk);
    expect(before.rpm).toBeGreaterThan(1000);
    state.height += 1;
    state.revision++;
    contact.update();
    const placed = telemetry(sdk);
    advance(sdk, loop, contact, 120);
    expect(placed.speed).toBeCloseTo(before.speed, 5);
    expect(placed.rpm).toBeGreaterThan(500);
    expect(telemetry(sdk).rpm).toBeGreaterThan(500);
    expect(sdk.getPropertyValue("propulsion/engine/set-running")).toBe(1);
    expect(sdk.getPropertyValue("fcs/throttle-cmd-norm")).toBe(0.4);
    expect(sdk.getPropertyValue("fcs/mixture-cmd-norm")).toBe(1);
  });

  it.each([30, 60, 120])("does not create mechanical energy during a 100kt impact descending %sft/s", async descentFps => {
    const sdk = await setup(303, 100, descentFps);
    const { surface } = terrain();
    const contact = createTerrainContact(sdk, surface);
    const loop = createFixedStepPhysicsLoop(sdk);
    const before = telemetry(sdk);
    const result = advance(sdk, loop, contact, 600);
    expect(result.maxCompression).toBeGreaterThan(0.1);
    // Lift and spring rebound can redirect existing momentum upward; that is
    // allowed. Additional mechanical energy from an immovable floor is not.
    expect(result.maxEnergy).toBeLessThan(before.energy + 0.1);
    expect(telemetry(sdk).energy).toBeLessThan(before.energy);
    if (descentFps === 120) expect(loop.getFault()).not.toBeNull();
    else expect(loop.getFault()).toBeNull();
  });

});
