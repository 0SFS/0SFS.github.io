import { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { wasmBinaryUrl, wasmModuleUrl } from "@0x62/jsbsim-wasm/wasm";
import { bootstrapAircraft, type C172BootstrapOptions } from "./bootstrapC172";
import { type AircraftId, isAircraftId } from "../aircraft/aircraftIds";
import { downloadJsbsimData, type JsbsimLoadProgress } from "./hydrateJsbsimData";

type JsbsimDestroyApi = JSBSimSdk & {
  delete?: () => void;
};

export interface JsbsimRuntimeOptions {
  dataBaseUrl?: string;
  aircraftId?: AircraftId;
  bootstrap?: C172BootstrapOptions;
  onProgress?: (progress: JsbsimLoadProgress) => void;
  onLog?: (stream: "stdout" | "stderr", message: string) => void;
}

export interface JsbsimRuntime { sdk: JSBSimSdk; dispose(): void }

export async function createJsbsimRuntime(options: JsbsimRuntimeOptions = {}): Promise<JsbsimRuntime> {
  // Network fetches overlap WASM download/compilation and renderer setup.
  const sdkPromise = JSBSimSdk.create({
    moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false, stripAnsi: true },
  });
  const aircraftId = options.aircraftId ?? "cessna-172";
  if (!isAircraftId(aircraftId)) throw new Error(`Unsupported aircraft: ${aircraftId}`);
  const dataPromise = downloadJsbsimData(options.dataBaseUrl, options.onProgress, aircraftId);
  const releaseSdk = (instance: JsbsimDestroyApi): void => {
    try {
      instance.destroy();
    } finally {
      instance.delete?.();
    }
  };
  let sdk: JSBSimSdk;
  let files: Awaited<typeof dataPromise>;
  try {
    [sdk, files] = await Promise.all([sdkPromise, dataPromise]);
  } catch (error) {
    void sdkPromise.then((instance) => releaseSdk(instance as JsbsimDestroyApi)).catch(() => {});
    throw error;
  }
  const stdout = (entry: { message: string }) => options.onLog?.("stdout", entry.message);
  const stderr = (entry: { message: string }) => options.onLog?.("stderr", entry.message);
  sdk.on("stdout", stdout);
  sdk.on("stderr", stderr);
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    sdk.off("stdout", stdout);
    sdk.off("stderr", stderr);
    releaseSdk(sdk as JsbsimDestroyApi);
  };
  try {
    options.onProgress?.({ message: "Preparing flight physics", progress: null });
    for (const file of files) sdk.writeDataFile(file.path, file.contents);
    await bootstrapAircraft(sdk, aircraftId, options.bootstrap);
    return { sdk, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
