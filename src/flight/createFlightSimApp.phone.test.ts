// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PhoneControlSessionOptions } from "./remote/createPhoneControlSession";
import type { ControlSurfaceState } from "./input/flightInputManager";
import type { FlightControlPanelOptions } from "./hud/FlightControlPanel";

const mocks = vi.hoisted(() => {
  const state = { latDeg: 1, lonDeg: 2, altMeters: 1000, headingRad: 0, airspeedKts: 110 };
  const snapshot = { owner: "local" as "local" | "phone", phase: "paired" };
  const phoneControls = { elevator: -0.4, aileron: 0.6, rudder: 0.5, throttle: 0.83, pitchTrim: -0.2, rollTrim: 0.15, flaps: 1 / 3, brake: 1 };
  const engineVisualValues = new Map<string, number>();
  const phone = {
    subscribe: vi.fn(() => vi.fn()), getSnapshot: () => snapshot,
    beforeStep: vi.fn(), takeControl: vi.fn(), cancelHandoff: vi.fn(), reset: vi.fn(), isStarterHeld: vi.fn(() => false),
    takeCameraAim: vi.fn(() => null as { yaw: number; pitch: number; zoom?: number } | null),
    isCameraActive: vi.fn(() => false),
    hasPendingCameraAim: vi.fn(() => false),
    onHidden: vi.fn(), syncStatus: vi.fn(), destroy: vi.fn(),
  };
  return {
    state, snapshot, phoneControls, phone, engineVisualValues,
    createPhoneSession: vi.fn(() => phone),
    pairingPanel: { destroy: vi.fn() }, createPairingPanel: vi.fn(),
    resetLocation: vi.fn(() => state),
    sdk: {
      setPropertyValue: vi.fn(), run: vi.fn(),
      createPropertyBatch: vi.fn((paths: readonly string[]) => ({
        read: vi.fn((target = new Float64Array(paths.length)) => {
          paths.forEach((path, index) => { target[index] = engineVisualValues.get(path) ?? Number.NaN; });
          return target;
        }),
        dispose: vi.fn(),
      })),
      // The engine runs, as a flight starts: an engine that is off holds the throttle at idle.
      getPropertyValue: vi.fn((property: string) => property === "fcs/throttle-cmd-norm" ? 0.65 : property === "gear/gear-cmd-norm" ? 1
        : property.endsWith("/set-running") ? 1 : 0),
    }, disposeSdk: vi.fn(),
    runtime: {
      renderer: { mode: "webgl2" }, status: { mode: "fallback" }, scene: {},
      engine: { getFps: () => 60 }, geospatialCamera: null, prepareTerrain: vi.fn(async (request: { altitudeMeters?: number }) => ({ groundHeightMeters: 250, altitudeMeters: request.altitudeMeters ?? 1774 })),
      surface: { sample: vi.fn(() => null) },
      getWorldRoot: () => ({}), registerFocusPoint: vi.fn(() => () => {}), setSimViewState: vi.fn(), setSimTick: vi.fn(), setSimRunning: vi.fn(),
      getGoogleTerrainDetailState: vi.fn(() => null),
      subscribeStatus: vi.fn(() => () => {}),
      isStreamingTiles: () => false,
      onTilesStreamingChange: vi.fn(() => () => {}),
      onRasterDetailFeedback: vi.fn(() => () => {}),
      onDetailAdjusted: vi.fn(() => () => {}),
      getRasterDetailFeedback: vi.fn(() => null),
      setRasterDetailTarget: vi.fn(),
      setGoogleTerrainDetailTarget: vi.fn(),
      requestRender: vi.fn(), destroy: vi.fn(),
    },
    aircraft: {
      setViewMode: vi.fn(), getViewMode: () => "third", toggleViewMode: vi.fn(), dispose: vi.fn(),
      orbitChaseCamera: vi.fn(), zoomChaseCamera: vi.fn(), modelRoot: {}, setModelLoaded: vi.fn(), getChaseDistanceMeters: () => 14,
      thirdPersonCamera: { position: { y: 2.2, length: () => Math.hypot(2.2, 14) } },
    },
    aircraftModel: { getState: () => ({ status: "ready" }), getRig: () => null, setAircraft: vi.fn(), setLod: vi.fn(), setRenderStowedGear: vi.fn(), updateGearVisibility: vi.fn(), refreshAutoLod: vi.fn(), dispose: vi.fn() },
    terrainContact: { update: vi.fn(() => true), reset: vi.fn() },
    visibleMeshCollision: { update: vi.fn(() => false), reset: vi.fn() },
    physics: {
      reset: vi.fn(), setPaused: vi.fn(), update: vi.fn(), getLatestState: () => state, getFault: () => null,
    },
    createHud: vi.fn(() => ({ update: vi.fn(), refreshFlaps: vi.fn(), destroy: vi.fn() })),
    createPanel: vi.fn(() => ({ update: vi.fn(), openOrSelectTab: vi.fn(), toggleTab: vi.fn(), destroy: vi.fn() })),
    createHudBar: vi.fn(() => ({ update: vi.fn(), destroy: vi.fn() })),
  };
});
vi.mock("foss-earth/runtime", () => ({
  // The runtime's profiling session is real: off, it attaches nothing to the scene.
  createBabylonRuntime: async () => {
    const { createFrameProfileSession } = await import("foss-earth/perf");
    return Object.assign(mocks.runtime, { frameProfile: createFrameProfileSession({ scene: {} as never, engine: { getCaps: () => ({}) } as never }) });
  },
  RASTER_BASE_MAP_SOURCES: [], TERRAIN_SOURCES: [], resolveTerrainSource: vi.fn(), resolveRasterBaseMapSource: vi.fn(),
  resolveMapRuntimeConfig: () => ({}), applyRendererChoice: vi.fn(), setMapSourcePreference: vi.fn(), setTerrainSourcePreference: vi.fn(),
}));
vi.mock("foss-earth/input", () => ({
  loadInputModePreference: () => "mouse", loadInputSensitivityPreference: () => ({}),
  loadOrbitInvertSettings: () => ({ invertYaw: false, invertPitch: false, recenterMode: "hold" }),
  saveOrbitInvertSettings: vi.fn(),
}));
vi.mock("./jsbsim/createJsbsimRuntime", () => ({ createJsbsimRuntime: async () => ({ sdk: mocks.sdk, dispose: mocks.disposeSdk }) }));
vi.mock("./bridge/ecefBridge", () => ({ readFlightState: () => mocks.state }));
vi.mock("./bridge/floatingOrigin", () => ({ createFloatingOrigin: () => ({ aircraftRoot: { setEnabled: vi.fn() }, apply: vi.fn(), dispose: vi.fn() }) }));
vi.mock("./aircraft/createPlaceholderAircraft", () => ({ createPlaceholderAircraft: () => mocks.aircraft }));
vi.mock("./aircraft/createAircraftModel", () => ({ createAircraftModel: () => mocks.aircraftModel }));
vi.mock("./aircraft/createExternalTankVisuals", () => ({ createExternalTankVisuals: () => ({
  ready: Promise.resolve(), sync: vi.fn(), jettison: vi.fn(), update: vi.fn(),
  setLifetimeSeconds: vi.fn(), setMaxDetachedTanks: vi.fn(), resetDetached: vi.fn(), dispose: vi.fn(),
}) }));
vi.mock("./aircraft/aircraftAnimation", () => ({ applyAircraftRig: vi.fn(), readControlSurfaceState: vi.fn(() => ({ gearDownNorm: 1 })) }));
vi.mock("./physics/fixedStepLoop", () => ({ FIXED_DT: 1 / 120, createFixedStepPhysicsLoop: () => mocks.physics }));
vi.mock("./physics/terrainContact", () => ({ createTerrainContact: () => mocks.terrainContact }));
vi.mock("./physics/visibleMeshCollision", () => ({ createVisibleMeshCollision: () => mocks.visibleMeshCollision }));
vi.mock("./input/flightCameraInput", () => ({ attachFlightCameraInput: () => vi.fn() }));
vi.mock("./hud/flightHud", () => ({ createFlightHud: mocks.createHud }));
vi.mock("./hud/createFlightControlPanel", () => ({ createFlightControlPanel: mocks.createPanel }));
vi.mock("./hud/createFlightHudBar", () => ({ createFlightHudBar: mocks.createHudBar }));
vi.mock("./jsbsim/resetFlightLocation", () => ({ resetFlightLocation: mocks.resetLocation }));
vi.mock("./remote/createPhoneControlSession", () => ({ createPhoneControlSession: mocks.createPhoneSession }));
vi.mock("./hud/createPhonePairingPanel", () => ({ createPhonePairingPanel: mocks.createPairingPanel }));

import { getAppSettings, resetAppSettings } from "foss-earth/settings";
import { createFlightSimApp } from "./createFlightSimApp";
import { registerFlightSettings } from "./settings/registerFlightSettings";
import { getAircraftDefinition } from "./aircraft/aircraftCatalog";

let app: Awaited<ReturnType<typeof createFlightSimApp>> | null = null;
let tick: (dt: number) => void;
let options: PhoneControlSessionOptions;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.engineVisualValues.clear();
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: vi.fn(() => []) });
  mocks.snapshot.owner = "local";
  mocks.createPairingPanel.mockReturnValue(mocks.pairingPanel);
  mocks.terrainContact.update.mockReturnValue(true);
  mocks.visibleMeshCollision.update.mockReturnValue(false);
  mocks.physics.update.mockImplementation((_dt, apply: () => boolean | void | "reset") => {
    if (apply() !== false) mocks.sdk.run();
    return mocks.state;
  });
  mocks.phone.beforeStep.mockImplementation((local: ControlSurfaceState) => mocks.snapshot.owner === "phone" ? { ...mocks.phoneControls } : local);
  mocks.phone.takeControl.mockImplementation(() => {
    if (mocks.snapshot.owner === "local") return;
    const controls = options.getStatus().controls;
    mocks.snapshot.owner = "local";
    options.onOwnershipChange("local", controls);
  });
  mocks.phone.reset.mockImplementation(() => mocks.phone.takeControl());
});

afterEach(() => {
  app?.destroy(); app = null;
  vi.restoreAllMocks();
  document.body.replaceChildren();
  resetAppSettings();
});

/** What the flight hands the side panel; the Remote Control tab calls into it. */
function panelOptions() {
  return mocks.createPanel.mock.calls.at(-1)![2] as FlightControlPanelOptions;
}

async function mount(pair = true) {
  const root = document.createElement("div");
  document.body.append(root);
  app = await createFlightSimApp(root);
  tick = mocks.runtime.setSimTick.mock.calls.at(-1)![0];
  if (pair) {
    await panelOptions().loadPhonePairing();
    options = mocks.createPhoneSession.mock.calls[0][0];
  }
  return root;
}

function grant() {
  mocks.snapshot.owner = "phone";
  options.onOwnershipChange("phone", { ...mocks.phoneControls, elevator: 0, aileron: 0, rudder: 0, brake: 0 });
}

describe("0SFS phone integration", () => {
  it("keeps Auto flaps through unchanged phone packets as actual travel changes, then yields to fresh phone input", async () => {
    const previousRead = mocks.sdk.getPropertyValue.getMockImplementation()!;
    let actual = 0;
    mocks.sdk.getPropertyValue.mockImplementation(property => property === "fcs/flap-pos-deg" ? actual * 30 : previousRead(property));
    try {
      await mount(); grant();
      for (const position of [0.4, 0.6]) {
        actual = position; tick(1 / 60);
        expect(getAppSettings().get("osfs.assist.autoFlaps")).toBe(true);
        expect(mocks.snapshot.owner).toBe("phone");
      }
      mocks.phone.beforeStep.mockImplementation(() => ({ ...mocks.phoneControls, flaps: 0.8 }));
      tick(1 / 60);
      expect(getAppSettings().get("osfs.assist.autoFlaps")).toBe(false);
      expect(mocks.sdk.setPropertyValue).toHaveBeenCalledWith("fcs/flap-cmd-norm", 0.8);
      expect(mocks.snapshot.owner).toBe("phone");
      expect(mocks.phone.takeControl).not.toHaveBeenCalled();
    } finally { mocks.sdk.getPropertyValue.mockImplementation(previousRead); }
  });

  it("makes the phone session only when the Remote Control tab asks, once, and leaves flight unchanged", async () => {
    await mount(false);
    expect(mocks.createPhoneSession).not.toHaveBeenCalled();
    tick(1 / 60);
    expect(mocks.sdk.setPropertyValue).toHaveBeenCalledWith("fcs/throttle-cmd-norm", 0.65);

    const mountPairing = await panelOptions().loadPhonePairing();
    expect(mocks.createPhoneSession).toHaveBeenCalledOnce();
    const host = document.createElement("div");
    expect(mountPairing(host, { pairOnOpen: true })).toBe(mocks.pairingPanel);
    expect(mocks.createPairingPanel).toHaveBeenCalledWith(host, mocks.phone, { pairOnOpen: true });
    // The tab comes and goes with the panel; the session and its phone stay.
    expect(await panelOptions().loadPhonePairing()).toBe(mountPairing);
    expect(mocks.createPhoneSession).toHaveBeenCalledOnce();
    expect(mocks.runtime.setSimRunning).toHaveBeenLastCalledWith(true);
  });

  it("lets the tab try again after pairing failed to load", async () => {
    await mount(false);
    mocks.createPhoneSession.mockImplementationOnce(() => { throw new Error("offline"); });
    await expect(panelOptions().loadPhonePairing()).rejects.toThrow("offline");

    await panelOptions().loadPhonePairing();
    expect(mocks.createPhoneSession).toHaveBeenCalledTimes(2);
  });

  it("switches this device to the controller at a clean /rc/, leaving the simulator", async () => {
    await mount(false);
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, href: "https://0sfs.github.io/fly/?key=secret#spot", origin: "https://0sfs.github.io", assign });
    panelOptions().onUseAsRemote();
    vi.unstubAllGlobals();

    expect(assign).toHaveBeenCalledWith("/rc/");
    expect(mocks.createPhoneSession).not.toHaveBeenCalled();
  });

  it("selects fresh phone controls directly at the SDK boundary and keeps their applied settings for takeover", async () => {
    await mount();
    getAppSettings().set("osfs.assist.autoFlaps", false);
    grant();
    tick(1 / 60);
    expect(mocks.sdk.setPropertyValue).toHaveBeenCalledWith("fcs/elevator-cmd-norm", -0.4);
    expect(mocks.sdk.setPropertyValue).toHaveBeenCalledWith("fcs/aileron-cmd-norm", 0.6);
    expect(mocks.sdk.setPropertyValue).toHaveBeenCalledWith("fcs/rudder-cmd-norm", -0.5);
    expect(options.getStatus().controls).toEqual(mocks.phoneControls);

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" }));
    expect(mocks.phone.takeControl).toHaveBeenCalledOnce();
    expect(options.getStatus().owner).toBe("local");
    expect(options.getStatus().controls).toEqual({ ...mocks.phoneControls, elevator: 0, aileron: 0, rudder: 0, brake: 0 });
    tick(0.1);
    expect(options.getStatus().controls.aileron).toBeCloseTo(0.8);
    expect(options.getStatus().controls.throttle).toBe(0.83);
    expect(options.getStatus().controls.pitchTrim).toBe(-0.2);
    expect(options.getStatus().controls.flaps).toBe(1 / 3);
  });

  it("aborts the current physics step when the freshness guard revokes ownership", async () => {
    await mount();
    grant();
    mocks.phone.beforeStep.mockImplementation(() => {
      mocks.phone.takeControl();
      options.setPaused(true);
      return false;
    });
    tick(1 / 60);
    expect(mocks.sdk.setPropertyValue).not.toHaveBeenCalled();
    expect(mocks.sdk.run).not.toHaveBeenCalled();
    expect(mocks.runtime.setSimRunning).toHaveBeenLastCalledWith(false);
    expect(mocks.physics.setPaused).toHaveBeenLastCalledWith(true);
  });

  it("does not write controls if a guard pauses while returning a snapshot", async () => {
    await mount();
    grant();
    mocks.phone.beforeStep.mockImplementation(() => { options.setPaused(true); return mocks.phoneControls; });
    tick(1 / 60);
    expect(mocks.sdk.setPropertyValue).not.toHaveBeenCalled();
    expect(mocks.sdk.run).not.toHaveBeenCalled();
  });

  it("checks freshness after synchronous terrain and collision work, including a collision reset", async () => {
    await mount();
    grant();
    let expired = false;
    mocks.phone.beforeStep.mockImplementation(() => expired ? false : mocks.phoneControls);
    mocks.terrainContact.update.mockImplementation(() => {
      // The first call is outside the physics loop. The second represents an
      // expensive in-step surface sample exhausting the input lease.
      if (mocks.terrainContact.update.mock.calls.length >= 2) expired = true;
      return true;
    });
    mocks.visibleMeshCollision.update.mockReturnValue(true);
    tick(1 / 60);
    expect(mocks.phone.beforeStep).toHaveBeenCalledOnce();
    expect(mocks.sdk.setPropertyValue).not.toHaveBeenCalled();
    expect(mocks.sdk.run).not.toHaveBeenCalled();
  });

  it("keeps ownership through explicit pause, cancels handoff immediately, and preserves the resume delta guard", async () => {
    await mount();
    grant();
    // A handoff re-arms profile commands; the next flight frame samples input.
    tick(1 / 60);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP" }));
    expect(mocks.snapshot.owner).toBe("phone");
    expect(mocks.phone.takeControl).not.toHaveBeenCalled();
    expect(mocks.phone.cancelHandoff).toHaveBeenCalledOnce();
    expect(mocks.phone.syncStatus).toHaveBeenCalledOnce();
    options.setPaused(false);
    tick(60);
    expect(mocks.physics.update).toHaveBeenLastCalledWith(0, expect.any(Function));
  });

  it("draws the phone's camera swipe once, at the mouse's rate, and pinches the chase distance", async () => {
    await mount();
    grant();
    // A gesture is what the fingers did, not a rate: the frame length cannot
    // change how far a swipe moves the view.
    mocks.phone.takeCameraAim.mockReturnValueOnce({ yaw: 0.1, pitch: -0.05 });
    tick(0.1);
    expect(mocks.aircraft.orbitChaseCamera).toHaveBeenCalledWith(expect.closeTo(0.5, 5), expect.closeTo(-0.25, 5));
    // Drained by the session, so the next frame draws nothing further.
    mocks.aircraft.orbitChaseCamera.mockClear();
    tick(0.1);
    expect(mocks.aircraft.orbitChaseCamera).not.toHaveBeenCalled();
    // Pinching apart brings the aircraft closer, which is a smaller distance.
    mocks.phone.takeCameraAim.mockReturnValueOnce({ yaw: 0, pitch: 0, zoom: 2 });
    tick(0.1);
    expect(mocks.aircraft.zoomChaseCamera).toHaveBeenCalledWith(0.5);
    expect(mocks.aircraftModel.refreshAutoLod).toHaveBeenCalled();
  });

  it("reports the engine reading the HUD is drawing, so the phone shows the same one", async () => {
    await mount();
    grant();
    tick(1 / 60);
    // The mocked model publishes nothing readable, so the phase is still a
    // label and every number is absent rather than a zero the phone would show.
    // What the throttle lever needs comes with it: the engine runs, so the
    // phone's lever offers the shutdown hold rather than a start.
    expect(options.getStatus().engine).toEqual({
      phase: expect.stringMatching(/^[A-Z][A-Z ]*$/), state: "running", start: 1,
      kind: "piston", maxRpm: 2700,
      rotorBlades: { outer: 2, inner: null, outerEstimated: false, innerEstimated: false },
      orbs: { fps: 1000, turnsPerSecond: 2, maxPatternStep: 0.45, pixelRatio: 2, renderer: "auto" },
    });
  });

  it("shares the F-35 afterburner accent through cached native visuals and the phone status", async () => {
    const parameters = registerFlightSettings(getAppSettings());
    const previousAircraft = parameters.get("osfs.aircraft.id");
    parameters.set("osfs.aircraft.id", "f-35b");
    try {
      await mount();
      grant();
      const accent = getAircraftDefinition("f-35b").afterburner!.accentColor;
      for (const observed of [0, 1, Number.NaN, 0]) {
        mocks.engineVisualValues.set("propulsion/engine[0]/augmentation", observed);
        tick(1 / 60);
        expect(options.getStatus().engine?.afterburnerColor).toBe(observed === 1 ? accent : undefined);
      }
      expect(mocks.sdk.createPropertyBatch).toHaveBeenCalledOnce();
      expect(mocks.sdk.createPropertyBatch.mock.results[0].value.read).toHaveBeenCalledTimes(4);
      expect(mocks.sdk.getPropertyValue).not.toHaveBeenCalledWith("propulsion/engine[0]/augmentation");
    } finally {
      app?.destroy(); app = null;
      parameters.set("osfs.aircraft.id", previousAircraft);
    }
  });

  it("adopts reset state and clears a held local key before a general reposition", async () => {
    await mount();
    getAppSettings().set("osfs.assist.autoFlaps", false);
    grant(); tick(1 / 60);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    tick(0.1);
    expect(options.hasActiveLocalInput()).toBe(true);
    const callbacks = mocks.createPanel.mock.calls[0][2] as { onLocationApply(location: { latDeg: number; lonDeg: number }): void };
    mocks.resetLocation.mockClear();
    callbacks.onLocationApply({ latDeg: 3, lonDeg: 4 });
    await vi.waitFor(() => expect(mocks.resetLocation).toHaveBeenCalledOnce());
    expect(mocks.phone.reset).toHaveBeenCalledOnce();
    expect(mocks.phone.reset.mock.invocationCallOrder[0]).toBeLessThan(mocks.resetLocation.mock.invocationCallOrder[0]);
    expect(options.hasActiveLocalInput()).toBe(false);
    expect(options.getStatus().controls).toEqual({ ...mocks.phoneControls, elevator: 0, aileron: 0, rudder: 0, brake: 0 });
  });

  it("notifies phone state on desktop view changes and pauses/revokes through the visibility handler", async () => {
    await mount();
    grant();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyV" }));
    expect(mocks.phone.takeControl).not.toHaveBeenCalled();
    expect(mocks.phone.syncStatus).toHaveBeenCalledOnce();
    const callbacks = mocks.createPanel.mock.calls[0][2] as { onViewModeChange(mode: "first"): void };
    callbacks.onViewModeChange("first");
    expect(mocks.phone.syncStatus).toHaveBeenCalledTimes(2);
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(mocks.phone.onHidden).toHaveBeenCalledOnce();
  });

  it("detaches the session, callbacks, input, and SDK on destroy and ignores late render callbacks", async () => {
    const root = await mount();
    app!.destroy(); app = null;
    const writes = mocks.sdk.setPropertyValue.mock.calls.length;
    tick(1 / 60);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(mocks.phone.destroy).toHaveBeenCalledOnce();
    expect(mocks.runtime.setSimTick).toHaveBeenLastCalledWith(null);
    expect(mocks.sdk.setPropertyValue).toHaveBeenCalledTimes(writes);
    expect(mocks.phone.takeControl).not.toHaveBeenCalled();
    expect(mocks.phone.onHidden).not.toHaveBeenCalled();
    expect(mocks.disposeSdk).toHaveBeenCalledOnce();
    expect(root.children).toHaveLength(0);
  });

  it("does not create a late session when destroyed during lazy loading", async () => {
    await mount(false);
    const loading = panelOptions().loadPhonePairing();
    app!.destroy(); app = null;
    await expect(loading).rejects.toThrow();
    expect(mocks.createPhoneSession).not.toHaveBeenCalled();
    expect(mocks.createPairingPanel).not.toHaveBeenCalled();
  });
});
