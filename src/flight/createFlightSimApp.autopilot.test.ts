// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlightHudOptions } from "./hud/flightHud";
import type { FlightControlPanelOptions } from "./hud/FlightControlPanel";
import { AUTOPILOT_SETTINGS_STORAGE_KEY } from "./autopilot/autopilotSettings";

const mocks = vi.hoisted(() => {
  const state = { latDeg: 1, lonDeg: 2, altMeters: 1000, headingRad: 0, airspeedKts: 110 };
  return {
    state,
    properties: {} as Record<string, number>,
    sdk: {
      setPropertyValue: vi.fn(),
      run: vi.fn(),
      getPropertyValue: vi.fn((property: string) => {
        if (property in mocks.properties) return mocks.properties[property];
        if (property === "fcs/throttle-cmd-norm") return 0.65;
        if (property === "gear/gear-cmd-norm") return 1;
        return 0;
      }),
    },
    disposeSdk: vi.fn(),
    runtime: {
      renderer: { mode: "webgl2" }, status: { mode: "fallback" }, scene: {},
      engine: { getFps: () => 60 }, geospatialCamera: null,
      prepareTerrain: vi.fn(async (request: { altitudeMeters?: number }) => ({
        groundHeightMeters: 250, altitudeMeters: request.altitudeMeters ?? 1774,
      })),
      surface: { sample: vi.fn(() => null) },
      getWorldRoot: () => ({}), setSimViewState: vi.fn(), setSimTick: vi.fn(), setSimRunning: vi.fn(),
      getGoogleTerrainDetailState: vi.fn(() => null),
      getGoogleTerrainDetailAnchor: vi.fn(() => "simulation-origin"),
      setGoogleTerrainDetailTarget: vi.fn(), setGoogleTerrainDetailAnchor: vi.fn(),
      requestRender: vi.fn(), destroy: vi.fn(),
    },
    aircraft: {
      setViewMode: vi.fn(), getViewMode: () => "third", toggleViewMode: vi.fn(), dispose: vi.fn(),
      orbitChaseCamera: vi.fn(), zoomChaseCamera: vi.fn(), modelRoot: {}, setModelLoaded: vi.fn(),
      getChaseDistanceMeters: () => 14,
      thirdPersonCamera: { position: { y: 2.2, length: () => Math.hypot(2.2, 14) } },
    },
    aircraftModel: {
      getState: () => ({ status: "ready" }), getRig: () => null,
      setAircraft: vi.fn(), setLod: vi.fn(), refreshAutoLod: vi.fn(), dispose: vi.fn(),
    },
    terrainContact: { update: vi.fn(() => true), reset: vi.fn() },
    visibleMeshCollision: { update: vi.fn(() => false), reset: vi.fn() },
    physics: {
      reset: vi.fn(), setPaused: vi.fn(), update: vi.fn(), getLatestState: () => state, getFault: () => null,
    },
    createHud: vi.fn(() => ({ update: vi.fn(), setGearDown: vi.fn(), destroy: vi.fn() })),
    createPanel: vi.fn(() => ({ update: vi.fn(), openOrSelectTab: vi.fn(), destroy: vi.fn() })),
    createHudBar: vi.fn(() => ({ update: vi.fn(), setPhoneStatus: vi.fn(), destroy: vi.fn() })),
  };
});
vi.mock("foss-earth/runtime", () => ({
  createBabylonRuntime: async () => mocks.runtime,
  RASTER_BASE_MAP_SOURCES: [], TERRAIN_SOURCES: [], resolveTerrainSource: vi.fn(),
  resolveRasterBaseMapSource: vi.fn(), resolveMapRuntimeConfig: () => ({}),
  setMapSourcePreference: vi.fn(), setTerrainSourcePreference: vi.fn(), setRasterQualityPreference: vi.fn(),
}));
vi.mock("foss-earth/input", () => ({ loadInputModePreference: () => "mouse", loadInputSensitivityPreference: () => ({}) }));
vi.mock("./jsbsim/createJsbsimRuntime", () => ({ createJsbsimRuntime: async () => ({ sdk: mocks.sdk, dispose: mocks.disposeSdk }) }));
vi.mock("./bridge/ecefBridge", () => ({ readFlightState: () => mocks.state }));
vi.mock("./bridge/floatingOrigin", () => ({ createFloatingOrigin: () => ({ aircraftRoot: { setEnabled: vi.fn() }, apply: vi.fn(), dispose: vi.fn() }) }));
vi.mock("./aircraft/createPlaceholderAircraft", () => ({ createPlaceholderAircraft: () => mocks.aircraft }));
vi.mock("./aircraft/createAircraftModel", () => ({ createAircraftModel: () => mocks.aircraftModel }));
vi.mock("./aircraft/aircraftAnimation", () => ({ applyAircraftRig: vi.fn(), readControlSurfaceState: vi.fn() }));
vi.mock("./physics/fixedStepLoop", () => ({ FIXED_DT: 1 / 120, createFixedStepPhysicsLoop: () => mocks.physics }));
vi.mock("./physics/terrainContact", () => ({ createTerrainContact: () => mocks.terrainContact }));
vi.mock("./physics/visibleMeshCollision", () => ({ createVisibleMeshCollision: () => mocks.visibleMeshCollision }));
vi.mock("./input/flightCameraInput", () => ({ attachFlightCameraInput: () => vi.fn() }));
vi.mock("./hud/flightHud", () => ({ createFlightHud: mocks.createHud }));
vi.mock("./hud/createFlightControlPanel", () => ({ createFlightControlPanel: mocks.createPanel }));
vi.mock("./hud/createFlightHudBar", () => ({ createFlightHudBar: mocks.createHudBar }));
vi.mock("./jsbsim/resetFlightLocation", () => ({ resetFlightLocation: vi.fn(() => mocks.state) }));

import { createFlightSimApp } from "./createFlightSimApp";

let app: Awaited<ReturnType<typeof createFlightSimApp>> | null = null;
let tick: (dt: number) => void;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.properties = {};
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    clear: () => values.clear(),
  });
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: vi.fn(() => []) });
  mocks.terrainContact.update.mockReturnValue(true);
  mocks.visibleMeshCollision.update.mockReturnValue(false);
  mocks.physics.update.mockImplementation((_dt, apply: () => boolean | void | "reset") => {
    if (apply() !== false) mocks.sdk.run();
    return mocks.state;
  });
});

afterEach(() => {
  app?.destroy(); app = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

async function mount() {
  const root = document.createElement("div");
  document.body.append(root);
  app = await createFlightSimApp(root);
  tick = mocks.runtime.setSimTick.mock.calls.at(-1)![0];
  return root;
}

function hudOptions(): FlightHudOptions {
  return mocks.createHud.mock.calls.at(-1)![1] as FlightHudOptions;
}

function panelOptions(): FlightControlPanelOptions {
  return mocks.createPanel.mock.calls.at(-1)![2] as FlightControlPanelOptions;
}

function lastAileron(): number | undefined {
  for (let i = mocks.sdk.setPropertyValue.mock.calls.length - 1; i >= 0; i -= 1) {
    const [name, value] = mocks.sdk.setPropertyValue.mock.calls[i]!;
    if (name === "fcs/aileron-cmd-norm") return value as number;
  }
  return undefined;
}

describe("OSFS autopilot engage path", () => {
  it("keeps the stick in charge until the HUD master is engaged", async () => {
    await mount();
    tick(1 / 60);
    expect(mocks.sdk.setPropertyValue).toHaveBeenCalledWith("fcs/throttle-cmd-norm", 0.65);
    expect(lastAileron()).toBe(0);
  });

  it("hands roll to our AP after engage, and gives it back when the stick is deflected", async () => {
    await mount();
    hudOptions().onAutopilotEngageChange(true);
    tick(1 / 60);
    mocks.properties["attitude/phi-deg"] = 12;
    mocks.sdk.setPropertyValue.mockClear();
    tick(1 / 60);
    expect(lastAileron()!).toBeLessThan(0);

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" }));
    mocks.sdk.setPropertyValue.mockClear();
    tick(0.1);
    expect(lastAileron()!).toBeGreaterThan(0.05);
  });

  it("does not let ArduPilot fly when the backend is selected but not connected", async () => {
    await mount();
    panelOptions().onAutopilotSettingsChange({
      version: 1,
      backend: "ardupilot",
      axes: { roll: true, pitch: true, yaw: true, throttle: true, gear: true, flaps: true },
      throttleMode: "airspeed",
    });
    hudOptions().onAutopilotEngageChange(true);
    mocks.properties["attitude/phi-deg"] = 12;
    mocks.sdk.setPropertyValue.mockClear();
    tick(1 / 60);
    expect(lastAileron()).toBe(0);
    expect(mocks.sdk.setPropertyValue).toHaveBeenCalledWith("fcs/throttle-cmd-norm", 0.65);
    expect(window.localStorage.getItem(AUTOPILOT_SETTINGS_STORAGE_KEY)).toMatch(/ardupilot/);
  });
});
