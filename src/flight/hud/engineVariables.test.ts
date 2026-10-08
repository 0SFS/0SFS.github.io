import { describe, expect, it, vi } from "vitest";
import { discoverEngineVariables, engineVariableInUnit } from "./engineVariables";
import { readEngineHistoryValues } from "./engineHistory";

describe("authoritative engine variables", () => {
  it("keeps current, history and default grouping on one definition with a declared provisional envelope", () => {
    const variables = discoverEngineVariables(new Set(["propulsion/engine/n1", "propulsion/engine/n2", "propulsion/engine/thrust-lbs"]));
    const [n1, n2, thrust] = variables;
    expect(n1.id).toBe("propulsion/engine/n1");
    expect(n1.defaultPresentation).toBe("plot");
    expect(n1.recordByDefault).toBe(true);
    expect(n1.defaultGroup).toBe(n2.defaultGroup);
    expect(n1.expectedRange).toMatchObject({ kind: "provisional", minimum: 0, maximum: 120 });
    expect(n1.expectedRange.source).toContain("not an F135 operating or safe range");
    expect(thrust.expectedRange.kind).toBe("unknown");
    expect(thrust.defaultGroup).toBeNull();
  });

  it("uses published native/profile plotting references and does not read unpublished maximum nodes", () => {
    const get = vi.fn((path: string) => path.endsWith("MaxN1") ? 102 : Number.NaN);
    const n1 = discoverEngineVariables(new Set(["propulsion/engine[3]/n1", "propulsion/engine[3]/MaxN1"]), { kind: "turbine" }, { getPropertyValue: get })[0];
    expect(n1.engineIndex).toBe(3);
    expect(n1.title).toBe("Engine 4 · N1");
    expect(n1.expectedRange).toMatchObject({ kind: "known", minimum: 0, maximum: 102 });
    expect(n1.expectedRange.source).toContain("propulsion/engine[3]/MaxN1");
    get.mockClear();
    discoverEngineVariables(new Set(["propulsion/engine/n2"]), { kind: "turbine" }, { getPropertyValue: get });
    expect(get).not.toHaveBeenCalled();
    const rpm = discoverEngineVariables(new Set(["propulsion/engine/engine-rpm"]), { kind: "piston", maxRpm: 2700 })[0];
    expect(rpm.expectedRange).toMatchObject({ kind: "known", maximum: 2700 });
  });

  it("deduplicates only explicitly equivalent observations and preserves mass/volume and total/static distinctions", () => {
    const prefix = "propulsion/engine[2]/";
    const variables = discoverEngineVariables(new Set([
      prefix + "n1", prefix + "plant/shaft/n1-percent",
      prefix + "egt-degc", prefix + "egt-degF", prefix + "plant/combustion/egt-gauge-k",
      prefix + "fuel-flow-rate-pps", prefix + "plant/fuel/total-metered-kg-sec", prefix + "fuel-flow-rate-gph",
      prefix + "thermal/nozzle-gas-temperature-k", prefix + "plant/station/st7/total-temperature-k",
      prefix + "plant/nozzle/exit-static-temperature-k", prefix + "thermal/valid",
      prefix + "plant/numerics/valid",
      prefix + "thermal/metal-temperature-k", prefix + "thermal/metal-temperature-state-k", prefix + "thermal/liner/metal-temperature-k",
      prefix + "plant/solid/liner/temperature-k", prefix + "plant/state/solid/liner/temperature-k",
      prefix + "thermal/initialized", prefix + "thermal/liner/initialized",
    ]), { kind: "turbine", primaryThermalSolid: "liner" });
    expect(variables.filter(v => v.id === prefix + "n1")).toHaveLength(1);
    expect(variables.find(v => v.id === prefix + "n1")?.aliases).toHaveLength(2);
    expect(variables.find(v => v.id === prefix + "egt-degc")?.aliases).toHaveLength(3);
    expect(variables.find(v => v.id === prefix + "fuel-flow-rate-pps")?.aliases).toHaveLength(1);
    expect(variables.some(v => v.id === prefix + "plant/fuel/total-metered-kg-sec")).toBe(true);
    expect(variables.some(v => v.path.endsWith("fuel-flow-rate-gph"))).toBe(true);
    expect(variables.find(v => v.id === prefix + "thermal/nozzle-gas-temperature-k")?.aliases).toHaveLength(2);
    expect(variables.some(v => v.path.endsWith("exit-static-temperature-k"))).toBe(true);
    expect(variables.find(v => v.id === prefix + "thermal/metal-temperature-k")?.aliases).toHaveLength(4);
    const staged = variables.find(v => v.id === prefix + "plant/state/solid/liner/temperature-k")!;
    expect(staged.path).toBe(prefix + "plant/state/solid/liner/temperature-k");
    expect(staged.description).toContain("Staged native restore record");
    expect(staged.description).toContain("until committed");
    const accounted = variables.find(v => v.id === prefix + "fuel-flow-rate-pps")!;
    const metered = variables.find(v => v.id === prefix + "plant/fuel/total-metered-kg-sec")!;
    const reader = { getPropertyValue: (path: string) => path.endsWith("numerics/valid") ? 1 : path.endsWith("total-metered-kg-sec") ? 2 : 0 };
    expect(readEngineHistoryValues(reader, [accounted, metered])).toEqual([0, 2]);
  });

  it("publishes arbitrary discovered numeric paths honestly and labels native enum/flag diagnostics", () => {
    const prefix = "propulsion/engine/plant/";
    const variables = discoverEngineVariables(new Set([prefix + "numerics/valid", prefix + "numerics/new-observation",
      prefix + "numerics/algorithm", prefix + "events/last-code", prefix + "nozzle/regime",
      prefix + "state/config-digest", prefix + "fuel/ab-manifold-kg", "propulsion/tank[4]/contents-lbs"]));
    const unknown = variables.find(v => v.path.endsWith("new-observation"))!;
    expect(unknown.nativeUnit).toBe("unknown");
    expect(unknown.unit).toBe("unknown");
    expect(unknown.historyEligible).toBe(true);
    expect(unknown.recordByDefault).toBe(false);
    expect(unknown.defaultPresentation).toBe("compact");
    expect(unknown.expectedRange.kind).toBe("unknown");
    expect(variables.find(v => v.path.endsWith("numerics/algorithm"))).toMatchObject({ numericalType: "enumeration", labels: ["component", "reduced"] });
    expect(variables.find(v => v.path.endsWith("events/last-code"))?.labels?.[10]).toBe("numerical failure");
    expect(variables.find(v => v.path.endsWith("nozzle/regime"))?.labels?.[0]).toBe("no flow");
    expect(variables.find(v => v.path.endsWith("state/config-digest"))?.historyEligible).toBe(false);
    expect(variables.find(v => v.path.includes("tank[4]"))?.label).toBe("Tank 5 contents");
    expect(variables.find(v => v.path.endsWith("ab-manifold-kg"))?.nativeUnit).toBe("kg");
  });

  it("maps published requested solver settings to their existing control home without recording duplicate settings", () => {
    const prefix = "propulsion/engine[3]/plant/";
    const mappings = {
      algorithm: "osfs.enginePlant.algorithm",
      "iteration-cap": "osfs.enginePlant.iterationCap",
      "subdivision-cap": "osfs.enginePlant.subdivisionCap",
      tolerance: "osfs.enginePlant.tolerance",
      "closure-budget-bytes": "osfs.enginePlant.closureBudgetKiB",
    };
    const paths = new Set([...Object.keys(mappings).map(name => prefix + "settings/" + name), prefix + "numerics/algorithm"]);
    const variables = discoverEngineVariables(paths, { kind: "turbine" });
    for (const [name, settingId] of Object.entries(mappings)) {
      const requested = variables.find(v => v.path === prefix + "settings/" + name)!;
      expect(requested.settingId).toBe(settingId);
      expect(requested.engineIndex).toBe(3);
      expect(requested.historyEligible).toBe(false);
      expect(requested.description).toContain("homed in Engine Settings");
    }
    const actual = variables.find(v => v.path === prefix + "numerics/algorithm")!;
    expect(actual.settingId).toBeUndefined();
    expect(actual.historyEligible).toBe(true);
    expect(actual.validityProperties).toBeUndefined();
  });

  it("keeps unavailable dependencies distinct from valid physical zero without querying missing flags", () => {
    const path = "propulsion/engine/thermal/nozzle-gas-temperature-k";
    const metric = discoverEngineVariables(new Set([path]))[0];
    expect(metric.unavailableReason).toContain("thermal/valid");
    const get = vi.fn(() => 0);
    expect(readEngineHistoryValues({ getPropertyValue: get }, [metric])).toEqual([null]);
    expect(get).not.toHaveBeenCalled();
    const thrust = discoverEngineVariables(new Set(["propulsion/engine/thrust-lbs"]))[0];
    expect(readEngineHistoryValues({ getPropertyValue: get }, [thrust])).toEqual([0]);
  });

  it("keeps failed-attempt diagnostics readable while retained physical getters are declared stale and excluded from history", () => {
    const engine = "propulsion/engine[2]/";
    const values: Record<string, number> = {
      [engine + "n1"]: 75,
      [engine + "MaxN1"]: 100,
      [engine + "fuel-flow-rate-pps"]: .25,
      [engine + "thermal/nozzle-gas-temperature-k"]: 1000,
      [engine + "thermal/valid"]: 0,
      [engine + "plant/numerics/valid"]: 0,
      [engine + "plant/numerics/failure"]: 1,
      [engine + "plant/numerics/algorithm"]: 0,
      [engine + "plant/numerics/iterations"]: 12,
      [engine + "plant/numerics/new-work-counter"]: 24,
      [engine + "plant/ledger/valid"]: 0,
      [engine + "plant/ledger/mass-relative"]: .001,
    };
    const variables = discoverEngineVariables(new Set(Object.keys(values)), { kind: "turbine" });
    const find = (suffix: string) => variables.find(v => v.path === engine + suffix)!;
    expect(find("n1").staleProperties).toEqual([engine + "plant/numerics/failure"]);
    expect(find("fuel-flow-rate-pps").staleProperties).toEqual([engine + "plant/numerics/failure"]);
    expect(find("thermal/nozzle-gas-temperature-k").staleProperties).toEqual([engine + "plant/numerics/failure"]);
    expect(find("MaxN1").staleProperties).toBeUndefined();
    expect(find("plant/numerics/iterations").validityProperties).toBeUndefined();
    expect(find("plant/numerics/new-work-counter").validityProperties).toBeUndefined();
    expect(find("plant/numerics/failure").validityProperties).toBeUndefined();
    expect(find("plant/numerics/algorithm").description).toContain("latest native solve attempt");
    expect(find("plant/ledger/mass-relative").validityProperties).toEqual([engine + "plant/ledger/valid"]);
    expect(find("plant/ledger/mass-relative").staleProperties).toBeUndefined();
    expect(find("plant/ledger/valid").validityProperties).toBeUndefined();
    const reader = { getPropertyValue: (path: string) => values[path] };
    expect(readEngineHistoryValues(reader, [find("n1"), find("fuel-flow-rate-pps"), find("thermal/nozzle-gas-temperature-k")])).toEqual([null, null, null]);
    expect(readEngineHistoryValues(reader, [find("plant/numerics/failure"), find("plant/numerics/algorithm"),
      find("plant/numerics/iterations"), find("plant/numerics/new-work-counter"), find("plant/ledger/mass-relative"), find("plant/ledger/valid")])).toEqual([1, 0, 12, 24, null, 0]);
    values[engine + "plant/numerics/failure"] = 0;
    values[engine + "plant/numerics/valid"] = 1;
    values[engine + "plant/ledger/valid"] = 1;
    expect(readEngineHistoryValues(reader, [find("n1"), find("plant/ledger/mass-relative")])).toEqual([75, .001]);
  });

  it("converts absolute temperatures and expected ranges, preserves outside-envelope values, and offers useful mass-flow units", () => {
    const paths = new Set(["propulsion/engine/thermal/valid", "propulsion/engine/thermal/nozzle-gas-temperature-k"]);
    const celsius = discoverEngineVariables(paths).find(v => v.path.endsWith("nozzle-gas-temperature-k"))!;
    const ranged = { ...celsius, expectedRange: { kind: "provisional" as const, minimum: 0, maximum: 100, source: "test envelope" } };
    const fahrenheit = engineVariableInUnit(ranged, "°F");
    expect(fahrenheit.expectedRange.kind).toBe("provisional");
    if (fahrenheit.expectedRange.kind !== "unknown") {
      expect(fahrenheit.expectedRange.minimum).toBeCloseTo(32);
      expect(fahrenheit.expectedRange.maximum).toBeCloseTo(212);
    }
    const reader = { getPropertyValue: (path: string) => path.endsWith("/valid") ? 1 : 500 };
    expect(readEngineHistoryValues(reader, [engineVariableInUnit(ranged, "K")])).toEqual([500]);
    expect(readEngineHistoryValues(reader, [fahrenheit])[0]).toBeCloseTo(440.33);
    const fuel = discoverEngineVariables(new Set(["propulsion/engine/fuel-flow-rate-pps"]))[0];
    expect(readEngineHistoryValues({ getPropertyValue: () => 1 }, [engineVariableInUnit(fuel, "kg/s")])).toEqual([.45359237]);
    expect(engineVariableInUnit(fuel, "gph")).toBe(fuel);
  });
});
