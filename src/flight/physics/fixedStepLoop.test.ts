import { readFileSync } from "node:fs";
import { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { wasmBinaryUrl, wasmModuleUrl } from "@0x62/jsbsim-wasm/wasm";
import { describe, expect, it, vi } from "vitest";
import { createFixedStepPhysicsLoop, FIXED_DT } from "./fixedStepLoop";

describe("fixedStepPhysicsLoop pause", () => {
  it("does not advance JSBSim while paused", () => {
    const run = vi.fn(() => true);
    const sdk = {
      run,
      getPropertyValue: vi.fn((key: string) => key === "position/h-sl-ft" ? 1000 : 0),
    } as unknown as JSBSimSdk;
    const loop = createFixedStepPhysicsLoop(sdk);

    const runningState = loop.update(FIXED_DT, vi.fn());
    loop.setPaused(true);
    const pausedState = loop.update(FIXED_DT * 4, vi.fn());

    expect(run).toHaveBeenCalledTimes(1);
    expect(pausedState.altMeters).toBe(runningState.altMeters);
    expect(pausedState.latDeg).toBe(runningState.latDeg);
  });
});

it("seeds interpolation with the new position on reset, including while paused", () => {
  let latitude = 10;
  const sdk = { run: () => true, getPropertyValue: (key: string) => key === "position/lat-geod-deg" ? latitude : key === "position/h-sl-ft" ? 1000 : 0 } as unknown as JSBSimSdk;
  const loop = createFixedStepPhysicsLoop(sdk);
  loop.update(FIXED_DT, () => {});
  latitude = 46.7867;
  loop.reset();
  expect(loop.update(0, () => {}).latDeg).toBe(latitude);
  loop.setPaused(true);
  expect(loop.update(10, () => {}).latDeg).toBe(latitude);
});

async function aircraftAt(rollDeg: number, pitchDeg: number, aglMeters: number) {
  const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false } });
  const manifest = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8")) as { files: string[] };
  for (const file of manifest.files) sdk.writeDataFile(file, readFileSync(`public/jsbsim-data/${file}`, "utf8"));
  sdk.configurePaths({ rootDir: "/runtime", aircraftPath: "aircraft", enginePath: "engine", systemsPath: "systems" });
  sdk.loadModel("c172p");
  for (const [property, value] of Object.entries({ "simulation/dt": FIXED_DT,
    "ic/lat-geod-deg": 34, "ic/long-gc-deg": -118.3,
    "ic/h-sl-ft": (300 + aglMeters) / 0.3048, "ic/terrain-elevation-ft": 300 / 0.3048,
    "ic/phi-deg": rollDeg, "ic/theta-deg": pitchDeg, "ic/vc-kts": 80 })) sdk.setPropertyValue(property, value);
  expect(sdk.runIc()).toBe(true);
  return sdk;
}

describe("ground impact uses actual C172 contact geometry", () => {
  it.each([
    { roll: 20, pitch: 0, agl: 2.6 }, { roll: 35, pitch: 0, agl: 3 },
    { roll: -35, pitch: 0, agl: 3 }, { roll: 0, pitch: 30, agl: 2.7 },
    { roll: 0, pitch: -30, agl: 2.7 },
  ])("keeps an intact aircraft flying at $roll degrees bank/$pitch pitch and $agl m AGL", async ({ roll, pitch, agl }) => {
    const sdk = await aircraftAt(roll, pitch, agl);
    try {
      const run = vi.spyOn(sdk, "run");
      const altitudeBefore = sdk.getPropertyValue("position/h-sl-ft") * 0.3048;
      const downBefore = sdk.getPropertyValue("velocities/v-down-fps") * 0.3048;
      const loop = createFixedStepPhysicsLoop(sdk);
      loop.update(FIXED_DT, () => true);
      expect(loop.getFault()).toBeNull();
      expect(run).toHaveBeenCalledOnce();
      for (let wheel = 0; wheel < 3; wheel++) expect(sdk.getPropertyValue(`gear/unit[${wheel}]/WOW`)).toBe(0);
      // Pitched flight has a real vertical velocity; retain that expected travel.
      expect(sdk.getPropertyValue("position/h-sl-ft") * 0.3048).toBeCloseTo(altitudeBefore - downBefore * FIXED_DT, 1);
    } finally { sdk.destroy(); }
  });

  it("stops a genuinely penetrating wingtip before evaluating its structural spring", async () => {
    const sdk = await aircraftAt(35, 0, 2);
    try {
      const run = vi.spyOn(sdk, "run");
      const loop = createFixedStepPhysicsLoop(sdk);
      loop.update(FIXED_DT, () => true);
      expect(loop.getFault()).toBe("Hard ground impact. Reposition the aircraft to recover.");
      expect(run).not.toHaveBeenCalled();
    } finally { sdk.destroy(); }
  });
});
