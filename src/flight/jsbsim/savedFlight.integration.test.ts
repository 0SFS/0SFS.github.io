import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrapC172p } from "./bootstrapC172";
import { resolveAircraftDataFiles } from "./hydrateJsbsimData";
import { readFlightState } from "../bridge/ecefBridge";
import { validFlightState } from "../physics/safeFlightState";
import { applySavedControls, captureSavedFlight, parseSavedFlight, restoreSavedFlight } from "./savedFlight";

const FT = 0.3048;
const instances: JSBSimSdk[] = [];
afterEach(() => { for (const sdk of instances.splice(0)) sdk.destroy(); });

async function createC172(options: Parameters<typeof bootstrapC172p>[1] = {}): Promise<JSBSimSdk> {
  const sdk = await JSBSimSdk.create({
    moduleUrl: wasmModuleUrl,
    wasmUrl: wasmBinaryUrl,
    persistence: { enabled: false },
    log: { console: false, stripAnsi: true },
  });
  instances.push(sdk);
  const dataRoot = resolve(process.cwd(), "public/jsbsim-data");
  const manifest = JSON.parse(readFileSync(resolve(dataRoot, "manifest.json"), "utf8")) as { files: string[] };
  for (const relativePath of resolveAircraftDataFiles(manifest, "cessna-172")) {
    sdk.writeDataFile(relativePath, readFileSync(resolve(dataRoot, relativePath), "utf8"));
  }
  await bootstrapC172p(sdk, options);
  return sdk;
}

describe("saved flight in JSBSim", () => {
  it("resumes a turning C172 in a new simulator, at its height above the ground prepared there", async () => {
    const first = await createC172();
    first.setPropertyValue("position/terrain-elevation-asl-ft", 250 / FT);
    first.setPropertyValue("fcs/throttle-cmd-norm", 0.8);
    first.setPropertyValue("fcs/flap-cmd-norm", 0.33);
    first.setPropertyValue("fcs/pitch-trim-cmd-norm", 0.1);
    first.setPropertyValue("fcs/aileron-cmd-norm", 0.2);
    for (let step = 0; step < 240; step += 1) expect(first.run()).toBe(true);
    const before = readFlightState(first);
    const saved = parseSavedFlight(JSON.stringify(captureSavedFlight(first, "cessna-172", true)))!;
    expect(saved.paused).toBe(true);
    expect(saved.aboveGroundMeters).toBeCloseTo(before.altMeters - 250, 3);

    // The next session's simulator starts elsewhere, on its own defaults.
    const second = await createC172({ latDeg: 10, lonDeg: 20, headingDeg: 0, throttleNorm: 0.4 });
    applySavedControls(second, saved, "cessna-172");
    expect(second.getPropertyValue("fcs/throttle-cmd-norm")).toBeCloseTo(0.8, 6);
    expect(second.getPropertyValue("fcs/flap-cmd-norm")).toBeCloseTo(0.33, 6);
    expect(second.getPropertyValue("fcs/pitch-trim-cmd-norm")).toBeCloseTo(0.1, 6);

    // This session's map puts the ground 40 m higher.
    const ground = 290;
    const after = restoreSavedFlight(second, saved, "cessna-172", {
      groundHeightMeters: ground, altitudeMeters: ground + saved.aboveGroundMeters!,
    });
    expect(validFlightState(after)).toBe(true);
    expect(after.latDeg).toBeCloseTo(before.latDeg, 7);
    expect(after.lonDeg).toBeCloseTo(before.lonDeg, 7);
    expect(after.altMeters - ground).toBeCloseTo(before.altMeters - 250, 1);
    expect(after.rollRad).toBeCloseTo(before.rollRad, 3);
    expect(after.pitchRad).toBeCloseTo(before.pitchRad, 3);
    expect(after.headingRad).toBeCloseTo(before.headingRad, 3);
    expect(after.airspeedKts).toBeCloseTo(before.airspeedKts, 0);
    expect(after.verticalSpeedFps).toBeCloseTo(before.verticalSpeedFps, 0);
    expect(second.getPropertyValue("propulsion/engine/set-running")).toBe(1);
    expect(second.getPropertyValue("propulsion/engine/engine-rpm")).toBeGreaterThan(1500);

    // And it flies on from there.
    for (let step = 0; step < 120; step += 1) expect(second.run()).toBe(true);
    const flown = readFlightState(second);
    expect(validFlightState(flown)).toBe(true);
    expect(Math.abs(flown.airspeedKts - after.airspeedKts)).toBeLessThan(10);
  });
});
