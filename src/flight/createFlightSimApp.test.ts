// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = { latDeg: 1, lonDeg: 2, altMeters: 1000, headingRad: 0 };
  return {
    state,
    resetLocation: vi.fn(() => state),
    applyOrigin: vi.fn(),
    runtime: {
      renderer: { mode: "webgl2" }, status: { mode: "fallback" }, scene: {},
      engine: { getFps: () => 60 }, geospatialCamera: null,
      surface: { sample: vi.fn(() => null) },
      getWorldRoot: () => ({}), setSimViewState: vi.fn(), setSimTick: vi.fn(),
      setSimRunning: vi.fn(), requestRender: vi.fn(), setMapSource: vi.fn(), setTerrainSource: vi.fn(), setRasterQuality: vi.fn(), destroy: vi.fn(),
    },
    aircraft: {
      setViewMode: vi.fn(), toggleViewMode: vi.fn(), getViewMode: () => "third",
      orbitChaseCamera: vi.fn(), zoomChaseCamera: vi.fn(), dispose: vi.fn(),
    },
    terrainContact: { reset: vi.fn(), update: vi.fn(() => true) },
    visibleMeshCollision: { reset: vi.fn(), update: vi.fn(() => false) },
    physics: { reset: vi.fn(), setPaused: vi.fn(), update: vi.fn((_delta, applyInputs) => { applyInputs(); return state; }), getLatestState: () => state, getFault: () => null },
  };
});
vi.mock("foss-earth/runtime", () => ({
  createBabylonRuntime: async () => mocks.runtime,
  RASTER_BASE_MAP_SOURCES: [], TERRAIN_SOURCES: [], resolveTerrainSource: vi.fn(), resolveRasterBaseMapSource: vi.fn(), resolveMapRuntimeConfig: () => ({}), setMapSourcePreference: vi.fn(), setTerrainSourcePreference: vi.fn(), setRasterQualityPreference: vi.fn(),
}));
vi.mock("./jsbsim/createJsbsimRuntime", () => ({ createJsbsimRuntime: async () => ({ sdk: { setPropertyValue: vi.fn() }, dispose: vi.fn() }) }));
vi.mock("./bridge/ecefBridge", () => ({ readFlightState: () => mocks.state }));
vi.mock("./bridge/floatingOrigin", () => ({ createFloatingOrigin: () => ({ aircraftRoot: {}, apply: mocks.applyOrigin, dispose: vi.fn() }) }));
vi.mock("./aircraft/createPlaceholderAircraft", () => ({ createPlaceholderAircraft: () => mocks.aircraft }));
vi.mock("./physics/fixedStepLoop", () => ({ createFixedStepPhysicsLoop: () => mocks.physics }));
vi.mock("./physics/terrainContact", () => ({ createTerrainContact: () => mocks.terrainContact }));
vi.mock("./physics/visibleMeshCollision", () => ({ createVisibleMeshCollision: () => mocks.visibleMeshCollision }));
vi.mock("./hud/flightHud", () => ({ createFlightHud: () => ({ update: vi.fn(), destroy: vi.fn() }) }));
vi.mock("./jsbsim/resetFlightLocation", () => ({ resetFlightLocation: mocks.resetLocation }));
vi.mock("./hud/createFlightHudBar", () => ({ createFlightHudBar: () => ({ update: vi.fn(), destroy: vi.fn() }) }));

import { createFlightSimApp } from "./createFlightSimApp";

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

describe("Flight Sim render demand", () => {
  it("pauses/resumes without a frame, wakes for camera changes, and discards idle elapsed time", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "trackpad", setItem: vi.fn() });
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
    const root = document.createElement("div");
    document.body.append(root);
    let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
    await act(async () => { app = await createFlightSimApp(root); });
    try {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP" }));
      expect(mocks.runtime.setSimRunning).toHaveBeenLastCalledWith(false);
      expect(mocks.physics.setPaused).toHaveBeenLastCalledWith(true);
      const canvas = root.querySelector("canvas")!;
      mocks.runtime.requestRender.mockClear();
      canvas.dispatchEvent(new MouseEvent("click", { button: 0 }));
      expect(mocks.runtime.requestRender).not.toHaveBeenCalled();
      canvas.dispatchEvent(new WheelEvent("wheel", { deltaX: 10, deltaY: 20 }));
      expect(mocks.aircraft.orbitChaseCamera).toHaveBeenCalled();
      expect(mocks.runtime.requestRender).toHaveBeenCalledOnce();
      canvas.dispatchEvent(new WheelEvent("wheel", { ctrlKey: true, deltaY: -10 }));
      expect(mocks.aircraft.zoomChaseCamera).toHaveBeenCalled();
      expect(mocks.runtime.requestRender).toHaveBeenCalledTimes(2);
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyV" }));
      expect(mocks.runtime.requestRender).toHaveBeenCalledTimes(3);
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP" }));
      expect(mocks.runtime.setSimRunning).toHaveBeenLastCalledWith(true);
      const tick = mocks.runtime.setSimTick.mock.calls[0][0] as (dt: number) => void;
      tick(60);
      expect(mocks.physics.update).toHaveBeenLastCalledWith(0, expect.any(Function));
    } finally { await act(async () => app.destroy()); }
    expect(mocks.runtime.setSimTick).toHaveBeenLastCalledWith(null);
  });
});

it("samples visible terrain contact in Google mode and resets a recoverable fault on Resume", async () => {
  vi.stubGlobal("localStorage", { getItem: () => "trackpad", setItem: vi.fn() });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  mocks.runtime.status.mode = "google-tiles";
  mocks.physics.getFault = () => "recoverable contact fault";
  const root = document.createElement("div");
  document.body.append(root);
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  try {
    const tick = mocks.runtime.setSimTick.mock.calls.at(-1)?.[0] as (dt: number) => void;
    tick(1 / 60);
    expect(mocks.terrainContact.update).toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP" }));
    expect(mocks.physics.reset).toHaveBeenCalled();
    expect(mocks.terrainContact.reset).toHaveBeenCalled();
  } finally { await act(async () => app.destroy()); }
});


it("mounts the shared + menu, opens Location, and applies coordinates to the simulation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  const root = document.createElement("div");
  document.body.append(root);
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  try {
    expect(root.querySelector<HTMLElement>(".flight-panel-root")!.hidden).toBe(false);
    expect(root.querySelector('[aria-label="Open left panel"]')).toBeNull();
    await act(async () => root.querySelector<HTMLButtonElement>('[aria-label="Open right panel"]')!.click());
    const aircraft = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(button => button.textContent === "Aircraft")!;
    await act(async () => aircraft.click());
    const add = root.querySelector<HTMLButtonElement>('.foss-earth-tab-strip [aria-label="Open new tab"]')!;
    expect(add).not.toBeNull();
    await act(async () => add.click());
    const location = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(button => button.textContent === "Location")!;
    await act(async () => location.click());
    expect(root.querySelector(".foss-earth-location-panel")).not.toBeNull();
    expect(root.querySelector('[role="menu"]')).toBeNull();
    const panel = root.querySelector<HTMLElement>(".foss-earth-dock-panel")!;
    const expandedHeight = panel.style.height;
    const minimize = async () => {
      const handle = panel.querySelector<HTMLElement>('[role="separator"]')!;
      handle.setPointerCapture = vi.fn();
      handle.releasePointerCapture = vi.fn();
      await act(async () => {
        handle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
        handle.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0 }));
      });
      expect(panel.dataset.collapsed).toBe("true");
      expect(panel.querySelector(".foss-earth-dock-panel-body")).toBeNull();
      expect(Array.from(panel.querySelectorAll(".foss-earth-tab-button"), button => button.textContent)).toEqual(["Aircraft", "Location"]);
    };
    const select = async (label: string) => {
      const tab = Array.from(panel.querySelectorAll<HTMLButtonElement>(".foss-earth-tab-button")).find(button => button.textContent === label)!;
      await act(async () => tab.click());
      expect(panel.dataset.collapsed).toBe("false");
      expect(panel.style.height).toBe(expandedHeight);
      if (label === "Location") expect(panel.querySelector(".foss-earth-location-panel")).not.toBeNull();
      else expect(panel.querySelector(".flight-panel__title")!.textContent).toBe(label);
    };
    await minimize();
    await select("Location"); // The already-selected tab restores too.
    await minimize();
    await select("Aircraft");
    await select("Location");
    const inputs = root.querySelectorAll<HTMLInputElement>('input[type="number"]');
    await act(async () => {
      for (const [index, value] of ["46.7867", "-92.1005"].entries()) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(inputs[index], value);
        inputs[index].dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await act(async () => inputs[0].form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.resetLocation).toHaveBeenCalledWith(expect.anything(), { latDeg: 46.7867, lonDeg: -92.1005, altMeters: 1000 }, undefined);
    expect(mocks.physics.reset).toHaveBeenCalledOnce();
    expect(mocks.applyOrigin).toHaveBeenLastCalledWith(mocks.state);
    expect(mocks.runtime.setSimViewState).toHaveBeenLastCalledWith(expect.objectContaining({ latDeg: mocks.state.latDeg, lonDeg: mocks.state.lonDeg }));
    expect(mocks.runtime.requestRender).toHaveBeenCalled();
    // Closing every tab leaves the shared launcher usable.
    for (const label of ["Location", "Aircraft"]) {
      await act(async () => root.querySelector<HTMLButtonElement>(`[aria-label="Close ${label} tab"]`)!.click());
    }
    expect(root.querySelector(".foss-earth-dock-panel")).toBeNull();
    await act(async () => root.querySelector<HTMLButtonElement>('[aria-label="Open right panel"]')!.click());
    const reopen = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(button => button.textContent === "Location")!;
    await act(async () => reopen.click());
    expect(root.querySelector(".foss-earth-location-panel")).not.toBeNull();
  } finally { await act(async () => app.destroy()); }
  expect(root.children).toHaveLength(0);
});
