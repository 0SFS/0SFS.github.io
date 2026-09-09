// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PhoneControlSessionOptions } from "./remote/createPhoneControlSession";
import type { ControlSurfaceState } from "./input/flightInputManager";
import type { FlightHudBarOptions } from "./hud/createFlightHudBar";

const mocks = vi.hoisted(() => {
  const state = { latDeg: 1, lonDeg: 2, altMeters: 1000, headingRad: 0, airspeedKts: 110 };
  const snapshot = { owner: "local" as "local" | "phone", phase: "paired" };
  const phoneControls = { elevator: -0.4, aileron: 0.6, rudder: 0.5, throttle: 0.83, pitchTrim: -0.2, flaps: 1 / 3, brake: 1 };
  const phone = {
    subscribe: vi.fn(() => vi.fn()), getSnapshot: () => snapshot,
    beforeStep: vi.fn(), takeControl: vi.fn(), cancelHandoff: vi.fn(), reset: vi.fn(),
    onHidden: vi.fn(), syncStatus: vi.fn(), destroy: vi.fn(),
  };
  return {
    state, snapshot, phoneControls, phone,
    createPhoneSession: vi.fn(() => phone),
    dialog: { open: vi.fn(), destroy: vi.fn() }, createDialog: vi.fn(),
    resetLocation: vi.fn(() => state),
    sdk: { setPropertyValue: vi.fn(), run: vi.fn() }, disposeSdk: vi.fn(),
    runtime: {
      renderer: { mode: "webgl2" }, status: { mode: "fallback" }, scene: {},
      engine: { getFps: () => 60 }, geospatialCamera: null, surface: { sample: vi.fn(() => null) },
      getWorldRoot: () => ({}), setSimViewState: vi.fn(), setSimTick: vi.fn(), setSimRunning: vi.fn(),
      requestRender: vi.fn(), destroy: vi.fn(),
    },
    aircraft: {
      setViewMode: vi.fn(), getViewMode: () => "third", toggleViewMode: vi.fn(), dispose: vi.fn(),
      orbitChaseCamera: vi.fn(), zoomChaseCamera: vi.fn(), modelRoot: {}, setModelLoaded: vi.fn(), getChaseDistanceMeters: () => 14,
    },
    aircraftModel: { getRig: () => null, setAircraft: vi.fn(), setLod: vi.fn(), refreshAutoLod: vi.fn(), dispose: vi.fn() },
    terrainContact: { update: vi.fn(() => true), reset: vi.fn() },
    visibleMeshCollision: { update: vi.fn(() => false), reset: vi.fn() },
    physics: {
      reset: vi.fn(), setPaused: vi.fn(), update: vi.fn(), getLatestState: () => state, getFault: () => null,
    },
    createHud: vi.fn(() => ({ update: vi.fn(), destroy: vi.fn() })),
    createPanel: vi.fn(() => ({ update: vi.fn(), destroy: vi.fn() })),
    createHudBar: vi.fn(() => ({ update: vi.fn(), setPhoneStatus: vi.fn(), destroy: vi.fn() })),
  };
});
vi.mock("foss-earth/runtime", () => ({
  createBabylonRuntime: async () => mocks.runtime,
  RASTER_BASE_MAP_SOURCES: [], TERRAIN_SOURCES: [], resolveTerrainSource: vi.fn(), resolveRasterBaseMapSource: vi.fn(),
  resolveMapRuntimeConfig: () => ({}), setMapSourcePreference: vi.fn(), setTerrainSourcePreference: vi.fn(), setRasterQualityPreference: vi.fn(),
}));
vi.mock("foss-earth/input", () => ({ loadInputModePreference: () => "mouse", loadInputSensitivityPreference: () => ({}) }));
vi.mock("./jsbsim/createJsbsimRuntime", () => ({ createJsbsimRuntime: async () => ({ sdk: mocks.sdk, dispose: mocks.disposeSdk }) }));
vi.mock("./bridge/ecefBridge", () => ({ readFlightState: () => mocks.state }));
vi.mock("./bridge/floatingOrigin", () => ({ createFloatingOrigin: () => ({ aircraftRoot: {}, apply: vi.fn(), dispose: vi.fn() }) }));
vi.mock("./aircraft/createPlaceholderAircraft", () => ({ createPlaceholderAircraft: () => mocks.aircraft }));
vi.mock("./aircraft/aircraftCatalog", () => ({ isAircraftId: () => true, isAircraftLodId: () => true }));
vi.mock("./aircraft/createAircraftModel", () => ({ createAircraftModel: () => mocks.aircraftModel }));
vi.mock("./aircraft/aircraftAnimation", () => ({ applyAircraftRig: vi.fn(), readControlSurfaceState: vi.fn() }));
vi.mock("./physics/fixedStepLoop", () => ({ createFixedStepPhysicsLoop: () => mocks.physics }));
vi.mock("./physics/terrainContact", () => ({ createTerrainContact: () => mocks.terrainContact }));
vi.mock("./physics/visibleMeshCollision", () => ({ createVisibleMeshCollision: () => mocks.visibleMeshCollision }));
vi.mock("./input/flightCameraInput", () => ({ attachFlightCameraInput: () => vi.fn() }));
vi.mock("./hud/flightHud", () => ({ createFlightHud: mocks.createHud }));
vi.mock("./hud/createFlightControlPanel", () => ({ createFlightControlPanel: mocks.createPanel }));
vi.mock("./hud/createFlightHudBar", () => ({ createFlightHudBar: mocks.createHudBar }));
vi.mock("./jsbsim/resetFlightLocation", () => ({ resetFlightLocation: mocks.resetLocation }));
vi.mock("./remote/createPhoneControlSession", () => ({ createPhoneControlSession: mocks.createPhoneSession }));
vi.mock("./hud/createPhonePairingDialog", () => ({ createPhonePairingDialog: mocks.createDialog }));

import { createFlightSimApp } from "./createFlightSimApp";

let app: Awaited<ReturnType<typeof createFlightSimApp>> | null = null;
let tick: (dt: number) => void;
let options: PhoneControlSessionOptions;

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: vi.fn(() => []) });
  mocks.snapshot.owner = "local";
  mocks.createDialog.mockReturnValue(mocks.dialog);
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
});

async function mount(pair = true) {
  const root = document.createElement("div");
  document.body.append(root);
  app = await createFlightSimApp(root);
  tick = mocks.runtime.setSimTick.mock.calls.at(-1)![0];
  if (pair) {
    const hudOptions = mocks.createHudBar.mock.calls.at(-1)![1] as FlightHudBarOptions;
    hudOptions.onPhoneControlClick!();
    await vi.waitFor(() => expect(mocks.createPhoneSession).toHaveBeenCalledOnce());
    options = mocks.createPhoneSession.mock.calls[0][0];
  }
  return root;
}

function grant() {
  mocks.snapshot.owner = "phone";
  options.onOwnershipChange("phone", { ...mocks.phoneControls, elevator: 0, aileron: 0, rudder: 0, brake: 0 });
}

describe("OSFS phone integration", () => {
  it("initializes the phone session only from the HUD button, reuses the dialog, and leaves flight unchanged", async () => {
    await mount(false);
    expect(mocks.createPhoneSession).not.toHaveBeenCalled();
    tick(1 / 60);
    expect(mocks.sdk.setPropertyValue).toHaveBeenCalledWith("fcs/throttle-cmd-norm", 0.65);
    const hudOptions = mocks.createHudBar.mock.calls.at(-1)![1] as FlightHudBarOptions;
    hudOptions.onPhoneControlClick!();
    await vi.waitFor(() => expect(mocks.createPhoneSession).toHaveBeenCalledOnce());
    hudOptions.onPhoneControlClick!();
    expect(mocks.dialog.open).toHaveBeenCalledTimes(2);
    expect(mocks.runtime.setSimRunning).not.toHaveBeenCalled();
  });

  it("selects fresh phone controls directly at the SDK boundary and keeps their applied settings for takeover", async () => {
    await mount();
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
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP" }));
    expect(mocks.snapshot.owner).toBe("phone");
    expect(mocks.phone.takeControl).not.toHaveBeenCalled();
    expect(mocks.phone.cancelHandoff).toHaveBeenCalledOnce();
    expect(mocks.phone.syncStatus).toHaveBeenCalledOnce();
    options.setPaused(false);
    tick(60);
    expect(mocks.physics.update).toHaveBeenLastCalledWith(0, expect.any(Function));
  });

  it("adopts reset state and clears a held local key before a general reposition", async () => {
    await mount();
    grant(); tick(1 / 60);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    tick(0.1);
    expect(options.hasActiveLocalInput()).toBe(true);
    const callbacks = mocks.createPanel.mock.calls[0][2] as { onLocationApply(location: { latDeg: number; lonDeg: number }): void };
    callbacks.onLocationApply({ latDeg: 3, lonDeg: 4 });
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
    expect(mocks.dialog.destroy).toHaveBeenCalledOnce();
    expect(mocks.phone.subscribe.mock.results[0].value).toHaveBeenCalledOnce();
    expect(mocks.runtime.setSimTick).toHaveBeenLastCalledWith(null);
    expect(mocks.sdk.setPropertyValue).toHaveBeenCalledTimes(writes);
    expect(mocks.phone.takeControl).not.toHaveBeenCalled();
    expect(mocks.phone.onHidden).not.toHaveBeenCalled();
    expect(mocks.disposeSdk).toHaveBeenCalledOnce();
    expect(root.children).toHaveLength(0);
  });

  it("does not create a late session when destroyed during lazy loading", async () => {
    await mount(false);
    const hudOptions = mocks.createHudBar.mock.calls.at(-1)![1] as FlightHudBarOptions;
    hudOptions.onPhoneControlClick!();
    app!.destroy(); app = null;
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mocks.createPhoneSession).not.toHaveBeenCalled();
    expect(mocks.createDialog).not.toHaveBeenCalled();
  });
});
