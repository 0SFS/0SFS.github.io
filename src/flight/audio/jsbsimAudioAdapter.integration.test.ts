// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AircraftId } from "../aircraft/aircraftIds";
import { bootstrapAircraft } from "../jsbsim/bootstrapC172";
import { getFdmProfile } from "../jsbsim/fdmProfiles";
import { resolveAircraftDataFiles } from "../jsbsim/hydrateJsbsimData";
import { AVAILABILITY } from "./audioSnapshot";
import { getAircraftAudioInstallation, resolveAircraftAudioInstallation, type ResolvedEngineSoundSource } from "./aircraftAudioProfiles";
import { FJ33_DEFINITION } from "./engineAcousticDefinitions";
import { createDspHarness, rms, TIER } from "./dspHarness";
import { createJsbsimAudioAdapter, decideCombustion, toSnapshot } from "./jsbsimAudioAdapter";

/**
 * The adapter against the REAL packaged JSBSim and the shipped aircraft data:
 * the mapping and state rules are checked on the model the app flies.
 */

const instances: JSBSimSdk[] = [];
afterEach(() => { for (const sdk of instances.splice(0)) sdk.destroy(); });

async function boot(aircraftId: AircraftId, transformModel?: (xml: string) => string): Promise<JSBSimSdk> {
  const sdk = await JSBSimSdk.create({
    moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false },
  });
  instances.push(sdk);
  const manifest: unknown = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8"));
  for (const path of resolveAircraftDataFiles(manifest, aircraftId)) {
    const text = readFileSync("public/jsbsim-data/" + path, "utf8");
    sdk.writeDataFile(path, transformModel && text.includes("<fdm_config")
      ? transformModel(text) : text);
  }
  await bootstrapAircraft(sdk, aircraftId, {});
  return sdk;
}

function run(sdk: JSBSimSdk, seconds: number): void {
  for (let step = Math.round(seconds * 120); step > 0; step -= 1) {
    if (!sdk.run()) throw new Error("JSBSim step failed");
  }
}

const adapterFor = (sdk: JSBSimSdk, aircraftId: AircraftId) => {
  const audio = resolveAircraftAudioInstallation(getAircraftAudioInstallation(aircraftId));
  if (!audio.supported) throw new Error(audio.reason);
  return createJsbsimAudioAdapter(sdk, { gearHeightMetres: getFdmProfile(aircraftId).stance.staticMeters, source: audio.source });
};

const testSource = (engineIndex = 0): ResolvedEngineSoundSource => ({
  installation: { id: "test-exhaust", engineIndex, engineDefinitionId: FJ33_DEFINITION.id, position: { kind: "native-engine" } },
  definition: FJ33_DEFINITION,
});

describe("JSBSim audio adapter on the real SF50 model", () => {
  it.each([44_100, 48_000])("feeds native FJ33 telemetry into procedural High at %i Hz without a bank", async sampleRate => {
    const sdk = await boot("cirrus-vision-jet");
    const adapter = adapterFor(sdk, "cirrus-vision-jet");
    try {
      const core = await createDspHarness({ sampleRate });
      core.setProfile(FJ33_DEFINITION);
      core.exports.osfs_audio_set_tier(TIER.high);
      core.exports.osfs_audio_set_gains(1, 1, 0, 0, 0);
      const start = adapter.read().simTimeS;
      core.anchor(1, start);
      let next = 0, sequence = 0;
      const output = core.renderSeconds(0.8, frame => {
        const time = frame / sampleRate;
        if (time < next) return;
        while (sdk.getSimTime() - start < time - 1e-9) expect(sdk.run()).toBe(true);
        const reading = adapter.read();
        core.pushSnapshot(toSnapshot(reading, {
          sequence: sequence++, epoch: 1, source: [0, 0, 10],
          sourceVelocity: [0, 0, 0], listenerVelocity: [0, 0, 0],
          sourceAxis: reading.sourceAxis, sourceAxisValid: true,
          exterior: 1, groundReflectionM: -1, poseValid: true,
        }));
        next += 1 / 60;
      });
      expect(output.left.every(Number.isFinite)).toBe(true);
      expect(rms(output.left, sampleRate / 2)).toBeGreaterThan(1e-5);
      expect(core.stats()).toMatchObject({ tier: TIER.high, activeGrains: 0, nonFinite: 0 });
    } finally {
      adapter.dispose();
    }
  });

  it("observes the native thrust orientation and publishes its opposite exhaust axis", async () => {
    const sdk = await boot("cirrus-vision-jet");
    const adapter = adapterFor(sdk, "cirrus-vision-jet");
    expect(adapter.read().sourceAxis).toEqual([0, -0, -1]);
    sdk.setPropertyValue("propulsion/engine[0]/pitch-angle-rad", Math.PI / 3);
    sdk.setPropertyValue("propulsion/engine[0]/yaw-angle-rad", Math.PI / 6);
    const axis = adapter.read().sourceAxis!;
    expect(axis[0]).toBeCloseTo(0.25, 8);
    expect(axis[1]).toBeCloseTo(-Math.sqrt(3) / 2, 8);
    expect(axis[2]).toBeCloseTo(-Math.sqrt(3) / 4, 8);
    expect(Math.hypot(...axis)).toBeCloseTo(1, 8);
    adapter.dispose();
  });

  it("finds every audio property in the catalog and places the engine from the model's geometry", async () => {
    const sdk = await boot("cirrus-vision-jet");
    const adapter = adapterFor(sdk, "cirrus-vision-jet");
    expect(adapter.diagnostics.missing).toEqual([]);
    expect(adapter.diagnostics.combustionSource).toBe("fuel-flow");
    expect(adapter.diagnostics.telemetryAvailable).toBe(true);
    // evidence/audio/sf50-geometry-2026-09-14.txt: engine (225, 0, 6) in, CG (159.56, 0, -39.12) in,
    // static stance 1.12 m. A geometric reading of the model, not a measured acoustic centre.
    const [x, y, z] = adapter.diagnostics.sourceOffset;
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo((6 + 39.12) * 0.0254 + 1.12, 2);
    expect(z).toBeCloseTo(-(225 - 159.56) * 0.0254, 2);
    adapter.dispose();
  });

  it("reads a running engine with every telemetry availability bit set, and no pose bit", async () => {
    const sdk = await boot("cirrus-vision-jet");
    const adapter = adapterFor(sdk, "cirrus-vision-jet");
    run(sdk, 0.5);
    const reading = adapter.read();
    const telemetry = AVAILABILITY.N1 | AVAILABILITY.N2 | AVAILABILITY.THRUST | AVAILABILITY.FUEL_FLOW
      | AVAILABILITY.COMBUSTION | AVAILABILITY.RUNNING | AVAILABILITY.COMMANDS
      | AVAILABILITY.AIRSPEED | AVAILABILITY.CONFIG;
    expect(reading.availability & telemetry).toBe(telemetry);
    expect(reading.availability & AVAILABILITY.POSE).toBe(0);
    expect(reading.simTimeS).toBeCloseTo(0.5, 6);
    expect(reading.n1Pct).toBeGreaterThan(20);
    expect(reading).toMatchObject({ combustion: true, running: true });
    expect(reading.soundSpeedMps).toBeGreaterThan(300);
    expect(reading.soundSpeedMps).toBeLessThan(350);
    adapter.dispose();
  });

  it("calls a fueled start burning while native running is still false (the recorded start trace)", async () => {
    const sdk = await boot("cirrus-vision-jet");
    const adapter = adapterFor(sdk, "cirrus-vision-jet");
    // Same procedure as evidence/audio/sf50-start-trace-2026-09-14.txt.
    sdk.setPropertyValue("fcs/throttle-cmd-norm", 0);
    sdk.setPropertyValue("propulsion/cutoff_cmd", 1);
    sdk.setPropertyValue("propulsion/engine[0]/set-running", 0);
    run(sdk, 0.5);
    sdk.setPropertyValue("propulsion/starter_cmd", 1);
    run(sdk, 2.5);
    let reading = adapter.read();
    // Motoring on the starter with cutoff commanded: rotating, not burning.
    expect(reading).toMatchObject({ starter: true, cutoff: true, combustion: false, running: false });
    expect(reading.fuelFlowPps).toBe(0);
    expect(reading.n2Pct).toBeGreaterThan(10);

    sdk.setPropertyValue("propulsion/cutoff_cmd", 0);
    run(sdk, 1);
    reading = adapter.read();
    expect(reading.fuelFlowPps).toBeGreaterThan(1e-4);
    expect(reading).toMatchObject({ cutoff: false, combustion: true, running: false });
    adapter.dispose();
  });

  it("drops combustion on the step fuel is cut while the shafts keep turning (shutdown)", async () => {
    const sdk = await boot("cirrus-vision-jet");
    const adapter = adapterFor(sdk, "cirrus-vision-jet");
    run(sdk, 1);
    expect(adapter.read()).toMatchObject({ combustion: true, running: true });
    sdk.setPropertyValue("propulsion/cutoff_cmd", 1);
    run(sdk, 0.5);
    const reading = adapter.read();
    expect(reading.fuelFlowPps).toBe(0);
    expect(reading).toMatchObject({ cutoff: true, combustion: false });
    // Coasting, not stopped: the rotating tones stay while the burner goes.
    expect(reading.n2Pct).toBeGreaterThan(5);
    adapter.dispose();
  });

  it("drops combustion when a start is aborted before native running latches", async () => {
    const sdk = await boot("cirrus-vision-jet");
    const adapter = adapterFor(sdk, "cirrus-vision-jet");
    sdk.setPropertyValue("fcs/throttle-cmd-norm", 0);
    sdk.setPropertyValue("propulsion/cutoff_cmd", 1);
    sdk.setPropertyValue("propulsion/engine[0]/set-running", 0);
    run(sdk, 0.5);
    sdk.setPropertyValue("propulsion/starter_cmd", 1);
    run(sdk, 2.5);
    sdk.setPropertyValue("propulsion/cutoff_cmd", 0);
    run(sdk, 1);
    expect(adapter.read()).toMatchObject({ combustion: true, running: false });
    sdk.setPropertyValue("propulsion/cutoff_cmd", 1);
    run(sdk, 0.25);
    const reading = adapter.read();
    expect(reading.fuelFlowPps).toBe(0);
    expect(reading).toMatchObject({ combustion: false, running: false });
    adapter.dispose();
  });

  it("releases its property batch once and reads nothing afterwards", async () => {
    const sdk = await boot("cirrus-vision-jet");
    const adapter = adapterFor(sdk, "cirrus-vision-jet");
    run(sdk, 0.25);
    const before = adapter.read().simTimeS;
    adapter.dispose();
    adapter.dispose();
    run(sdk, 0.25);
    expect(adapter.read().simTimeS).toBe(before);
  });
});

describe("JSBSim audio adapter on a model without a turbofan", () => {
  it("rejects absent required turbine capabilities instead of reading JSBSim's zero", async () => {
    const sdk = await boot("cessna-172");
    const batch = vi.spyOn(sdk, "createPropertyBatch");
    // A caller can propose a turbine schema, but the native catalog must
    // refuse its missing required capabilities; the facade cannot admit it.
    expect(() => createJsbsimAudioAdapter(sdk, {
      gearHeightMetres: getFdmProfile("cessna-172").stance.staticMeters, source: testSource(),
    })).toThrow(/required native telemetry propulsion\/engine\[0\]\/n1/);
    expect(batch).not.toHaveBeenCalled();
  });
});

describe("explicit indexed native telemetry", () => {
  it("reads engine one, its throttle and its source geometry without substituting engine zero", async () => {
    const sdk = await boot("cirrus-vision-jet", xml => {
      // Synthetic twin fixture tests native indexing; it is not a new aircraft
      // or an assertion that this installation is acoustically calibrated.
      const engine = xml.match(/<engine file="fj33_5a">[\s\S]*?<\/engine>/)?.[0];
      if (!engine) throw new Error("SF50 fixture engine block missing");
      const second = engine.replace("<x>225.0</x><y>0.0</y>", "<x>325.0</x><y>36.0</y>");
      return xml.replace(engine, engine + second);
    });
    sdk.setPropertyValue("fcs/throttle-cmd-norm[0]", 0.1);
    sdk.setPropertyValue("fcs/throttle-cmd-norm[1]", 0.8);
    run(sdk, 1);
    const adapter = createJsbsimAudioAdapter(sdk, { gearHeightMetres: 1.12, source: testSource(1) });
    expect(adapter.diagnostics).toMatchObject({ sourceId: "test-exhaust", engineIndex: 1, telemetryAvailable: true });
    const reading = adapter.read();
    for (const [field, property] of [["n1Pct", "n1"], ["n2Pct", "n2"],
      ["thrustLbf", "thrust-lbs"], ["fuelFlowPps", "fuel-flow-rate-pps"]] as const) {
      expect(reading[field]).toBe(sdk.getPropertyValue(`propulsion/engine[1]/${property}`));
    }
    expect(reading.throttleNorm).toBe(0.8);
    expect(reading.thrustLbf).not.toBe(sdk.getPropertyValue("propulsion/engine[0]/thrust-lbs"));
    expect(adapter.diagnostics.sourceOffset[0]).toBeCloseTo(-36 * 0.0254, 8);
    expect(adapter.diagnostics.sourceOffset[2]).toBeCloseTo(-(325 - sdk.getPropertyValue("inertia/cg-x-in")) * 0.0254, 8);

    // Native global commands are attributed only while the selected engine
    // matches this installation. An all-engine aggregate is not engine one.
    expect(reading.availability & AVAILABILITY.COMMANDS).toBe(0);
    sdk.setPropertyValue("propulsion/active_engine", 1);
    sdk.setPropertyValue("propulsion/starter_cmd", 1);
    sdk.setPropertyValue("propulsion/cutoff_cmd", 1);
    expect(adapter.read()).toMatchObject({ starter: true, cutoff: true });
    expect(reading.availability & AVAILABILITY.COMMANDS).toBe(AVAILABILITY.COMMANDS);
    sdk.setPropertyValue("propulsion/active_engine", 0);
    expect(adapter.read()).toMatchObject({ starter: false, cutoff: false });
    expect(reading.availability & AVAILABILITY.COMMANDS).toBe(0);
    sdk.setPropertyValue("propulsion/active_engine", -1);
    expect(adapter.read().availability & AVAILABILITY.COMMANDS).toBe(0);
    adapter.dispose();
  });

  it("rejects a nonexistent configured engine instead of falling back to engine zero", async () => {
    const sdk = await boot("cirrus-vision-jet");
    expect(() => createJsbsimAudioAdapter(sdk, { gearHeightMetres: 1.12, source: testSource(2) }))
      .toThrow(/required native telemetry propulsion\/engine\[2\]\/n1/);
  });

  it("rejects missing source geometry instead of inventing a zero position", async () => {
    const sdk = await boot("cirrus-vision-jet");
    const catalog = sdk.queryPropertyCatalog.bind(sdk);
    vi.spyOn(sdk, "queryPropertyCatalog").mockImplementation(query => catalog(query).split("\n")
      .filter(line => !/^propulsion\/engine(?:\[0\])?\/x-position\s/.test(line.trim())).join("\n"));
    const batch = vi.spyOn(sdk, "createPropertyBatch");
    expect(() => adapterFor(sdk, "cirrus-vision-jet")).toThrow(/requires native geometry.*x-position/);
    expect(batch).not.toHaveBeenCalled();
  });

  it("does not turn an absent optional augmentation capability into a native inactive observer", async () => {
    const sdk = await boot("cirrus-vision-jet");
    const source = { ...testSource(), definition: { ...FJ33_DEFINITION, telemetry: { ...FJ33_DEFINITION.telemetry,
      paths: { ...FJ33_DEFINITION.telemetry.paths,
        augmentation: "propulsion/engine[{engineIndex}]/missing-augmentation",
        throttleNorm: "fcs/missing-throttle[{engineIndex}]",
      },
    } } };
    const adapter = createJsbsimAudioAdapter(sdk, { gearHeightMetres: 1.12, source });
    const reading = adapter.read();
    expect(adapter.diagnostics.telemetryAvailable).toBe(true);
    expect(reading.augmentation).toBe(false);
    expect(Number.isNaN(reading.throttleNorm)).toBe(true);
    expect(reading.availability & AVAILABILITY.AUGMENTATION).toBe(0);
    expect(reading.availability & AVAILABILITY.FUEL_FLOW).toBe(AVAILABILITY.FUEL_FLOW);
    adapter.dispose();
  });

  it.each(["non-finite", "read-error"])("disposes its native batch after initial %s telemetry", async failure => {
    const sdk = await boot("cirrus-vision-jet");
    const create = sdk.createPropertyBatch.bind(sdk);
    const dispose = vi.fn();
    vi.spyOn(sdk, "createPropertyBatch").mockImplementation((paths, options) => {
      const batch = create(paths, options);
      const read = batch.read.bind(batch);
      const release = batch.dispose.bind(batch);
      vi.spyOn(batch, "read").mockImplementation(target => {
        if (failure === "read-error") throw new Error("Native batch read failed");
        const values = read(target);
        values[paths.indexOf("propulsion/engine[0]/n1")] = Number.NaN;
        return values;
      });
      vi.spyOn(batch, "dispose").mockImplementation(() => { dispose(); release(); });
      return batch;
    });
    expect(() => adapterFor(sdk, "cirrus-vision-jet"))
      .toThrow(failure === "read-error" ? /Native batch read failed/ : /unavailable required telemetry/);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("marks a later non-finite native value unavailable and leaves its raw value as NaN", async () => {
    const sdk = await boot("cirrus-vision-jet");
    const create = vi.spyOn(sdk, "createPropertyBatch");
    const adapter = adapterFor(sdk, "cirrus-vision-jet");
    const batch = create.mock.results[0].value as ReturnType<JSBSimSdk["createPropertyBatch"]>;
    const read = batch.read.bind(batch);
    const slot = create.mock.calls[0][0].indexOf("propulsion/engine[0]/n1");
    let nonFinite = true;
    vi.spyOn(batch, "read").mockImplementation(target => {
      const values = read(target); if (nonFinite) values[slot] = Number.NaN; return values;
    });
    const reading = adapter.read();
    expect(Number.isNaN(reading.n1Pct)).toBe(true);
    expect(reading.availability & AVAILABILITY.N1).toBe(0);
    expect(adapter.diagnostics.telemetryAvailable).toBe(false);
    nonFinite = false;
    expect(Number.isFinite(adapter.read().n1Pct)).toBe(true);
    expect(adapter.diagnostics.telemetryAvailable).toBe(true);
    adapter.dispose();
  });
});

describe("combustion decision", () => {
  it("uses the schema's explicit native fuel-flow threshold", () => {
    const input = { fuelFlowAvailable: true, fuelFlowPps: 0.001, runningAvailable: false, running: false };
    expect(decideCombustion(input, 1e-4).combustion).toBe(true);
    expect(decideCombustion(input, 0.01).combustion).toBe(false);
  });
  it.each([
    ["fuel burning while running is false", { fuelFlowAvailable: true, fuelFlowPps: 0.0103, runningAvailable: true, running: false }, true, "fuel-flow"],
    ["no fuel, not running", { fuelFlowAvailable: true, fuelFlowPps: 0, runningAvailable: true, running: false }, false, "fuel-flow"],
    ["non-finite fuel but running", { fuelFlowAvailable: true, fuelFlowPps: Number.NaN, runningAvailable: true, running: true }, true, "fuel-flow"],
    ["running flag only", { fuelFlowAvailable: false, fuelFlowPps: 0, runningAvailable: true, running: true }, true, "running-only"],
    ["no signal at all", { fuelFlowAvailable: false, fuelFlowPps: 0, runningAvailable: false, running: true }, false, "unavailable"],
  ] as const)("%s", (_name, input, combustion, source) => {
    expect(decideCombustion(input, 1e-4)).toEqual({ combustion, source });
  });

  it("adds the pose bit only for a valid pose", () => {
    const reading = {
      simTimeS: 1, availability: AVAILABILITY.N1, n1Pct: 30, n2Pct: 60, thrustLbf: 0, fuelFlowPps: 0,
      throttleNorm: 0, combustion: false, running: false, starter: false, cutoff: true, kias: 0,
      gearNorm: 1, flapNorm: 0, velocity: [0, 0, 0] as [number, number, number], soundSpeedMps: 340, augmentation: false,
    };
    const pose = {
      sequence: 4, epoch: 2, source: [1, 2, 3] as const, sourceVelocity: [0, 0, 0] as const,
      listenerVelocity: [0, 0, 0] as const, exterior: 1, groundReflectionM: 5,
    };
    expect(toSnapshot(reading, { ...pose, poseValid: true }).availability).toBe(AVAILABILITY.N1 | AVAILABILITY.POSE);
    expect(toSnapshot(reading, { ...pose, poseValid: false }))
      .toMatchObject({ availability: AVAILABILITY.N1, epoch: 2, sequence: 4, soundSpeedMps: 340 });
  });
});
