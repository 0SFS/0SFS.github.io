import { describe, expect, it, vi } from "vitest";

vi.mock("@0x62/jsbsim-wasm", () => ({
  JSBSimSdk: {
    create: vi.fn(),
  },
}));

vi.mock("./hydrateJsbsimData", () => ({
  downloadJsbsimData: vi.fn().mockResolvedValue([]),
}));

import { createJsbsimRuntime } from "./createJsbsimRuntime";
import { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { downloadJsbsimData } from "./hydrateJsbsimData";

const createMockSdk = () => ({
  configurePaths: vi.fn(),
  loadModel: vi.fn(() => true),
  runIc: vi.fn(() => true),
  setPropertyValue: vi.fn(),
  getPropertyValue: vi.fn(),
  setDt: vi.fn(),
  getDeltaT: vi.fn(() => 1 / 120),
  writeDataFile: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  destroy: vi.fn(),
  delete: vi.fn(),
  setRunMode: vi.fn(),
});

describe("createJsbsimRuntime", () => {
  it("disposes the native instance when runtime dispose is called", async () => {
    const sdk = createMockSdk() as unknown as Awaited<ReturnType<typeof JSBSimSdk.create>>;
    vi.mocked(JSBSimSdk.create).mockResolvedValue(sdk);

    const runtime = await createJsbsimRuntime();
    runtime.dispose();
    runtime.dispose();

    expect(sdk.off).toHaveBeenCalled();
    expect(sdk.destroy).toHaveBeenCalledTimes(1);
    expect(sdk.delete).toHaveBeenCalledTimes(1);
  });

  it("loads the selected aircraft package", async () => {
    const sdk = createMockSdk() as unknown as Awaited<ReturnType<typeof JSBSimSdk.create>>;
    vi.mocked(JSBSimSdk.create).mockResolvedValue(sdk);
    vi.mocked(downloadJsbsimData).mockResolvedValue([]);

    await createJsbsimRuntime({ aircraftId: "cirrus-vision-jet" });

    expect(vi.mocked(downloadJsbsimData)).toHaveBeenCalledWith(undefined, undefined, "cirrus-vision-jet");
  });
});
