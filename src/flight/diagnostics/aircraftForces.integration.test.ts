// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrapAircraft } from "../jsbsim/bootstrapC172";
import { getFdmProfile } from "../jsbsim/fdmProfiles";
import { resolveAircraftDataFiles } from "../jsbsim/hydrateJsbsimData";
import type { AircraftId } from "../aircraft/aircraftIds";
import {
  createAircraftForceReader, POUND_FOOT_TO_NEWTON_METERS, POUND_FORCE_TO_NEWTONS, structuralPointToDisplay, windForceToBody,
  type ForceVector,
} from "./aircraftForces";

const instances: JSBSimSdk[] = [];
afterEach(() => { for (const sdk of instances.splice(0)) sdk.destroy(); });

async function createAircraft(aircraftId: AircraftId) {
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

  it.each(["cessna-172", "f-35b", "cirrus-vision-jet"] as const)("draws %s control surfaces from terms in the frames that sum to its native aerodynamics", async aircraftId => {
    const sdk = await createAircraft(aircraftId);
    for (const [command, value] of [["elevator", -0.3], ["aileron", 0.4], ["rudder", 0.3]] as const) sdk.setPropertyValue(`fcs/${command}-cmd-norm`, value);
    for (let step = 0; step < 60; step++) expect(sdk.run()).toBe(true);
    const profile = getFdmProfile(aircraftId);
    const reader = createAircraftForceReader(sdk, profile.forceEngineLabels, profile.forceControlSurfaces);
    try {
      const snapshot = reader.read();
      expect(snapshot.unavailable).toEqual([]);
      const value = (path: string): number => sdk.getPropertyValue(path);
      const alpha = value("aero/alpha-rad"), beta = value("aero/beta-rad");
      const model = new DOMParser().parseFromString(readFileSync(`public/jsbsim-data/aircraft/${profile.model}/${profile.model}.xml`, "utf8"), "application/xml");
      const sum = (axis: string): number => [...model.querySelectorAll(`aerodynamics > axis[name="${axis}"] > function`)]
        .reduce((total, term) => total + value(term.getAttribute("name")!), 0);
      // Every term of the model, converted as the surfaces' are, is JSBSim's own aerodynamic force and moment.
      const force = windForceToBody([-sum("DRAG"), sum("SIDE"), -sum("LIFT")], alpha, beta);
      const rp = ["x", "y", "z"].map(axis => value(`aero/rp-body-${axis}-ft`));
      const moment = [sum("ROLL") + rp[1] * force[2] - rp[2] * force[1], sum("PITCH") + rp[2] * force[0] - rp[0] * force[2],
        sum("YAW") + rp[0] * force[1] - rp[1] * force[0]];
      ["x", "y", "z"].forEach((axis, index) => {
        expect(force[index]).toBeCloseTo(value(`forces/fb${axis}-aero-rp-lbs`), 6);
        expect(moment[index]).toBeCloseTo(value(`moments/${["l", "m", "n"][index]}-aero-lbsft`), 4);
      });
      expect(snapshot.moments.find(item => item.id === "aero-moment")!.bodyNewtonMeters.map(item => item / POUND_FOOT_TO_NEWTON_METERS))
        .toEqual(["l", "m", "n"].map(axis => expect.closeTo(value(`moments/${axis}-aero-lbsft`), 6)));
      const anchor = snapshot.forces.find(item => item.id === "aero-0")!.anchorMeters;
      for (const surface of profile.forceControlSurfaces) {
        const term = (axis: keyof typeof surface.terms): number => surface.terms[axis] === undefined ? 0 : value(surface.terms[axis]!);
        const expectedForce: ForceVector = windForceToBody([-term("drag"), term("side"), -term("lift")], alpha, beta);
        const drawnForce = snapshot.forces.find(item => item.id === `surface-${surface.id}`);
        if (drawnForce) {
          expect(drawnForce.anchorMeters).toEqual(anchor);
          drawnForce.bodyNewtons.forEach((component, index) => expect(component).toBeCloseTo(expectedForce[index] * POUND_FORCE_TO_NEWTONS, 6));
        } else expect(expectedForce).toEqual([0, 0, 0].map(() => expect.closeTo(0, 12)));
        const drawnMoment = snapshot.moments.find(item => item.id === `surface-${surface.id}-moment`);
        const expectedMoment = [term("roll"), term("pitch"), term("yaw")];
        if (drawnMoment) {
          drawnMoment.bodyNewtonMeters.forEach((component, index) => expect(component).toBeCloseTo(expectedMoment[index] * POUND_FOOT_TO_NEWTON_METERS, 6));
        } else expect(expectedMoment).toEqual([0, 0, 0]);
      }
      // The commanded deflections reached the surfaces: the elevator's moment is not zero.
      const elevator = snapshot.moments.find(item => item.label === "Elevator" || item.label.endsWith("ruddervator"))!;
      expect(Math.abs(elevator.bodyNewtonMeters[1])).toBeGreaterThan(100);
    } finally { reader.dispose(); }
  });
});
