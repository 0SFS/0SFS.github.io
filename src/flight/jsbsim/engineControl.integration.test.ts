// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { afterEach, describe, expect, it } from "vitest";
import type { AircraftId } from "../aircraft/aircraftIds";
import { bootstrapAircraft } from "./bootstrapC172";
import { createEngineControl, engineIndices, type EngineControl, type EngineControlReading } from "./engineControl";
import { getFdmProfile } from "./fdmProfiles";
import { resolveAircraftDataFiles } from "./hydrateJsbsimData";
import { FIXED_DT } from "../physics/fixedStepLoop";
import { captureSimulation, restoreSimulation } from "../physics/safeFlightState";

const instances: JSBSimSdk[] = [];

afterEach(() => {
  for (const sdk of instances.splice(0)) sdk.destroy();
});

async function boot(aircraftId: AircraftId, airspeedKts = 0, altFt = 1000) {
  const sdk = await JSBSimSdk.create({
    moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false },
  });
  instances.push(sdk);
  const manifest: unknown = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8"));
  for (const file of resolveAircraftDataFiles(manifest, aircraftId)) sdk.writeDataFile(file, readFileSync("public/jsbsim-data/" + file, "utf8"));
  await bootstrapAircraft(sdk, aircraftId, { altFt, airspeedKts });
  return { sdk, control: createEngineControl(sdk, getFdmProfile(aircraftId)) };
}

/** Steps as the app does: the control first, then JSBSim, throttle at idle. */
function fly(sdk: JSBSimSdk, control: EngineControl, seconds: number, startHeld: boolean,
  until?: (reading: EngineControlReading) => boolean): { seconds: number; readings: EngineControlReading[] } {
  const readings: EngineControlReading[] = [];
  for (let step = 0; step < Math.round(seconds / FIXED_DT); step++) {
    const reading = control.step(startHeld);
    readings.push(reading);
    if (until?.(reading)) return { seconds: step * FIXED_DT, readings };
    sdk.setPropertyValue("fcs/throttle-cmd-norm", 0);
    expect(sdk.run()).toBe(true);
  }
  return { seconds, readings };
}

const running = (sdk: JSBSimSdk) => engineIndices(sdk).map(index => sdk.getPropertyValue(`propulsion/engine[${index}]/set-running`));

describe("engine control on JSBSim", () => {
  it.each([
    ["cessna-172", 0, 5],
    ["cirrus-vision-jet", 0, 30],
    ["f-35b", 0, 35],
    ["cessna-172", 100, 5],
    ["cirrus-vision-jet", 150, 30],
  ] as const)("shuts %s down at %s kt, keeps it down, and starts it again only while held", async (aircraftId, kts, startSeconds) => {
    const { sdk, control } = await boot(aircraftId, kts, kts ? 6000 : 1000);
    expect(fly(sdk, control, 0.5, false).readings.at(-1)!.state).toBe("running");

    control.shutdown();
    expect(control.reading().state).toBe("stopped");
    fly(sdk, control, 10, false);
    expect(running(sdk).every(flag => flag === 0)).toBe(true);
    expect(control.reading()).toEqual({ state: "stopped", startProgress: 0, blocked: null });

    // A start held for one second and let go is abandoned, and nothing relights it.
    expect(fly(sdk, control, 1, true).readings.at(-1)!.state).toBe("starting");
    fly(sdk, control, 15, false);
    expect(running(sdk).every(flag => flag === 0)).toBe(true);
    expect(sdk.getPropertyValue("propulsion/starter_cmd")).toBe(0);

    const start = fly(sdk, control, startSeconds, true, reading => reading.state === "running");
    expect(control.reading().state).toBe("running");
    expect(running(sdk).every(flag => flag === 1)).toBe(true);
    // The ring only fills as the engine spools, and fills completely only when it runs.
    const progress = start.readings.map(reading => reading.startProgress);
    expect(progress.at(-1)).toBe(1);
    expect(Math.max(...progress.slice(0, -1))).toBeLessThan(1);
    expect(progress.slice(1).every((value, i) => value >= progress[i]! - 0.02)).toBe(true);
    // Let go once running: it keeps running, and a piston's starter is released.
    fly(sdk, control, 3, false);
    expect(control.reading().state).toBe("running");
    expect(sdk.getPropertyValue("propulsion/starter_cmd")).toBe(0);
  }, 60000);

  it("measures how long each start takes", async () => {
    const seconds: Record<string, number> = {};
    for (const aircraftId of ["cessna-172", "cirrus-vision-jet", "f-35b"] as const) {
      const { sdk, control } = await boot(aircraftId);
      fly(sdk, control, 0.5, false);
      control.shutdown();
      fly(sdk, control, 30, false);
      seconds[aircraftId] = fly(sdk, control, 60, true, reading => reading.state === "running").seconds;
    }
    expect(seconds["cessna-172"]).toBeLessThan(4);
    expect(seconds["cirrus-vision-jet"]).toBeGreaterThan(15);
    expect(seconds["cirrus-vision-jet"]).toBeLessThan(35);
    expect(seconds["f-35b"]).toBeGreaterThan(15);
    expect(seconds["f-35b"]).toBeLessThan(40);
  }, 120000);

  it("makes a shutdown stick through the step after a reinitialization", async () => {
    const { sdk, control } = await boot("cirrus-vision-jet");
    fly(sdk, control, 0.5, false);
    // Recovery rebuilds the state at zero time; its first step sets cutoff from running.
    restoreSimulation(sdk, captureSimulation(sdk));
    control.shutdown();
    fly(sdk, control, 2, false);
    expect(running(sdk)).toEqual([0]);
    expect(sdk.getPropertyValue("propulsion/cutoff_cmd")).toBe(1);
  }, 30000);

  it("keeps a start going through a reinitialization while it is held", async () => {
    const { sdk, control } = await boot("cessna-172");
    fly(sdk, control, 0.5, false);
    control.shutdown();
    fly(sdk, control, 10, false);
    fly(sdk, control, 0.5, true);
    restoreSimulation(sdk, captureSimulation(sdk));
    fly(sdk, control, 5, true, reading => reading.state === "running");
    expect(running(sdk)).toEqual([1]);
  }, 30000);

  it("says why a start cannot finish without fuel", async () => {
    const { sdk, control } = await boot("cirrus-vision-jet");
    fly(sdk, control, 0.5, false);
    control.shutdown();
    sdk.setPropertyValue("propulsion/tank[0]/contents-lbs", 0);
    fly(sdk, control, 2, false);
    const reading = fly(sdk, control, 10, true).readings.at(-1)!;
    expect(reading.state).toBe("starting");
    expect(reading.blocked).toBe("No fuel on board");
    expect(running(sdk)).toEqual([0]);
  }, 30000);
});
