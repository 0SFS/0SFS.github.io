import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { wasmBinaryUrl, wasmModuleUrl } from "@0x62/jsbsim-wasm/wasm";
import { describe, expect, it } from "vitest";
import { bootstrapC172p } from "./bootstrapC172";
import { resolveAircraftDataFiles } from "./hydrateJsbsimData";

interface DataManifest {
  files: string[];
}

describe("C172 propulsion", () => {
  it("sustains engine power at full throttle", async () => {
    const sdk = await JSBSimSdk.create({
      moduleUrl: wasmModuleUrl,
      wasmUrl: wasmBinaryUrl,
      persistence: { enabled: false },
      log: { console: false, stripAnsi: true },
    });
    const dataRoot = resolve(process.cwd(), "public/jsbsim-data");
    const manifest = JSON.parse(readFileSync(resolve(dataRoot, "manifest.json"), "utf8")) as DataManifest;
    for (const relativePath of resolveAircraftDataFiles(manifest, "cessna-172")) {
      sdk.writeDataFile(relativePath, readFileSync(resolve(dataRoot, relativePath), "utf8"));
    }

    await bootstrapC172p(sdk);
    sdk.setPropertyValue("fcs/throttle-cmd-norm", 1);
    for (let step = 0; step < 120; step += 1) expect(sdk.run()).toBe(true);

    expect(sdk.getPropertyValue("propulsion/engine/engine-rpm")).toBeGreaterThan(500);
    expect(sdk.getPropertyValue("propulsion/engine/power-hp")).toBeGreaterThan(0);
  });
});
