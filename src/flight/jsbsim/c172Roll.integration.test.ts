import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { wasmBinaryUrl, wasmModuleUrl } from "@0x62/jsbsim-wasm/wasm";
import { Vector3 } from "@babylonjs/core";
import { describe, expect, it } from "vitest";
import { bootstrapC172p } from "./bootstrapC172";
import { flightAttitudeToQuaternion, readFlightState } from "../bridge/ecefBridge";

describe("C172 roll direction", () => {
  it.each([-1, 1])("banks in the commanded direction for aileron %s", async (aileron) => {
    const sdk = await JSBSimSdk.create({
      moduleUrl: wasmModuleUrl,
      wasmUrl: wasmBinaryUrl,
      persistence: { enabled: false },
      log: { console: false, stripAnsi: true },
    });
    const dataRoot = resolve(process.cwd(), "public/jsbsim-data");
    const manifest = JSON.parse(readFileSync(resolve(dataRoot, "manifest.json"), "utf8")) as { files: string[] };
    for (const relativePath of manifest.files) {
      sdk.writeDataFile(relativePath, readFileSync(resolve(dataRoot, relativePath), "utf8"));
    }
    await bootstrapC172p(sdk);
    sdk.setPropertyValue("fcs/aileron-cmd-norm", aileron);
    for (let step = 0; step < 60; step += 1) expect(sdk.run()).toBe(true);
    const state = readFlightState(sdk);
    expect(state.rollRad * aileron).toBeGreaterThan(0.01);
    const rightWing = Vector3.Zero();
    new Vector3(-1, 0, 0).rotateByQuaternionToRef(
      flightAttitudeToQuaternion(state.rollRad, state.pitchRad, state.headingRad), rightWing,
    );
    expect(rightWing.y * aileron).toBeLessThan(-0.01);
  });
});
