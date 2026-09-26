// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

type HudBarClicks = Pick<import("./hud/createFlightHudBar").FlightHudBarOptions,
  "onDebugClick" | "onMapClick" | "onRendererClick" | "onStatusClick">;

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
      statusListeners: new Set<(status: { mode: string; terrainSource?: { id: string } }) => void>(),
      subscribeStatus: vi.fn((listener: (status: { mode: string; terrainSource?: { id: string } }) => void) => {
        mocks.runtime.statusListeners.add(listener);
        return () => mocks.runtime.statusListeners.delete(listener);
      }),
      isStreamingTiles: () => false,
      onTilesStreamingChange: vi.fn(() => () => {}),
      onRasterDetailFeedback: vi.fn(() => () => {}),
      getRasterDetailFeedback: vi.fn(() => null),
      setRasterDetailTarget: vi.fn(),
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
      thirdPersonCamera: { position: { y: 2.2, length: () => Math.hypot(2.2, 14) } },
    },
    aircraftModel: {
      root: {},
      getState: () => ({
        aircraftId: "cessna-172", lodId: "auto", activeLodId: "lod3",
        status: "ready", triangles: 876, error: null,
      }),
      getRig: () => mocks.rig,
      setAircraft: vi.fn(), setLod: vi.fn(), setPresentation: vi.fn(), refreshAutoLod: vi.fn(), dispose: vi.fn(),
    },
    rig: { parts: [], propeller: null, propellerAngleRad: 0, bound: [] },
    surfaceState: { elevatorRad: 0.1 },
    applyAircraftRig: vi.fn(),
    terrainContact: { reset: vi.fn(), update: vi.fn(() => true) },
    visibleMeshCollision: { reset: vi.fn(), update: vi.fn(() => false) },
    physics: { reset: vi.fn(), setPaused: vi.fn(), update: vi.fn((_delta, applyInputs) => { applyInputs(); return state; }), getLatestState: () => state, getFault: () => null },
    hudBarOptions: null as HudBarClicks | null,
  };
});
vi.mock("foss-earth/runtime", () => ({
  createBabylonRuntime: async () => mocks.runtime,
  RASTER_BASE_MAP_SOURCES: [], TERRAIN_SOURCES: [], resolveTerrainSource: vi.fn(), resolveRasterBaseMapSource: vi.fn(), resolveMapRuntimeConfig: () => ({}), applyRendererChoice: vi.fn(), setMapSourcePreference: vi.fn(), setTerrainSourcePreference: vi.fn(), setRasterQualityPreference: vi.fn(),
}));
const shellCapture = vi.hoisted(() => ({ mapPanel: null as null | {
  onMapSourceChange(sourceId: string): void;
  detail?: import("foss-earth/shell").MapDetailController;
} }));
vi.mock("foss-earth/shell", async importOriginal => {
  const actual = await importOriginal<typeof import("foss-earth/shell")>();
  return {
    ...actual,
    createMapSourcePanel: (options: Parameters<typeof actual.createMapSourcePanel>[0]) => {
      shellCapture.mapPanel = options;
      return actual.createMapSourcePanel(options);
    },
  };
});
vi.mock("./jsbsim/createJsbsimRuntime", () => ({ createJsbsimRuntime: vi.fn(async (options: { aircraftId?: string } = {}) => ({
  sdk: {
    setPropertyValue: vi.fn(),
    getPropertyValue: vi.fn((property: string) => property === "fcs/throttle-cmd-norm"
      ? options.aircraftId === "cirrus-vision-jet" ? 0.35 : 0.65
      : property === "gear/gear-cmd-norm" ? options.aircraftId === "cirrus-vision-jet" ? 0 : 1 : 0),
  }, dispose: vi.fn(),
})) }));
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
  createFlightHudBar: (_container: HTMLElement, options: HudBarClicks) => {
    mocks.hudBarOptions = options;
    return { update: vi.fn(), destroy: vi.fn() };
  },
}));

import { getAppSettings, resetAppSettings, SETTINGS_STORAGE_KEY } from "foss-earth/settings";
import { setMapSourcePreference } from "foss-earth/runtime";
import { createFlightSimApp } from "./createFlightSimApp";
import { createJsbsimRuntime } from "./jsbsim/createJsbsimRuntime";
import { createCollisionDebugOverlay } from "./diagnostics/createCollisionDebugOverlay";
import { createFixedStepPhysicsLoop } from "./physics/fixedStepLoop";
import { createVisibleMeshCollision } from "./physics/visibleMeshCollision";

// Each test is a fresh page: the app registry reads the stubbed storage again.
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); resetAppSettings(); });

const savedSettings = (storage: Map<string, string>): Record<string, unknown> =>
  (JSON.parse(storage.get(SETTINGS_STORAGE_KEY) ?? "{\"values\":{}}") as { values: Record<string, unknown> }).values;

async function openTab(root: HTMLElement, label: string): Promise<void> {
  const launcher = root.querySelector<HTMLButtonElement>('[aria-label="Open right panel"]')
    ?? root.querySelector<HTMLButtonElement>('.foss-earth-tab-strip [aria-label="Open new tab"]')!;
  await act(async () => launcher.click());
  const item = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(button => button.textContent === label)!;
  await act(async () => item.click());
}

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
  const openGroundHandling = async () => {
    await openTab(root, "Aircraft");
    return root.querySelector<HTMLInputElement>('[data-parameter="osfs.ground.arcadeLaunches"] input')!;
  };
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  try {
    const physicsOptions = vi.mocked(createFixedStepPhysicsLoop).mock.calls.at(-1)![2]!;
    const bodyOptions = vi.mocked(createVisibleMeshCollision).mock.calls.at(-1)![2]!;
    expect(physicsOptions.getArcadeGroundLaunches?.()).toBe(false);
    expect(bodyOptions.getRestitution?.()).toBe(0.25);
    const checkbox = await openGroundHandling();
    expect(checkbox.checked).toBe(false);
    await act(async () => checkbox.click());
    expect(checkbox.checked).toBe(true);
    expect(physicsOptions.getArcadeGroundLaunches?.()).toBe(true);
    expect(bodyOptions.getRestitution?.()).toBe(1.35);
    expect(savedSettings(storage)["osfs.ground.arcadeLaunches"]).toBe(true);
  } finally { await act(async () => app.destroy()); }
  resetAppSettings();
  await act(async () => { app = await createFlightSimApp(root); });
  try {
    expect(vi.mocked(createFixedStepPhysicsLoop).mock.calls.at(-1)![2]!.getArcadeGroundLaunches?.()).toBe(true);
  } finally { await act(async () => app.destroy()); }
});

it("keeps autopilot configuration on the Autopilot tab, and has no Settings tab", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  const root = document.createElement("div");
  document.body.append(root);
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  try {
    await openTab(root, "Aircraft");
    expect(root.querySelector('[aria-label="Autopilot backend"]')).toBeNull();
    expect(root.querySelector('[data-parameter="osfs.ground.arcadeLaunches"]')).not.toBeNull();
    const launcher = root.querySelector<HTMLButtonElement>('.foss-earth-tab-strip [aria-label="Open new tab"]')!;
    await act(async () => launcher.click());
    const items = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(items.map(item => item.textContent)).not.toContain("Settings");
    await act(async () => items.find(item => item.textContent === "Autopilot")!.click());
    expect(root.querySelector('[aria-label="Autopilot backend"]')).not.toBeNull();
    expect(root.querySelector('[aria-label="ArduPilot status"]')!.textContent).toMatch(/LOITER/);
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
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyP" }));
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
    expect(mocks.resetLocation).toHaveBeenCalledWith(expect.anything(), { latDeg: 46.7867, lonDeg: -92.1005, altMeters: 1000 }, 250, "cessna-172");
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


function selectionControl<T extends Element>(root: HTMLElement, selector: string): T {
  const control = root.querySelector<T>(selector);
  if (!control) throw new Error("Missing aircraft selection control: " + selector);
  return control;
}

async function changeSelect(root: HTMLElement, selector: string, value: string) {
  const select = selectionControl<HTMLSelectElement>(root, selector);
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function openPanelTab(root: HTMLElement, label: string, initiallyClosed = false) {
  const existing = Array.from(root.querySelectorAll<HTMLButtonElement>(".foss-earth-tab-button"))
    .find(button => button.textContent === label);
  if (existing) {
    await act(async () => existing.click());
    return;
  }
  const launcher = initiallyClosed ? '[aria-label="Open right panel"]' : '[aria-label="Open new tab"]';
  await act(async () => selectionControl<HTMLButtonElement>(root, launcher).click());
  const item = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    .find(button => button.textContent === label);
  if (!item) throw new Error("Missing panel tab: " + label);
  await act(async () => item.click());
}

async function mountAircraftSelection(initial: [string, string][] = []) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const storage = new Map(initial);
  const setItem = vi.fn((key: string, value: string) => { storage.set(key, value); });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem,
    removeItem: vi.fn((key: string) => { storage.delete(key); }),
  });
  const reload = vi.fn();
  const browserWindow = window;
  const location = { href: browserWindow.location.href, search: browserWindow.location.search, reload };
  vi.stubGlobal("window", new Proxy(browserWindow, {
    get(target, property) {
      return property === "location" ? location : Reflect.get(target, property, target);
    },
  }));
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  const root = document.createElement("div");
  document.body.append(root);
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  await openPanelTab(root, "Aircraft", true);
  setItem.mockClear();
  return { root, app, storage, setItem, reload };
}

const generationSelector = ".flight-panel__generation-field select";
const lodSelector = ".flight-panel__model-controls select";
const applySelector = ".flight-panel__aircraft-controls > button";

it("stages all Vision Jet generations and applies a complete package once", async () => {
  const t = await mountAircraftSelection();
  try {
    const radios = Array.from(t.root.querySelectorAll<HTMLInputElement>('input[name="flight-aircraft"]'));
    expect(radios.map(input => input.value)).toEqual(["cessna-172", "cirrus-vision-jet"]);
    expect(t.root.querySelector(generationSelector)).toBeNull();
    await act(async () => radios[1].click());
    expect(Array.from(selectionControl<HTMLSelectElement>(t.root, generationSelector).options, option => option.value).sort())
      .toEqual(["g1", "g2", "g2+", "g3"]);
    for (const generation of ["g1", "g2", "g2+", "g3"]) {
      await changeSelect(t.root, generationSelector, generation);
      expect(selectionControl<HTMLSelectElement>(t.root, generationSelector).value).toBe(generation);
      expect(t.root.textContent).toContain("Currently flying Cessna 172 Skyhawk until you apply.");
      expect(t.setItem).not.toHaveBeenCalled();
      expect(t.reload).not.toHaveBeenCalled();
      expect(mocks.aircraftModel.setPresentation).not.toHaveBeenCalled();
    }
    await changeSelect(t.root, generationSelector, "g2+");
    await act(async () => selectionControl<HTMLInputElement>(t.root, '.flight-panel__model-controls input[type="checkbox"]').click());
    await changeSelect(t.root, lodSelector, "hd");
    await act(async () => selectionControl<HTMLButtonElement>(t.root, applySelector).click());
    // One write of the whole choice, before the reload that activates it.
    expect(t.setItem).toHaveBeenCalledOnce();
    expect(savedSettings(t.storage)).toMatchObject({
      "osfs.aircraft.id": "cirrus-vision-jet-g2", "osfs.aircraft.generation": "g2+",
      "osfs.aircraft.lod": "hd", "osfs.aircraft.optInLods": true,
    });
    expect(t.reload).toHaveBeenCalledOnce();
    expect(t.setItem.mock.invocationCallOrder.at(-1)).toBeLessThan(t.reload.mock.invocationCallOrder[0]);
    expect(mocks.aircraftModel.setAircraft).not.toHaveBeenCalled();
    expect(mocks.aircraftModel.setPresentation).not.toHaveBeenCalled();
    expect(createJsbsimRuntime).toHaveBeenCalledTimes(1);
    await act(async () => selectionControl<HTMLButtonElement>(t.root, applySelector).click());
    expect(t.reload).toHaveBeenCalledOnce();
    expect(t.setItem).toHaveBeenCalledOnce();
  } finally { await act(async () => t.app.destroy()); }
});

it("applies presentation changes once after staging and retains per-family drafts across tabs", async () => {
  const t = await mountAircraftSelection();
  try {
    await changeSelect(t.root, lodSelector, "lod2");
    expect(mocks.aircraftModel.setPresentation).not.toHaveBeenCalled();
    expect(t.setItem).not.toHaveBeenCalled();
    await act(async () => selectionControl<HTMLButtonElement>(t.root, applySelector).click());
    expect(mocks.aircraftModel.setPresentation).toHaveBeenCalledExactlyOnceWith("lod2", false);
    expect(t.reload).not.toHaveBeenCalled();
    expect(selectionControl<HTMLButtonElement>(t.root, applySelector).disabled).toBe(true);

    await act(async () => selectionControl<HTMLInputElement>(t.root, 'input[name="flight-aircraft"][value="cirrus-vision-jet"]').click());
    await changeSelect(t.root, generationSelector, "g3");
    await act(async () => selectionControl<HTMLInputElement>(t.root, '.flight-panel__model-controls input[type="checkbox"]').click());
    await changeSelect(t.root, lodSelector, "hd");
    await act(async () => selectionControl<HTMLInputElement>(t.root, 'input[name="flight-aircraft"][value="cessna-172"]').click());
    expect(t.root.querySelector(generationSelector)).toBeNull();
    expect(t.root.querySelector('.flight-panel__model-controls input[type="checkbox"]')).toBeNull();
    expect(selectionControl<HTMLSelectElement>(t.root, lodSelector).value).toBe("lod2");
    await openPanelTab(t.root, "Weather");
    await openPanelTab(t.root, "Aircraft");
    await act(async () => selectionControl<HTMLInputElement>(t.root, 'input[name="flight-aircraft"][value="cirrus-vision-jet"]').click());
    expect(selectionControl<HTMLSelectElement>(t.root, generationSelector).value).toBe("g3");
    expect(selectionControl<HTMLSelectElement>(t.root, lodSelector).value).toBe("hd");
    expect(selectionControl<HTMLInputElement>(t.root, '.flight-panel__model-controls input[type="checkbox"]').checked).toBe(true);
    expect(mocks.aircraftModel.setPresentation).toHaveBeenCalledTimes(1);
    expect(t.setItem).toHaveBeenCalledOnce();
    await act(async () => selectionControl<HTMLButtonElement>(t.root, ".flight-panel__command--secondary").click());
    expect(selectionControl<HTMLInputElement>(t.root, 'input[name="flight-aircraft"][value="cessna-172"]').checked).toBe(true);
    expect(selectionControl<HTMLSelectElement>(t.root, lodSelector).value).toBe("lod2");
    expect(selectionControl<HTMLButtonElement>(t.root, applySelector).disabled).toBe(true);
  } finally { await act(async () => t.app.destroy()); }
});

it("takes back an aircraft choice that could not be saved, and does not reload", async () => {
  const t = await mountAircraftSelection([["osfs.aircraft", "cessna-172"], ["osfs.aircraft-lod", "lod2"]]);
  try {
    await act(async () => selectionControl<HTMLInputElement>(t.root, 'input[name="flight-aircraft"][value="cirrus-vision-jet"]').click());
    await changeSelect(t.root, generationSelector, "g2+");
    const beforeApply = [...t.storage.entries()];
    t.setItem.mockImplementation((key: string, value: string) => {
      if (key === SETTINGS_STORAGE_KEY) throw new Error("storage unavailable");
      t.storage.set(key, value);
    });
    await act(async () => selectionControl<HTMLButtonElement>(t.root, applySelector).click());
    expect(t.root.querySelector('[role="alert"]')?.textContent).toContain("Could not save your aircraft choice");
    expect([...t.storage.entries()]).toEqual(beforeApply);
    expect(getAppSettings().get("osfs.aircraft.id")).toBe("cessna-172");
    expect(getAppSettings().get("osfs.aircraft.lod")).toBe("lod2");
    expect(t.reload).not.toHaveBeenCalled();
    expect(mocks.aircraftModel.setPresentation).not.toHaveBeenCalled();
    expect(mocks.aircraftModel.setAircraft).not.toHaveBeenCalled();
    await changeSelect(t.root, generationSelector, "g1");
    expect(t.root.querySelector('[role="alert"]')).toBeNull();
  } finally { await act(async () => t.app.destroy()); }
});

it.each([
  ["flight-sim.aircraft", "cirrus-vision-jet", undefined, "g1"],
  ["osfs.aircraft", "cirrus-vision-jet-g2", "g2+", "g2+"],
  ["osfs.aircraft", "cirrus-vision-jet-g3", "g3", "g3"],
] as const)("restores %s=%s with saved generation %s", async (key, aircraftId, savedGeneration, expectedGeneration) => {
  const initial: [string, string][] = [[key, aircraftId]];
  if (savedGeneration !== undefined) initial.push(["osfs.aircraft-generation", savedGeneration]);
  const t = await mountAircraftSelection(initial);
  try {
    expect(selectionControl<HTMLSelectElement>(t.root, generationSelector).value).toBe(expectedGeneration);
    expect(createJsbsimRuntime).toHaveBeenLastCalledWith(expect.objectContaining({ aircraftId }));
    expect(selectionControl<HTMLButtonElement>(t.root, applySelector).disabled).toBe(true);
    expect(t.setItem).not.toHaveBeenCalled();
  } finally { await act(async () => t.app.destroy()); }
});


it("boots a saved SF50 selection with its matching FDM, reset identity and collision probes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("localStorage", { getItem: (key: string) => key === "osfs.aircraft" ? "cirrus-vision-jet" : null, setItem: vi.fn() });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  const root = document.createElement("div"); document.body.append(root);
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  try {
    expect(createJsbsimRuntime).toHaveBeenCalledWith(expect.objectContaining({ aircraftId: "cirrus-vision-jet" }));
    expect(mocks.resetLocation).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), 250, "cirrus-vision-jet");
    const probes = vi.mocked(createVisibleMeshCollision).mock.calls.at(-1)![2]!.bodyProbes!;
    expect(probes).toContainEqual(expect.objectContaining({ name: "left-wing", left: 5.898 }));
    expect(probes).toContainEqual(expect.objectContaining({ name: "right-tail" }));
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

it("puts the Flight minimum on the Map → Detail Google track, saved in the registry, with the waiver beside it", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const values = new Map<string, string>([
    ["osfs.flight-terrain-requirement", "8192"],
    ["osfs.terrain-detail-anchor", "camera"],
  ]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  mocks.runtime.status.mode = "google-tiles";
  mocks.runtime.googleTerrainDetail = { defaultErrorTarget: 20, errorTarget: 20, overrideErrorTarget: null };
  const root = document.createElement("div");
  document.body.append(root);
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  try {
    const settings = getAppSettings();
    // The old keys moved into the registry, and stay for rollback.
    expect(settings.get("osfs.flight.minimum")).toBe(8192);
    expect(settings.get("map.focus.refineFrom")).toBe("camera");
    expect(values.get("osfs.flight-terrain-requirement")).toBe("8192");
    const detail = shellCapture.mapPanel!.detail!;
    const marker = () => detail.getState()!.markers.find(candidate => candidate.id === "osfs.flight.minimum")!;
    expect(marker()).toMatchObject({ kind: "google", value: 8192, draggable: true, requirement: true, hollow: false, onRail: false });

    // Dragging the marker saves the Flight minimum; it is not clamped into the range.
    await act(async () => marker().onChange!(2));
    expect(settings.get("osfs.flight.minimum")).toBe(2);
    expect(savedSettings(values)["osfs.flight.minimum"]).toBe(2);
    expect(marker().value).toBe(2);

    // The waiver is a session switch in Map → Detail: it hollows the marker and is never saved.
    await act(async () => { settings.set("osfs.flight.allowCoarserThisSession", true); });
    expect(marker().hollow).toBe(true);
    expect(savedSettings(values)).not.toHaveProperty("osfs.flight.allowCoarserThisSession");
  } finally {
    await act(async () => app.destroy());
    mocks.runtime.status.mode = "fallback";
  }
  expect(shellCapture.mapPanel!.detail!.getState()?.markers ?? []).toEqual([]);
});

it("uses the Google default refinement around the aircraft when nothing was saved", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  const root = document.createElement("div");
  document.body.append(root);
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  try {
    expect(getAppSettings().inspect("map.focus.refineFrom")).toMatchObject({ value: "focus", provenance: "host-default" });
  } finally { await act(async () => app.destroy()); }
});

it("prepares terrain again only when the ground changes: Google, a 2D basemap, or its elevation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  mocks.runtime.status = { mode: "raster-basemap", terrainSource: { id: "mapterhorn" } } as never;
  const root = document.createElement("div");
  document.body.append(root);
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  // The runtime reports each switch, wherever it was made: the Map tab, Show all parameters or an import.
  const report = (status: { mode: string; terrainSource?: { id: string } }) => act(async () => {
    for (const listener of [...mocks.runtime.statusListeners]) listener(status);
  });
  try {
    const preparations = () => mocks.runtime.prepareTerrain.mock.calls.length;
    const before = preparations();
    // Saving the choice is what switches the map.
    await act(async () => shellCapture.mapPanel!.onMapSourceChange("carto-positron"));
    expect(vi.mocked(setMapSourcePreference)).toHaveBeenCalledWith("carto-positron");
    // One 2D basemap for another changes imagery only.
    await report({ mode: "raster-basemap", terrainSource: { id: "mapterhorn" } });
    expect(preparations()).toBe(before);
    await report({ mode: "google-tiles" });
    expect(preparations()).toBe(before + 1);
    await report({ mode: "fallback" });
    await report({ mode: "google-tiles" });
    expect(preparations()).toBe(before + 1);
    await report({ mode: "raster-basemap", terrainSource: { id: "mapterhorn" } });
    await report({ mode: "raster-basemap", terrainSource: { id: "terrarium" } });
    expect(preparations()).toBe(before + 3);
  } finally {
    await act(async () => app.destroy());
    mocks.runtime.status = { mode: "fallback" } as never;
  }
  expect(mocks.runtime.statusListeners.size).toBe(0);
});

it("holds a low spawn at the flight minimum without saving it, and releases it after departure", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const values = new Map<string, string>([
    ["osfs.world-detail-target", "16384"],
    ["osfs.flight-terrain-requirement", "4096"],
  ]);
  const setItem = vi.fn((key: string, value: string) => { values.set(key, value); });
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  mocks.physics.getFault = () => null;
  mocks.runtime.status.mode = "google-tiles";
  mocks.runtime.googleTerrainDetail = { defaultErrorTarget: 20, errorTarget: 20, overrideErrorTarget: null };
  // The spawn is 50 m above the ground; the flight later reads 750 m.
  mocks.runtime.prepareTerrain.mockImplementation(async () => ({ groundHeightMeters: 250, altitudeMeters: 300 }));
  mocks.runtime.surface.sample.mockImplementation(() => ({ heightMeters: 250 }) as never);
  const root = document.createElement("div");
  document.body.append(root);
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  try {
    // The old target became the saved default; the flight holds 4,096 px on top.
    expect(mocks.runtime.setGoogleTerrainDetailTarget).toHaveBeenCalledWith(16384);
    expect(mocks.runtime.setGoogleTerrainDetailTarget).toHaveBeenLastCalledWith(4096);
    const detail = shellCapture.mapPanel!.detail!;
    expect(detail.getPolicy("google")).toEqual({ kind: "google", finestErrorPx: 4096, coarsestErrorPx: 16384, defaultValue: 16384 });
    expect(values.get("osfs.world-detail-target")).toBe("16384");
    expect(setItem).not.toHaveBeenCalledWith("osfs.world-detail-target", expect.anything());
    // The HUD rail shows the Flight minimum while it holds detail, and why.
    const onRail = () => detail.getState()!.markers.find(marker => marker.id === "osfs.flight.minimum")!.onRail;

    const tick = mocks.runtime.setSimTick.mock.calls.at(-1)?.[0] as (dt: number) => void;
    for (let frame = 0; frame < 5; frame++) tick(0.1);
    expect(mocks.runtime.setGoogleTerrainDetailTarget).toHaveBeenLastCalledWith(4096);
    expect(onRail()).toBe(true);
    for (let frame = 0; frame < 8; frame++) tick(0.1);
    expect(mocks.runtime.setGoogleTerrainDetailTarget).toHaveBeenLastCalledWith(16384);
    expect(onRail()).toBe(false);
  } finally {
    await act(async () => app.destroy());
    mocks.runtime.prepareTerrain.mockImplementation(async (request: { altitudeMeters?: number }) => ({ groundHeightMeters: 250, altitudeMeters: request.altitudeMeters ?? 1774 }));
    mocks.runtime.surface.sample.mockImplementation(() => null);
  }
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
    // Showing, so the next click closes it.
    await act(async () => mocks.hudBarOptions!.onDebugClick());
    expect(root.querySelector(".foss-earth-tab-button")).toBeNull();
  } finally { await act(async () => app.destroy()); }
});

it("toggles the Map, Renderer and Location tabs from their HUD chips", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  const root = document.createElement("div");
  document.body.append(root);
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  const tabs = () => Array.from(root.querySelectorAll(".foss-earth-tab-button"), (button) => button.textContent);
  try {
    await act(async () => mocks.hudBarOptions!.onMapClick());
    expect(tabs()).toEqual(["Map"]);
    expect(root.querySelector('[aria-label="2D basemaps"]')).not.toBeNull();
    await act(async () => mocks.hudBarOptions!.onRendererClick());
    expect(tabs()).toEqual(["Map", "Renderer"]);
    expect(root.querySelector('input[name="foss-earth-renderer"]')).not.toBeNull();
    await act(async () => mocks.hudBarOptions!.onStatusClick());
    expect(tabs()).toEqual(["Map", "Renderer", "Location"]);
    await act(async () => mocks.hudBarOptions!.onStatusClick());
    await act(async () => mocks.hudBarOptions!.onRendererClick());
    expect(tabs()).toEqual(["Map"]);
  } finally { await act(async () => app.destroy()); }
});

it("opens Engine from the HUD indicator as a tab, not an overlay", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  const root = document.createElement("div");
  document.body.append(root);
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  try {
    expect(root.querySelector(".flight-engine__details")).toBeNull();
    await act(async () => root.querySelector<HTMLButtonElement>(".flight-engine__summary")!.click());
    const right = root.querySelector<HTMLElement>('[data-side="right"]')!;
    expect(right.querySelector(".foss-earth-tab-button")?.textContent).toBe("Engine");
    expect(right.dataset.collapsed).toBe("false");
    expect(right.querySelector(".flight-engine__details")).not.toBeNull();
    expect(root.querySelector(".flight-eval .flight-engine__details")).toBeNull();
    await act(async () => right.querySelector<HTMLButtonElement>(".foss-earth-tab-button")!.click());
    expect(right.dataset.collapsed).toBe("true");
    await act(async () => root.querySelector<HTMLButtonElement>(".flight-engine__summary")!.click());
    expect(right.dataset.collapsed).toBe("false");
    expect(right.querySelector(".flight-engine__details")).not.toBeNull();
  } finally { await act(async () => app.destroy()); }
});

it("keeps flight recording in Logging, off until started, and warns before closing the tab", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  const root = document.createElement("div");
  document.body.append(root);
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  try {
    expect(root.querySelector(".flight-eval__recorder")).toBeNull();
    await openPanelTab(root, "Logging", true);
    expect(root.querySelector(".foss-earth-tab-button")?.textContent).toBe("Logging");
    expect(root.textContent).toContain("Idle");
    await act(async () => root.querySelector<HTMLButtonElement>('[aria-label="Start recording"]')!.click());
    expect(root.textContent).toContain("Recording");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await act(async () => root.querySelector<HTMLButtonElement>('[aria-label="Close Logging tab"]')!.click());
    expect(confirm).toHaveBeenCalledOnce();
    expect(root.querySelector(".foss-earth-tab-button")?.textContent).toBe("Logging");
    confirm.mockReturnValue(true);
    await act(async () => root.querySelector<HTMLButtonElement>('[aria-label="Close Logging tab"]')!.click());
    expect(root.querySelector(".foss-earth-tab-button")).toBeNull();
  } finally { await act(async () => app.destroy()); }
});
