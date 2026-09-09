import type { JSBSimSdk } from "@0x62/jsbsim-wasm";

interface ManifestFileList { files: string[] }
export interface JsbsimLoadProgress { message: string; progress: number | null }
const DEFAULT_DATA_BASE_URL = `${import.meta.env.BASE_URL}jsbsim-data`;

/** Fetch independently of WASM compilation, then write once its filesystem exists. */
export async function downloadJsbsimData(
  baseUrl = DEFAULT_DATA_BASE_URL,
  onProgress?: (progress: JsbsimLoadProgress) => void,
): Promise<Array<{ path: string; contents: string }>> {
  const response = await fetch(`${baseUrl}/manifest.json`);
  if (!response.ok) throw new Error("Failed to load the flight data manifest.");
  const manifest = await response.json() as ManifestFileList;
  let complete = 0;
  onProgress?.({ message: `Loading flight data: 0 of ${manifest.files.length} files`, progress: 0 });
  return Promise.all(manifest.files.map(async path => {
    const fileResponse = await fetch(`${baseUrl}/${path}`);
    if (!fileResponse.ok) throw new Error(`Failed to load JSBSim asset ${path}.`);
    const contents = await fileResponse.text();
    complete += 1;
    onProgress?.({ message: `Loading flight data: ${complete} of ${manifest.files.length} files`, progress: complete / manifest.files.length });
    return { path, contents };
  }));
}

export async function hydrateJsbsimData(sdk: JSBSimSdk, baseUrl = DEFAULT_DATA_BASE_URL): Promise<void> {
  for (const file of await downloadJsbsimData(baseUrl)) sdk.writeDataFile(file.path, file.contents);
}
