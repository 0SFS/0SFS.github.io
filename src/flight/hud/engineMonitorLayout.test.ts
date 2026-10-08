import { describe, expect, it } from "vitest";
import {
  compatibleEngineVariables, engineLayoutScope, enginePlotGroups, engineVariableExpectedRange,
  engineVariablePresentation, engineVariableUnit, groupCompatibleEngineVariables,
  readEngineMonitorLayout, separateEngineVariable, setEngineVariablePresentation, writeEngineMonitorLayout,
  ENGINE_MONITOR_LAYOUT_KEY, type EngineLayoutVariable,
} from "./engineMonitorLayout";

const variable = (id: string, extra: Partial<EngineLayoutVariable> = {}): EngineLayoutVariable => ({
  id, engineIndex: 0, family: "rotation", unit: "%", defaultPresentation: "plot", defaultGroup: "engine:0:spools",
  historyEligible: true, expectedRange: { kind: "provisional", minimum: 0, maximum: 110 },
  units: [{ unit: "%", scale: 1 }], ...extra,
});
const storage = (saved: Record<string, string> = {}) => {
  const values = new Map(Object.entries(saved));
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } };
};

describe("engine layout persistence", () => {
  it("defaults to Settings closed and Live data open; preserves independent family bands and unavailable IDs", () => {
    const saved = storage();
    const scope = engineLayoutScope("f-35b", "plant", "turbine");
    const layout = readEngineMonitorLayout(saved, scope);
    expect(layout.top).toEqual({ settings: false, live: true });
    layout.top.settings = true;
    layout.families["plots:fuel"] = false;
    layout.families["values:fuel"] = true;
    layout.variables["temporarily-unavailable"] = { presentation: "plot", group: null, unit: "K", range: { minimum: 200, maximum: 500 } };
    writeEngineMonitorLayout(saved, scope, layout);
    expect(readEngineMonitorLayout(saved, scope)).toEqual(layout);
    expect(readEngineMonitorLayout(saved, engineLayoutScope("f-35b", "empirical", "turbine")).variables).toEqual({});
    expect(readEngineMonitorLayout(saved, engineLayoutScope("cessna-172", "default", "piston")).top.settings).toBe(false);
  });

  it("migrates useful v1 collapse choices without replacing defaults with obsolete dashboards", () => {
    const saved = storage({ "osfs.engineMonitor.v1": JSON.stringify({ open: { fuel: false, plant: false, all: true, log: false }, flowUnit: "gal/h" }) });
    const layout = readEngineMonitorLayout(saved, "aircraft:model");
    expect(layout.top).toEqual({ settings: false, live: true });
    expect(layout.families).toEqual({ "values:fuel": false, "values:numerics": false });
    expect(layout.supplementary).toEqual({ all: true, log: false });
    writeEngineMonitorLayout(saved, "aircraft:model", layout);
    expect(saved.values.has("osfs.engineMonitor.v1")).toBe(true);
    const collapsedHistory = readEngineMonitorLayout(storage({ "osfs.engineMonitor.v1": JSON.stringify({ open: { history: false } }) }), "test");
    expect(collapsedHistory.top.live).toBe(true);
    expect(collapsedHistory.families["plots:rotation"]).toBe(false);
    expect(collapsedHistory.families["plots:fuel"]).toBe(false);
    expect(collapsedHistory.families["values:fuel"]).toBeUndefined();
  });

  it("ignores malformed records and invalid ranges, retains safe unknown IDs, and survives blocked storage", () => {
    expect(readEngineMonitorLayout(storage({ [ENGINE_MONITOR_LAYOUT_KEY]: "{bad" }), "test").variables).toEqual({});
    const saved = storage({ [ENGINE_MONITOR_LAYOUT_KEY]: JSON.stringify({ version: 2, scopes: { test: {
      top: { settings: "yes", live: false }, families: { "plots:fuel": false, "other:key": true },
      variables: { unknown: { presentation: "plot", range: { minimum: 2, maximum: 1 } },
        broken: { presentation: "graph", group: false, range: { minimum: 0, maximum: null } } },
    } } }) });
    const layout = readEngineMonitorLayout(saved, "test");
    expect(layout.top).toEqual({ settings: false, live: false });
    expect(layout.families).toEqual({ "plots:fuel": false });
    expect(layout.variables).toEqual({ unknown: { presentation: "plot" }, broken: {} });
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } };
    expect(() => writeEngineMonitorLayout(blocked, "test", layout)).not.toThrow();
    expect(readEngineMonitorLayout(blocked, "test").top.live).toBe(true);
  });
});

describe("engine plot grouping", () => {
  it("groups reviewed same-unit envelopes deterministically, independently of measured values", () => {
    const layout = readEngineMonitorLayout(null, "test");
    const n1 = variable("engine:0:n1"), n2 = variable("engine:0:n2");
    const otherEngine = variable("engine:2:n1", { engineIndex: 2 });
    expect(enginePlotGroups([n1, n2, otherEngine], layout).map(group => group.map(v => v.id))).toEqual([[n1.id, n2.id], [otherEngine.id]]);
    expect(enginePlotGroups([n1, n2], layout)).toEqual([[n1, n2]]);
  });

  it("keeps incompatible scales, unknown ranges, stations with unreviewed groups, and different families separate", () => {
    const layout = readEngineMonitorLayout(null, "test");
    const a = variable("a"), small = variable("small", { expectedRange: { kind: "known", minimum: 0, maximum: 1 } });
    const distant = variable("distant", { expectedRange: { kind: "known", minimum: 200, maximum: 310 } });
    const unknown = variable("unknown", { expectedRange: { kind: "unknown" } });
    const gas = variable("gas", { family: "gas", defaultGroup: null });
    const metal = variable("metal", { family: "gas", defaultGroup: null });
    expect(compatibleEngineVariables(a, small, layout)).toBe(false);
    expect(compatibleEngineVariables(a, distant, layout)).toBe(false);
    expect(compatibleEngineVariables(a, unknown, layout)).toBe(false);
    expect(compatibleEngineVariables(a, gas, layout)).toBe(false);
    expect(enginePlotGroups([a, small, distant, unknown, gas, metal], layout)).toHaveLength(6);
    const boundary = variable("boundary", { expectedRange: { kind: "known", minimum: 55, maximum: 275 } });
    expect(compatibleEngineVariables(a, boundary, layout)).toBe(true);
  });

  it("keeps manual separation across fresh inputs and reloads, expands one compact member only, then explicitly regroups", () => {
    const saved = storage(), layout = readEngineMonitorLayout(saved, "test");
    const n1 = variable("n1"), n2 = variable("n2"), variables = [n1, n2];
    separateEngineVariable(layout, n2.id);
    expect(enginePlotGroups(variables, layout)).toEqual([[n1], [n2]]);
    writeEngineMonitorLayout(saved, "test", layout);
    const reloaded = readEngineMonitorLayout(saved, "test");
    expect(enginePlotGroups(variables.map(v => ({ ...v })), reloaded)).toEqual([[n1], [n2]]);
    for (const v of variables) setEngineVariablePresentation(reloaded, v.id, "compact");
    setEngineVariablePresentation(reloaded, n1.id, "plot");
    expect(enginePlotGroups(variables, reloaded)).toEqual([[n1]]);
    expect(engineVariablePresentation(reloaded, n2)).toBe("compact");
    groupCompatibleEngineVariables(reloaded, variables, n1.id);
    expect(enginePlotGroups(variables, reloaded)).toEqual([[n1, n2]]);
  });

  it("uses converted expected envelopes, preserves explicit ranges, and keeps text compact", () => {
    const layout = readEngineMonitorLayout(null, "test");
    const temperature = variable("temperature", { unit: "K", family: "gas", expectedRange: { kind: "provisional", minimum: 273.15, maximum: 373.15 },
      units: [{ unit: "K", scale: 1 }, { unit: "°C", scale: 1, offset: -273.15 }] });
    layout.variables[temperature.id] = { unit: "°C", range: { minimum: -100, maximum: 100 } };
    expect(engineVariableUnit(temperature, layout)).toEqual({ unit: "°C", scale: 1, offset: -273.15 });
    expect(engineVariableExpectedRange(temperature, layout)).toEqual({ minimum: 0, maximum: 100 });
    expect(layout.variables[temperature.id].range).toEqual({ minimum: -100, maximum: 100 });
    const text = variable("algorithm", { historyEligible: false });
    setEngineVariablePresentation(layout, text.id, "plot");
    expect(engineVariablePresentation(layout, text)).toBe("compact");
  });
});
