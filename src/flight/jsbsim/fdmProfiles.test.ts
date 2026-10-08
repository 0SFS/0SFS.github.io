// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AeroAxis } from "../diagnostics/aircraftForces";
import { FDM_PROFILES, getFdmProfile, resolveEngineModel } from "./fdmProfiles";

const AXIS_NAMES: Readonly<Record<AeroAxis, string>> = {
  drag: "DRAG", side: "SIDE", lift: "LIFT", roll: "ROLL", pitch: "PITCH", yaw: "YAW",
};
const SURFACE_POSITION = /^fcs\/.+-pos-(rad|deg|norm)$/;

/** Terms that read a control surface's position without being that surface's own increment. */
const NOT_SURFACE_TERMS: Readonly<Record<string, readonly string[]>> = {
  // Whole-wing drag tabulated against alpha and flap, and stability derivatives the flaps schedule.
  c172p: ["CDwbh", "CYb", "CYp", "CYr", "Clr"],
  // Fan-trap drag, tabulated against fcs/mixture-pos-norm.
  "F-35B-jsbsim": ["CDft"],
};

interface AeroFunction { axis: string; element: Element; surfacePositions: Set<string> }

function readAerodynamics(model: string): Map<string, AeroFunction> {
  const text = readFileSync(`public/jsbsim-data/aircraft/${model}/${model}.xml`, "utf8");
  const document = new DOMParser().parseFromString(text, "application/xml");
  const aerodynamics = document.querySelector("aerodynamics");
  expect(aerodynamics, `${model} defines its aerodynamics inline`).not.toBeNull();
  expect(aerodynamics!.hasAttribute("file")).toBe(false);
  const functions = new Map<string, AeroFunction>();
  for (const axis of [...aerodynamics!.children].filter(child => child.tagName === "axis")) {
    const axisName = axis.getAttribute("name")!;
    // The reader converts terms from JSBSim's default frames only.
    expect(Object.values(AXIS_NAMES)).toContain(axisName);
    expect(axis.hasAttribute("frame"), `${model} ${axisName} uses its default frame`).toBe(false);
    for (const element of [...axis.children].filter(child => child.tagName === "function")) {
      const references = [...element.querySelectorAll("property, independentVar")].map(node => node.textContent!.trim());
      functions.set(element.getAttribute("name")!, {
        axis: axisName, element, surfacePositions: new Set(references.filter(path => SURFACE_POSITION.test(path))),
      });
    }
  }
  return functions;
}

/**
 * A product with the surface's position as a factor, its magnitude, or a
 * one-input table of it that reads zero at zero, vanishes with the surface centred.
 */
function vanishesWhenCentred(element: Element): boolean {
  const product = [...element.children].find(child => child.tagName !== "description");
  if (product?.tagName !== "product") return false;
  const isPosition = (node: Element | undefined): boolean =>
    node?.tagName === "property" && SURFACE_POSITION.test(node.textContent!.trim());
  return [...product.children].some(factor => {
    if (isPosition(factor)) return true;
    if (factor.tagName === "abs") return factor.children.length === 1 && isPosition(factor.children[0]);
    if (factor.tagName !== "table") return false;
    const inputs = factor.querySelectorAll("independentVar");
    if (inputs.length !== 1 || !SURFACE_POSITION.test(inputs[0].textContent!.trim())) return false;
    const rows = factor.querySelector("tableData")!.textContent!.trim().split("\n").map(row => row.trim().split(/\s+/).map(Number));
    return rows.some(([input, output]) => input === 0 && output === 0);
  });
}

const models = [...new Map(Object.values(FDM_PROFILES).map(profile => [profile.model, profile])).values()];

describe.each(models)("$model control-surface terms for Debug → Forces", profile => {
  const functions = readAerodynamics(profile.model);
  const declared = profile.forceControlSurfaces.flatMap(surface =>
    Object.entries(surface.terms).map(([axis, path]) => ({ surface, axis: axis as AeroAxis, path })));

  it("names each term once, in the axis the model sums it into, applied at the reference point", () => {
    expect(declared.length).toBeGreaterThan(0);
    expect(new Set(declared.map(term => term.path)).size).toBe(declared.length);
    expect(new Set(profile.forceControlSurfaces.map(surface => surface.id)).size).toBe(profile.forceControlSurfaces.length);
    for (const { surface, axis, path } of declared) {
      const term = functions.get(path);
      expect(term, `${surface.label} ${path}`).toBeDefined();
      expect(term!.axis, `${surface.label} ${path}`).toBe(AXIS_NAMES[axis]);
      expect(term!.element.getAttribute("apply_at_cg"), path).not.toBe("true");
    }
  });

  it("declares only increments that vanish with the surface centred", () => {
    for (const { path } of declared) {
      expect(functions.get(path)!.surfacePositions.size, path).toBe(1);
      expect(vanishesWhenCentred(functions.get(path)!.element), path).toBe(true);
    }
  });

  it("leaves out no term that reads a surface position without saying why", () => {
    const included = new Set(declared.map(term => term.path));
    const excluded = new Set((NOT_SURFACE_TERMS[profile.model] ?? []).map(name => `aero/coefficient/${name}`));
    const dependent = [...functions].filter(([, term]) => term.surfacePositions.size > 0).map(([name]) => name);
    expect(dependent.filter(name => !included.has(name) && !excluded.has(name))).toEqual([]);
    for (const name of excluded) expect(functions.get(name)?.surfacePositions.size, name).toBeGreaterThan(0);
  });
});

describe("engine models", () => {
  it("offers the F-35B its coupled plant first, then its earlier empirical engine", () => {
    expect(FDM_PROFILES["f-35b"].engineModels?.map(model => model.id)).toEqual(["plant", "empirical"]);
    expect(resolveEngineModel("f-35b")?.id).toBe("plant");
    expect(resolveEngineModel("f-35b", "empirical")?.id).toBe("empirical");
    for (const id of ["cessna-172", "cirrus-vision-jet", "cirrus-vision-jet-g2", "cirrus-vision-jet-g3"] as const) {
      expect(resolveEngineModel(id, "empirical"), id).toBeNull();
      expect(getFdmProfile(id, "plant"), id).toBe(FDM_PROFILES[id]);
    }
  });

  it("changes only the model, its package, its engines' and forces' names, and the force carriers' throttles", () => {
    const plant = getFdmProfile("f-35b", "plant");
    const empirical = getFdmProfile("f-35b", "empirical");
    expect(plant).toBe(FDM_PROFILES["f-35b"]);
    expect(getFdmProfile("f-35b", "empirical")).toBe(empirical);
    expect(Object.keys(empirical).filter(key => empirical[key as keyof typeof empirical] !== plant[key as keyof typeof plant]).sort())
      .toEqual(["dataPackage", "forceEngineLabels", "forceExternalForces", "initialProperties", "model"]);
    expect(empirical).toMatchObject({ model: "F-35B-jsbsim-empirical", dataPackage: "f-35b-empirical-engine" });
    expect(empirical.forceExternalForces?.map(force => force.name)).toEqual(["external-tank-0-drag", "external-tank-1-drag", "pushback"]);
    expect(empirical.initialProperties).toEqual({ ...plant.initialProperties, "fcs/throttle1": 0, "fcs/throttle2": 0, "fcs/throttle3": 0 });
  });
});
