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
      prepareTerrain: vi.fn(async (request: { altitudeMeters?: number }) => ({ groundHeightMeters: 250, altitudeMeters: request.altitudeMeters ?? 1774 })),
      surface: { sample: vi.fn(() => null) },
      getWorldRoot: () => ({}), setSimViewState: vi.fn(), setSimTick: vi.fn(),
      googleTerrainDetail: {
        defaultErrorTarget: 20,
        errorTarget: 20,
        overrideErrorTarget: null as number | null,
      },
      getGoogleTerrainDetailState: vi.fn(() => mocks.runtime.googleTerrainDetail),
      getGoogleTerrainDetailAnchor: vi.fn(() => "simulation-origin"),
      setGoogleTerrainDetailAnchor: vi.fn(),
      setGoogleTerrainDetailTarget: vi.fn((errorTarget: number | null) => {
        mocks.runtime.googleTerrainDetail.errorTarget = errorTarget ?? mocks.runtime.googleTerrainDetail.defaultErrorTarget;
        mocks.runtime.googleTerrainDetail.overrideErrorTarget = errorTarget;
      }),
      setSimRunning: vi.fn(), requestRender: vi.fn(), setMapSource: vi.fn(), setTerrainSource: vi.fn(), setRasterQuality: vi.fn(), destroy: vi.fn(),
    },
    collisionOverlay: { setEnabled: vi.fn(), update: vi.fn(), dispose: vi.fn() },
    wheelOverlay: { setEnabled: vi.fn(), update: vi.fn(), dispose: vi.fn() },
    wheelSpin: { step: vi.fn(), reset: vi.fn(), getStates: () => [] },
    tireAudio: { setEnabled: vi.fn(), setPaused: vi.fn(), setVolume: vi.fn(), update: vi.fn(), dispose: vi.fn(), getStatus: () => null },
    aircraft: {
      root: {},
      setViewMode: vi.fn(), toggleViewMode: vi.fn(), getViewMode: () => "third",
      orbitChaseCamera: vi.fn(), zoomChaseCamera: vi.fn(), dispose: vi.fn(),
      modelRoot: {}, setModelLoaded: vi.fn(), getChaseDistanceMeters: () => 14,
    },
    aircraftModel: {
      root: {},
      getState: () => ({
        aircraftId: "cessna-172", lodId: "auto", activeLodId: "lod3",
        status: "ready", triangles: 876, error: null,
      }),
      getRig: () => mocks.rig,
      setAircraft: vi.fn(), setLod: vi.fn(), refreshAutoLod: vi.fn(), dispose: vi.fn(),
    },
    rig: { parts: [], propeller: null, propellerAngleRad: 0, bound: [] },
    surfaceState: { elevatorRad: 0.1 },
    applyAircraftRig: vi.fn(),
    terrainContact: { reset: vi.fn(), update: vi.fn(() => true) },
    visibleMeshCollision: { reset: vi.fn(), update: vi.fn(() => false) },
    physics: { reset: vi.fn(), setPaused: vi.fn(), update: vi.fn((_delta, applyInputs) => { applyInputs(); return state; }), getLatestState: () => state, getFault: () => null },
    hudBarOptions: null as { onDebugClick(): void } | null,
  };
});
vi.mock("foss-earth/runtime", () => ({
  createBabylonRuntime: async () => mocks.runtime,
  RASTER_BASE_MAP_SOURCES: [], TERRAIN_SOURCES: [], resolveTerrainSource: vi.fn(), resolveRasterBaseMapSource: vi.fn(), resolveMapRuntimeConfig: () => ({}), setMapSourcePreference: vi.fn(), setTerrainSourcePreference: vi.fn(), setRasterQualityPreference: vi.fn(),
}));
vi.mock("./jsbsim/createJsbsimRuntime", () => ({ createJsbsimRuntime: async () => ({ sdk: { setPropertyValue: vi.fn(), getPropertyValue: vi.fn(() => 0) }, dispose: vi.fn() }) }));
vi.mock("./bridge/ecefBridge", () => ({ readFlightState: () => mocks.state }));
vi.mock("./bridge/floatingOrigin", () => ({ createFloatingOrigin: () => ({ aircraftRoot: { setEnabled: vi.fn() }, apply: mocks.applyOrigin, dispose: vi.fn() }) }));
vi.mock("./aircraft/createPlaceholderAircraft", () => ({ createPlaceholderAircraft: () => mocks.aircraft }));
vi.mock("./diagnostics/createCollisionDebugOverlay", () => ({ createCollisionDebugOverlay: vi.fn(() => mocks.collisionOverlay) }));
vi.mock("./diagnostics/createWheelSpinDebugOverlay", () => ({ createWheelSpinDebugOverlay: vi.fn(() => mocks.wheelOverlay) }));
vi.mock("./physics/createWheelSpinExperiment", () => ({ createWheelSpinExperiment: () => mocks.wheelSpin }));
vi.mock("./audio/createTireAudio", () => ({ createTireAudio: () => mocks.tireAudio }));
vi.mock("./aircraft/createAircraftModel", () => ({ createAircraftModel: () => mocks.aircraftModel }));
vi.mock("./aircraft/aircraftAnimation", () => ({
  applyAircraftRig: mocks.applyAircraftRig,
  readControlSurfaceState: () => mocks.surfaceState,
}));
vi.mock("./physics/fixedStepLoop", () => ({ FIXED_DT: 1 / 120, createFixedStepPhysicsLoop: vi.fn(() => mocks.physics) }));
vi.mock("./physics/terrainContact", () => ({ createTerrainContact: () => mocks.terrainContact }));
vi.mock("./physics/visibleMeshCollision", () => ({ createVisibleMeshCollision: vi.fn(() => mocks.visibleMeshCollision) }));
vi.mock("./hud/flightHud", () => ({ createFlightHud: () => ({ update: vi.fn(), destroy: vi.fn() }) }));
vi.mock("./jsbsim/resetFlightLocation", () => ({ resetFlightLocation: mocks.resetLocation }));
vi.mock("./hud/createFlightHudBar", () => ({
  createFlightHudBar: (_container: HTMLElement, options: { onDebugClick(): void }) => {
    mocks.hudBarOptions = options;
    return { update: vi.fn(), destroy: vi.fn() };
  },
}));

import { createFlightSimApp } from "./createFlightSimApp";
import { createCollisionDebugOverlay } from "./diagnostics/createCollisionDebugOverlay";
import { createFixedStepPhysicsLoop } from "./physics/fixedStepLoop";
import { createVisibleMeshCollision } from "./physics/visibleMeshCollision";

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

it("runs wheel feedback only when selected, exposes A/B while paused, and mutes on off", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  mocks.physics.getFault = () => null;
  const root = document.createElement("div"); document.body.append(root);
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  try {
    const onStep = vi.mocked(createFixedStepPhysicsLoop).mock.calls.at(-1)![1]!;
    onStep(mocks.state as never);
    expect(mocks.wheelSpin.step).not.toHaveBeenCalled();
    expect(mocks.tireAudio.setEnabled).not.toHaveBeenCalled();
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP" })));
    expect(mocks.tireAudio.setPaused).toHaveBeenLastCalledWith(true);
    await act(async () => root.querySelector<HTMLButtonElement>('[aria-label="Open right panel"]')!.click());
    const debug = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(button => button.textContent === "Debug")!;
    await act(async () => debug.click());
    const select = root.querySelector<HTMLSelectElement>('[aria-label="Wheel spin experiment"]')!;
    const sound = root.querySelector<HTMLInputElement>('[aria-label="Enable tire sound"]')!;
    expect(select.value).toBe("off");
    expect(sound.disabled).toBe(true);
    await act(async () => { select.value = "inertia"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(mocks.wheelSpin.reset).toHaveBeenCalled();
    expect(sound.disabled).toBe(false);
    await act(async () => sound.click());
    expect(mocks.tireAudio.setEnabled).toHaveBeenLastCalledWith(true);
    onStep(mocks.state as never);
    expect(mocks.wheelSpin.step).toHaveBeenLastCalledWith(1 / 120, "inertia");
    await act(async () => root.querySelector<HTMLInputElement>('[aria-label="Show aircraft collision geometry"]')!.click());
    expect(mocks.wheelOverlay.setEnabled).toHaveBeenLastCalledWith(true);
    await act(async () => { select.value = "instant"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    onStep(mocks.state as never);
    expect(mocks.wheelSpin.step).toHaveBeenLastCalledWith(1 / 120, "instant");
    await act(async () => { select.value = "off"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(sound.checked).toBe(false);
    expect(mocks.tireAudio.setEnabled).toHaveBeenLastCalledWith(false);
    expect(mocks.wheelOverlay.setEnabled).toHaveBeenLastCalledWith(false);
    mocks.wheelSpin.step.mockClear();
    onStep(mocks.state as never);
    expect(mocks.wheelSpin.step).not.toHaveBeenCalled();
  } finally { await act(async () => app.destroy()); }
  expect(mocks.tireAudio.dispose).toHaveBeenCalledOnce();
  expect(mocks.wheelOverlay.dispose).toHaveBeenCalledOnce();
});

it("defaults to passive impacts and applies the persistent arcade override to both contact paths", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value) });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  const root = document.createElement("div"); document.body.append(root);
  const openSettings = async () => {
    await act(async () => root.querySelector<HTMLButtonElement>('[aria-label="Open right panel"]')!.click());
    const item = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(button => button.textContent === "Settings")!;
    await act(async () => item.click());
    return root.querySelector<HTMLInputElement>('[aria-label="Arcade ground launches"]')!;
  };
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  try {
    const physicsOptions = vi.mocked(createFixedStepPhysicsLoop).mock.calls.at(-1)![2]!;
    const bodyOptions = vi.mocked(createVisibleMeshCollision).mock.calls.at(-1)![2]!;
    expect(physicsOptions.getArcadeGroundLaunches?.()).toBe(false);
    expect(bodyOptions.getRestitution?.()).toBe(0.25);
    const checkbox = await openSettings();
    expect(checkbox.checked).toBe(false);
    await act(async () => checkbox.click());
    expect(checkbox.checked).toBe(true);
    expect(physicsOptions.getArcadeGroundLaunches?.()).toBe(true);
    expect(bodyOptions.getRestitution?.()).toBe(1.35);
    expect(storage.get("osfs.arcade-ground-launches")).toBe("on");
  } finally { await act(async () => app.destroy()); }
  await act(async () => { app = await createFlightSimApp(root); });
  try {
    expect(vi.mocked(createFixedStepPhysicsLoop).mock.calls.at(-1)![2]!.getArcadeGroundLaunches?.()).toBe(true);
  } finally { await act(async () => app.destroy()); }
});

it.each([0, 1])("discards swept body history when terrain repositions during contact call %s", async resetCall => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  mocks.physics.getFault = () => null;
  const root = document.createElement("div"); document.body.append(root);
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  try {
    mocks.visibleMeshCollision.reset.mockClear();
    mocks.visibleMeshCollision.update.mockClear();
    let call = 0;
    mocks.terrainContact.update.mockImplementation(() => call++ === resetCall ? "reset" as never : true);
    const tick = mocks.runtime.setSimTick.mock.calls.at(-1)![0] as (dt: number) => void;
    tick(1 / 60);
    expect(mocks.visibleMeshCollision.reset).toHaveBeenCalledOnce();
    expect(mocks.visibleMeshCollision.reset.mock.invocationCallOrder[0]).toBeLessThan(mocks.visibleMeshCollision.update.mock.invocationCallOrder[0]);
  } finally {
    mocks.terrainContact.update.mockImplementation(() => true);
    await act(async () => app.destroy());
  }
});

describe("OSFS render demand", () => {
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
    expect(mocks.terrainContact.update).toHaveBeenLastCalledWith(false, true, true, true);
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
    expect(mocks.resetLocation).toHaveBeenCalledWith(expect.anything(), { latDeg: 46.7867, lonDeg: -92.1005, altMeters: 1000 }, 250);
    expect(mocks.physics.reset).toHaveBeenCalledTimes(2);
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


it("selects the airframe and LOD from the Aircraft tab and persists both", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const setItem = vi.fn();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  const root = document.createElement("div");
  document.body.append(root);
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  try {
    await act(async () => root.querySelector<HTMLButtonElement>('[aria-label="Open right panel"]')!.click());
    const aircraftTab = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      .find((button) => button.textContent === "Aircraft")!;
    expect(aircraftTab).not.toBeUndefined();
    await act(async () => aircraftTab.click());

    // Both airframes are offered, and the C172 lists every exported level.
    const radios = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="flight-aircraft"]'));
    expect(radios.map((input) => input.value)).toEqual(["cessna-172", "cirrus-vision-jet"]);
    const lodSelect = root.querySelector<HTMLSelectElement>(".flight-panel__select")!;
    expect(Array.from(lodSelect.options, (option) => option.value))
      .toEqual(["auto", "lod3", "lod2", "lod1", "lod0"]);

    await act(async () => {
      lodSelect.value = "lod2";
      lodSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(mocks.aircraftModel.setLod).toHaveBeenCalledWith("lod2");
    expect(setItem).toHaveBeenCalledWith("osfs.aircraft-lod", "lod2");

    await act(async () => radios[1].click());
    expect(mocks.aircraftModel.setAircraft).toHaveBeenCalledWith("cirrus-vision-jet");
    expect(setItem).toHaveBeenCalledWith("osfs.aircraft", "cirrus-vision-jet");
  } finally { await act(async () => app.destroy()); }
});


it("drives the model's control surfaces and propeller from the simulation each tick", async () => {
  vi.stubGlobal("localStorage", { getItem: () => "trackpad", setItem: vi.fn() });
  mocks.physics.getFault = () => null;
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  const root = document.createElement("div");
  document.body.append(root);
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  try {
    const tick = mocks.runtime.setSimTick.mock.calls.at(-1)?.[0] as (dt: number) => void;
    mocks.applyAircraftRig.mockClear();
    tick(1 / 60);
    expect(mocks.applyAircraftRig).toHaveBeenCalledWith(mocks.rig, mocks.surfaceState, 1 / 60, { simulationHeld: false });
    // Paused, the camera can still orbit and render frames with a real
    // interval; the rig must be told the simulation is not advancing.
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP" }));
    tick(1 / 60);
    expect(mocks.applyAircraftRig).toHaveBeenLastCalledWith(mocks.rig, mocks.surfaceState, 1 / 60, { simulationHeld: true });
  } finally { await act(async () => app.destroy()); }
});

it("saves World detail and the flight terrain requirement from Settings", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const setItem = vi.fn();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  mocks.runtime.status.mode = "google-tiles";
  mocks.runtime.googleTerrainDetail = {
    defaultErrorTarget: 20,
    errorTarget: 20,
    overrideErrorTarget: null,
  };
  const root = document.createElement("div");
  document.body.append(root);
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  try {
    await act(async () => root.querySelector<HTMLButtonElement>('[aria-label="Open right panel"]')!.click());
    const settings = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      .find((button) => button.textContent === "Settings")!;
    await act(async () => settings.click());
    const target = root.querySelector<HTMLInputElement>('[aria-label="World detail target"]')!;
    const requirement = root.querySelector<HTMLInputElement>('[aria-label="Minimum World detail for flight"]')!;
    const detailAnchor = root.querySelector<HTMLElement>('[aria-label="Terrain detail follows"]')!;
    expect(target.max).toBe("19");
    expect(target.closest(".flight-panel__detail-range")).toBe(requirement.closest(".flight-panel__detail-range"));
    expect(mocks.runtime.setGoogleTerrainDetailAnchor).toHaveBeenCalledWith("simulation-origin");
    const camera = Array.from(detailAnchor.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent === "Camera")!;
    await act(async () => camera.click());
    expect(mocks.runtime.setGoogleTerrainDetailAnchor).toHaveBeenLastCalledWith("camera");
    expect(setItem).toHaveBeenCalledWith("osfs.terrain-detail-anchor", "camera");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(target, "12");
      target.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(mocks.runtime.setGoogleTerrainDetailTarget).toHaveBeenLastCalledWith(4_096);
    expect(setItem).toHaveBeenCalledWith("osfs.world-detail-target", "4096");

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(requirement, "13");
      requirement.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(setItem).toHaveBeenCalledWith("osfs.flight-terrain-requirement", "8192");

    const override = root.querySelector<HTMLInputElement>('[aria-label="Allow coarser terrain for this session"]')!;
    await act(async () => override.click());
    expect(override.checked).toBe(true);

    const automatic = Array.from(root.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.startsWith("Use automatic detail"))!;
    await act(async () => automatic.click());
    expect(setItem).toHaveBeenCalledWith("osfs.world-detail-target", "auto");
  } finally { await act(async () => app.destroy()); }
});

it("enables collision geometry from Debug while paused, skips disabled work and disposes it", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  mocks.physics.getFault = () => null;
  const root = document.createElement("div"); document.body.append(root);
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  try {
    expect(createCollisionDebugOverlay).not.toHaveBeenCalled();
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP" })));
    await act(async () => root.querySelector<HTMLButtonElement>('[aria-label="Open right panel"]')!.click());
    const debug = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(button => button.textContent === "Debug")!;
    await act(async () => debug.click());
    const checkbox = root.querySelector<HTMLInputElement>('[aria-label="Show aircraft collision geometry"]')!;
    expect(checkbox.checked).toBe(false);
    mocks.runtime.requestRender.mockClear();
    await act(async () => checkbox.click());
    expect(checkbox.checked).toBe(true);
    expect(createCollisionDebugOverlay).toHaveBeenCalledOnce();
    expect(vi.mocked(createCollisionDebugOverlay).mock.calls[0][1]).toBe(mocks.aircraft.root);
    expect(mocks.collisionOverlay.setEnabled).toHaveBeenLastCalledWith(true);
    expect(mocks.collisionOverlay.update).not.toHaveBeenCalled();
    expect(mocks.runtime.requestRender).toHaveBeenCalledOnce();
    expect(root.textContent).toContain("5 swept body probes");
    expect(root.textContent).toContain("not a solid collision mesh");

    await act(async () => checkbox.click());
    expect(mocks.collisionOverlay.setEnabled).toHaveBeenLastCalledWith(false);
    mocks.collisionOverlay.update.mockClear();
    const tick = mocks.runtime.setSimTick.mock.calls.at(-1)![0] as (dt: number) => void;
    await act(async () => tick(1 / 60));
    expect(mocks.collisionOverlay.update).not.toHaveBeenCalled();
    await act(async () => checkbox.click());
    expect(createCollisionDebugOverlay).toHaveBeenCalledOnce();
    expect(mocks.collisionOverlay.setEnabled).toHaveBeenLastCalledWith(true);
  } finally { await act(async () => app.destroy()); }
  expect(mocks.collisionOverlay.dispose).toHaveBeenCalledOnce();

  await act(async () => { app = await createFlightSimApp(root); });
  try {
    // The opt-in resets for a new session, without recreating an overlay.
    expect(createCollisionDebugOverlay).toHaveBeenCalledOnce();
  } finally { await act(async () => app.destroy()); }
});

it("opens Debug from the FPS control on the right when the left slot cannot fit", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  const root = document.createElement("div");
  document.body.append(root);
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  try {
    expect(root.querySelector('[aria-label="Open left panel"]')).toBeNull();
    await act(async () => mocks.hudBarOptions!.onDebugClick());
    const right = root.querySelector<HTMLElement>('[data-side="right"]')!;
    expect(right.querySelector(".foss-earth-tab-button")?.textContent).toBe("Debug");
    expect(right.dataset.collapsed).toBe("false");
    await act(async () => right.querySelector<HTMLButtonElement>(".foss-earth-tab-button")!.click());
    expect(right.dataset.collapsed).toBe("true");
    await act(async () => mocks.hudBarOptions!.onDebugClick());
    expect(right.dataset.collapsed).toBe("false");
  } finally { await act(async () => app.destroy()); }
});
