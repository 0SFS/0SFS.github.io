import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { expect, it } from "vitest";
import { runSf50Rollout } from "../validation/sf50RolloutScenario";

it.each(["flat", "rough", "refinement"] as const)(
  "keeps the SF50 lit through %s touchdown and rollout",
  async surface => {
    const sdk = await JSBSimSdk.create({
      moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
      log: { console: false }, persistence: { enabled: false },
    });
    try {
      const manifest = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8")) as {
        aircraft: Record<string, string[]>;
      };
      for (const file of manifest.aircraft["cirrus-vision-jet-g2"] ?? []) {
        sdk.writeDataFile(file, readFileSync(`public/jsbsim-data/${file}`, "utf8"));
      }
      sdk.configurePaths({
        rootDir: "/runtime", aircraftPath: "aircraft", enginePath: "engine", systemsPath: "systems",
      });
      expect(sdk.loadModel("sf50-g2")).toBe(true);

      const result = runSf50Rollout(sdk, surface);
      mkdirSync("build/validation/rollout", { recursive: true });
      writeFileSync(`build/validation/rollout/${surface}.json`, JSON.stringify(result));

      expect(result.summary.fault).toBeNull();
      expect(result.summary.touchdownStep).not.toBeNull();
      if (surface === "rough") expect(result.summary.minimumQbarPsf).toBeLessThan(30);
      else expect(result.summary.stoppedStep).not.toBeNull();
      expect(result.summary.outageFrames).toBe(0);
      expect(result.summary.simTimeRewinds).toBe(0);
      if (surface === "refinement") expect(result.summary.resetCount).toBeGreaterThan(0);
    } finally {
      sdk.destroy();
    }
  },
);
