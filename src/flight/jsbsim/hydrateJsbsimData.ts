import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import type { AircraftId } from "../aircraft/aircraftIds";

interface ManifestFileList {
  files: string[];
  aircraft: Record<string, string[]>;
}

const cache = new Map<string, Promise<Array<{ path: string; contents: string }>>>();
export interface JsbsimLoadProgress { message: string; progress: number | null }
const DEFAULT_DATA_BASE_URL = `${import.meta.env.BASE_URL}jsbsim-data`;

/** Fetch independently of WASM compilation, then write once its filesystem exists. */
export async function downloadJsbsimData(
  baseUrl = DEFAULT_DATA_BASE_URL,
  onProgress?: (progress: JsbsimLoadProgress) => void,
  aircraftId: AircraftId = "cessna-172",
): Promise<Array<{ path: string; contents: string }>> {
  const key = `${baseUrl}|${aircraftId}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const downloadPromise = (async () => {
    const response = await fetch(`${baseUrl}/manifest.json`);
    if (!response.ok) throw new Error("Failed to load the flight data manifest.");
    const manifest = await response.json() as ManifestFileList;
    const packageFiles = manifest.aircraft[aircraftId];
    if (!Array.isArray(packageFiles) || packageFiles.length === 0) {
      throw new Error(`No JSBSim package defined for aircraft ${aircraftId}.`);
    }
    let complete = 0;
    onProgress?.({ message: `Loading flight data: 0 of ${packageFiles.length} files`, progress: 0 });
    return Promise.all(packageFiles.map(async path => {
      const fileResponse = await fetch(`${baseUrl}/${path}`);
      if (!fileResponse.ok) throw new Error(`Failed to load JSBSim asset ${path}.`);
      const contents = await fileResponse.text();
      complete += 1;
      onProgress?.({ message: `Loading flight data: ${complete} of ${packageFiles.length} files`, progress: complete / packageFiles.length });
      return { path, contents };
    }));
  })();
  cache.set(key, downloadPromise);
  try {
    return await downloadPromise;
  } catch (error) {
    cache.delete(key);
    throw error;
  }
}

export async function hydrateJsbsimData(
  sdk: JSBSimSdk,
  baseUrl = DEFAULT_DATA_BASE_URL,
  aircraftId: AircraftId = "cessna-172",
): Promise<void> {
  for (const file of await downloadJsbsimData(baseUrl, undefined, aircraftId)) sdk.writeDataFile(file.path, file.contents);
}
