import { describe, expect, it, vi } from "vitest";
import type { JSBSimSdk } from "@felipegalind0/jsbsim";
import { captureSimulation, restoreSimulation } from "./safeFlightState";

const thermal = (index?: number) => `propulsion/engine${index === undefined ? "" : `[${index}]`}/thermal/`;
const statePath = (index?: number) => `${thermal(index)}metal-temperature-state-k`;
const initializedPath = (index?: number) => `${thermal(index)}initialized`;

function fixture(catalog: readonly string[] = [
  `${statePath()} (RW)`, `${initializedPath()} (R)`,
  `${statePath(3)} (RW)`, `${initializedPath(3)} (R)`,
]) {
  const values: Record<string, number> = {
    "propulsion/engine/set-running": 1, "simulation/sim-time-sec": 42,
    [statePath()]: 840, [initializedPath()]: 1,
    [statePath(3)]: 620, [initializedPath(3)]: 1,
  };
  const startupStates: Record<string, number>[] = [];
  const getPropertyValue = vi.fn((path: string) => values[path] ?? 0);
  const queryPropertyCatalog = vi.fn((query: string) => catalog.filter(line => line.startsWith(query)).join("\n"));
  const setPropertyValue = vi.fn((path: string, value: number) => {
    values[path] = value;
    if (path.endsWith("/thermal/metal-temperature-state-k")) {
      values[path.replace(/metal-temperature-state-k$/, "initialized")] = 1;
    }
    if (path === "propulsion/set-running") {
      startupStates.push({ [statePath()]: values[statePath()], [statePath(3)]: values[statePath(3)] });
      for (const index of [undefined, 3]) {
        if (!values[initializedPath(index)]) {
          values[statePath(index)] = 1100;
          values[initializedPath(index)] = 1;
        }
      }
    }
  });
  const resetToInitialConditions = vi.fn(() => {
    for (const index of [undefined, 3]) {
      values[statePath(index)] = 273.15;
      values[initializedPath(index)] = 0;
    }
  });
  const sdk = {
    getPropertyValue, queryPropertyCatalog, setPropertyValue, resetToInitialConditions,
    runIc: vi.fn(() => true), setSimTime: vi.fn(),
  };
  return { sdk, native: sdk as unknown as JSBSimSdk, values, startupStates };
}

describe("native engine thermal state in simulation snapshots", () => {
  it.each(["core", "2nd-wall"])("captures and restores named solid %s using its own initialization flag", region => {
    const core = `${thermal()}${region}/metal-temperature-state-k`;
    const coreReady = `${thermal()}${region}/initialized`;
    const pending = `${thermal()}pending/metal-temperature-state-k`;
    const pendingReady = `${thermal()}pending/initialized`;
    const t = fixture([`${statePath()} (RW)`, `${initializedPath()} (R)`,
      `${core} (RW)`, `${coreReady} (R)`, `${pending} (RW)`, `${pendingReady} (R)`]);
    t.values[core] = 1200;
    t.values[coreReady] = 1;
    t.values[pending] = 300;
    t.values[pendingReady] = 0;
    const snapshot = captureSimulation(t.native);
    expect(snapshot.controls[core]).toBe(1200);
    expect(snapshot.controls[statePath()]).toBe(840);
    expect(snapshot.controls[pending]).toBeUndefined();
    t.values[core] = 500;
    restoreSimulation(t.native, snapshot);
    expect(t.values[core]).toBe(1200);
    const write = t.sdk.setPropertyValue.mock.calls.findIndex(([path]) => path === core);
    expect(t.sdk.setPropertyValue.mock.invocationCallOrder[write]).toBeLessThan(t.sdk.runIc.mock.invocationCallOrder[0]);
  });

  it("discovers writable state once, preserves all native indices, and leaves pending or unavailable state alone", () => {
    const t = fixture([
      `${statePath()} (RW)`, `${initializedPath()} (R)`,
      `${statePath(3)} (RW)`, `${initializedPath(3)} (R)`,
      `${statePath(1)} (R)`, `${initializedPath(1)} (R)`,
      `${statePath(2)} (W)`, `${initializedPath(2)} (R)`,
      `${statePath(4)} (RW)`,
      `${statePath(5)} (RW)`, `${initializedPath(5)} (R)`,
      `${statePath(6)} (RW)`, `${initializedPath(6)} (R)`,
    ]);
    t.values[statePath(5)] = 300;
    t.values[initializedPath(5)] = 0;
    t.values[statePath(6)] = Number.NaN;
    t.values[initializedPath(6)] = 1;
    const first = captureSimulation(t.native);
    expect(first.controls[statePath()]).toBe(840);
    expect(first.controls[statePath(3)]).toBe(620);
    for (const index of [1, 2, 4, 5, 6]) expect(first.controls[statePath(index)]).toBeUndefined();
    for (const index of [1, 2, 4, 5]) expect(t.sdk.getPropertyValue).not.toHaveBeenCalledWith(statePath(index));
    expect(t.sdk.setPropertyValue).not.toHaveBeenCalled();

    // Capability discovery is cached, but initialized state is observed anew.
    t.values[statePath(5)] = 900;
    t.values[initializedPath(5)] = 1;
    expect(captureSimulation(t.native).controls[statePath(5)]).toBe(900);
    expect(t.sdk.queryPropertyCatalog.mock.calls.filter(([query]) => query === "propulsion/engine")).toHaveLength(1);
  });

  it("restores captured metal temperatures before warm initialization can replace them", () => {
    const t = fixture();
    const snapshot = captureSimulation(t.native);
    restoreSimulation(t.native, snapshot);
    expect(t.sdk.resetToInitialConditions).toHaveBeenCalledWith(2);
    expect(t.startupStates).toEqual([{ [statePath()]: 840, [statePath(3)]: 620 }]);
    expect(t.values[statePath()]).toBe(840);
    expect(t.values[statePath(3)]).toBe(620);
    expect(t.values[initializedPath()]).toBe(1);
    expect(t.values[initializedPath(3)]).toBe(1);
    const firstRun = t.sdk.runIc.mock.invocationCallOrder[0];
    for (const path of [statePath(), statePath(3)]) {
      const index = t.sdk.setPropertyValue.mock.calls.findIndex(([written]) => written === path);
      expect(t.sdk.setPropertyValue.mock.invocationCallOrder[index]).toBeLessThan(firstRun);
    }
  });

  it("does not replay foreign thermal nodes onto a model that has no matching native capability", () => {
    const t = fixture([]);
    const snapshot = captureSimulation(t.native);
    snapshot.controls[statePath(7)] = 950;
    snapshot.controls[`${thermal(7)}metal-temperature-k`] = 950;
    restoreSimulation(t.native, snapshot);
    expect(t.sdk.setPropertyValue.mock.calls.filter(([path]) => path.includes("/thermal/"))).toEqual([]);
    expect(t.sdk.getPropertyValue.mock.calls.filter(([path]) => path.includes("/thermal/"))).toEqual([]);
  });
});
