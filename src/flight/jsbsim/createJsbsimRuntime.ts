import { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { wasmBinaryUrl, wasmModuleUrl } from "@0x62/jsbsim-wasm/wasm";
import { bootstrapC172p, type C172BootstrapOptions } from "./bootstrapC172";
import { downloadJsbsimData, type JsbsimLoadProgress } from "./hydrateJsbsimData";

export interface JsbsimRuntimeOptions {
  dataBaseUrl?: string;
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
  const dataPromise = downloadJsbsimData(options.dataBaseUrl, options.onProgress);
  let sdk: JSBSimSdk;
  let files: Awaited<typeof dataPromise>;
  try {
    [sdk, files] = await Promise.all([sdkPromise, dataPromise]);
  } catch (error) {
    void sdkPromise.then(sdk => sdk.destroy()).catch(() => {});
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
    sdk.destroy();
  };
  try {
    options.onProgress?.({ message: "Preparing flight physics", progress: null });
    for (const file of files) sdk.writeDataFile(file.path, file.contents);
    await bootstrapC172p(sdk, options.bootstrap);
    return { sdk, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
