import { buildIdentity, JSBSimSdk } from "@felipegalind0/jsbsim";
import { wasmBinaryUrl, wasmModuleUrl } from "@felipegalind0/jsbsim/wasm";
import { bootstrapAircraft, type C172BootstrapOptions } from "./bootstrapC172";
import { type AircraftId, isAircraftId } from "../aircraft/aircraftIds";
import { downloadJsbsimData, type JsbsimLoadProgress } from "./hydrateJsbsimData";
import { readJsbsimBuildIdentity, type JsbsimBuildIdentity } from "./jsbsimBuildIdentity";

export interface JsbsimRuntimeIdentity {
  aircraftId: AircraftId;
  build: JsbsimBuildIdentity;
  assets: { moduleUrl: string; wasmUrl: string };
}

declare global {
  interface Window {
    /** Developer diagnostics for the current runtime; contains no native handles. */
    osfsJsbsimBuild?: JsbsimRuntimeIdentity;
  }
}

export interface JsbsimRuntimeOptions {
  dataBaseUrl?: string;
  aircraftId?: AircraftId;
  bootstrap?: C172BootstrapOptions;
  onProgress?: (progress: JsbsimLoadProgress) => void;
  onLog?: (stream: "stdout" | "stderr", message: string) => void;
}

export interface JsbsimRuntime { sdk: JSBSimSdk; identity: JsbsimRuntimeIdentity; dispose(): void }

export async function createJsbsimRuntime(options: JsbsimRuntimeOptions = {}): Promise<JsbsimRuntime> {
  const aircraftId = options.aircraftId ?? "cessna-172";
  if (!isAircraftId(aircraftId)) throw new Error("Unsupported aircraft: " + aircraftId);
  const identity: JsbsimRuntimeIdentity = {
    aircraftId,
    build: readJsbsimBuildIdentity(buildIdentity),
    assets: { moduleUrl: wasmModuleUrl.toString(), wasmUrl: wasmBinaryUrl.toString() },
  };
  // Asset URLs and build identity come from the same installed SDK package.
  const sdkPromise = JSBSimSdk.create({
    moduleUrl: wasmModuleUrl, wasmUrl: wasmBinaryUrl,
    persistence: { enabled: false }, log: { console: false, stripAnsi: true },
  });
  const dataPromise = downloadJsbsimData(options.dataBaseUrl, options.onProgress, aircraftId);
  let sdk: JSBSimSdk;
  let files: Awaited<typeof dataPromise>;
  try {
    [sdk, files] = await Promise.all([sdkPromise, dataPromise]);
  } catch (error) {
    // A late successful allocation still belongs to this failed startup.
    void sdkPromise.then(instance => instance.destroy()).catch(() => {});
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
    if (typeof window !== "undefined" && window.osfsJsbsimBuild === identity) delete window.osfsJsbsimBuild;
    sdk.destroy();
  };
  try {
    options.onProgress?.({ message: "Preparing flight physics", progress: null });
    for (const file of files) sdk.writeDataFile(file.path, file.contents);
    await bootstrapAircraft(sdk, aircraftId, options.bootstrap);
    if (typeof window !== "undefined") window.osfsJsbsimBuild = identity;
    return { sdk, identity, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
