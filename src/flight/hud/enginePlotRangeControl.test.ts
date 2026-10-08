// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { changeEngineVariableUnit, createEnginePlotRangeControl } from "./enginePlotRangeControl";
import { readEngineMonitorLayout, writeEngineMonitorLayout } from "./engineMonitorLayout";
import { engineVariableInUnit, type EngineVariable } from "./engineVariables";

const temperature = {
  id: "engine:2:nozzle-gas", path: "propulsion/engine[2]/temperature-k", title: "Engine 3 · Gas temperature",
  label: "Gas temperature", engineIndex: 2, unit: "K", displayUnit: "K", nativeUnit: "K", scale: 1, digits: 2,
  family: "gas", numericalType: "continuous", expectedRange: { kind: "provisional", minimum: 200, maximum: 1200, source: "Editor test only" },
  defaultPresentation: "compact", defaultGroup: null, historyEligible: true, recordByDefault: false, thermalAccounting: false,
  dimension: "temperature", units: [{ unit: "K", scale: 1 }, { unit: "°C", scale: 1, offset: -273.15 }], aliases: [],
} as EngineVariable;

describe("engine display plot envelope", () => {
  it("uses one track with two thumbs, keeps input focus, and persists the compact variable's explicit envelope", () => {
    const saved = new Map<string, string>();
    const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); } };
    const layout = readEngineMonitorLayout(storage, "test");
    const changed = vi.fn();
    const control = createEnginePlotRangeControl(temperature, layout, { save: () => writeEngineMonitorLayout(storage, "test", layout), onChange: changed });
    document.body.append(control.element);
    expect(control.element.querySelectorAll(".foss-earth-track")).toHaveLength(1);
    const thumbs = control.element.querySelectorAll<HTMLInputElement>('input[type="range"]');
    expect(thumbs).toHaveLength(2);
    thumbs[0].focus(); thumbs[0].value = "300"; thumbs[0].dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.activeElement).toBe(thumbs[0]);
    expect(changed).toHaveBeenCalledOnce();
    expect(readEngineMonitorLayout(storage, "test").variables[temperature.id]).toMatchObject({ range: { minimum: 300, maximum: 1200 } });
    expect(control.element.textContent).toContain("Plot range: 300.00–1200.00 K · Manual");
    const expand = [...control.element.querySelectorAll("button")].find(button => button.textContent === "Expand ×2")!;
    expand.click();
    expect(Number(thumbs[0].min)).toBe(-300);
    expect(Number(thumbs[0].max)).toBe(1700);
    expect(layout.variables[temperature.id].range).toEqual({ minimum: 300, maximum: 1200 });
    const auto = [...control.element.querySelectorAll("button")].find(button => button.textContent === "Auto")!;
    auto.click();
    expect(layout.variables[temperature.id].range).toBeUndefined();
    expect(readEngineMonitorLayout(storage, "test").variables[temperature.id].range).toBeUndefined();
    expect(control.element.textContent).toContain("Plot range: 200.00–1200.00 K · Auto (provisional)");
    control.destroy();
    expect(control.element.isConnected).toBe(false);
  });

  it("converts a saved explicit envelope together with the chosen display unit", () => {
    const layout = readEngineMonitorLayout(null, "test");
    layout.variables[temperature.id] = { presentation: "compact", range: { minimum: 273.15, maximum: 373.15 } };
    changeEngineVariableUnit(layout, temperature, "°C");
    expect(layout.variables[temperature.id]).toEqual({ presentation: "compact", unit: "°C", range: { minimum: 0, maximum: 100 } });
    changeEngineVariableUnit(layout, engineVariableInUnit(temperature, "°C"), "K");
    expect(layout.variables[temperature.id].range).toEqual({ minimum: 273.15, maximum: 373.15 });
  });

  it("uses already observed bounds for unknown quantities and labels an initial neutral span honestly", () => {
    const unknown = { ...temperature, expectedRange: { kind: "unknown" as const, source: "No range metadata" } };
    const layout = readEngineMonitorLayout(null, "test");
    const fromObservations = createEnginePlotRangeControl(unknown, layout, { save() {}, onChange() {}, observedRange: () => ({ minimum: 10, maximum: 20 }) });
    expect(fromObservations.element.textContent).toContain("10.00–20.00 K");
    expect(fromObservations.element.textContent).toContain("Auto (observed)");
    fromObservations.destroy();
    const beforeObservations = createEnginePlotRangeControl(unknown, layout, { save() {}, onChange() {} });
    expect(beforeObservations.element.textContent).toContain("0.00–1.00 K");
    expect(beforeObservations.element.textContent).toContain("Plot range: Auto · waiting for samples");
    expect(beforeObservations.element.textContent).toContain("Editor: 0.00–1.00 K");
    beforeObservations.destroy();
  });
});
