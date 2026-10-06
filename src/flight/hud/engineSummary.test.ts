// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEngineSummary, type EngineSummaryView } from "./engineSummary";

const turbine: EngineSummaryView = {
  kind: "turbine",
  phase: "running",
  label: "RUNNING",
  simTimeS: 1,
  n1Pct: 99,
  n2Pct: 99,
  rpm: null,
  thrustLbf: 9999,
  fuelFlowPph: 100,
  fuelFlowGph: 15,
};
const piston: EngineSummaryView = {
  ...turbine, kind: "piston", n1Pct: null, n2Pct: null, rpm: 2400, maxRpm: 2700,
};
const unavailable: EngineSummaryView = {
  ...turbine, kind: null, phase: null, label: "Unavailable", n1Pct: null, n2Pct: null,
  fuelFlowPph: null, fuelFlowGph: null,
};
const roots: HTMLElement[] = [];
const observers: MutationObserver[] = [];

function mount(view: EngineSummaryView) {
  const summary = createEngineSummary();
  const root = document.createElement("div");
  root.append(summary.diagram, summary.values);
  document.body.append(root);
  roots.push(root);
  summary.render(view, "lb/h");
  const observer = new MutationObserver(() => {});
  observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
  observers.push(observer);
  return { summary, root, observer };
}

afterEach(() => {
  for (const observer of observers.splice(0)) observer.disconnect();
  for (const root of roots.splice(0)) root.remove();
  vi.restoreAllMocks();
});

describe("engine summary DOM updates", () => {
  it.each([
    ["turbine", turbine], ["piston", piston], ["unavailable", unavailable],
  ] as const)("does not mutate or measure unchanged %s readouts as simulation time advances", (_kind, view) => {
    const { summary, observer } = mount(view);
    const measure = vi.spyOn(window, "getComputedStyle");
    summary.render({ ...view, simTimeS: 2 }, "lb/h");
    summary.render({ ...view, simTimeS: 3 }, "lb/h");
    expect(observer.takeRecords()).toHaveLength(0);
    expect(measure).not.toHaveBeenCalled();
  });

  it("ignores subprecision changes and changes only the N2 readout when its formatted value changes", () => {
    const { summary, root, observer } = mount(turbine);
    const n1 = root.querySelector(".flight-engine__spool-n1 .flight-engine__spool-value")!;
    const n2 = root.querySelector(".flight-engine__spool--n2 .flight-engine__spool-value")!;
    const originalN1Text = n1.firstChild;
    const measure = vi.spyOn(window, "getComputedStyle");
    summary.render({ ...turbine, n1Pct: 99.01, n2Pct: 99.01, thrustLbf: 9999.1, fuelFlowPph: 100.1 }, "lb/h");
    expect(observer.takeRecords()).toHaveLength(0);

    summary.render({ ...turbine, n2Pct: 99.1 }, "lb/h");
    expect(n1.firstChild).toBe(originalN1Text);
    expect(n2.textContent).toBe("99.1");
    const changes = observer.takeRecords();
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.every((change) => change.target === n2 || change.target === summary.spools)).toBe(true);
    expect(measure).not.toHaveBeenCalled();
  });

  it("repositions ring labels when a displayed value grows, then leaves the settled layout alone", () => {
    const { summary, root, observer } = mount(turbine);
    const label = root.querySelector<HTMLElement>(".flight-engine__spool-thrust .flight-engine__spool-label")!;
    const initialTransform = label.style.transform;
    const measure = vi.spyOn(window, "getComputedStyle");
    const changed = { ...turbine, thrustLbf: 10000 };
    summary.render(changed, "lb/h");
    expect(label.style.transform).not.toBe(initialTransform);
    expect(measure).toHaveBeenCalled();
    observer.takeRecords();
    measure.mockClear();
    summary.render({ ...changed, simTimeS: 2 }, "lb/h");
    expect(observer.takeRecords()).toHaveLength(0);
    expect(measure).not.toHaveBeenCalled();
  });

  it("updates aircraft, phase and flow units once when they change", () => {
    const { summary, root, observer } = mount(turbine);
    const changed = { ...piston, phase: null, label: "Custom phase" };
    summary.render(changed, "gal/h");
    expect(summary.spools.dataset.kind).toBe("piston");
    expect(root.querySelector<HTMLElement>(".flight-engine__spool--n2")!.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>(".flight-engine__rpm")!.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>(".flight-engine__phase")!.dataset.phase).toBeUndefined();
    expect(root.querySelector(".flight-engine__flow-unit")!.textContent).toBe("gal/h");
    expect(observer.takeRecords().length).toBeGreaterThan(0);
    summary.render({ ...changed, simTimeS: 2 }, "gal/h");
    expect(observer.takeRecords()).toHaveLength(0);
  });
});
