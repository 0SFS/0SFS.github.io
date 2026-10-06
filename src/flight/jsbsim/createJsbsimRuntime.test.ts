import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@felipegalind0/jsbsim", async importOriginal => ({
  ...await importOriginal<typeof import("@felipegalind0/jsbsim")>(),
  JSBSimSdk: { create: vi.fn() },
}));
vi.mock("./hydrateJsbsimData", () => ({ downloadJsbsimData: vi.fn() }));

import { createJsbsimRuntime } from "./createJsbsimRuntime";
import { buildIdentity, JSBSimSdk } from "@felipegalind0/jsbsim";
import { downloadJsbsimData } from "./hydrateJsbsimData";
import { AIRCRAFT_IDS } from "../aircraft/aircraftIds";
import { getFdmProfile } from "./fdmProfiles";

const createMockSdk = () => ({
  configurePaths: vi.fn(), loadModel: vi.fn(() => true), runIc: vi.fn(() => true),
  setPropertyValue: vi.fn(), getPropertyValue: vi.fn(), setDt: vi.fn(),
  getDeltaT: vi.fn(() => 1 / 120), writeDataFile: vi.fn(),
  getPropertyCatalog: vi.fn(() => AIRCRAFT_IDS.flatMap(id =>
    (getFdmProfile(id).requiredReadOnlyModelProperties ?? []).map(path => `${path} (R)`))),
  on: vi.fn(), off: vi.fn(), destroy: vi.fn(), delete: vi.fn(), setRunMode: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(downloadJsbsimData).mockResolvedValue([]);
});

describe("createJsbsimRuntime", () => {
  it("delegates native lifetime to SDK destroy exactly once", async () => {
    const sdk = createMockSdk();
    vi.mocked(JSBSimSdk.create).mockResolvedValue(sdk as never);
    const runtime = await createJsbsimRuntime();
    expect(runtime.identity.build).toEqual(buildIdentity);
    expect(runtime.identity.assets.wasmUrl).toContain("jsbsim_wasm");
    runtime.dispose();
    runtime.dispose();
    expect(sdk.off).toHaveBeenCalledTimes(2);
    expect(sdk.destroy).toHaveBeenCalledOnce();
    expect(sdk.delete).not.toHaveBeenCalled();
  });

  it.each(AIRCRAFT_IDS)(
    "loads only the selected %s package", async aircraftId => {
      const sdk = createMockSdk();
      vi.mocked(JSBSimSdk.create).mockResolvedValue(sdk as never);
      const runtime = await createJsbsimRuntime({ aircraftId });
      expect(downloadJsbsimData).toHaveBeenCalledWith(undefined, undefined, aircraftId);
      expect(sdk.loadModel).toHaveBeenCalledWith(getFdmProfile(aircraftId).model);
      expect(runtime.identity.aircraftId).toBe(aircraftId);
      runtime.dispose();
    },
  );

  it("rejects an unknown aircraft before creating a native runtime or downloading data", async () => {
    await expect(createJsbsimRuntime({ aircraftId: "unknown" as never })).rejects.toThrow("Unsupported aircraft");
    expect(JSBSimSdk.create).not.toHaveBeenCalled();
    expect(downloadJsbsimData).not.toHaveBeenCalled();
  });

  it("releases a late SDK allocation after aircraft downloading fails", async () => {
    const sdk = createMockSdk();
    let resolveSdk!: (value: Awaited<ReturnType<typeof JSBSimSdk.create>>) => void;
    vi.mocked(JSBSimSdk.create).mockReturnValue(new Promise(resolve => { resolveSdk = resolve; }));
    vi.mocked(downloadJsbsimData).mockRejectedValueOnce(new Error("data unavailable"));
    await expect(createJsbsimRuntime()).rejects.toThrow("data unavailable");
    expect(sdk.destroy).not.toHaveBeenCalled();
    resolveSdk(sdk as never);
    await Promise.resolve();
    expect(sdk.destroy).toHaveBeenCalledOnce();
    expect(sdk.delete).not.toHaveBeenCalled();
  });

  it("unsubscribes and destroys the SDK when model initialization fails", async () => {
    const sdk = createMockSdk();
    sdk.loadModel.mockReturnValue(false);
    vi.mocked(JSBSimSdk.create).mockResolvedValue(sdk as never);
    await expect(createJsbsimRuntime()).rejects.toThrow("failed to load");
    expect(sdk.off).toHaveBeenCalledTimes(2);
    expect(sdk.destroy).toHaveBeenCalledOnce();
    expect(sdk.delete).not.toHaveBeenCalled();
  });

  it("releases the SDK when aircraft data requires an unavailable native observation", async () => {
    const sdk = createMockSdk();
    sdk.getPropertyCatalog.mockReturnValue(["propulsion/engine/body-force-z-lbs (RW)"]);
    vi.mocked(JSBSimSdk.create).mockResolvedValue(sdk as never);
    await expect(createJsbsimRuntime({ aircraftId: "f-35b" })).rejects.toThrow("required native read-only");
    expect(sdk.runIc).not.toHaveBeenCalled();
    expect(sdk.off).toHaveBeenCalledTimes(2);
    expect(sdk.destroy).toHaveBeenCalledOnce();
  });
});
