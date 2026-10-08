import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AIRCRAFT_IDS } from "../aircraft/aircraftIds";
import { engineIndices } from "./engineControl";
import { getFdmProfile } from "./fdmProfiles";
import { resolveAircraftDataFiles } from "./hydrateJsbsimData";

const manifest: unknown = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8"));

/** Engine 0's definition, as the aircraft file names it. */
function firstEngine(aircraftId: (typeof AIRCRAFT_IDS)[number]): string {
  const model = getFdmProfile(aircraftId).model;
  const aircraft = readFileSync(`public/jsbsim-data/aircraft/${model}/${model}.xml`, "utf8");
  const name = /<engine\s+file="([^"]+)"/.exec(aircraft)![1]!;
  const path = resolveAircraftDataFiles(manifest, aircraftId).find(file => file.endsWith(`/${name}.xml`))!;
  return readFileSync(`public/jsbsim-data/${path}`, "utf8");
}

const number = (xml: string, tag: string) => Number(new RegExp(`<${tag}>\\s*([-\\d.]+)\\s*</${tag}>`).exec(xml)?.[1]);

describe("engine start speeds", () => {
  it.each(AIRCRAFT_IDS)("%s fills its start ring toward the speed JSBSim calls it running at", aircraftId => {
    const profile = getFdmProfile(aircraftId);
    const engine = firstEngine(aircraftId);
    // FGTurbine runs at idle N2 (a coupled plant's idle is corrected, in fraction);
    // FGPiston runs above 80% of idle RPM with spark and fuel.
    const expected = profile.engine !== "turbine" ? 0.8 * number(engine, "idlerpm")
      : engine.includes("<plant") ? 100 * number(engine, "idle-corrected-n2") : number(engine, "idlen2");
    expect(profile.startSpeed.runningAt).toBeCloseTo(expected, 6);
    expect(profile.startSpeed.property).toBe(profile.engine === "turbine" ? "propulsion/engine[0]/n2" : "propulsion/engine[0]/engine-rpm");
  });
});

describe("engine discovery", () => {
  it("finds every engine from its running flag, and assumes one where there is no catalogue", () => {
    const catalog = [
      "propulsion/engine/set-running (RW)", "propulsion/engine/n2 (RW)",
      "propulsion/engine[1]/set-running (RW)", "propulsion/engine[3]/set-running (RW)",
    ].join("\n");
    expect(engineIndices({ queryPropertyCatalog: () => catalog })).toEqual([0, 1, 3]);
    expect(engineIndices({})).toEqual([0]);
    expect(engineIndices({ queryPropertyCatalog: () => "" })).toEqual([0]);
  });
});
