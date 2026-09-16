import { readFileSync } from "node:fs";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { expect, it } from "vitest";
import { captureSimulation, restoreSimulation } from "../physics/safeFlightState";
import { bootstrapAircraft } from "../jsbsim/bootstrapC172";
import { getFdmProfile } from "../jsbsim/fdmProfiles";
import { resolveAircraftDataFiles } from "../jsbsim/hydrateJsbsimData";
import { createJsbsimAudioAdapter } from "./jsbsimAudioAdapter";

const aircraftId = "cirrus-vision-jet" as const;

it("keeps SF50 audio telemetry monotonic through repeated contact restores", async () => {
  const sdk = await JSBSimSdk.create({
    moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false },
  });
  try {
    const manifest: unknown = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8"));
    for (const path of resolveAircraftDataFiles(manifest, aircraftId)) {
      sdk.writeDataFile(path, readFileSync("public/jsbsim-data/" + path, "utf8"));
    }
    await bootstrapAircraft(sdk, aircraftId, {});
    const adapter = createJsbsimAudioAdapter(sdk, {
      gearHeightMetres: getFdmProfile(aircraftId).stance.staticMeters,
    });
    try {
      for (let step = 0; step < 120; step += 1) expect(sdk.run()).toBe(true);
      let reading = adapter.read();
      let previousTime = reading.simTimeS;
      expect(reading).toMatchObject({ combustion: true, running: true });

      // Terrain and visible-mesh contact both use this restore sequence. Before
      // the clock was retained, every restore published time zero and the audio
      // owner reset the DSP epoch despite uninterrupted combustion.
      for (let reset = 0; reset < 3; reset += 1) {
        restoreSimulation(sdk, captureSimulation(sdk));
        reading = adapter.read();
        const restoredTime = reading.simTimeS;
        expect(restoredTime).toBeCloseTo(previousTime, 10);
        expect(reading).toMatchObject({ combustion: true, running: true });
        expect(sdk.run()).toBe(true);
        reading = adapter.read();
        expect(reading.simTimeS).toBeGreaterThan(restoredTime);
        expect(reading).toMatchObject({ combustion: true, running: true });
        previousTime = reading.simTimeS;
      }
    } finally {
      adapter.dispose();
    }
  } finally {
    sdk.destroy();
  }
});
