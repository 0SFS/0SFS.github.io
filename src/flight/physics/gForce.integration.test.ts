import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrapC172p } from "../jsbsim/bootstrapC172";
import { resolveAircraftDataFiles } from "../jsbsim/hydrateJsbsimData";
import { readPilotG } from "./gForce";

const instances: JSBSimSdk[] = [];
afterEach(() => { for (const sdk of instances.splice(0)) sdk.destroy(); });

describe("the load at the pilot's seat, from the native flight model", () => {
  it("is near 1 g at the start of a flight, rises in a pull and goes negative in a push", async () => {
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
    const fly = (steps: number, elevator: number): number[] => {
      sdk.setPropertyValue("fcs/elevator-cmd-norm", elevator);
      const loads: number[] = [];
      for (let step = 0; step < steps; step += 1) {
        expect(sdk.run()).toBe(true);
        loads.push(readPilotG(sdk));
      }
      return loads;
    };

    // Stick centred, the aircraft bootstraps faster than it trims and noses up: a positive load,
    // and the same at the seat as at the centre of gravity but for the aircraft's rotation.
    const centred = fly(240, 0);
    expect(centred[0]).toBeGreaterThan(0.5);
    expect(centred[0]).toBeLessThan(1.5);
    expect(Math.abs(readPilotG(sdk) - sdk.getPropertyValue("accelerations/Nz"))).toBeLessThan(0.3);

    expect(Math.max(...fly(120, -1))).toBeGreaterThan(Math.max(...centred) + 1);
    expect(Math.min(...fly(240, 1))).toBeLessThan(0);
  });
});
