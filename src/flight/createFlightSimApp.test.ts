// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

type HudBarClicks = Pick<import("./hud/createFlightHudBar").FlightHudBarOptions,
  "onDebugClick" | "onMapClick" | "onRendererClick" | "onStatusClick" | "onPausedChange">;

const mocks = vi.hoisted(() => {
  const state = { latDeg: 1, lonDeg: 2, altMeters: 1000, headingRad: 0,
    northVelocityFps: 100, eastVelocityFps: 20, verticalSpeedFps: 5,
    rollRad: 0, pitchRad: 0, airspeedKts: 120, throttleNorm: 0.65 };
  const meshSnapshot = { roots: [], enabled: false, error: null };
  return {
    state,
    meshInspector: {
      setRoots: vi.fn(), setEnabled: vi.fn(), setSelected: vi.fn(), selectAll: vi.fn(), dispose: vi.fn(),
      getSnapshot: () => meshSnapshot, subscribe: () => () => {},
    },
    resetLocation: vi.fn(() => state),
    worldRoot: { setEnabled: vi.fn() },
    applyOrigin: vi.fn(),
    originEcef: { x: 1, y: 2, z: 3 },
    unregisterFocusPoint: vi.fn(),
    unsubscribeDetailLog: vi.fn(),
    runtime: {
      renderer: { mode: "webgl2" }, status: { mode: "fallback" }, scene: {},
      engine: { getFps: () => 60 }, geospatialCamera: null,
      prepareTerrain: vi.fn(async (request: { altitudeMeters?: number }) => ({ groundHeightMeters: 250, altitudeMeters: request.altitudeMeters ?? 1774 })),
      surface: { sample: vi.fn(() => null) },
      getWorldRoot: () => mocks.worldRoot, setSimViewState: vi.fn(), setSimTick: vi.fn(),
      registerFocusPoint: vi.fn<(point: { id: string; label: string; getPosition: () => unknown }) => () => void>(() => mocks.unregisterFocusPoint),
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
      onDetailAdjusted: vi.fn<import("foss-earth/runtime").BabylonRuntime["onDetailAdjusted"]>(() => mocks.unsubscribeDetailLog),
      getRasterDetailFeedback: vi.fn(() => null),
      setRasterDetailTarget: vi.fn(),
      setGoogleTerrainDetailTarget: vi.fn((errorTarget: number | null) => {
        mocks.runtime.googleTerrainDetail.errorTarget = errorTarget ?? mocks.runtime.googleTerrainDetail.defaultErrorTarget;
        mocks.runtime.googleTerrainDetail.overrideErrorTarget = errorTarget;
      }),
      setSimRunning: vi.fn(), requestRender: vi.fn(), setMapSource: vi.fn(), setTerrainSource: vi.fn(), destroy: vi.fn(),
    },
    collisionOverlay: { setEnabled: vi.fn(), update: vi.fn(), dispose: vi.fn() },
    forcesOverlay: { setSettings: vi.fn(), update: vi.fn(), dispose: vi.fn() },
    wheelOverlay: { setEnabled: vi.fn(), update: vi.fn(), dispose: vi.fn() },
    wheelSpin: { step: vi.fn(), reset: vi.fn(), getStates: () => [] },
    tireAudio: { setEnabled: vi.fn(), setPaused: vi.fn(), setVolume: vi.fn(), update: vi.fn(), dispose: vi.fn(), getStatus: () => null },
    aircraft: {
      root: {},
      setViewMode: vi.fn(), toggleViewMode: vi.fn(), getViewMode: () => "third",
      setNearClipMeters: vi.fn(),
      orbitChaseCamera: vi.fn(), zoomChaseCamera: vi.fn(), dispose: vi.fn(),
      modelRoot: {}, setModelLoaded: vi.fn(), getChaseDistanceMeters: () => 14,
      thirdPersonCamera: { position: { y: 2.2, length: () => Math.hypot(2.2, 14) } },
      firstPersonCamera: { id: "cockpit-camera" },
    },
    aircraftModel: {
      root: {},
      getState: () => ({
        aircraftId: "cessna-172", lodId: "auto", activeLodId: "lod3",
        status: "ready", triangles: 876, error: null,
      }),
      getRig: () => mocks.rig,
      setAircraft: vi.fn(), setLod: vi.fn(), setRenderStowedGear: vi.fn(), updateGearVisibility: vi.fn(), refreshAutoLod: vi.fn(), dispose: vi.fn(),
    },
    rig: { parts: [], propeller: null, propellerAngleRad: 0, bound: [], getNode: () => null },
    surfaceState: { elevatorRad: 0.1, gearDownNorm: 1 },
    readControlSurfaceState: vi.fn(),
    engineVisualValues: new Map<string, number>(),
    externalTankAttached: new Map([[2, true], [3, true]]),
    externalTanks: {
      ready: Promise.resolve(), sync: vi.fn(), jettison: vi.fn(), update: vi.fn(),
      setLifetimeSeconds: vi.fn(), setMaxDetachedTanks: vi.fn(), resetDetached: vi.fn(), dispose: vi.fn(),
    },
    useRealFlightHud: false,
    flightHud: { update: vi.fn(), destroy: vi.fn(), refreshVtolConversion: vi.fn(), refreshFlaps: vi.fn() },
    applyAircraftRig: vi.fn(),
    terrainContact: { reset: vi.fn(), update: vi.fn(() => true) },
    visibleMeshCollision: { reset: vi.fn(), update: vi.fn(() => false) },
    physics: { reset: vi.fn(), setPaused: vi.fn(), update: vi.fn((_delta, applyInputs) => { applyInputs(); return state; }), getLatestState: () => state, getFault: () => null },
    hudBarOptions: null as HudBarClicks | null,
  };
});
vi.mock("foss-earth/runtime", () => ({
  // The runtime's profiling session is real: off, it attaches nothing to the scene.
  createBabylonRuntime: async () => {
    const { createFrameProfileSession } = await import("foss-earth/perf");
    // Every scene observable the profiler attaches to, never notified.
    const scene = new Proxy({}, { get: () => ({ add: () => null, remove: () => true }) });
    return Object.assign(mocks.runtime, { frameProfile: createFrameProfileSession({ scene: scene as never, engine: { getCaps: () => ({}) } as never }) });
  },
  RASTER_BASE_MAP_SOURCES: [], TERRAIN_SOURCES: [], resolveTerrainSource: vi.fn(), resolveRasterBaseMapSource: vi.fn(), resolveMapRuntimeConfig: () => ({}), applyRendererChoice: vi.fn(), setMapSourcePreference: vi.fn(), setTerrainSourcePreference: vi.fn(),
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
    createPropertyBatch: vi.fn((paths: readonly string[]) => ({
      read: vi.fn((target = new Float64Array(paths.length)) => {
        paths.forEach((path, index) => { target[index] = mocks.engineVisualValues.get(path) ?? Number.NaN; });
        return target;
      }),
      dispose: vi.fn(),
    })),
    setPropertyValue: vi.fn(),
    getPropertyValue: vi.fn((property: string) => property === "fcs/throttle-cmd-norm"
      ? options.aircraftId === "cirrus-vision-jet" ? 0.35 : 0.65
      : property === "gear/gear-cmd-norm" ? options.aircraftId === "cirrus-vision-jet" ? 0 : 1
        // The engine runs, as a flight starts: an engine that is off holds the throttle at idle.
        : property.endsWith("/set-running") ? 1 : 0),
  }, dispose: vi.fn(),
})) }));
vi.mock("./bridge/ecefBridge", () => ({ readFlightState: () => mocks.state }));
vi.mock("./bridge/floatingOrigin", () => ({ createFloatingOrigin: () => ({ aircraftRoot: { setEnabled: vi.fn() }, apply: mocks.applyOrigin, getOriginEcef: () => mocks.originEcef, getWorldFromEcef: () => null, dispose: vi.fn() }) }));
vi.mock("./aircraft/createPlaceholderAircraft", () => ({ createPlaceholderAircraft: () => mocks.aircraft }));
vi.mock("./diagnostics/createCollisionDebugOverlay", () => ({ createCollisionDebugOverlay: vi.fn(() => mocks.collisionOverlay) }));
vi.mock("./diagnostics/createForcesDebugOverlay", () => ({ createForcesDebugOverlay: vi.fn(() => mocks.forcesOverlay) }));
vi.mock("./diagnostics/createWheelSpinDebugOverlay", () => ({ createWheelSpinDebugOverlay: vi.fn(() => mocks.wheelOverlay) }));
vi.mock("./physics/createWheelSpinExperiment", () => ({ createWheelSpinExperiment: () => mocks.wheelSpin }));
vi.mock("./audio/createTireAudio", () => ({ createTireAudio: () => mocks.tireAudio }));
vi.mock("./audio/createFlightAudio", async importOriginal => {
  const actual = await importOriginal<typeof import("./audio/createFlightAudio")>();
  return { ...actual, createFlightAudio: vi.fn(actual.createFlightAudio) };
});
vi.mock("./audio/jsbsimAudioAdapter", async importOriginal => {
  const actual = await importOriginal<typeof import("./audio/jsbsimAudioAdapter")>();
  return { ...actual, createJsbsimAudioAdapter: vi.fn(actual.createJsbsimAudioAdapter) };
});
vi.mock("./aircraft/createAircraftModel", () => ({ createAircraftModel: vi.fn(() => mocks.aircraftModel) }));
vi.mock("foss-earth/diagnostics", async importOriginal => ({
  ...await importOriginal<typeof import("foss-earth/diagnostics")>(),
  createMeshInspector: vi.fn(() => mocks.meshInspector),
}));
vi.mock("./aircraft/createExternalTankVisuals", () => ({ createExternalTankVisuals: vi.fn(() => mocks.externalTanks) }));
vi.mock("./jsbsim/externalFuelTanks", () => ({
  readExternalFuelTanks: (_sdk: unknown, aircraftId: string) => aircraftId === "f-35b"
    ? [...mocks.externalTankAttached].map(([index, attached]) => ({ index, attached })) : [],
  setExternalFuelTankAttached: vi.fn((_sdk: unknown, _aircraftId: string, index: number, attached: boolean) => {
    if (mocks.externalTankAttached.get(index) === attached) return false;
    mocks.externalTankAttached.set(index, attached);
    return true;
  }),
}));
vi.mock("./aircraft/aircraftAnimation", () => ({
  applyAircraftRig: mocks.applyAircraftRig,
  readControlSurfaceState: (...args: unknown[]) => { mocks.readControlSurfaceState(...args); return mocks.surfaceState; },
}));
vi.mock("./physics/fixedStepLoop", () => ({ FIXED_DT: 1 / 120, createFixedStepPhysicsLoop: vi.fn(() => mocks.physics) }));
vi.mock("./physics/terrainContact", () => ({ createTerrainContact: () => mocks.terrainContact }));
vi.mock("./physics/visibleMeshCollision", () => ({ createVisibleMeshCollision: vi.fn(() => mocks.visibleMeshCollision) }));
vi.mock("./hud/flightHud", async importOriginal => {
  const actual = await importOriginal<typeof import("./hud/flightHud")>();
  return { ...actual, createFlightHud: (root: HTMLElement, options: import("./hud/flightHud").FlightHudOptions) =>
    mocks.useRealFlightHud ? actual.createFlightHud(root, options) : mocks.flightHud };
});
vi.mock("./jsbsim/resetFlightLocation", () => ({ resetFlightLocation: mocks.resetLocation }));
// The mocked simulator cannot be captured or reinitialised; these two stand in for it.
vi.mock("./jsbsim/savedFlight", async importOriginal => {
  const actual = await importOriginal<typeof import("./jsbsim/savedFlight")>();
  return { ...actual, captureSavedFlight: vi.fn(() => null), restoreSavedFlight: vi.fn(() => mocks.state) };
});
vi.mock("./hud/createFlightHudBar", () => ({
  createFlightHudBar: (_container: HTMLElement, options: HudBarClicks) => {
    mocks.hudBarOptions = options;
    return { update: vi.fn(), destroy: vi.fn(), mountInputMethod: () => () => {} };
  },
}));

import type { FrameProfileSession } from "foss-earth/perf";
import { getAppSettings, resetAppSettings, SETTINGS_STORAGE_KEY } from "foss-earth/settings";
import { setMapSourcePreference } from "foss-earth/runtime";
import { createFlightSimApp } from "./createFlightSimApp";
import { createAircraftModel } from "./aircraft/createAircraftModel";
import { createJsbsimRuntime } from "./jsbsim/createJsbsimRuntime";
import { createExternalTankVisuals } from "./aircraft/createExternalTankVisuals";
import * as fuelTanks from "./jsbsim/fuelTanks";
import { setExternalFuelTankAttached } from "./jsbsim/externalFuelTanks";
import { createCollisionDebugOverlay } from "./diagnostics/createCollisionDebugOverlay";
import { createForcesDebugOverlay } from "./diagnostics/createForcesDebugOverlay";
import { createFixedStepPhysicsLoop } from "./physics/fixedStepLoop";
import { createVisibleMeshCollision } from "./physics/visibleMeshCollision";
import { createJsbsimAudioAdapter } from "./audio/jsbsimAudioAdapter";
import { createFlightAudio } from "./audio/createFlightAudio";
import { captureSavedFlight, restoreSavedFlight, SAVED_FLIGHT_STORAGE_KEY, type SavedFlight } from "./jsbsim/savedFlight";

// Each test is a fresh page: the app registry reads the stubbed storage again.
afterEach(() => { mocks.useRealFlightHud = false; mocks.engineVisualValues.clear(); mocks.externalTankAttached.set(2, true); mocks.externalTankAttached.set(3, true); mocks.physics.getFault = () => null; vi.clearAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); resetAppSettings(); });

const savedSettings = (storage: Map<string, string>): Record<string, unknown> =>
  (JSON.parse(storage.get(SETTINGS_STORAGE_KEY) ?? "{\"values\":{}}") as { values: Record<string, unknown> }).values;

async function openTab(root: HTMLElement, label: string): Promise<void> {
  const launcher = root.querySelector<HTMLButtonElement>('[aria-label="Open right panel"]')
    ?? root.querySelector<HTMLButtonElement>('.foss-earth-tab-strip [aria-label="Open new tab"]')!;
  await act(async () => launcher.click());
  const item = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(button => button.textContent === label)!;
  await act(async () => item.click());
}

it("logs automatic map detail changes with their frame-time reason and disconnects on teardown", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  const root = document.createElement("div"); document.body.append(root);
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  try {
    expect(mocks.runtime.onDetailAdjusted).toHaveBeenCalledOnce();
    const adjusted = mocks.runtime.onDetailAdjusted.mock.calls[0][0];
    adjusted({ at: 0, from: 0, to: 0.25, meanFrameMs: 23.14, goalMs: 16.7 });
    adjusted({ at: 1, from: 0.25, to: 0, meanFrameMs: 16.7, goalMs: 16.7 });
    expect(document.body.textContent).toContain("Map detail coarsened 0.25 levels to hold the frame time: frames averaged 23.1 ms against a 16.7 ms goal.");
    expect(document.body.textContent).toContain("Map detail returned 0.25 levels toward what you asked for");
    adjusted({ at: 2, from: 0.5, to: 0, reason: "settings", meanFrameMs: 23.14, goalMs: 16.7 });
    expect(document.body.textContent).toContain("Map detail returned 0.5 levels toward what you asked for: automatic-adjustment settings changed.");
  } finally { await act(async () => app.destroy()); }
  expect(mocks.unsubscribeDetailLog).toHaveBeenCalledOnce();
});

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

it("keeps autopilot configuration on the Autopilot tab, and only presets and the saved record in Settings", async () => {
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
    await openTab(root, "Autopilot");
    expect(root.querySelector('[aria-label="Autopilot backend"]')).not.toBeNull();
    expect(root.querySelector('[aria-label="ArduPilot status"]')!.textContent).toMatch(/LOITER/);

    const sectionTitles = () => [...root.querySelectorAll(".foss-earth-panel-section__title")].map(title => title.textContent);
    await openTab(root, "Settings");
    expect(sectionTitles()).toEqual(["Presets", "Saved settings"]);
    // The flight's presets are listed beside FOSS Earth's.
    expect(root.querySelector('[data-preset="osfs-low-and-slow"]')).not.toBeNull();
    expect(root.querySelector('[data-preset="sharpest"]')).not.toBeNull();
    await openTab(root, "Interface");
    expect(sectionTitles()).toEqual([getAppSettings().getSectionTitle("interface", "log"), getAppSettings().getSectionTitle("interface", "search")]);
    expect(root.querySelector('[data-parameter="interface.log.maxLines"]')).not.toBeNull();
    await openTab(root, "Debug");
    expect(root.textContent).not.toContain("Saved settings");
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

describe("0SFS render demand", () => {
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

it("connects external tank fuel controls to separation, respawn and simulation time", async () => {
  const readTanks = vi.spyOn(fuelTanks, "readFuelTanks").mockImplementation(() => [0, 1, 2, 3].map(index => ({
    index, capacityLbs: index < 2 ? 6550 : 2991, contentsLbs: index < 2 ? 2500 : 0,
    xIn: 368.52, yIn: [40, -40, 127.952756, -127.952756][index]!, densityLbsPerGal: 6.7,
    ...(index < 2 ? {} : { attached: mocks.externalTankAttached.get(index)!,
      attachmentProperty: `stores/external-tank[${index - 2}]/attached` }),
  })));
  const t = await mountAircraftSelection([["osfs.aircraft", "f-35b"]]);
  try {
    expect(createExternalTankVisuals).toHaveBeenCalledWith(mocks.runtime.scene, mocks.aircraft.modelRoot,
      expect.arrayContaining([expect.objectContaining({ index: 2 }), expect.objectContaining({ index: 3 })]),
      expect.objectContaining({ lifetimeSeconds: 15, maxDetachedTanks: 2 }));
    await openPanelTab(t.root, "Fuel");
    await act(async () => selectionControl<HTMLButtonElement>(t.root, '[aria-label="Jettison left external tank"]').click());
    expect(setExternalFuelTankAttached).toHaveBeenLastCalledWith(expect.anything(), "f-35b", 3, false);
    expect(mocks.externalTanks.jettison).toHaveBeenLastCalledWith(3, expect.objectContaining({
      x: 6.096, y: 1.524, z: -30.48,
    }));
    expect(mocks.externalTanks.sync).toHaveBeenLastCalledWith([
      { index: 2, attached: true }, { index: 3, attached: false },
    ]);
    await act(async () => selectionControl<HTMLButtonElement>(t.root, '[aria-label="Respawn left external tank"]').click());
    expect(setExternalFuelTankAttached).toHaveBeenLastCalledWith(expect.anything(), "f-35b", 3, true);
    expect(mocks.externalTanks.jettison).toHaveBeenCalledTimes(1);
    const tick = mocks.runtime.setSimTick.mock.calls.at(-1)![0] as (dt: number) => void;
    await act(async () => tick(1 / 60));
    // This test simulator accepted no physics steps: a frame alone cannot age released tanks.
    expect(mocks.externalTanks.update).toHaveBeenLastCalledWith(0);
    const afterStep = vi.mocked(createFixedStepPhysicsLoop).mock.calls.at(-1)![1]!;
    afterStep(mocks.state); afterStep(mocks.state);
    await act(async () => tick(1 / 60));
    expect(mocks.externalTanks.update).toHaveBeenLastCalledWith(1 / 60);
    await act(async () => {
      getAppSettings().set("osfs.externalTanks.debrisLifetimeSeconds", 3);
      getAppSettings().set("osfs.externalTanks.maxDetachedTanks", 0);
    });
    expect(mocks.externalTanks.setLifetimeSeconds).toHaveBeenLastCalledWith(3);
    expect(mocks.externalTanks.setMaxDetachedTanks).toHaveBeenLastCalledWith(0);
    await openPanelTab(t.root, "Location");
    let failTerrain!: (error: Error) => void;
    mocks.runtime.prepareTerrain.mockImplementationOnce(() => new Promise((_resolve, reject) => { failTerrain = reject; }));
    mocks.applyOrigin.mockClear();
    mocks.externalTanks.resetDetached.mockClear();
    const locationInput = t.root.querySelector<HTMLInputElement>('.foss-earth-location-panel input[type="number"]')!;
    await act(async () => locationInput.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.externalTanks.resetDetached).toHaveBeenCalledOnce();
    expect(mocks.externalTanks.resetDetached.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.applyOrigin.mock.invocationCallOrder[0]!);
    await act(async () => failTerrain(new Error("Destination unavailable")));
    expect(mocks.externalTanks.resetDetached).toHaveBeenCalledOnce();
  } finally {
    await act(async () => t.app.destroy());
    readTanks.mockRestore();
  }
  expect(mocks.externalTanks.dispose).toHaveBeenCalledTimes(1);
});

it("stages all Vision Jet generations and applies a complete package once", async () => {
  const t = await mountAircraftSelection();
  try {
    const radios = Array.from(t.root.querySelectorAll<HTMLInputElement>('input[name="flight-aircraft"]'));
    expect(radios.map(input => input.value)).toEqual(["cessna-172", "cirrus-vision-jet", "f-35b"]);
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
      expect(mocks.aircraftModel.setLod).not.toHaveBeenCalled();
    }
    await changeSelect(t.root, generationSelector, "g2+");
    await changeSelect(t.root, lodSelector, "hd");
    await act(async () => selectionControl<HTMLButtonElement>(t.root, applySelector).click());
    // One write of the whole choice, before the reload that activates it.
    expect(t.setItem).toHaveBeenCalledOnce();
    expect(savedSettings(t.storage)).toMatchObject({
      "osfs.aircraft.id": "cirrus-vision-jet-g2", "osfs.aircraft.generation": "g2+",
      "osfs.aircraft.lod": "hd",
    });
    expect(t.reload).toHaveBeenCalledOnce();
    expect(t.setItem.mock.invocationCallOrder.at(-1)).toBeLessThan(t.reload.mock.invocationCallOrder[0]);
    expect(mocks.aircraftModel.setAircraft).not.toHaveBeenCalled();
    expect(mocks.aircraftModel.setLod).not.toHaveBeenCalled();
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
    expect(mocks.aircraftModel.setLod).not.toHaveBeenCalled();
    expect(t.setItem).not.toHaveBeenCalled();
    await act(async () => selectionControl<HTMLButtonElement>(t.root, applySelector).click());
    expect(mocks.aircraftModel.setLod).toHaveBeenCalledExactlyOnceWith("lod2");
    expect(t.reload).not.toHaveBeenCalled();
    expect(selectionControl<HTMLButtonElement>(t.root, applySelector).disabled).toBe(true);

    await act(async () => selectionControl<HTMLInputElement>(t.root, 'input[name="flight-aircraft"][value="cirrus-vision-jet"]').click());
    await changeSelect(t.root, generationSelector, "g3");
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
    expect(mocks.aircraftModel.setLod).toHaveBeenCalledTimes(1);
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
    expect(mocks.aircraftModel.setLod).not.toHaveBeenCalled();
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


it("supplies the true cockpit camera to audio even while chase is the active view", async () => {
  const t = await mountAircraftSelection([["osfs.aircraft", "f-35b"]]);
  const scene = mocks.runtime.scene as { activeCamera?: unknown };
  const previous = scene.activeCamera;
  try {
    const audio = vi.mocked(createFlightAudio).mock.results.at(-1)!.value;
    vi.spyOn(audio, "isEngineActive").mockReturnValue(true);
    const updateView = vi.spyOn(audio, "updateView");
    scene.activeCamera = mocks.aircraft.thirdPersonCamera;
    const tick = mocks.runtime.setSimTick.mock.calls.at(-1)![0] as (dt: number) => void;
    tick(1 / 60);
    expect(updateView).toHaveBeenLastCalledWith(expect.objectContaining({
      camera: mocks.aircraft.thirdPersonCamera,
      cockpitCamera: mocks.aircraft.firstPersonCamera,
      aircraftRoot: mocks.aircraft.root,
      exterior: 1,
    }));
  } finally { scene.activeCamera = previous; await act(async () => t.app.destroy()); }
});

it("observes native engine visuals with sound off and releases its model-bound reader", async () => {
  mocks.useRealFlightHud = true;
  const canvas = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    new Proxy({}, { get: () => () => undefined }) as unknown as CanvasRenderingContext2D,
  );
  const t = await mountAircraftSelection([[SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, values: {
    "osfs.aircraft.id": "f-35b", "osfs.sound.enabled": false,
  } })]]);
  const runtime = await vi.mocked(createJsbsimRuntime).mock.results.at(-1)!.value;
  const createBatch = vi.mocked(runtime.sdk.createPropertyBatch);
  const batch = createBatch.mock.results.at(-1)!.value;
  try {
    expect(createBatch).toHaveBeenCalledWith([
      "propulsion/engine[0]/augmentation", "propulsion/engine[0]/nozzle-pos-norm",
      "propulsion/engine[0]/n2", "propulsion/engine[0]/fuel-flow-rate-pps",
      "propulsion/engine[0]/thermal/afterburner-burned-fuel-flow-kg-sec",
      "propulsion/engine[0]/thermal/metal-temperature-k", "propulsion/engine[0]/thermal/initialized",
      "propulsion/engine[0]/thermal/valid", "propulsion/engine[0]/thermal/core/metal-temperature-k",
      "propulsion/engine[0]/thermal/core/initialized", "propulsion/engine[0]/thermal/nozzle-gas-temperature-k", "propulsion/engine[0]/egt-degc", "simulation/sim-time-sec",
      "atmosphere/T-R", "atmosphere/P-psf",
    ], { create: false });
    const tick = mocks.runtime.setSimTick.mock.calls.at(-1)![0] as (dt: number) => void;
    const output = t.root.querySelector<HTMLOutputElement>('[data-output="throttle"]')!;
    const lever = output.closest<HTMLElement>(".flight-hud__slider-control")!;
    const audio = vi.mocked(createFlightAudio).mock.results.at(-1)!.value;
    expect(audio.isEngineActive()).toBe(false);
    mocks.engineVisualValues.set("propulsion/engine[0]/nozzle-pos-norm", 0.72);
    for (const [observed, active] of [[0, false], [1, true], [Number.NaN, false], [0, false]] as const) {
      mocks.engineVisualValues.set("propulsion/engine[0]/augmentation", observed);
      tick(1 / 60);
      expect(output.value.endsWith(active ? "🔥" : "%")).toBe(true);
      expect(lever.dataset.afterburner).toBe(active ? "active" : "inactive");
      expect(mocks.readControlSurfaceState).toHaveBeenLastCalledWith(runtime.sdk, "f-35b", { nozzlePositionNorm: 0.72 });
    }
    expect(createBatch).toHaveBeenCalledOnce();
    expect(batch.read).toHaveBeenCalledTimes(4);
    expect(runtime.sdk.setPropertyValue).not.toHaveBeenCalledWith("propulsion/engine[0]/augmentation", expect.anything());
    expect(runtime.sdk.setPropertyValue).not.toHaveBeenCalledWith("propulsion/engine[0]/nozzle-pos-norm", expect.anything());
    expect(runtime.sdk.setPropertyValue).not.toHaveBeenCalledWith("propulsion/engine[0]/egt-degc", expect.anything());
  } finally { await act(async () => t.app.destroy()); canvas.mockRestore(); }
  expect(batch.dispose).toHaveBeenCalledOnce();
});

it("boots an F-35B with a VTOL lever beside THR and routes its registry command to the FDM", async () => {
  mocks.useRealFlightHud = true;
  const canvas = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    new Proxy({}, { get: () => () => undefined }) as unknown as CanvasRenderingContext2D,
  );
  const t = await mountAircraftSelection([["osfs.aircraft", "f-35b"]]);
  try {
    expect(createJsbsimRuntime).toHaveBeenLastCalledWith(expect.objectContaining({
      aircraftId: "f-35b", bootstrap: expect.objectContaining({ airspeedKts: 300 }),
    }));
    expect(createJsbsimAudioAdapter).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      gearHeightMetres: 1.267,
      source: expect.objectContaining({
        definition: expect.objectContaining({ id: "f135-approximation" }),
        installation: expect.objectContaining({ engineIndex: 0, engineDefinitionId: "f135-approximation" }),
      }),
    }));
    expect(t.root.textContent).toContain("Lockheed Martin F-35B Lightning II");
    const conversion = t.root.querySelector<HTMLInputElement>('[data-control="vtol-conversion"]')!;
    expect(conversion.closest("label")?.previousElementSibling?.querySelector('[data-control="throttle"]')).not.toBeNull();
    await act(async () => {
      conversion.value = "0.75";
      conversion.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(getAppSettings().get("osfs.aircraft.stovlConversion")).toBe(0.75);
    expect(t.root.querySelector<HTMLOutputElement>('[data-output="vtol-conversion"]')?.value).toBe("75%");
    await openPanelTab(t.root, "Controls");
    const section = t.root.querySelector<HTMLElement>('[data-settings-section="controls/stovl"]')!;
    expect(section.querySelector('input[type="range"]')).toBeNull();
    expect(section.textContent).toContain("Use the VTOL lever beside THR");
    const showAll = section.querySelector<HTMLInputElement>('input[name^="foss-earth-show-all"]')!;
    await act(async () => {
      showAll.checked = true;
      showAll.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(section.textContent).toContain("STOVL conversion");
    const runtime = await vi.mocked(createJsbsimRuntime).mock.results.at(-1)!.value;
    const tick = mocks.runtime.setSimTick.mock.calls.at(-1)?.[0] as (dt: number) => void;
    tick(1 / 60);
    expect(runtime.sdk.setPropertyValue).toHaveBeenCalledWith("fcs/stovl-cmd-norm", 0.75);
    expect(runtime.sdk.setPropertyValue).not.toHaveBeenCalledWith("fcs/stovl-pos-norm", expect.anything());
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP" }));
      getAppSettings().set("osfs.aircraft.stovlConversion", 0.4);
    });
    expect(conversion.value).toBe("0.4");
    expect(savedSettings(t.storage)).toMatchObject({ "osfs.aircraft.stovlConversion": 0.4 });
    expect(mocks.runtime.requestRender).toHaveBeenCalled();
    await openPanelTab(t.root, "Location");
    const locationInput = t.root.querySelector<HTMLInputElement>('.foss-earth-location-panel input[type="number"]')!;
    await act(async () => locationInput.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.resetLocation).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), 250, "f-35b");
    expect(getAppSettings().get("osfs.aircraft.stovlConversion")).toBe(0.4);
    expect(conversion.value).toBe("0.4");
  } finally { await act(async () => t.app.destroy()); canvas.mockRestore(); }
});

it.each(["cessna-172", "cirrus-vision-jet"])("omits the quick VTOL lever for %s", async aircraftId => {
  mocks.useRealFlightHud = true;
  const canvas = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    new Proxy({}, { get: () => () => undefined }) as unknown as CanvasRenderingContext2D,
  );
  const t = await mountAircraftSelection([["osfs.aircraft", aircraftId]]);
  try {
    expect(t.root.querySelector('[data-control="vtol-conversion"]')).toBeNull();
    expect(t.root.querySelector('[data-control="throttle"]')).not.toBeNull();
    expect(t.root.querySelector('[data-parameter="osfs.aircraft.controlLaw"]')).toBeNull();
    const runtime = await vi.mocked(createJsbsimRuntime).mock.results.at(-1)!.value;
    expect(runtime.sdk.setPropertyValue).not.toHaveBeenCalledWith("fcs/control-law-mode", expect.anything());
  } finally { await act(async () => t.app.destroy()); canvas.mockRestore(); }
});

it("preserves focused manual flap edits while paused and waits for a native step", async () => {
  mocks.useRealFlightHud = true;
  const canvas = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    new Proxy({}, { get: () => () => undefined }) as unknown as CanvasRenderingContext2D,
  );
  const t = await mountAircraftSelection();
  try {
    const runtime = await vi.mocked(createJsbsimRuntime).mock.results.at(-1)!.value;
    const tick = mocks.runtime.setSimTick.mock.calls.at(-1)![0] as (dt: number) => void;
    const slider = t.root.querySelector<HTMLInputElement>('[data-control="flaps"]')!;
    const output = t.root.querySelector<HTMLOutputElement>('[data-output="flaps"]')!;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP" }));
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyP" }));
    slider.focus();
    vi.mocked(runtime.sdk.setPropertyValue).mockClear();
    for (const value of [0.01, 0.02]) {
      await act(async () => {
        slider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        slider.value = String(value);
        slider.dispatchEvent(new Event("input", { bubbles: true }));
      });
      tick(1 / 60);
      expect(slider.value).toBe(String(value));
      expect(output.value).toBe("0%");
      expect(getAppSettings().get("osfs.assist.autoFlaps")).toBe(false);
    }
    expect(runtime.sdk.setPropertyValue).not.toHaveBeenCalledWith("fcs/flap-cmd-norm", expect.anything());
  } finally { await act(async () => t.app.destroy()); canvas.mockRestore(); }
});

it("takes Auto flaps off for a fresh paused retract key even when the current flap command is already zero", async () => {
  const t = await mountAircraftSelection();
  try {
    const tick = mocks.runtime.setSimTick.mock.calls.at(-1)![0] as (dt: number) => void;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP" }));
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyP" }));
    expect(getAppSettings().get("osfs.assist.autoFlaps")).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyR" }));
    tick(1 / 60);
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyR" }));
    expect(getAppSettings().get("osfs.assist.autoFlaps")).toBe(false);
  } finally { await act(async () => t.app.destroy()); }
});

it.each(["cessna-172", "cirrus-vision-jet", "f-35b"])("defaults Auto flaps on for %s and displays observed travel with manual takeover", async aircraftId => {
  mocks.useRealFlightHud = true;
  const canvas = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    new Proxy({}, { get: () => () => undefined }) as unknown as CanvasRenderingContext2D,
  );
  const t = await mountAircraftSelection([["osfs.aircraft", aircraftId]]);
  try {
    await act(async () => mocks.hudBarOptions!.onPausedChange(false));
    const runtime = await vi.mocked(createJsbsimRuntime).mock.results.at(-1)!.value;
    const previousRead = vi.mocked(runtime.sdk.getPropertyValue).getMockImplementation()!;
    vi.mocked(runtime.sdk.getPropertyValue).mockImplementation(property => property === "fcs/flap-pos-deg"
      ? 15 : property === "fcs/flap-pos-norm" ? 0.5 : previousRead(property));
    const tick = mocks.runtime.setSimTick.mock.calls.at(-1)?.[0] as (dt: number) => void;
    tick(1 / 60);
    const slider = t.root.querySelector<HTMLInputElement>('[data-control="flaps"]')!;
    const button = t.root.querySelector<HTMLButtonElement>('[data-control="auto-flaps"]')!;
    expect(getAppSettings().get("osfs.assist.autoFlaps")).toBe(true);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(slider.value).toBe("0.5");
    await act(async () => {
      slider.value = "0.25";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    tick(1 / 60);
    expect(getAppSettings().get("osfs.assist.autoFlaps")).toBe(false);
    expect(runtime.sdk.setPropertyValue).toHaveBeenCalledWith("fcs/flap-cmd-norm", 0.25);
    if (aircraftId === "f-35b") expect(runtime.sdk.setPropertyValue).toHaveBeenCalledWith("fcs/flaps-auto-enabled", 0);
    await act(async () => button.click());
    expect(getAppSettings().get("osfs.assist.autoFlaps")).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyF" }));
    tick(1 / 60);
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyF" }));
    expect(getAppSettings().get("osfs.assist.autoFlaps")).toBe(false);
    expect(savedSettings(t.storage)["osfs.assist.autoFlaps"]).toBe(false);
  } finally { await act(async () => t.app.destroy()); canvas.mockRestore(); }
});

it("homes polygon edges in Aircraft, follows the live setting and model hierarchy, and disconnects on teardown", async () => {
  const t = await mountAircraftSelection([[SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, values: {
    "osfs.aircraft.wireframe": true,
  } })]]);
  try {
    expect(mocks.meshInspector.setEnabled).toHaveBeenLastCalledWith(true);
    const section = t.root.querySelector('[data-settings-section="aircraft/mesh-inspector"]')!;
    const checkbox = section.querySelector<HTMLInputElement>('[data-parameter="osfs.aircraft.wireframe"] input')!;
    expect(checkbox.checked).toBe(true);
    const modelOptions = vi.mocked(createAircraftModel).mock.calls.at(-1)![2];
    const roots: import("@babylonjs/core").TransformNode[] = [];
    modelOptions.onMeshRootsChange?.(roots);
    expect(mocks.meshInspector.setRoots).toHaveBeenLastCalledWith(roots);
    await act(async () => checkbox.click());
    expect(mocks.meshInspector.setEnabled).toHaveBeenLastCalledWith(false);
    expect(savedSettings(t.storage)["osfs.aircraft.wireframe"]).toBeUndefined();
    await act(async () => checkbox.click());
    expect(savedSettings(t.storage)["osfs.aircraft.wireframe"]).toBe(true);
  } finally { await act(async () => t.app.destroy()); }
  expect(mocks.meshInspector.dispose).toHaveBeenCalledOnce();
  mocks.meshInspector.setEnabled.mockClear();
  getAppSettings().set("osfs.aircraft.wireframe", false);
  expect(mocks.meshInspector.setEnabled).not.toHaveBeenCalled();
});

it("persists the stowed gear debug override and feeds the model actual gear position while paused", async () => {
  const t = await mountAircraftSelection([[SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, values: {
    "osfs.aircraft.id": "f-35b", "osfs.debug.renderStowedGear": true,
  } })]]);
  try {
    expect(vi.mocked(createAircraftModel).mock.calls.at(-1)?.[2]).toMatchObject({ renderStowedGear: true });
    expect(mocks.aircraftModel.updateGearVisibility).toHaveBeenCalledWith(1);
    await openPanelTab(t.root, "Debug");
    const checkbox = t.root.querySelector<HTMLInputElement>('[data-parameter="osfs.debug.renderStowedGear"] input')!;
    expect(checkbox.checked).toBe(true);
    await act(async () => checkbox.click());
    expect(mocks.aircraftModel.setRenderStowedGear).toHaveBeenLastCalledWith(false);
    // The registry removes a saved override when it returns to the default.
    expect(savedSettings(t.storage)["osfs.debug.renderStowedGear"]).toBeUndefined();
    await act(async () => checkbox.click());
    expect(savedSettings(t.storage)["osfs.debug.renderStowedGear"]).toBe(true);
    const tick = mocks.runtime.setSimTick.mock.calls.at(-1)?.[0] as (dt: number) => void;
    mocks.surfaceState.gearDownNorm = 0;
    tick(0);
    expect(mocks.aircraftModel.updateGearVisibility).toHaveBeenLastCalledWith(0, true);
    mocks.surfaceState.gearDownNorm = 0.001;
    tick(0);
    expect(mocks.aircraftModel.updateGearVisibility).toHaveBeenLastCalledWith(0.001, true);
  } finally {
    mocks.surfaceState.gearDownNorm = 1;
    await act(async () => t.app.destroy());
  }
  mocks.aircraftModel.setRenderStowedGear.mockClear();
  getAppSettings().set("osfs.debug.renderStowedGear", true);
  expect(mocks.aircraftModel.setRenderStowedGear).not.toHaveBeenCalled();
});

it("keeps native force observation opt-in and wires live Debug settings to the aircraft CG", async () => {
  const t = await mountAircraftSelection([["osfs.aircraft", "f-35b"]]);
  try {
    expect(createForcesDebugOverlay).not.toHaveBeenCalled();
    await openPanelTab(t.root, "Debug");
    expect(t.root.querySelector('[data-settings-section="debug/forces"]')).not.toBeNull();
    await act(async () => { getAppSettings().set("osfs.forces.enabled", true); });
    expect(createForcesDebugOverlay).toHaveBeenCalledOnce();
    expect(vi.mocked(createForcesDebugOverlay).mock.calls[0][1]).toBe(mocks.aircraft.root);
    expect(vi.mocked(createForcesDebugOverlay).mock.calls[0][3].engineLabels).toMatchObject({ 0: "Main engine", 1: "Lift fan" });
    await act(async () => { getAppSettings().set("osfs.forces.newtonsPerMeter", 12_000); });
    expect(mocks.forcesOverlay.setSettings).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true, newtonsPerMeter: 12_000 }));
    const tick = mocks.runtime.setSimTick.mock.calls.at(-1)?.[0] as (dt: number) => void;
    tick(1 / 60);
    expect(mocks.forcesOverlay.update).toHaveBeenLastCalledWith(true);
    await act(async () => { getAppSettings().set("osfs.forces.enabled", false); });
    expect(mocks.forcesOverlay.setSettings).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
  } finally { await act(async () => t.app.destroy()); }
  expect(mocks.forcesOverlay.dispose).toHaveBeenCalledOnce();
});

it("shows and persists the F-35B control law, applies it while paused and restores it after relocation", async () => {
  const t = await mountAircraftSelection([[SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, values: {
    "osfs.aircraft.id": "f-35b", "osfs.aircraft.controlLaw": "manual",
  } })]]);
  try {
    const runtime = await vi.mocked(createJsbsimRuntime).mock.results.at(-1)!.value;
    expect(runtime.sdk.setPropertyValue).toHaveBeenCalledWith("fcs/control-law-mode", 1);
    const section = t.root.querySelector<HTMLElement>('[data-settings-section="aircraft/flight-controls"]')!;
    expect(section.textContent).toContain("Autopilot and input assists have separate settings");
    const modes = Array.from(section.querySelectorAll<HTMLInputElement>('[data-parameter="osfs.aircraft.controlLaw"] input[type="radio"]'));
    expect(modes.map(mode => mode.value)).toEqual(["auto", "manual", "fly-by-wire"]);
    expect(modes.find(mode => mode.checked)?.value).toBe("manual");
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP" }));
      modes.find(mode => mode.value === "fly-by-wire")!.click();
    });
    expect(runtime.sdk.setPropertyValue).toHaveBeenCalledWith("fcs/control-law-mode", 2);
    expect(savedSettings(t.storage)["osfs.aircraft.controlLaw"]).toBe("fly-by-wire");
    await openPanelTab(t.root, "Location");
    const location = t.root.querySelector<HTMLInputElement>('.foss-earth-location-panel input[type="number"]')!;
    vi.mocked(runtime.sdk.setPropertyValue).mockClear();
    await act(async () => location.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(runtime.sdk.setPropertyValue).toHaveBeenCalledWith("fcs/control-law-mode", 2);
  } finally { await act(async () => t.app.destroy()); }
});

it("restores the saved VTOL command on reload without treating it as physical conversion", async () => {
  mocks.useRealFlightHud = true;
  const canvas = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    new Proxy({}, { get: () => () => undefined }) as unknown as CanvasRenderingContext2D,
  );
  const t = await mountAircraftSelection([[SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, values: {
    "osfs.aircraft.id": "f-35b", "osfs.aircraft.stovlConversion": 0.6,
  } })]]);
  try {
    const conversion = t.root.querySelector<HTMLInputElement>('[data-control="vtol-conversion"]')!;
    expect(conversion.value).toBe("0.6");
    expect(conversion.getAttribute("aria-valuetext")).toBe("60% commanded; 0% actual conversion");
  } finally { await act(async () => t.app.destroy()); canvas.mockRestore(); }
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

it("loads and refines around the aircraft when nothing was saved, and removes it as a focus point on close", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  const root = document.createElement("div");
  document.body.append(root);
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  try {
    expect(getAppSettings().inspect("map.focus.refineFrom")).toMatchObject({ value: "focus", provenance: "host-default" });
    expect(getAppSettings().inspect("map.focus.mode")).toMatchObject({ value: "both", provenance: "host-default" });
    const point = mocks.runtime.registerFocusPoint.mock.calls[0][0];
    expect(point).toMatchObject({ id: "aircraft", label: "Aircraft" });
    expect(point.getPosition()).toEqual(mocks.originEcef);
    // The runtime lists the aircraft among the focus points, and the flight selects it.
    getAppSettings().setChoices("map.focus.point", [{ id: "orbit-target", label: "Simulation origin" }, { id: "aircraft", label: "Aircraft" }]);
    expect(getAppSettings().inspect("map.focus.point")).toMatchObject({ value: "aircraft", provenance: "host-default" });
    expect(mocks.unregisterFocusPoint).not.toHaveBeenCalled();
  } finally { await act(async () => app.destroy()); }
  expect(mocks.unregisterFocusPoint).toHaveBeenCalledOnce();
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

it("keeps flightPerf=1, the DevTools aliases and Debug → Frame budget, on the runtime's profiler", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
  mocks.physics.getFault = () => null;
  // What the flightPerf=1 capture reads each tick.
  Object.assign(mocks.runtime, { getTileMetrics: () => null, isStreamingTiles: () => false, getMapDownloadBytesPerSecond: () => 0 });
  window.history.replaceState(null, "", "?flightPerf=1");
  const root = document.createElement("div"); document.body.append(root);
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  const session = (mocks.runtime as unknown as { frameProfile: FrameProfileSession }).frameProfile;
  try {
    expect(window.osfsFrameProfiler).toBe(session.profiler);
    expect(window.osfsFrameProfiler!.enabled).toBe(true);
    expect(window.osfsFrameProfile!.gpuTimed()).toBe(false);
    // The runtime closes each frame; the flight's sections land in it.
    const tick = mocks.runtime.setSimTick.mock.calls.at(-1)![0] as (dt: number) => void;
    session.frame();
    await act(async () => tick(1 / 60));
    session.frame();
    const sections = window.osfsFrameProfiler!.summary().sections.map(section => section.section);
    expect(sections).toContain("flight");
    expect(sections).toContain("flight/physics");

    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP" })));
    await act(async () => root.querySelector<HTMLButtonElement>('[aria-label="Open right panel"]')!.click());
    const debug = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(button => button.textContent === "Debug")!;
    await act(async () => debug.click());
    const measure = root.querySelector<HTMLInputElement>('[data-parameter="renderer.profiling.enabled"] input')!;
    expect(measure.checked).toBe(true);
    expect(root.textContent).toContain("Copy frame budget");
    await act(async () => window.osfsFrameProfile!.setEnabled(false));
    expect(getAppSettings().get("renderer.profiling.enabled")).toBe(false);
    expect(session.enabled).toBe(false);
    await act(async () => measure.click());
    expect(session.enabled).toBe(true);
  } finally {
    await act(async () => app.destroy());
    window.history.replaceState(null, "", "/");
  }
  expect(window.osfsFrameProfiler).toBeUndefined();
  expect(window.osfsFrameProfile).toBeUndefined();
});

describe("pause while loading and resumed flights", () => {
  const pressPause = (): void => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP" }));
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyP" }));
  };
  const savedFlight = (overrides: Partial<SavedFlight> = {}): SavedFlight => ({
    version: 1, savedAtMs: Date.UTC(2026, 9, 5, 22, 30), aircraftId: "cessna-172", paused: true,
    latDeg: 46.8, lonDeg: -92.1, altMeters: 430, headingDeg: 90, aboveGroundMeters: 180,
    simulation: {
      initial: { "ic/lat-geod-deg": 46.8, "ic/long-gc-deg": -92.1, "ic/h-sl-ft": 430 / 0.3048 },
      controls: { "fcs/throttle-cmd-norm": 0.4, "atmosphere/wind-north-fps": 30 },
      running: true, simTimeS: 12,
    },
    ...overrides,
  });

  it("loads Earth at MSP runway 35 and isolates the static engine session from flight assists and the saved flight", async () => {
    const pageWindow = window;
    pageWindow.history.replaceState(null, "", "/?engineTest=1");
    const saved = JSON.stringify(savedFlight());
    let mounted: Awaited<ReturnType<typeof mountAircraftSelection>> | undefined;
    try {
      mounted = await mountAircraftSelection([
        [SAVED_FLIGHT_STORAGE_KEY, saved],
        [SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, values: { "osfs.aircraft.id": "f-35b" } })],
      ]);
      expect(vi.mocked(createJsbsimRuntime).mock.calls.at(-1)![0]).toMatchObject({
        aircraftId: "f-35b",
        bootstrap: { airspeedKts: 0, throttleNorm: 0, engineRunning: false, holdDown: true, altFt: 833.3,
          latDeg: 44.866176833333334, lonDeg: -93.23664458333333, headingDeg: 350 },
      });
      expect(mocks.runtime.prepareTerrain).toHaveBeenCalledWith(expect.objectContaining({
        latDeg: 44.866176833333334, lonDeg: -93.23664458333333,
        altitudeMeters: 833.3 * 0.3048, clearanceMeters: 0,
      }));
      expect(mocks.worldRoot.setEnabled).not.toHaveBeenCalledWith(false);
      expect(restoreSavedFlight).not.toHaveBeenCalled();
      expect(mocks.resetLocation).toHaveBeenCalledWith(expect.anything(), {
        latDeg: 44.866176833333334, lonDeg: -93.23664458333333, altMeters: 250,
      }, 250, "f-35b", { holdDown: true });
      expect(vi.mocked(createAircraftModel).mock.calls.at(-1)![2]).toMatchObject({ engineOnly: true });
      expect(mocks.aircraft.setModelLoaded).toHaveBeenCalledWith(true);
      const tick = mocks.runtime.setSimTick.mock.calls.at(-1)![0] as (dt: number) => void;
      await act(async () => { tick(1 / 60); pressPause(); });
      expect(mocks.physics.update).toHaveBeenCalled();
      expect(mocks.terrainContact.update).not.toHaveBeenCalled();
      expect(mocks.visibleMeshCollision.update).not.toHaveBeenCalled();
      expect(captureSavedFlight).not.toHaveBeenCalled();
      expect(mounted.storage.get(SAVED_FLIGHT_STORAGE_KEY)).toBe(saved);
    } finally {
      if (mounted) await act(async () => mounted!.app.destroy());
      pageWindow.history.replaceState(null, "", "/");
    }
  });

  it("moves the held engine stand with the existing Location tab and keeps the saved flight intact", async () => {
    const pageWindow = window;
    pageWindow.history.replaceState(null, "", "/?engineTest=1");
    const saved = JSON.stringify(savedFlight());
    let mounted: Awaited<ReturnType<typeof mountAircraftSelection>> | undefined;
    try {
      mounted = await mountAircraftSelection([[SAVED_FLIGHT_STORAGE_KEY, saved]]);
      await openPanelTab(mounted.root, "Location");
      const inputs = mounted.root.querySelectorAll<HTMLInputElement>('.foss-earth-location-panel input[type="number"]');
      await act(async () => {
        for (const [index, value] of ["46.8", "-92.1", "500"].entries()) {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(inputs[index], value);
          inputs[index].dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
      await act(async () => inputs[0].form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
      expect(mocks.runtime.prepareTerrain).toHaveBeenLastCalledWith(expect.objectContaining({
        latDeg: 46.8, lonDeg: -92.1, altitudeMeters: 500, clearanceMeters: 0,
      }));
      expect(mocks.resetLocation).toHaveBeenLastCalledWith(expect.anything(), {
        latDeg: 46.8, lonDeg: -92.1, altMeters: 500,
      }, 250, "cessna-172", { holdDown: true });
      expect(mocks.physics.reset).toHaveBeenCalledTimes(2);
      expect(mocks.worldRoot.setEnabled).not.toHaveBeenCalledWith(false);
      expect(captureSavedFlight).not.toHaveBeenCalled();
      expect(mounted.storage.get(SAVED_FLIGHT_STORAGE_KEY)).toBe(saved);
      expect(mocks.runtime.setSimRunning).toHaveBeenLastCalledWith(true);
    } finally {
      if (mounted) await act(async () => mounted!.app.destroy());
      pageWindow.history.replaceState(null, "", "/");
    }
  });

  /** Starts the app with terrain preparation held, so a test can act while it loads. */
  async function startLoading() {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
    let finishTerrain!: () => void;
    mocks.runtime.prepareTerrain.mockImplementationOnce(() => new Promise(resolve => {
      finishTerrain = () => resolve({ groundHeightMeters: 250, altitudeMeters: 1774 });
    }));
    mocks.hudBarOptions = null;
    const root = document.createElement("div");
    document.body.append(root);
    const started = createFlightSimApp(root);
    return {
      started,
      /** Until the simulator and the HUD exist, while the ground still loads. */
      untilFlightInput: () => act(async () => { await vi.waitFor(() => expect(mocks.hudBarOptions).not.toBeNull()); }),
      finish: async () => {
        let app!: Awaited<typeof started>;
        await act(async () => { finishTerrain(); app = await started; });
        return app;
      },
    };
  }

  it("starts the flight paused when pause is pressed before the simulator is ready", async () => {
    const loading = await startLoading();
    pressPause();
    expect(document.body.textContent).toContain("The flight will start paused.");
    await loading.untilFlightInput();
    const app = await loading.finish();
    try {
      expect(mocks.physics.setPaused).toHaveBeenLastCalledWith(true);
      expect(mocks.runtime.setSimRunning).toHaveBeenLastCalledWith(false);
    } finally { await act(async () => app.destroy()); }
  });

  it("hands the loading pause over to the flight's own input while the ground loads", async () => {
    const loading = await startLoading();
    pressPause();
    await loading.untilFlightInput();
    // The HUD exists now, its pause button live; the flight's own input runs pause.
    await act(async () => pressPause());
    const app = await loading.finish();
    try {
      expect(mocks.physics.setPaused).toHaveBeenLastCalledWith(false);
      expect(mocks.runtime.setSimRunning).toHaveBeenLastCalledWith(true);
    } finally { await act(async () => app.destroy()); }
  });

  it("resumes the saved flight where it was, with its controls, paused as it was left", async () => {
    const flight = savedFlight();
    const t = await mountAircraftSelection([[SAVED_FLIGHT_STORAGE_KEY, JSON.stringify(flight)]]);
    try {
      expect(mocks.runtime.prepareTerrain).toHaveBeenCalledWith(expect.objectContaining({
        latDeg: 46.8, lonDeg: -92.1, altitudeAboveGroundMeters: 180, clearanceMeters: 0,
      }));
      expect(createJsbsimRuntime).toHaveBeenLastCalledWith(expect.objectContaining({
        bootstrap: expect.objectContaining({ latDeg: 46.8, lonDeg: -92.1, headingDeg: 90 }),
      }));
      const runtime = await vi.mocked(createJsbsimRuntime).mock.results.at(-1)!.value;
      expect(runtime.sdk.setPropertyValue).toHaveBeenCalledWith("fcs/throttle-cmd-norm", 0.4);
      expect(runtime.sdk.setPropertyValue).not.toHaveBeenCalledWith("atmosphere/wind-north-fps", 30);
      expect(restoreSavedFlight).toHaveBeenCalledWith(runtime.sdk, flight, "cessna-172", { groundHeightMeters: 250, altitudeMeters: 1774 });
      expect(mocks.resetLocation).not.toHaveBeenCalled();
      expect(mocks.physics.setPaused).toHaveBeenLastCalledWith(true);
      expect(t.root.textContent).toContain("Last saved");
      expect(t.root.textContent).toContain("46.8000°N 92.1000°W");
    } finally { await act(async () => t.app.destroy()); }
  });

  it.each([true, false])("resolves the restored F35 native Auto flag from the persisted assist setting (%s) before the first tick", async enabled => {
    const flight = savedFlight({ aircraftId: "f-35b" });
    vi.mocked(restoreSavedFlight).mockImplementationOnce(sdk => {
      sdk.setPropertyValue("fcs/flaps-auto-enabled", Number(!enabled));
      const previousRead = vi.mocked(sdk.getPropertyValue).getMockImplementation()!;
      vi.mocked(sdk.getPropertyValue).mockImplementation(path => path === "fcs/flap-pos-norm" ? 0.6
        : path === "fcs/flap-cmd-norm" ? 0.25 : previousRead(path));
      return mocks.state;
    });
    const t = await mountAircraftSelection([
      ["osfs.aircraft", "f-35b"],
      [SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, values: { "osfs.aircraft": "f-35b", "osfs.assist.autoFlaps": enabled } })],
      [SAVED_FLIGHT_STORAGE_KEY, JSON.stringify(flight)],
    ]);
    try {
      const runtime = await vi.mocked(createJsbsimRuntime).mock.results.at(-1)!.value;
      const nativeWrites = vi.mocked(runtime.sdk.setPropertyValue).mock.calls.filter(([path]) => path === "fcs/flaps-auto-enabled");
      expect(nativeWrites.at(-1)![1]).toBe(Number(enabled));
      expect(getAppSettings().get("osfs.assist.autoFlaps")).toBe(enabled);
      expect(mocks.flightHud.update).toHaveBeenLastCalledWith(
        expect.anything(), expect.objectContaining({ flaps: enabled ? 0.6 : 0.25 }), true, expect.anything(), expect.anything(),
      );
      const tick = mocks.runtime.setSimTick.mock.calls.at(-1)![0] as (dt: number) => void;
      tick(1 / 60);
      expect(getAppSettings().get("osfs.assist.autoFlaps")).toBe(enabled);
    } finally { await act(async () => t.app.destroy()); }
  });

  it("starts at the start position the page address gives, over a saved flight", async () => {
    window.history.replaceState(null, "", "/?set.osfs.start.latitude=10&set.osfs.start.longitude=20");
    try {
      const t = await mountAircraftSelection([[SAVED_FLIGHT_STORAGE_KEY, JSON.stringify(savedFlight())]]);
      try {
        expect(mocks.runtime.prepareTerrain).toHaveBeenCalledWith(expect.objectContaining({ latDeg: 10, lonDeg: 20, clearanceMeters: 1000 }));
        expect(restoreSavedFlight).not.toHaveBeenCalled();
        expect(mocks.resetLocation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ latDeg: 10, lonDeg: 20 }), 250, "cessna-172");
      } finally { await act(async () => t.app.destroy()); }
    } finally { window.history.replaceState(null, "", "/"); }
  });

  it("saves the flight as it flies and on pause; a new flight discards it and reloads", async () => {
    const t = await mountAircraftSelection();
    try {
      const saved = (): SavedFlight | null => JSON.parse(t.storage.get(SAVED_FLIGHT_STORAGE_KEY) ?? "null") as SavedFlight | null;
      vi.mocked(captureSavedFlight).mockImplementation((_sdk, aircraftId, paused) => savedFlight({ aircraftId, paused, savedAtMs: 1 }));
      const tick = mocks.runtime.setSimTick.mock.calls.at(-1)![0] as (dt: number) => void;
      // Every osfs.start.saveInterval seconds of flight, 5 by default.
      for (let frame = 0; frame < 49; frame += 1) tick(0.1);
      expect(saved()).toBeNull();
      for (let frame = 0; frame < 2; frame += 1) tick(0.1);
      expect(saved()).toMatchObject({ paused: false });
      t.storage.delete(SAVED_FLIGHT_STORAGE_KEY);
      await act(async () => pressPause());
      expect(saved()).toMatchObject({ paused: true });
      t.storage.delete(SAVED_FLIGHT_STORAGE_KEY);
      window.dispatchEvent(new Event("pagehide"));
      expect(saved()).toMatchObject({ paused: true });

      const newFlight = Array.from(t.root.querySelectorAll<HTMLButtonElement>("button"))
        .find(button => button.textContent === "Start a new flight")!;
      await act(async () => newFlight.click());
      expect(t.reload).toHaveBeenCalledOnce();
      expect(saved()).toBeNull();
      // Leaving the page for the reload must not save the flight back.
      window.dispatchEvent(new Event("pagehide"));
      expect(saved()).toBeNull();
    } finally {
      vi.mocked(captureSavedFlight).mockImplementation(() => null);
      await act(async () => t.app.destroy());
    }
  });

  it("forgets the saved flight when resuming is turned off", async () => {
    const t = await mountAircraftSelection([[SAVED_FLIGHT_STORAGE_KEY, JSON.stringify(savedFlight())]]);
    try {
      await act(async () => { getAppSettings().set("osfs.start.resume", false); });
      expect(t.storage.has(SAVED_FLIGHT_STORAGE_KEY)).toBe(false);
      expect(t.root.textContent).toContain("No flight saved.");
    } finally { await act(async () => t.app.destroy()); }
  });
});
