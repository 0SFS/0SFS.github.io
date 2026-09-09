import { readFileSync } from "node:fs";
import { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { wasmBinaryUrl, wasmModuleUrl } from "@0x62/jsbsim-wasm/wasm";
import { describe, expect, it, vi } from "vitest";
import type { SurfaceQuery, SurfaceHit } from "foss-earth/runtime";
import { createTerrainContact, syncTerrainContact } from "./terrainContact";
import { createFixedStepPhysicsLoop } from "./fixedStepLoop";
import { bootstrapC172p } from "../jsbsim/bootstrapC172";

describe("displayed terrain contact", () => {
  it("does not halt flight for a transient optional visible-mesh miss", () => {
    const sdk = {
      getPropertyValue: vi.fn((property: string) => property === "position/lat-geod-deg" ? 34 : property === "position/long-gc-deg" ? -118 : 0),
      setPropertyValue: vi.fn(),
      resetToInitialConditions: vi.fn(),
      runIc: vi.fn(() => true),
    } as unknown as JSBSimSdk;
    let hit: SurfaceHit | null = { heightMeters: 0, revision: 1 } as SurfaceHit;
    const surface: SurfaceQuery = { raycast: () => null, sample: () => hit };
    const contact = createTerrainContact(sdk, surface);
    // A height has to exist before a miss can be called transient.
    contact.update(false);
    hit = null;
    expect(contact.update(false)).toBe(true);
    expect(contact.update()).toBe(false);
  });

  it("refuses to step before any terrain height exists, in either map mode", () => {
    // Google 3D Tiles publish nothing until the first tiles land. Stepping then
    // drops the aircraft toward a ground plane JSBSim has not been told about,
    // and the gear model resolves the penetration explosively once the real
    // surface arrives - tens of thousands of knots in a single step.
    const sdk = {
      getPropertyValue: vi.fn((property: string) => property === "position/lat-geod-deg" ? 34 : property === "position/long-gc-deg" ? -118 : 0),
      setPropertyValue: vi.fn(),
      resetToInitialConditions: vi.fn(),
      runIc: vi.fn(() => true),
    } as unknown as JSBSimSdk;
    let hit: SurfaceHit | null = null;
    const surface: SurfaceQuery = { raycast: () => null, sample: () => hit };
    const contact = createTerrainContact(sdk, surface);

    expect(contact.update(false)).toBe(false);
    expect(contact.update(true)).toBe(false);
    // JSBSim must not be told a terrain elevation it cannot support either.
    expect(sdk.setPropertyValue).not.toHaveBeenCalledWith("position/terrain-elevation-asl-ft", expect.anything());

    hit = { heightMeters: 120, revision: 1 } as SurfaceHit;
    expect(contact.update(false)).not.toBe(false);

    // A later miss is now genuinely transient and may be tolerated.
    hit = null;
    expect(contact.update(false)).toBe(true);

    // Repositioning starts over: the new location has no established height.
    contact.reset();
    expect(contact.update(false)).toBe(false);
  });

  it("updates the real JSBSim collision elevation when the visible surface changes", async () => {
    const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
      persistence: { enabled: false }, log: { console: false } });
    const manifest = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8")) as { files: string[] };
    for (const file of manifest.files) sdk.writeDataFile(file, readFileSync(`public/jsbsim-data/${file}`, "utf8"));
    await bootstrapC172p(sdk);
    const surface: SurfaceQuery = { raycast: () => null, sample: () => ({ heightMeters: 251.9 } as SurfaceHit) };
    expect(syncTerrainContact(sdk, surface)).toBe(true);
    sdk.run();
    expect(sdk.getPropertyValue("position/terrain-elevation-asl-ft") * 0.3048).toBeCloseTo(251.9, 4);
    surface.sample = () => ({ heightMeters: 32.6 } as SurfaceHit);
    syncTerrainContact(sdk, surface); sdk.run();
    expect(sdk.getPropertyValue("position/terrain-elevation-asl-ft") * 0.3048).toBeCloseTo(32.6, 4);
  });
  it("does not advance physics through missing terrain or accumulate a catch-up jump", () => {
    const sdk = { getPropertyValue: vi.fn((key: string) => key === "position/lat-geod-deg" ? 34 : 100), setPropertyValue: vi.fn(), run: vi.fn(() => true) };
    const loop = createFixedStepPhysicsLoop(sdk as unknown as JSBSimSdk);
    const surface: SurfaceQuery = { raycast: () => null, sample: () => null };
    for (let i = 0; i < 10; i++) loop.update(0.1, () => syncTerrainContact(sdk as unknown as JSBSimSdk, surface));
    expect(sdk.run).not.toHaveBeenCalled();
    expect(sdk.setPropertyValue).not.toHaveBeenCalled();
    loop.update(1 / 120, () => true);
    expect(sdk.run).toHaveBeenCalledOnce();
  });
});
