// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrapAircraft } from "../jsbsim/bootstrapC172";
import { getFdmProfile } from "../jsbsim/fdmProfiles";
import { resolveAircraftDataFiles } from "../jsbsim/hydrateJsbsimData";
import { createAircraftForceReader, POUND_FORCE_TO_NEWTONS, structuralPointToDisplay } from "./aircraftForces";

const instances: JSBSimSdk[] = [];
afterEach(() => { for (const sdk of instances.splice(0)) sdk.destroy(); });

async function createAircraft(aircraftId: "cessna-172" | "f-35b") {
  const sdk = await JSBSimSdk.create({ moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false } });
  instances.push(sdk);
  const manifest: unknown = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8"));
  for (const file of resolveAircraftDataFiles(manifest, aircraftId)) sdk.writeDataFile(file, readFileSync("public/jsbsim-data/" + file, "utf8"));
  await bootstrapAircraft(sdk, aircraftId);
  for (let step = 0; step < 120; step++) expect(sdk.run()).toBe(true);
  return sdk;
}

describe("installed SDK aircraft force observers", () => {
  it.each(["cessna-172", "f-35b"] as const)("reads cached native force closure for %s without mutating or advancing physics", async aircraftId => {
    const sdk = await createAircraft(aircraftId);
    const reader = createAircraftForceReader(sdk, getFdmProfile(aircraftId).forceEngineLabels);
    try {
      const time = sdk.getPropertyValue("simulation/sim-time-sec");
      const snapshot = reader.read();
      expect(snapshot.unavailable).toEqual([]);
      expect(snapshot.simulationTimeSeconds).toBe(time);
      expect(sdk.getPropertyValue("simulation/sim-time-sec")).toBe(time);
      const engineForces = snapshot.forces.filter(force => force.id.startsWith("engine-"));
      expect(engineForces).toHaveLength(aircraftId === "f-35b" ? 4 : 1);
      const aeroForces = snapshot.forces.filter(force => /^aero-[012]$/.test(force.id) || force.id === "aero-cg");
      for (let index = 0; index < 3; index++) {
        const axis = ["x", "y", "z"][index];
        expect(engineForces.reduce((sum, force) => sum + force.bodyNewtons[index], 0)).toBeCloseTo(
          sdk.getPropertyValue(`forces/fb${axis}-prop-lbs`) * POUND_FORCE_TO_NEWTONS, 6);
        expect(aeroForces.reduce((sum, force) => sum + force.bodyNewtons[index], 0)).toBeCloseTo(
          sdk.getPropertyValue(`forces/fb${axis}-aero-lbs`) * POUND_FORCE_TO_NEWTONS, 6);
        expect(snapshot.forces.find(force => force.id === "net")!.bodyNewtons[index]).toBeCloseTo(
          (sdk.getPropertyValue(`forces/fb${axis}-total-lbs`) + sdk.getPropertyValue(`forces/fb${axis}-weight-lbs`)) * POUND_FORCE_TO_NEWTONS, 6);
      }
      expect(reader.read()).toEqual(snapshot);
    } finally { reader.dispose(); }
  });

  it("observes all four converted F35 native force vectors and their current acting locations", async () => {
    const sdk = await createAircraft("f-35b");
    sdk.setPropertyValue("fcs/stovl-cmd-norm", 1);
    sdk.setPropertyValue("fcs/stovl-pos-norm", 1);
    sdk.setPropertyValue("fcs/throttle-cmd-norm", 0.98);
    for (let step = 0; step < 120; step++) expect(sdk.run()).toBe(true);
    const reader = createAircraftForceReader(sdk, getFdmProfile("f-35b").forceEngineLabels);
    try {
      const snapshot = reader.read();
      expect(snapshot.unavailable).toEqual([]);
      const cg = ["x", "y", "z"].map(axis => sdk.getPropertyValue(`inertia/cg-${axis}-in`)) as [number, number, number];
      for (let index = 0; index < 4; index++) {
        const force = snapshot.forces.find(force => force.id === `engine-${index}`)!;
        const acting = ["x", "y", "z"].map(axis => sdk.getPropertyValue(`propulsion/engine[${index}]/${axis}-position`)) as [number, number, number];
        expect(force.anchorMeters).toEqual(structuralPointToDisplay(acting, cg));
        expect(force.bodyNewtons.every(Number.isFinite)).toBe(true);
        expect(force.bodyNewtons[2]).toBeLessThan(0); // Actual upward thrust in body Z-down, including roll posts.
      }
      expect(snapshot.forces.find(force => force.id === "engine-1")!.anchorMeters[2]).toBeGreaterThan(0);
      expect(snapshot.forces.find(force => force.id === "engine-0")!.anchorMeters[2]).toBeLessThan(0);
    } finally { reader.dispose(); }
  });
});
