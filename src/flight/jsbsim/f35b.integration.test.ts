// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapAircraft, type C172BootstrapOptions } from "./bootstrapC172";
import { getFdmProfile, type FlightControlLawMode } from "./fdmProfiles";
import { setExternalFuelTankAttached } from "./externalFuelTanks";
import { resolveAircraftDataFiles } from "./hydrateJsbsimData";
import { resetFlightLocation } from "./resetFlightLocation";
import { readFlightState } from "../bridge/ecefBridge";
import { applyFlightControls } from "../input/applyFlightControls";
import { createFlightInputManager, type ControlSurfaceState } from "../input/flightInputManager";
import { createAutoTrimState, readAutoTrimTuning, stepPitchAutoTrim, stepRollAutoTrim } from "../input/autoTrim";
import { FIXED_DT } from "../physics/fixedStepLoop";
import { captureSimulation, restoreSimulation, validFlightState } from "../physics/safeFlightState";
import { flightParameterDefaults } from "../settings/flightParameters";

const aircraftId = "f-35b";
const profile = getFdmProfile(aircraftId);
const instances: JSBSimSdk[] = [];
const neutral: ControlSurfaceState = {
  elevator: 0, aileron: 0, rudder: 0, throttle: profile.initialThrottleNorm,
  pitchTrim: profile.initialProperties!["fcs/pitch-trim-cmd-norm"], rollTrim: 0, flaps: 0, brake: 0,
};

beforeEach(() => {
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
});

afterEach(() => {
  for (const sdk of instances.splice(0)) sdk.destroy();
  vi.restoreAllMocks();
});

async function createF35(options: C172BootstrapOptions = {}) {
  const sdk = await JSBSimSdk.create({
    moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false },
  });
  instances.push(sdk);
  const manifest: unknown = JSON.parse(readFileSync("public/jsbsim-data/manifest.json", "utf8"));
  for (const file of resolveAircraftDataFiles(manifest, aircraftId)) sdk.writeDataFile(file, readFileSync("public/jsbsim-data/" + file, "utf8"));
  await bootstrapAircraft(sdk, aircraftId, options);
  // Existing handling fixtures qualify the clean aircraft, with both stores removed.
  for (const index of [2, 3]) setExternalFuelTankAttached(sdk, aircraftId, index, false);
  return sdk;
}

function apply(sdk: JSBSimSdk, controls = neutral, conversion = 0) {
  applyFlightControls(sdk, controls, 0, profile.rudderSign, {
    commandProperty: profile.stovl!.commandProperty, commandNorm: conversion,
  });
}

function advance(sdk: JSBSimSdk, seconds: number) {
  for (let step = 0; step < seconds / FIXED_DT; step++) expect(sdk.run()).toBe(true);
  expect(validFlightState(readFlightState(sdk))).toBe(true);
}

async function createHover({ conversion = 1, altFt = 1000, airspeedKts = 0, throttleNorm = 0.98, holdDown = false } = {}) {
  const sdk = await createF35({ altFt, airspeedKts, throttleNorm, holdDown });
  const controls = { ...neutral, throttle: throttleNorm, pitchTrim: 0 };
  const initialize = () => {
    for (const property of ["ic/theta-deg", "ic/alpha-deg", "ic/gamma-deg"]) sdk.setPropertyValue(property, 0);
    sdk.setPropertyValue(profile.stovl!.positionProperty, conversion);
    apply(sdk, controls, conversion);
  };
  initialize();
  expect(sdk.runIc()).toBe(true);
  sdk.setPropertyValue("propulsion/set-running", -1);
  initialize();
  expect(sdk.runIc()).toBe(true);
  return { sdk, controls };
}

const PLANT = "propulsion/engine[0]/plant/";
const liftSystemThrust = (sdk: JSBSimSdk) => ({
  main: sdk.getPropertyValue(PLANT + "nozzle/gross-thrust-lbs"),
  liftFan: sdk.getPropertyValue(PLANT + "lift-fan/gross-thrust-lbs"),
  posts: [0, 1].map(post => sdk.getPropertyValue(PLANT + `roll-post[${post}]/gross-thrust-lbs`)),
});
/** The magnitude the model applies as one of its external forces. */
const applied = (sdk: JSBSimSdk, name: string) =>
  sdk.getPropertyValue(profile.forceExternalForces!.find(force => force.name === name)!.magnitude!);

describe("F-35B LiftSystem as outlets of the coupled F135 plant, not LiftSystem calibration", () => {
  it.each([0, 0.25, 0.5, 0.75, 1].flatMap(conversion => [0, 60, 150].map(airspeedKts => ({ conversion, airspeedKts }))))(
    "balances lift-fan against main-nozzle vertical thrust at conversion=$conversion, speed=$airspeedKts kt", async ({ conversion, airspeedKts }) => {
      const { sdk } = await createHover({ conversion, airspeedKts, altFt: 5000 });
      // One engine: the lift fan and roll posts are its outlets, never engines of their own.
      expect(sdk.getPropertyCatalog().some(line => line.startsWith("propulsion/engine[1]/"))).toBe(false);
      const { liftFan, posts } = liftSystemThrust(sdk);
      // Applied at their own stations as exactly the plant's outlet observations.
      expect(applied(sdk, "lift-fan")).toBe(liftFan);
      expect(applied(sdk, "roll-post-left")).toBe(posts[0]);
      expect(applied(sdk, "roll-post-right")).toBe(posts[1]);
      if (conversion === 0) {
        expect(liftFan).toBe(0);
        expect(posts).toEqual([0, 0]);
        return;
      }
      // The engine holds the commanded split, which balances the two jets about the CG.
      const cg = sdk.getPropertyValue("inertia/cg-x-in");
      const aftArm = sdk.getPropertyValue("propulsion/engine[0]/x-position") - cg;
      const forwardArm = cg - sdk.getPropertyValue("external_reactions/lift-fan/location-x-in");
      const mainVertical = -sdk.getPropertyValue("propulsion/engine[0]/body-force-z-lbs");
      expect(liftFan * forwardArm / (mainVertical * aftArm * (1 + sdk.getPropertyValue("fcs/stovl-pitch-control"))))
        .toBeCloseTo(1, 3);
      expect(posts[0]).toBeCloseTo(posts[1], 6);
    },
  );

  it("drives the lift fan from the main engine's LP spool as power changes", async () => {
    const { sdk, controls } = await createHover({ conversion: 0.5, altFt: 5000, throttleNorm: 0.6 });
    expect(sdk.run()).toBe(true); // Leave zero-time Trim before changing demand.
    const before = { n2: sdk.getPropertyValue("propulsion/engine[0]/n2"), ...liftSystemThrust(sdk) };
    apply(sdk, { ...controls, throttle: 0.98 }, 0.5);
    advance(sdk, 0.25);
    // A real spool: a quarter second later it is still accelerating.
    const early = sdk.getPropertyValue("propulsion/engine[0]/n2");
    expect(early).toBeGreaterThan(before.n2);
    const splitError = () => {
      const { main, liftFan } = liftSystemThrust(sdk);
      return Math.abs(liftFan / main / sdk.getPropertyValue("fcs/lift-split-cmd") - 1);
    };
    let worstSplit = 0;
    for (let step = 0; step < 4 / FIXED_DT; step++) {
      expect(sdk.run()).toBe(true);
      // The engaged clutch turns the fan with the LP spool through its gear.
      expect(Math.abs(sdk.getPropertyValue(PLANT + "lift-fan/speed-percent") - sdk.getPropertyValue("propulsion/engine[0]/n1")))
        .toBeLessThan(1);
      if (step * FIXED_DT > 2) worstSplit = Math.max(worstSplit, splitError());
    }
    expect(sdk.getPropertyValue("propulsion/engine[0]/n2")).toBeGreaterThan(early);
    expect(liftSystemThrust(sdk).liftFan).toBeGreaterThan(before.liftFan * 1.3);
    // While the vanes shed the fan's load the N1 governor overshoots, and the
    // split is held to 3.7 % at worst after 2 s (measured); once settled, to 1 %.
    expect(worstSplit).toBeLessThan(0.05);
    advance(sdk, 4);
    expect(splitError()).toBeLessThan(0.01);
  });

  it("has no lift power of its own: idle gives little, and cutoff takes it away with the spool, through RunIC and reload", async () => {
    // Held, so no ram air drives the open fan: what it gives is the engine's.
    const { sdk } = await createHover({ altFt: 5000, throttleNorm: 0, holdDown: true });
    const idle = liftSystemThrust(sdk);
    expect(idle.main + idle.liftFan + idle.posts[0] + idle.posts[1]).toBeLessThan(6000);
    apply(sdk, { ...neutral, pitchTrim: 0, throttle: 0.98 }, 1);
    advance(sdk, 5);
    const powered = liftSystemThrust(sdk).liftFan;
    expect(powered).toBeGreaterThan(10000);
    sdk.setPropertyValue("propulsion/active_engine", 0);
    sdk.setPropertyValue("propulsion/cutoff_cmd", 1);
    advance(sdk, 0.5);
    expect(sdk.getPropertyValue(PLANT + "fuel/core-burned-kg-sec")).toBe(0);
    let previous = liftSystemThrust(sdk).liftFan;
    expect(previous).toBeLessThan(powered);
    for (let step = 0; step < 10 / FIXED_DT; step++) {
      expect(sdk.run()).toBe(true);
      // Nothing burns and the rotors only give up energy: the fan runs down on what the spools had.
      expect(sdk.getPropertyValue(PLANT + "ledger/chemical-j")).toBe(0);
      expect(sdk.getPropertyValue(PLANT + "ledger/rotor-stored-j")).toBeLessThanOrEqual(0);
      const now = liftSystemThrust(sdk).liftFan;
      expect(now).toBeLessThanOrEqual(previous);
      previous = now;
    }
    expect(previous).toBeLessThan(0.1 * powered);
    // A zero-time call on a stopped engine re-reads its state; it never adds power.
    const spools = () => ["lp", "hp", "lift-fan"].map(shaft => sdk.getPropertyValue(PLANT + `shaft/${shaft}-rad-sec`));
    const before = spools();
    expect(sdk.runIc()).toBe(true);
    expect(spools()).toEqual(before);
    expect(liftSystemThrust(sdk).liftFan).toBeCloseTo(previous, 6);
    await bootstrapAircraft(sdk, aircraftId);
    expect(sdk.getPropertyValue("fcs/stovl-pos-norm")).toBe(0);
    const reloaded = liftSystemThrust(sdk);
    expect(reloaded.main).toBeGreaterThan(1000);
    expect([reloaded.liftFan, ...reloaded.posts]).toEqual([0, 0, 0]);
  });

  it("enters full conversion from the 60 kt development fixture without a pitch departure", async () => {
    const { sdk, controls } = await createHover({ conversion: 0, airspeedKts: 60, altFt: 5000 });
    apply(sdk, controls, 1);
    for (let step = 0; step < 10 / FIXED_DT; step++) {
      expect(sdk.run()).toBe(true);
      expect(Math.abs(sdk.getPropertyValue("attitude/theta-rad"))).toBeLessThan(0.15);
      expect(Math.abs(sdk.getPropertyValue("attitude/phi-rad"))).toBeLessThan(0.15);
    }
    expect(sdk.getPropertyValue("fcs/stovl-pos-norm")).toBe(1);
    expect(validFlightState(readFlightState(sdk))).toBe(true);
  });

  it.each([0.25, 0.5, 0.75].flatMap(conversion => (["aileron", "elevator", "rudder"] as const).map(axis => ({ conversion, axis }))))(
    "recovers after a $axis pulse at conversion=$conversion in the 60 kt fixture", async ({ conversion, axis }) => {
      const { sdk, controls } = await createHover({ conversion, airspeedKts: 60, altFt: 5000 });
      for (let step = 0; step < 10 / FIXED_DT; step++) {
        const time = step * FIXED_DT;
        apply(sdk, { ...controls, [axis]: time >= 1 && time < 2 ? 0.3 : 0 }, conversion);
        expect(sdk.run()).toBe(true);
        expect(Math.abs(sdk.getPropertyValue("attitude/theta-rad"))).toBeLessThan(0.25);
        expect(Math.abs(sdk.getPropertyValue("attitude/phi-rad"))).toBeLessThan(0.65);
        // Within the published LiftSystem ratings.
        const { liftFan, posts } = liftSystemThrust(sdk);
        expect(liftFan).toBeLessThan(20000);
        for (const thrust of posts) expect(thrust).toBeLessThan(1950);
      }
      const rate = axis === "aileron" ? "p" : axis === "elevator" ? "q" : "r";
      expect(Math.abs(sdk.getPropertyValue(`velocities/${rate}-rad_sec`))).toBeLessThan(0.03);
      expect(validFlightState(readFlightState(sdk))).toBe(true);
    },
  );
});

describe("F-35B roll-rate law", () => {
  const SOURCE_RATE = profile.fullStickRollRate!.sourceDegPerSec;
  const DEG = 180 / Math.PI;

  function applyRoll(sdk: JSBSimSdk, aileron: number, degPerSec: number,
    { mode = "auto" as FlightControlLawMode, conversion = 0, base = neutral } = {}) {
    applyFlightControls(sdk, { ...base, aileron }, 0, profile.rudderSign,
      { commandProperty: profile.stovl!.commandProperty, commandNorm: conversion },
      { commandProperty: profile.controlLaw!.commandProperty, mode }, undefined,
      { property: profile.fullStickRollRate!.property, degPerSec });
  }

  function hold(sdk: JSBSimSdk, seconds: number, aileron: number, degPerSec: number, mode?: FlightControlLawMode) {
    for (let step = 0; step < seconds / FIXED_DT; step++) {
      applyRoll(sdk, aileron, degPerSec, { mode });
      expect(sdk.run()).toBe(true);
    }
  }

  it("starts from the source gradient, full stick asking for 1/0.09 rad/s", async () => {
    const sdk = await createF35();
    expect(sdk.getPropertyValue(profile.fullStickRollRate!.property)).toBeCloseTo(SOURCE_RATE, 9);
  });

  it.each([[200, 10_000], [300, 10_000], [450, 10_000], [600, 10_000], [300, 30_000]].flatMap(([airspeedKts, altFt]) =>
    [30, 90].map(commandDegPerSec => ({ airspeedKts, altFt, commandDegPerSec }))))(
    "flies $commandDegPerSec°/s within 11% at $airspeedKts kt and $altFt ft", async ({ airspeedKts, altFt, commandDegPerSec }) => {
      const sdk = await createF35({ airspeedKts, altFt });
      hold(sdk, 0.5, 0, 165);
      // Half stick of a 2·command setting, so the setting scales the stick linearly.
      hold(sdk, 2, 0.5, 2 * commandDegPerSec);
      const rateDegPerSec = sdk.getPropertyValue("velocities/p-rad_sec") * DEG;
      // Feedforward is one constant; the residual follows Mach, from +10% at 200 kt to -10% at 600 kt.
      expect(rateDegPerSec / commandDegPerSec).toBeGreaterThan(0.89);
      expect(rateDegPerSec / commandDegPerSec).toBeLessThan(1.11);
    });

  it("stops and holds bank with the stick centred, where the source loop rolled back", async () => {
    const sdk = await createF35({ airspeedKts: 300, altFt: 10_000 });
    hold(sdk, 0.5, 0, 30);
    for (let step = 0; step < 5 / FIXED_DT && sdk.getPropertyValue("attitude/phi-deg") < 30; step++) {
      applyRoll(sdk, 1, 30);
      expect(sdk.run()).toBe(true);
    }
    hold(sdk, 3, 0, 30);
    const settled = sdk.getPropertyValue("attitude/phi-deg");
    expect(settled).toBeGreaterThan(30);
    expect(settled).toBeLessThan(40);
    for (let step = 0; step < 5 / FIXED_DT; step++) {
      applyRoll(sdk, 0, 30);
      expect(sdk.run()).toBe(true);
      expect(Math.abs(sdk.getPropertyValue("velocities/p-rad_sec") * DEG)).toBeLessThan(0.5);
    }
  });

  it("leaves Manual on the direct stick", async () => {
    const rates = [];
    for (const degPerSec of [30, SOURCE_RATE]) {
      const sdk = await createF35({ airspeedKts: 300, altFt: 10_000 });
      hold(sdk, 0.5, 0, degPerSec, "manual");
      hold(sdk, 1, 0.3, degPerSec, "manual");
      rates.push(sdk.getPropertyValue("velocities/p-rad_sec"));
    }
    expect(rates[0]).toBeGreaterThan(0.5);
    expect(rates[1]).toBe(rates[0]);
  });

  it("leaves the hover roll posts on the unscaled stick", async () => {
    const posts = [];
    for (const degPerSec of [SOURCE_RATE, 30]) {
      const { sdk, controls } = await createHover();
      applyRoll(sdk, 0.3, degPerSec, { conversion: 1, base: controls });
      expect(sdk.run()).toBe(true);
      posts.push(sdk.getPropertyValue("fcs/stovl-roll-control"));
    }
    expect(posts[0]).not.toBe(0);
    expect(posts[1]).toBe(posts[0]);
  });

  /**
   * Roll trim entered the law unscaled, as 1/0.09 rad/s at full trim, 637°/s,
   * where full stick asks for 30°/s: a few percent of trim outrolled the
   * stick. It is in the stick's units now, and osfs.aircraft.rollTrimRange
   * takes a share of that.
   */
  it("asks of full roll trim what full stick asks, and of a smaller range its share", async () => {
    const rates: number[] = [];
    for (const range of [1, 0.2]) {
      const sdk = await createF35({ airspeedKts: 300, altFt: 10_000 });
      for (let step = 0; step < 2.5 / FIXED_DT; step++) {
        applyFlightControls(sdk, { ...neutral, rollTrim: 1 }, 0, profile.rudderSign,
          { commandProperty: profile.stovl!.commandProperty, commandNorm: 0 },
          { commandProperty: profile.controlLaw!.commandProperty, mode: "auto" }, undefined,
          { property: profile.fullStickRollRate!.property, degPerSec: 30 }, range);
        expect(sdk.run()).toBe(true);
      }
      rates.push(sdk.getPropertyValue("velocities/p-rad_sec") * DEG);
    }
    expect(rates[0] / 30).toBeGreaterThan(0.89);
    expect(rates[0] / 30).toBeLessThan(1.11);
    expect(rates[1] / 6).toBeGreaterThan(0.8);
    expect(rates[1] / 6).toBeLessThan(1.2);
  });

  it("keeps the bank-holding integrator at zero on the ground", async () => {
    const sdk = await createF35();
    resetFlightLocation(sdk, {
      latDeg: 35, lonDeg: -110, altMeters: 300,
      flightPreset: { mode: "departure", headingDeg: 90, groundElevationMeters: 300, flightPathDeg: 0 },
    }, 300, aircraftId);
    // A roll trim is a roll-rate command the parked jet cannot follow; in the air the integrator would chase it.
    const parked = { ...neutral, throttle: 0, brake: 1, rollTrim: 1 };
    for (let step = 0; step < 2 / FIXED_DT; step++) {
      applyFlightControls(sdk, parked, 1, profile.rudderSign,
        { commandProperty: profile.stovl!.commandProperty, commandNorm: 0 }, undefined, undefined,
        { property: profile.fullStickRollRate!.property, degPerSec: 30 });
      expect(sdk.run()).toBe(true);
    }
    expect(sdk.getPropertyValue("gear/unit[1]/WOW")).toBe(1);
    expect(sdk.getPropertyValue("fcs/roll-trim-error")).toBeGreaterThan(0.01);
    expect(sdk.getPropertyValue("fcs/roll-i")).toBe(0);
  });
});

describe("F-35B augmentation transition interlock", () => {
  // The inhibit acts on the engine's control: on the step conversion becomes
  // positive, reheat is deselected and its metering shut. Fuel already in the
  // spray manifold still burns until the flame blows out, which the plant
  // computes (0.34 s from full reheat at this condition); burning never grows
  // while inhibited and is out within this bound.
  const AUGMENTATION = "propulsion/engine[0]/augmentation"; // reheat fuel actually burning
  const SELECTED = PLANT + "combustion/ab-selected";
  const METERED = PLANT + "fuel/ab-command-kg-sec";
  const BURNED = PLANT + "fuel/ab-burned-kg-sec";
  const BURNOUT_S = 0.5;

  /** One step under the inhibit: reheat deselected with its metering shut, and its burning not growing. */
  function stepInhibited(sdk: JSBSimSdk, context: Record<string, number>) {
    const before = sdk.getPropertyValue(BURNED);
    expect(sdk.run()).toBe(true);
    expect({ ...context, throttle: sdk.getPropertyValue("fcs/throttle-pos-norm"), selected: sdk.getPropertyValue(SELECTED),
      metered: sdk.getPropertyValue(METERED) }).toMatchObject({ selected: 0, metered: 0 });
    expect(sdk.getPropertyValue(BURNED)).toBeLessThanOrEqual(before);
  }

  it.each([0.0001, 0.001])("deselects reheat at once for positive conversion %s, and its burning ends with the manifold", async conversion => {
    const sdk = await createF35({ throttleNorm: 1 });
    advance(sdk, 0.1);
    expect(sdk.getPropertyValue(AUGMENTATION)).toBe(1);
    apply(sdk, { ...neutral, throttle: 1 }, conversion);
    for (let step = 0; step < BURNOUT_S / FIXED_DT; step++) {
      stepInhibited(sdk, { conversion, step });
      expect(sdk.getPropertyValue("fcs/stovl-pos-norm")).toBeCloseTo(conversion, 9);
    }
    expect(sdk.getPropertyValue(AUGMENTATION)).toBe(0);
  });

  it("checks every full-throttle step through entry, exit and reentry", async () => {
    const sdk = await createF35({ throttleNorm: 1 });
    advance(sdk, 0.1);
    expect(sdk.getPropertyValue(AUGMENTATION)).toBe(1);
    for (const command of [1, 0, 1]) {
      apply(sdk, { ...neutral, throttle: 1 }, command);
      let inhibited = 0;
      for (let step = 0; step < 360; step++) {
        // The FCS samples the request and the pre-step position.
        if (command > 0 || sdk.getPropertyValue("fcs/stovl-pos-norm") > 0) {
          stepInhibited(sdk, { command, step });
          inhibited++;
          if (inhibited * FIXED_DT >= BURNOUT_S) expect({ command, step, augmentation: sdk.getPropertyValue(AUGMENTATION) }).toMatchObject({ augmentation: 0 });
        } else expect(sdk.run()).toBe(true);
      }
      expect(sdk.getPropertyValue("fcs/stovl-pos-norm")).toBe(command);
      // Closed again, reheat relights within the rest of the 3 s.
      expect(sdk.getPropertyValue(SELECTED)).toBe(command === 0 ? 1 : 0);
      expect(sdk.getPropertyValue(AUGMENTATION)).toBe(command === 0 ? 1 : 0);
    }
  });

  it.each(["RunIC", "snapshot restore", "relocation"] as const)("keeps partial closing conversion inhibited through %s", async operation => {
    const sdk = await createF35({ throttleNorm: 1 });
    // Reach the closing boundary through accepted native steps, so the
    // snapshot contains consistent engine and actuator state, with reheat out.
    apply(sdk, { ...neutral, throttle: 1 }, 0.0105);
    advance(sdk, BURNOUT_S);
    apply(sdk, { ...neutral, throttle: 1 }, 0);
    for (let step = 0; step < 3; step++) expect(sdk.run()).toBe(true);
    expect(sdk.getPropertyValue("fcs/stovl-pos-norm")).toBeCloseTo(0.0005, 10);
    expect([sdk.getPropertyValue(SELECTED), sdk.getPropertyValue(AUGMENTATION)]).toEqual([0, 0]);
    if (operation === "RunIC") expect(sdk.runIc()).toBe(true);
    else if (operation === "snapshot restore") restoreSimulation(sdk, captureSimulation(sdk));
    else resetFlightLocation(sdk, { latDeg: 36, lonDeg: -111, altMeters: 2000 }, 0, aircraftId);
    // Raw RunIC evaluates zero-time kinematics at its commanded endpoint.
    // The app's recovery operations restore the saved physical position.
    expect(sdk.getPropertyValue("fcs/stovl-pos-norm")).toBeCloseTo(operation === "RunIC" ? 0 : 0.0005, 10);
    // No zero-time evaluation selects or lights reheat.
    expect([sdk.getPropertyValue(SELECTED), sdk.getPropertyValue(AUGMENTATION)]).toEqual([0, 0]);
    for (let step = 0; step < 2; step++) expect(sdk.run()).toBe(true);
    expect(sdk.getPropertyValue("fcs/stovl-pos-norm")).toBe(0);
    // Released, reheat is selected at once and burns once it has lit.
    expect(sdk.getPropertyValue(SELECTED)).toBe(1);
    let burning = false;
    for (let step = 0; step < 2 / FIXED_DT && !burning; step++) {
      expect(sdk.run()).toBe(true);
      burning = sdk.getPropertyValue(AUGMENTATION) === 1;
    }
    expect(burning).toBe(true);
  });

  it("reads the native main-nozzle schedule without creating or commanding it", async () => {
    const sdk = await createF35({ throttleNorm: 0.6 });
    const path = "propulsion/engine[0]/nozzle-pos-norm";
    expect(sdk.getPropertyCatalog().some(line => /^propulsion\/engine(?:\[0\])?\/nozzle-pos-norm \(R\)$/.test(line))).toBe(true);
    const batch = sdk.createPropertyBatch([path]);
    expect(batch.missing).toEqual([]);
    // The plant's own throat position, from its initialization onwards.
    const plantPosition = () => sdk.getPropertyValue(PLANT + "nozzle/position-norm");
    expect(batch.read()[0]).toBe(plantPosition());
    advance(sdk, 2);
    const dryPosition = batch.read()[0];
    expect(dryPosition).toBe(plantPosition());
    expect(dryPosition).toBeGreaterThanOrEqual(0);
    expect(dryPosition).toBeLessThan(0.5);
    sdk.setPropertyValue(path, 1);
    expect(batch.read()[0]).toBe(dryPosition);
    sdk.resetToInitialConditions(2);
    // Until the next evaluation, reset's generic open position; the plant says it has no evaluation.
    expect(batch.read()[0]).toBe(1);
    expect(sdk.getPropertyValue(PLANT + "numerics/valid")).toBe(0);
    expect(sdk.runIc()).toBe(true);
    expect(batch.read()[0]).toBe(plantPosition());
    await bootstrapAircraft(sdk, aircraftId, { throttleNorm: 1 });
    expect(() => batch.read()).toThrow(/disposed/);
    expect(sdk.getPropertyValue(path)).toBe(plantPosition());
  });

  it("reloads at full throttle and evaluates a fully converted initialization as dry", async () => {
    const sdk = await createF35({ throttleNorm: 1 });
    for (let reload = 0; reload < 2; reload++) {
      await bootstrapAircraft(sdk, aircraftId, { throttleNorm: 1 });
      expect(sdk.getPropertyValue("fcs/stovl-pos-norm")).toBe(0);
      expect({ reload, inhibit: sdk.getPropertyValue("fcs/stovl-augmentation-inhibit"),
        command: sdk.getPropertyValue("fcs/stovl-cmd-norm"), position: sdk.getPropertyValue("fcs/stovl-pos-norm"),
        augmentation: sdk.getPropertyValue(AUGMENTATION) }).toMatchObject({ augmentation: 1 });
      sdk.setPropertyValue("fcs/stovl-pos-norm", 1);
      apply(sdk, { ...neutral, throttle: 1 }, 1);
      expect(sdk.runIc()).toBe(true);
      sdk.setPropertyValue("propulsion/set-running", -1);
      apply(sdk, { ...neutral, throttle: 1 }, 1);
      expect(sdk.runIc()).toBe(true);
      // A converted operating point is solved dry at once, at 300 kt as at rest.
      expect(sdk.getPropertyValue(PLANT + "numerics/fallback-reason")).toBe(0);
      expect([sdk.getPropertyValue(SELECTED), sdk.getPropertyValue(AUGMENTATION)]).toEqual([0, 0]);
      expect(sdk.getPropertyValue(PLANT + "lift-fan/gross-thrust-lbs")).toBeGreaterThan(10000);
      for (let step = 0; step < 0.1 / FIXED_DT; step++) stepInhibited(sdk, { reload, step });
      expect(sdk.getPropertyValue(AUGMENTATION)).toBe(0);
    }
  });
});

describe("experimental F-35B installed-SDK contracts, not aircraft calibration", () => {
  it.each([0, 1, 2])("selects automatic or manual trailing-edge flaps independently of control mode %s", async mode => {
    const sdk = await createF35({ airspeedKts: 100 });
    expect(sdk.getPropertyValue("fcs/flaps-auto-enabled")).toBe(1);
    sdk.setPropertyValue("fcs/control-law-mode", mode);
    sdk.setPropertyValue("fcs/flap-cmd-norm", 0.25);
    expect(sdk.runIc()).toBe(true);
    expect(sdk.getPropertyValue("fcs/tef-pos-rad")).toBeCloseTo(0.349, 10);
    expect(sdk.getPropertyValue("fcs/flap-pos-norm")).toBeCloseTo(1, 10);
    sdk.setPropertyValue("fcs/flaps-auto-enabled", 0);
    expect(sdk.runIc()).toBe(true);
    expect(sdk.getPropertyValue("fcs/tef-pos-rad")).toBeCloseTo(0.349 * 0.25, 10);
    expect(sdk.getPropertyValue("fcs/flap-pos-norm")).toBeCloseTo(0.25, 10);
    sdk.setPropertyValue("fcs/flaps-auto-enabled", 1);
    expect(sdk.runIc()).toBe(true);
    expect(sdk.getPropertyValue("fcs/flap-pos-norm")).toBeCloseTo(1, 10);
    sdk.setPropertyValue("ic/vc-kts", 300);
    expect(sdk.runIc()).toBe(true);
    expect(sdk.getPropertyValue("fcs/flap-pos-norm")).toBeCloseTo(0, 10);
  });

  it.each([false, true])("flies the app bootstrap, terrain relocation and adopted trim for 60 s (auto trim=%s)", async autoTrim => {
    const sdk = await createF35();
    expect(sdk.getDeltaT()).toBeCloseTo(FIXED_DT, 12);
    expect(sdk.module.FS.analyzePath("/runtime/aircraft/F-35B-jsbsim/Engines/F135-PW-600.xml").exists).toBe(true);
    expect(sdk.module.FS.analyzePath("/runtime/aircraft/c172p/c172p.xml").exists).toBe(false);
    expect(sdk.getPropertyValue("propulsion/tank[0]/contents-lbs") + sdk.getPropertyValue("propulsion/tank[1]/contents-lbs")).toBe(5000);
    const targetAltitude = 600 + 5000 * 0.3048;
    resetFlightLocation(sdk, { latDeg: 35, lonDeg: -110, altMeters: targetAltitude }, 600, aircraftId);
    const input = createFlightInputManager({
      initialThrottle: sdk.getPropertyValue("fcs/throttle-cmd-norm"),
      initialGearDown: false, rudderSign: profile.rudderSign,
    });
    input.replacePitchTrim(sdk.getPropertyValue("fcs/pitch-trim-cmd-norm"));
    input.replaceRollTrim(sdk.getPropertyValue("fcs/roll-trim-cmd-norm"));
    let pitch = createAutoTrimState(autoTrim);
    let roll = createAutoTrimState(autoTrim);
    const tuning = readAutoTrimTuning(flightParameterDefaults());
    let maxExcursion = 0;
    for (let step = 0; step < 60 / FIXED_DT; step++) {
      const controls = input.poll(FIXED_DT);
      const common = { dt: FIXED_DT, qbarPsf: sdk.getPropertyValue("aero/qbar-psf"), vtFps: sdk.getPropertyValue("velocities/vt-fps"), onGround: false };
      const pitched = stepPitchAutoTrim(pitch, {
        ...common, pitchAccelRad: sdk.getPropertyValue("accelerations/qdot-rad_sec2"),
        pitchRateRad: sdk.getPropertyValue("velocities/q-rad_sec"), elevator: controls.elevator, pitchTrim: controls.pitchTrim,
      }, tuning);
      // The fly-by-wire holds bank itself, so the app's roll trim assist waits, as here.
      const rolled = sdk.getPropertyValue(profile.controlLaw!.enabledProperty) > 0.5
        ? { state: roll, rollTrim: controls.rollTrim }
        : stepRollAutoTrim(roll, {
          ...common, rollAccelRad: sdk.getPropertyValue("accelerations/pdot-rad_sec2"),
          rollRateRad: sdk.getPropertyValue("velocities/p-rad_sec"), aileron: controls.aileron, rollTrim: controls.rollTrim,
        }, tuning);
      pitch = pitched.state; roll = rolled.state;
      input.replacePitchTrim(pitched.pitchTrim); input.replaceRollTrim(rolled.rollTrim);
      apply(sdk, { ...controls, pitchTrim: pitched.pitchTrim, rollTrim: rolled.rollTrim });
      expect(sdk.run()).toBe(true);
      if (step % 120 === 0) {
        const state = readFlightState(sdk);
        expect(validFlightState(state)).toBe(true);
        expect(Math.abs(state.rollRad)).toBeLessThan(0.1);
        expect(state.airspeedKts).toBeGreaterThan(250);
        maxExcursion = Math.max(maxExcursion, Math.abs(state.altMeters - targetAltitude));
      }
    }
    input.dispose();
    expect(maxExcursion).toBeLessThan(200); // Development start envelope, not a performance specification.
    expect(sdk.getPropertyValue("propulsion/engine[0]/thrust-lbs")).toBeGreaterThan(1000);
    const { liftFan, posts } = liftSystemThrust(sdk);
    expect([liftFan, ...posts]).toEqual([0, 0, 0]);
    expect(sdk.getPropertyValue("gear/gear-pos-norm")).toBe(0);
  });

  it.each(["aileron", "rudder", "elevator"] as const)("honors the pilot's conventional %s sign", async axis => {
    const sdk = await createF35();
    const before = readFlightState(sdk);
    apply(sdk, { ...neutral, [axis]: 0.5 });
    advance(sdk, 0.5);
    const after = readFlightState(sdk);
    if (axis === "aileron") expect(after.rollRad - before.rollRad).toBeGreaterThan(0.01);
    if (axis === "elevator") expect(after.pitchRad - before.pitchRad).toBeLessThan(-0.01);
    if (axis === "rudder") expect(Math.atan2(Math.sin(after.headingRad - before.headingRad), Math.cos(after.headingRad - before.headingRad))).toBeGreaterThan(0.01);
  });

  it.each([[0.99, 27000], [1, 41000]])("gives the published F135 rating at sea-level static, throttle %s: %s lbf", async (throttleNorm, ratingLbf) => {
    // The plant's calibration targets (docs/validation/f135-engine-plant.md), solved steady.
    const sdk = await createF35({ altFt: 0, airspeedKts: 0, throttleNorm, holdDown: true });
    expect(sdk.getPropertyValue(PLANT + "numerics/fallback-reason")).toBe(0);
    expect(sdk.getPropertyValue(PLANT + "nozzle/gross-thrust-lbs")).toBeCloseTo(ratingLbf, -1);
    expect(sdk.getPropertyValue("propulsion/engine[0]/augmentation")).toBe(throttleNorm === 1 ? 1 : 0);
  });

  it("restores the engine's exact transient state through snapshot restore, and rejects a foreign one", async () => {
    const sdk = await createF35({ throttleNorm: 0.48 });
    apply(sdk, { ...neutral, throttle: 1 });
    advance(sdk, 0.5); // Mid spool-up, reheat not yet lit.
    const snapshot = captureSimulation(sdk);
    const fields = Object.keys(snapshot.controls).filter(path => path.includes("/plant/state/"));
    expect(fields.length).toBeGreaterThan(40);
    const n2 = sdk.getPropertyValue("propulsion/engine[0]/n2");
    advance(sdk, 1);
    expect(sdk.getPropertyValue("propulsion/engine[0]/n2")).not.toBe(n2);
    restoreSimulation(sdk, snapshot);
    expect(sdk.getPropertyValue(PLANT + "state/commit")).toBe(1);
    for (const path of fields) expect({ path, value: sdk.getPropertyValue(path) }).toEqual({ path, value: snapshot.controls[path] });
    expect(sdk.getPropertyValue("propulsion/engine[0]/n2")).toBe(n2);
    advance(sdk, 0.25);
    // A record from another engine configuration is refused; the engine keeps
    // the steady point the restore initialized, not a mixture of the two.
    const digest = fields.find(path => path.endsWith("/plant/state/config-digest"))!;
    const foreign = { ...snapshot, controls: { ...snapshot.controls, [digest]: 12345 } };
    restoreSimulation(sdk, foreign);
    expect(sdk.getPropertyValue(PLANT + "state/commit")).toBe(-1);
    expect(sdk.getPropertyValue(PLANT + "numerics/valid")).toBe(1);
    expect(sdk.getPropertyValue("propulsion/engine[0]/n2")).not.toBe(n2);
    advance(sdk, 0.25);
  });

  it.each(["relocation", "snapshot restore"] as const)("slews physical conversion and preserves it through %s", async operation => {
    const sdk = await createF35();
    apply(sdk, neutral, 1);
    advance(sdk, 0.5);
    const position = sdk.getPropertyValue(profile.stovl!.positionProperty);
    expect(position).toBeCloseTo(0.2, 8);
    if (operation === "relocation") resetFlightLocation(sdk, { latDeg: 36, lonDeg: -111, altMeters: 2000 }, 0, aircraftId);
    else restoreSimulation(sdk, captureSimulation(sdk));
    expect(sdk.getPropertyValue(profile.stovl!.commandProperty)).toBe(1);
    expect(sdk.getPropertyValue(profile.stovl!.positionProperty)).toBeCloseTo(position, 8);
    advance(sdk, 0.1);
    expect(sdk.getPropertyValue(profile.stovl!.positionProperty)).toBeCloseTo(position + 0.04, 8);
    expect(sdk.getPropertyValue("fcs/nozzle-pitch-rad")).toBeCloseTo((position + 0.04) * Math.PI / 2, 8);
  });

  it("produces balanced physical vertical thrust and finite attitude for 60 s without pose overrides", async () => {
    const { sdk } = await createHover();
    // The main nozzle is propulsion; the lift fan and roll posts are its outlets applied as external forces.
    expect(sdk.getPropertyValue("forces/fbz-prop-lbs") + sdk.getPropertyValue("forces/fbz-external-lbs")).toBeLessThan(-35000);
    expect(Math.abs(sdk.getPropertyValue("forces/fbx-prop-lbs"))).toBeLessThan(1);
    expect(sdk.getPropertyValue("fcs/nozzle-pitch-rad")).toBeCloseTo(Math.PI / 2, 8);
    for (let second = 0; second < 60; second++) {
      advance(sdk, 1);
      const state = readFlightState(sdk);
      expect(Math.abs(state.pitchRad)).toBeLessThan(0.1);
      expect(Math.abs(state.rollRad)).toBeLessThan(0.1);
      expect(state.altMeters).toBeGreaterThan(200);
    }
    expect(sdk.getPropertyValue("propulsion/tank[0]/contents-lbs") + sdk.getPropertyValue("propulsion/tank[1]/contents-lbs")).toBeLessThan(5000);
  });

  it("removes lift-fan and roll-post thrust when physical conversion closes despite turbine spool lag", async () => {
    const { sdk, controls } = await createHover();
    const initialFanThrust = liftSystemThrust(sdk).liftFan;
    apply(sdk, controls, 0);
    advance(sdk, 1.25);
    expect(sdk.getPropertyValue(profile.stovl!.positionProperty)).toBeCloseTo(0.5, 8);
    expect(liftSystemThrust(sdk).liftFan).toBeLessThan(initialFanThrust);
    advance(sdk, 1.25);
    expect(sdk.getPropertyValue(profile.stovl!.positionProperty)).toBeCloseTo(0, 8);
    // The actuator closes to within its integration round-off, about 1e-9,
    // and the outlets keep that fraction of their thrust.
    const { liftFan, posts } = liftSystemThrust(sdk);
    for (const thrust of [liftFan, ...posts]) expect(Math.abs(thrust)).toBeLessThan(1e-6 * initialFanThrust);
    // The LP spool takes the fan's load back without running away.
    for (let step = 0; step < 2 / FIXED_DT; step++) {
      expect(sdk.run()).toBe(true);
      expect(sdk.getPropertyValue("propulsion/engine[0]/n1")).toBeLessThan(106);
    }
    expect(sdk.getPropertyValue("fcs/nozzle-pitch-rad")).toBeCloseTo(0, 8);
  });

  it.each(["aileron", "rudder", "elevator"] as const)("uses native moments for the converted %s control", async axis => {
    const { sdk, controls } = await createHover();
    apply(sdk, { ...controls, [axis]: 0.5 }, 1);
    advance(sdk, 0.5);
    const property = axis === "aileron" ? "velocities/p-rad_sec" : axis === "rudder" ? "velocities/r-rad_sec" : "velocities/q-rad_sec";
    expect(sdk.getPropertyValue(property) * (axis === "elevator" ? -1 : 1)).toBeGreaterThan(0.005);
  });
});
