import { describe, expect, it, vi } from "vitest";
import { createEngineHistory, discoverEngineHistoryMetrics, engineHistoryCsv, engineHistoryPlot, readEngineHistoryValues } from "./engineHistory";

describe("native engine history", () => {
  it("records signed heat receipts only when requested and distinguishes warm seeding from an accepted step", () => {
    const thermal = "propulsion/engine[2]/thermal/";
    const region = thermal + "outer-wall/";
    const values: Record<string, number> = {
      [thermal + "valid"]: 1, [region + "initialized"]: 1,
      [region + "heat-balance-valid"]: 0, [region + "initialization-energy-j"]: 42000,
      [region + "coolant-heat-flow-w"]: -900, [region + "step-stored-energy-j"]: 2.5,
      [region + "step-energy-residual-j"]: 1e-9,
    };
    const available = new Set(Object.keys(values));
    expect(discoverEngineHistoryMetrics(available, { kind: "turbine" })).toEqual([]);
    const metrics = discoverEngineHistoryMetrics(available, { kind: "turbine" }, true);
    expect(metrics).toHaveLength(4);
    expect(metrics.every(row => row.engineIndex === 2)).toBe(true);
    const reader = { getPropertyValue: (path: string) => values[path] };
    expect(readEngineHistoryValues(reader, metrics)).toEqual([null, null, null, 42000]);
    values[region + "heat-balance-valid"] = 1;
    expect(readEngineHistoryValues(reader, metrics)).toEqual([-900, 2.5, 1e-9, 42000]);
    expect(engineHistoryCsv(metrics, [{ time: 1, values: readEngineHistoryValues(reader, metrics) }])).toContain("coolant heat (W)");
    expect(discoverEngineHistoryMetrics(available, { kind: "piston" }, true)).toEqual([]);
  });

  it("plots and exports independent core and liner temperatures with independent readiness", () => {
    const thermal = "propulsion/engine/thermal/";
    const values: Record<string, number> = {
      [thermal + "valid"]: 1, [thermal + "initialized"]: 1, [thermal + "core/initialized"]: 1,
      [thermal + "nozzle-gas-temperature-k"]: 1900, [thermal + "metal-temperature-k"]: 700,
      [thermal + "core/metal-temperature-k"]: 1100,
    };
    const metrics = discoverEngineHistoryMetrics(new Set(Object.keys(values)), { kind: "turbine" });
    expect(metrics.map(metric => metric.label)).toEqual(["Nozzle gas temperature", "Core-facing metal temperature", "Nozzle metal temperature"]);
    const observations = readEngineHistoryValues({ getPropertyValue: path => values[path] }, metrics);
    expect(observations).toEqual([1626.85, 826.85, 426.85]);
    expect(engineHistoryCsv(metrics, [{ time: 2, values: observations }])).toContain("Core-facing metal temperature (°C)");
    values[thermal + "core/initialized"] = 0;
    expect(readEngineHistoryValues({ getPropertyValue: path => values[path] }, metrics)).toEqual([1626.85, null, 426.85]);
  });

  it("samples native simulation advances within the configured ceiling without pause duplicates or catch-up values", () => {
    const history = createEngineHistory({ seconds: 10, hz: 5 });
    const read = vi.fn(() => [100]);
    expect(history.observe(12, false, read)).toBe(true);
    for (const time of [12, 12.05, 12.1, 12.19]) expect(history.observe(time, false, read)).toBe(false);
    expect(history.observe(12.2, false, read)).toBe(true);
    expect(history.observe(12.4, true, read)).toBe(false);
    expect(history.observe(20, false, read)).toBe(true);
    expect(history.frames().map(frame => frame.time)).toEqual([12, 12.2, 20]);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("bounds both retained duration and count, applies settings immediately, and disables all capture at zero Hz", () => {
    const history = createEngineHistory({ seconds: 2, hz: 2 });
    for (let i = 0; i <= 20; i++) history.observe(i / 2, false, () => [i]);
    expect(history.frames().map(frame => frame.time)).toEqual([8, 8.5, 9, 9.5, 10]);
    history.configure({ seconds: 1, hz: 1 });
    expect(history.frames().map(frame => frame.time)).toEqual([9.5, 10]);
    const read = vi.fn(() => [0]);
    history.configure({ seconds: 1, hz: 0 });
    expect(history.frames()).toEqual([]);
    expect(history.observe(100, false, read)).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });

  it("starts a new history after native time rewinds and keeps Clear empty during pause", () => {
    const history = createEngineHistory({ seconds: 60, hz: 5 });
    history.observe(20, false, () => [1]);
    history.observe(21, false, () => [2]);
    history.clear();
    expect(history.observe(21, false, () => [3])).toBe(false);
    expect(history.frames()).toEqual([]);
    history.observe(1, false, () => [4]);
    expect(history.frames()).toEqual([{ time: 1, values: [4] }]);
  });

  it("admits indexed thermal measurements only with their native flags and omits absent values", () => {
    const prefix = "propulsion/engine[3]/";
    const available = new Set([prefix + "thrust-lbs", prefix + "n2", "fcs/throttle-cmd-norm[3]",
      prefix + "thermal/nozzle-gas-temperature-k", prefix + "thermal/metal-temperature-k",
      prefix + "thermal/valid"]);
    const metrics = discoverEngineHistoryMetrics(available, { kind: "turbine" });
    expect(metrics.map(metric => metric.label)).toEqual(["N2", "Thrust", "Nozzle gas temperature", "Throttle command"]);
    expect(metrics.every(metric => metric.engineIndex === 3 && metric.title.startsWith("Engine 4"))).toBe(true);
    expect(metrics.some(metric => metric.path.includes("propulsion/engine/"))).toBe(false);
    const values = { [prefix + "n2"]: 79.2, [prefix + "thrust-lbs"]: 4000,
      [prefix + "thermal/nozzle-gas-temperature-k"]: 1800, [prefix + "thermal/valid"]: 1,
      "fcs/throttle-cmd-norm[3]": .7 };
    const get = vi.fn((path: string) => values[path]);
    expect(readEngineHistoryValues({ getPropertyValue: get }, metrics)).toEqual([79.2, 4000, 1526.85, 70]);
    values[prefix + "thermal/valid"] = 0;
    get.mockClear();
    expect(readEngineHistoryValues({ getPropertyValue: get }, metrics)[2]).toBeNull();
    expect(get).not.toHaveBeenCalledWith(prefix + "thermal/nozzle-gas-temperature-k");
  });

  it("respects piston metadata even if a previous turbine left readable spool properties", () => {
    const metrics = discoverEngineHistoryMetrics(new Set(["propulsion/engine/n1", "propulsion/engine/n2",
      "propulsion/engine/engine-rpm", "propulsion/engine/egt-degc", "propulsion/engine/egt-degF"]), { kind: "piston" });
    expect(metrics.map(metric => metric.label)).toEqual(["Engine RPM", "EGT"]);
  });

  it("keeps invalid and unavailable measurements as gaps, with correct Celsius and percent axes", () => {
    const plot = engineHistoryPlot([
      { time: 1, values: [700] }, { time: 2, values: [800] }, { time: 3, values: [null] },
      { time: 4, values: [900] }, { time: 5, values: [Number.NaN] },
    ], 0);
    expect(plot.minimum).toBe(700);
    expect(plot.maximum).toBe(900);
    expect(plot.path).toBe("M0.00,60.00L75.00,32.00M225.00,4.00");
    expect(engineHistoryPlot([{ time: 1, values: [null] }], 0).path).toBe("");
    const flag = engineHistoryPlot([{ time: 0, values: [0] }, { time: 1, values: [1] }], 0, true);
    expect(flag.path).toBe("M0.00,60.00H300.00V4.00");
  });

  it("exports explicit units, actual simulation timestamps and empty invalid cells", () => {
    const metrics = discoverEngineHistoryMetrics(new Set(["propulsion/engine/thrust-lbs"]));
    expect(engineHistoryCsv(metrics, [{ time: 1.2, values: [100] }, { time: 1.4, values: [null] }]))
      .toBe('"Simulation time (s)","Engine 1 · Thrust (lbf)"\r\n1.2,100\r\n1.4,\r\n');
  });
});
