import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import type { AircraftId } from "../aircraft/aircraftIds";

/** The same aircraft dependency selection is used by the browser and FDM tests. */
export function resolveAircraftDataFiles(manifest: unknown, aircraftId: AircraftId): string[] {
  const aircraft = manifest && typeof manifest === "object" && "aircraft" in manifest
    ? manifest.aircraft : null;
  const files = aircraft && typeof aircraft === "object" && aircraftId in aircraft
    ? (aircraft as Record<string, unknown>)[aircraftId] : null;
  if (!Array.isArray(files) || files.length === 0 || !files.every(path =>
    typeof path === "string" && path.length > 0 && !path.startsWith("/") && !path.split("/").includes(".."))) {
    throw new Error("No valid JSBSim package defined for aircraft " + aircraftId + ".");
  }
  return [...new Set(files as string[])];
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
    const packageFiles = resolveAircraftDataFiles(await response.json(), aircraftId);
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
