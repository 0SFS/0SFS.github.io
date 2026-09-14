// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { Vector3 } from "@babylonjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFlightInputManager } from "../input/flightInputManager";
import { bootstrapC172p } from "./bootstrapC172";
import { resolveAircraftDataFiles } from "./hydrateJsbsimData";
import { flightAttitudeToQuaternion, readFlightState } from "../bridge/ecefBridge";

const instances: JSBSimSdk[] = [];
afterEach(() => { for (const sdk of instances.splice(0)) sdk.destroy(); });

describe("C172 yaw direction", () => {
  it.each([["KeyQ", -1], ["KeyE", 1]] as const)("yaws in the commanded direction for %s", async (code, direction) => {
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
    await bootstrapC172p(sdk);
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: vi.fn(() => []) });
    const initialHeading = readFlightState(sdk).headingRad;
    const input = createFlightInputManager();
    const detach = input.attach(window);
    window.dispatchEvent(new KeyboardEvent("keydown", { code }));
    input.apply(sdk, input.poll(1));
    detach();
    for (let step = 0; step < 60; step += 1) expect(sdk.run()).toBe(true);
    const state = readFlightState(sdk);
    const headingChange = Math.atan2(Math.sin(state.headingRad - initialHeading), Math.cos(state.headingRad - initialHeading));
    expect(headingChange * direction).toBeGreaterThan(0.001);
    const nose = Vector3.Zero();
    new Vector3(0, 0, 1).rotateByQuaternionToRef(
      flightAttitudeToQuaternion(state.rollRad, state.pitchRad, state.headingRad), nose,
    );
    const initialRight = new Vector3(Math.cos(initialHeading), 0, Math.sin(initialHeading));
    expect(Vector3.Dot(nose, initialRight) * direction).toBeGreaterThan(0.001);
  });
});
