import { readFileSync } from "node:fs";
import { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { wasmBinaryUrl, wasmModuleUrl } from "@0x62/jsbsim-wasm/wasm";
import { describe, expect, it } from "vitest";
import type { SurfaceHit, SurfaceQuery } from "foss-earth/runtime";
import { createTerrainContact } from "./terrainContact";
import { createFixedStepPhysicsLoop, FIXED_DT } from "./fixedStepLoop";
import { readFlightState } from "../bridge/ecefBridge";
import { resetFlightLocation } from "../jsbsim/resetFlightLocation";
import { getFdmProfile } from "../jsbsim/fdmProfiles";

const C172_STATIC_METERS = getFdmProfile("cessna-172").stance.staticMeters;

async function setup(altitude = 400, terrain = 300) {
  const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false } });
  const manifest = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8")) as { files: string[] };
  for (const file of manifest.files) sdk.writeDataFile(file, readFileSync(`public/jsbsim-data/${file}`, "utf8"));
  sdk.configurePaths({ rootDir: "/runtime", aircraftPath: "aircraft", enginePath: "engine", systemsPath: "systems" });
  sdk.loadModel("c172p");
  sdk.setDt(FIXED_DT);
  for (const [property, value] of Object.entries({ "ic/lat-geod-deg": 34,
    "ic/long-gc-deg": -118.3, "ic/h-sl-ft": altitude / 0.3048, "ic/terrain-elevation-ft": terrain / 0.3048,
    "ic/psi-true-deg": 45, "ic/vc-kts": 100 })) sdk.setPropertyValue(property, value);
  sdk.runIc();
  return sdk;
}
function surfaceAt(getHeight: (lat: number) => number, revision: () => number): SurfaceQuery {
  return { raycast: () => null, sample: (lat) => ({ heightMeters: getHeight(lat), revision: revision(), quality: 15 } as SurfaceHit) };
}

describe("terrain refinement physics regressions", () => {
  it("lifts a clear aircraft above a 300m refinement without an impulse and preserves lateral velocity", async () => {
    const sdk = await setup();
    let height = 300, revision = 0;
    const contact = createTerrainContact(sdk, surfaceAt(() => height, () => revision));
    expect(contact.update()).toBe(true);
    const north = sdk.getPropertyValue("velocities/v-north-fps"), east = sdk.getPropertyValue("velocities/v-east-fps");
    sdk.setPropertyValue("fcs/throttle-cmd-norm", 0.6);
    height = 600; revision++;
    expect(contact.update()).toBe("reset");
    expect(readFlightState(sdk).altMeters).toBeGreaterThan(601);
    expect(readFlightState(sdk).altMeters).toBeLessThan(603);
    expect(sdk.getPropertyValue("velocities/v-north-fps")).toBeCloseTo(north, 3);
    expect(sdk.getPropertyValue("velocities/v-east-fps")).toBeCloseTo(east, 3);
    expect(sdk.getPropertyValue("attitude/psi-deg")).toBeCloseTo(45, 3);
    expect(sdk.getPropertyValue("fcs/throttle-cmd-norm")).toBe(0.6);
    const loop = createFixedStepPhysicsLoop(sdk);
    for (let step = 0; step < 240; step++) loop.update(FIXED_DT, contact.update);
    expect(loop.getFault()).toBeNull();
    expect(readFlightState(sdk).altMeters).toBeLessThan(1000);
  });
  it("does not lift an aircraft that moves into a known hill, even if other terrain refines", async () => {
    const sdk = await setup();
    let revision = 0;
    const contact = createTerrainContact(sdk, surfaceAt(lat => lat > 34.001 ? 600 : 300, () => revision));
    contact.update();
    sdk.setPropertyValue("ic/lat-geod-deg", 34.002); sdk.runIc();
    revision++;
    expect(contact.update()).toBe(true);
    expect(readFlightState(sdk).altMeters).toBeCloseTo(400, 2);
    const loop = createFixedStepPhysicsLoop(sdk);
    for (let step = 0; step < 120; step++) loop.update(FIXED_DT, contact.update);
    expect(loop.getFault()).not.toBeNull();
    expect(Object.values(loop.getLatestState()!).every(Number.isFinite)).toBe(true);
    expect(loop.getLatestState()!.altMeters).toBeLessThan(10000);
  });
  it("keeps an airborne aircraft fixed when terrain refines downwards", async () => {
    const sdk = await setup(); let height = 300, revision = 0;
    const contact = createTerrainContact(sdk, surfaceAt(() => height, () => revision));
    contact.update(); height = 100; revision++;
    expect(contact.update()).toBe(true);
    expect(readFlightState(sdk).altMeters).toBeCloseTo(400, 3);
  });
  it("follows a downward refinement when resting on the surface", async () => {
    const sdk = await setup(300 + C172_STATIC_METERS); sdk.setPropertyValue("ic/vc-kts", 0); sdk.runIc();
    let height = 300, revision = 0;
    const contact = createTerrainContact(sdk, surfaceAt(() => height, () => revision));
    contact.update(); height = 200; revision++;
    expect(contact.update()).toBe("reset");
    expect(readFlightState(sdk).altMeters).toBeCloseTo(200 + C172_STATIC_METERS, 2);
  });
  it("setting altitude to 500 discards a stale 1500m floor before RunIC", async () => {
    const sdk = await setup(2000, 1500);
    resetFlightLocation(sdk, { latDeg: 34.1, lonDeg: -118.2, altMeters: 500 }, 30);
    const contact = createTerrainContact(sdk, surfaceAt(() => 30, () => 0));
    const loop = createFixedStepPhysicsLoop(sdk);
    for (let step = 0; step < 240; step++) loop.update(FIXED_DT, contact.update);
    expect(loop.getFault()).toBeNull();
    expect(readFlightState(sdk).altMeters).toBeGreaterThan(400);
    expect(readFlightState(sdk).altMeters).toBeLessThan(600);
  });
  it("a fault latches and never publishes invalid output even if Run returns true", async () => {
    const sdk = await setup();
    const loop = createFixedStepPhysicsLoop(sdk);
    loop.reset();
    const run = sdk.run.bind(sdk);
    sdk.run = () => { sdk.setPropertyValue("position/h-sl-ft", 1e44); return true; };
    const state = loop.update(FIXED_DT, () => true);
    expect(loop.getFault()).not.toBeNull();
    expect(state.altMeters).toBeCloseTo(400, 3);
    sdk.run = run;
    expect(loop.update(1, () => true)).toEqual(state);
  });
});
