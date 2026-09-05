import { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { wasmBinaryUrl, wasmModuleUrl } from "@0x62/jsbsim-wasm/wasm";
import { bootstrapC172p, type C172BootstrapOptions } from "./bootstrapC172";
import { hydrateJsbsimData } from "./hydrateJsbsimData";

export interface JsbsimRuntimeOptions {
  dataBaseUrl?: string;
  bootstrap?: C172BootstrapOptions;
  onLog?: (stream: "stdout" | "stderr", message: string) => void;
}

export interface JsbsimRuntime {
  sdk: JSBSimSdk;
  dispose(): void;
}

export async function createJsbsimRuntime(options: JsbsimRuntimeOptions = {}): Promise<JsbsimRuntime> {
  const sdk = await JSBSimSdk.create({
    moduleUrl: wasmModuleUrl,
    wasmUrl: wasmBinaryUrl,
    persistence: { enabled: false },
    log: { console: false, stripAnsi: true },
  });

  const logHandler = (stream: "stdout" | "stderr") => (entry: { message: string }) => {
    options.onLog?.(stream, entry.message);
  };
  sdk.on("stdout", logHandler("stdout"));
  sdk.on("stderr", logHandler("stderr"));

  await hydrateJsbsimData(sdk, options.dataBaseUrl);
  await bootstrapC172p(sdk, options.bootstrap);

  return {
    sdk,
    dispose(): void {
      sdk.off("stdout", logHandler("stdout"));
      sdk.off("stderr", logHandler("stderr"));
    },
  };
}
