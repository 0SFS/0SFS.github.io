// @vitest-environment jsdom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { createWheelSpinState, type WheelSpinState } from "./physics/wheelSpin";

const mocks = vi.hoisted(() => {
  const state = { latDeg: 1, lonDeg: 2, altMeters: 1000, headingRad: 0 };
  return {
    state,
    wheelStates: [] as WheelSpinState[],
    runtime: {
      renderer: { mode: "webgl2" }, status: { mode: "fallback" }, scene: {},
      engine: { getFps: () => 60 }, geospatialCamera: null,
      prepareTerrain: vi.fn(async (request: { altitudeMeters?: number }) => ({ groundHeightMeters: 250, altitudeMeters: request.altitudeMeters ?? 1774 })),
      surface: { sample: vi.fn(() => null) },
      getWorldRoot: () => ({}), setSimViewState: vi.fn(), setSimTick: vi.fn(),
      getGoogleTerrainDetailState: vi.fn(() => null), getGoogleTerrainDetailAnchor: vi.fn(() => "simulation-origin"),
      setGoogleTerrainDetailAnchor: vi.fn(), setGoogleTerrainDetailTarget: vi.fn(),
      setSimRunning: vi.fn(), requestRender: vi.fn(), setMapSource: vi.fn(), setTerrainSource: vi.fn(), destroy: vi.fn(),
    },
    wheelSpin: { step: vi.fn(), reset: vi.fn(), getStates: () => mocks.wheelStates },
    tireAudio: { setEnabled: vi.fn(), setPaused: vi.fn(), setVolume: vi.fn(), update: vi.fn(), dispose: vi.fn(), getStatus: () => null },
    aircraft: {
      root: {}, setViewMode: vi.fn(), toggleViewMode: vi.fn(), getViewMode: () => "third",
      orbitChaseCamera: vi.fn(), zoomChaseCamera: vi.fn(), dispose: vi.fn(),
      modelRoot: {}, setModelLoaded: vi.fn(), getChaseDistanceMeters: () => 14,
    },
    aircraftModel: {
      getState: () => ({ aircraftId: "cessna-172", lodId: "auto", activeLodId: "lod3", status: "ready", triangles: 876, error: null }),
      getRig: () => null, setAircraft: vi.fn(), setLod: vi.fn(), refreshAutoLod: vi.fn(), dispose: vi.fn(),
    },
    terrainContact: { reset: vi.fn(), update: vi.fn(() => true) },
    visibleMeshCollision: { reset: vi.fn(), update: vi.fn(() => false) },
    physics: { reset: vi.fn(), setPaused: vi.fn(), update: vi.fn((_delta, applyInputs) => { applyInputs(); return state; }), getLatestState: () => state, getFault: () => null },
  };
});
vi.mock("foss-earth/runtime", () => ({
  createBabylonRuntime: async () => mocks.runtime,
  RASTER_BASE_MAP_SOURCES: [], TERRAIN_SOURCES: [], resolveTerrainSource: vi.fn(), resolveRasterBaseMapSource: vi.fn(),
  resolveMapRuntimeConfig: () => ({}), setMapSourcePreference: vi.fn(), setTerrainSourcePreference: vi.fn(),
}));
vi.mock("./jsbsim/createJsbsimRuntime", () => ({ createJsbsimRuntime: async () => ({ sdk: { setPropertyValue: vi.fn(), getPropertyValue: vi.fn(() => 0) }, dispose: vi.fn() }) }));
vi.mock("./bridge/ecefBridge", () => ({ readFlightState: () => mocks.state }));
vi.mock("./bridge/floatingOrigin", () => ({ createFloatingOrigin: () => ({ aircraftRoot: { setEnabled: vi.fn() }, apply: vi.fn(), dispose: vi.fn() }) }));
vi.mock("./aircraft/createPlaceholderAircraft", () => ({ createPlaceholderAircraft: () => mocks.aircraft }));
vi.mock("./diagnostics/createCollisionDebugOverlay", () => ({ createCollisionDebugOverlay: vi.fn(() => ({ setEnabled: vi.fn(), update: vi.fn(), dispose: vi.fn() })) }));
vi.mock("./diagnostics/createWheelSpinDebugOverlay", () => ({ createWheelSpinDebugOverlay: vi.fn(() => ({ setEnabled: vi.fn(), update: vi.fn(), dispose: vi.fn() })) }));
vi.mock("./physics/createWheelSpinExperiment", () => ({ createWheelSpinExperiment: () => mocks.wheelSpin }));
vi.mock("./audio/createTireAudio", () => ({ createTireAudio: () => mocks.tireAudio }));
vi.mock("./aircraft/createAircraftModel", () => ({ createAircraftModel: () => mocks.aircraftModel }));
vi.mock("./aircraft/aircraftAnimation", () => ({ applyAircraftRig: vi.fn(), readControlSurfaceState: () => ({}) }));
vi.mock("./physics/fixedStepLoop", () => ({ FIXED_DT: 1 / 120, createFixedStepPhysicsLoop: vi.fn(() => mocks.physics) }));
vi.mock("./physics/terrainContact", () => ({ createTerrainContact: () => mocks.terrainContact }));
vi.mock("./physics/visibleMeshCollision", () => ({ createVisibleMeshCollision: vi.fn(() => mocks.visibleMeshCollision) }));
vi.mock("./hud/flightHud", () => ({ createFlightHud: () => ({ update: vi.fn(), destroy: vi.fn() }) }));
vi.mock("./jsbsim/resetFlightLocation", () => ({ resetFlightLocation: () => mocks.state }));
vi.mock("./hud/createFlightHudBar", () => ({ createFlightHudBar: () => ({ update: vi.fn(), destroy: vi.fn() }) }));

import { createFlightSimApp } from "./createFlightSimApp";
import { createFixedStepPhysicsLoop } from "./physics/fixedStepLoop";

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

function environment(pads: unknown[] = []) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => pads });
  // Web Audio present so the Slip cue can resolve active.
  vi.stubGlobal("AudioContext", class {});
  return storage;
}

async function mount() {
  const root = document.createElement("div");
  document.body.append(root);
  let app!: Awaited<ReturnType<typeof createFlightSimApp>>;
  await act(async () => { app = await createFlightSimApp(root); });
  const onStep = vi.mocked(createFixedStepPhysicsLoop).mock.calls.at(-1)![1]!;
  const tick = mocks.runtime.setSimTick.mock.calls.at(-1)![0] as (dt: number) => void;
  const openTab = async (label: string) => {
    const launcher = root.querySelector<HTMLButtonElement>('[aria-label="Open right panel"]')
      ?? root.querySelector<HTMLButtonElement>('.foss-earth-tab-strip [aria-label="Open new tab"]')!;
    await act(async () => launcher.click());
    const item = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(button => button.textContent === label)!;
    await act(async () => item.click());
  };
  const choose = async (label: string, value: string) => {
    const select = root.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;
    await act(async () => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
  };
  const pause = () => act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP" })));
  return { root, app, onStep: () => onStep(mocks.state as never), tick, openTab, choose, pause };
}

it("queues wheel-model changes until pause, applies audio immediately, and restores them in a new flight", async () => {
  const storage = environment();
  const view = await mount();
  try {
    await view.openTab("Settings");
    await view.choose("Ground interaction profile", "landing-feedback");
    // Running: the wheel model waits for a safe boundary.
    view.onStep();
    expect(mocks.wheelSpin.step).not.toHaveBeenCalled();
    expect(view.root.querySelector('[aria-label="Wheel response status"]')!.textContent).toMatch(/Applies when the simulation is paused or reset/);
    expect(JSON.parse(storage.get("osfs.ground-interaction.v1")!)).toMatchObject({ profile: "landing-feedback", rotation: "inertia" });
    await act(async () => {
      const volume = view.root.querySelector<HTMLInputElement>('[aria-label="Tire audio volume"]')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(volume, "0.25");
      volume.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(mocks.tireAudio.setVolume).toHaveBeenLastCalledWith(0.25);
    expect(mocks.wheelSpin.reset).not.toHaveBeenCalled();
    await view.pause();
    view.onStep();
    expect(mocks.wheelSpin.step).toHaveBeenLastCalledWith(1 / 120, "inertia");
    expect(mocks.tireAudio.setEnabled).toHaveBeenLastCalledWith(true);
  } finally { await act(async () => view.app.destroy()); }

  mocks.wheelSpin.step.mockClear();
  const second = await mount();
  try {
    second.onStep();
    expect(mocks.wheelSpin.step).toHaveBeenLastCalledWith(1 / 120, "inertia");
  } finally { await act(async () => second.app.destroy()); }
});

it("keeps Debug experiment choices only through the explicit Settings action", async () => {
  const storage = environment();
  const view = await mount();
  try {
    await view.openTab("Debug");
    await view.choose("Wheel spin experiment", "instant");
    view.onStep();
    expect(mocks.wheelSpin.step).toHaveBeenLastCalledWith(1 / 120, "instant");
    expect(storage.has("osfs.ground-interaction.v1")).toBe(false);
    await view.openTab("Settings");
    const override = view.root.querySelector('[aria-label="Wheel experiment override"]')!;
    expect(override.textContent).toMatch(/Instant rolling/);
    const keep = Array.from(override.querySelectorAll("button")).find(button => button.textContent === "Keep experiment choices")!;
    await act(async () => keep.click());
    expect(JSON.parse(storage.get("osfs.ground-interaction.v1")!)).toMatchObject({ rotation: "instant", profile: "custom" });
    expect(view.root.querySelector('[aria-label="Wheel experiment override"]')).toBeNull();
    // Keeping what already runs is not a pending mid-flight change.
    expect(view.root.querySelector('[aria-label="Wheel response status"]')).toBeNull();
  } finally { await act(async () => view.app.destroy()); }
});

it("drives gamepad haptics from accepted wheel cues and cancels them on pause", async () => {
  const actuator = { effects: ["dual-rumble"], playEffect: vi.fn(async () => "complete"), reset: vi.fn(async () => "complete") };
  const storage = environment([{ id: "pad", index: 0, connected: true, axes: [0, 0, 0, 0], buttons: [], vibrationActuator: actuator }]);
  storage.set("osfs.ground-interaction.v1", JSON.stringify({ version: 1, rotation: "inertia", haptics: "landing", hapticStrength: 1 }));
  mocks.wheelStates = [0, 1, 2].map(() => createWheelSpinState());
  const view = await mount();
  try {
    await view.openTab("Settings");
    expect(view.root.querySelector('[aria-label="Haptic devices"]')!.textContent).toMatch(/Gamepad: Ready/);
    view.onStep();
    for (const wheel of mocks.wheelStates.slice(1)) Object.assign(wheel, { onGround: true, normalLoadNewtons: 5_000, slipPowerWatts: 30_000 });
    for (let step = 0; step < 6; step++) view.onStep();
    await act(async () => view.tick(1 / 60));
    expect(actuator.playEffect).toHaveBeenCalledOnce();
    const [, params] = actuator.playEffect.mock.calls[0] as unknown as [string, { duration: number; strongMagnitude: number }];
    expect(params.duration).toBeLessThanOrEqual(60);
    expect(params.strongMagnitude).toBeGreaterThan(0);
    await view.pause();
    expect(actuator.reset).toHaveBeenCalled();
    await act(async () => view.tick(1 / 60));
    expect(actuator.playEffect).toHaveBeenCalledOnce();
  } finally {
    await act(async () => view.app.destroy());
    mocks.wheelStates = [];
  }
});
