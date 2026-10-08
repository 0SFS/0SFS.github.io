// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { describe, expect, it } from "vitest";
import { bootstrapAircraft } from "./bootstrapC172";
import { resolveAircraftDataFiles } from "./hydrateJsbsimData";

const P = "propulsion/engine/plant/";

/** Engineering stability gates for admitted fixed-environment fixtures, not F135 identification. */
describe("F135 sustained powered lift at the actual full lever demand", () => {
  it.each([
    { name: ".98 initialized", throttle: .98, altFt: 5000, entry: false },
    { name: ".99 initialized", throttle: .99, altFt: 5000, entry: false },
    { name: "1.0 initialized", throttle: 1, altFt: 5000, entry: false },
    { name: "1.0 dynamically entered from idle", throttle: 1, altFt: 0, entry: true },
  ])("settles $name and holds its per-step envelope for sixty seconds", async ({ throttle, altFt, entry }) => {
    const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
      persistence: { enabled: false }, log: { console: false } });
    try {
      const manifest: unknown = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8"));
      for (const file of resolveAircraftDataFiles(manifest, "f-35b"))
        sdk.writeDataFile(file, readFileSync("public/jsbsim-data/" + file, "utf8"));
      await bootstrapAircraft(sdk, "f-35b", { altFt, airspeedKts: 0, throttleNorm: entry ? 0 : throttle,
        holdDown: true, latDeg: 0, lonDeg: 0, headingDeg: 0 });
      for (const index of [0, 1]) sdk.setPropertyValue(`stores/external-tank[${index}]/attached`, 0);
      for (const name of ["theta", "alpha", "gamma"]) sdk.setPropertyValue(`ic/${name}-deg`, 0);
      sdk.setPropertyValue("fcs/pitch-trim-cmd-norm", 0);
      sdk.setPropertyValue("fcs/stovl-cmd-norm", entry ? 0 : 1);
      sdk.setPropertyValue("fcs/stovl-pos-norm", entry ? 0 : 1);
      expect(sdk.runIc()).toBe(true);
      sdk.setPropertyValue("propulsion/set-running", -1);
      expect(sdk.runIc()).toBe(true);
      // Explicit frozen-load isolation. Burning/shaft work continue; tank mass stays fixed.
      sdk.setPropertyValue("propulsion/fuel_freeze", 1);
      const get = (name: string) => sdk.getPropertyValue(name);
      const initialFuel = [0, 1].map(i => get(`propulsion/tank[${i}]/contents-lbs`));
      const channels = [P + "shaft/n1-percent", P + "shaft/n2-percent", P + "nozzle/gross-thrust-lbs",
        P + "lift-fan/gross-thrust-lbs", P + "roll-post[0]/gross-thrust-lbs", P + "roll-post[1]/gross-thrust-lbs"];
      const tail: number[][] = [];
      let worstEnergy = 0, worstMass = 0, failures = 0, worstIterations = 0, wetSteps = 0;
      let sequence = get(P + "numerics/sequence");
      // Commanded conversion and throttle change after two seconds of actual time integration.
      for (let step = 0; step < 82 * 120; step++) {
        if (entry && step === 2 * 120) {
          sdk.setPropertyValue("fcs/throttle-cmd-norm", throttle);
          sdk.setPropertyValue("fcs/stovl-cmd-norm", 1);
        }
        expect(sdk.run()).toBe(true);
        const next = get(P + "numerics/sequence");
        expect(next).toBe(sequence + 1);
        sequence = next;
        failures += get(P + "numerics/failure");
        worstIterations = Math.max(worstIterations, get(P + "numerics/iterations"));
        worstEnergy = Math.max(worstEnergy, get(P + "ledger/energy-relative"));
        worstMass = Math.max(worstMass, get(P + "ledger/mass-relative"));
        wetSteps += get("propulsion/engine/augmentation");
        if (step >= 22 * 120) tail.push(channels.map(get));
      }
      expect(tail).toHaveLength(60 * 120);
      const peakToPeak = (values: number[]) => Math.max(...values) - Math.min(...values);
      expect(peakToPeak(tail.map(row => row[0]))).toBeLessThan(1);
      expect(peakToPeak(tail.map(row => row[1]))).toBeLessThan(1);
      const total = tail.map(row => row.slice(2).reduce((sum, force) => sum + force, 0));
      expect(peakToPeak(total) / (total.reduce((a, b) => a + b, 0) / total.length)).toBeLessThan(.02);
      expect(failures).toBe(0);
      expect(worstEnergy).toBeLessThan(1e-5);
      expect(worstMass).toBeLessThan(1e-6);
      expect(worstIterations).toBeLessThanOrEqual(get(P + "settings/iteration-cap"));
      expect(wetSteps).toBe(0);
      expect(get("fcs/throttle-pos-norm")).toBeLessThanOrEqual(.99);
      expect([0, 1].map(i => get(`propulsion/tank[${i}]/contents-lbs`))).toEqual(initialFuel);
      // Frozen bookkeeping must not hide actual engine consumption from sound/optics.
      expect(get("propulsion/engine/fuel-flow-rate-pps")).toBeGreaterThan(0);
      expect(get("propulsion/engine/fuel-flow-rate-pps") * .45359237 / 120)
        .toBeCloseTo(get(P + "ledger/fuel-in-kg"), 10);
    } finally { sdk.destroy(); }
  }, 60_000);
});
