import type { JSBSimSdk } from "@0x62/jsbsim-wasm";

interface ManifestFileList {
  files: string[];
}

const DEFAULT_DATA_BASE_URL = `${import.meta.env.BASE_URL}jsbsim-data`;

export async function hydrateJsbsimData(sdk: JSBSimSdk, baseUrl = DEFAULT_DATA_BASE_URL): Promise<void> {
  const manifestUrl = `${baseUrl}/manifest.json`;
  const response = await fetch(manifestUrl);
  if (!response.ok) {
    throw new Error(`Failed to load JSBSim data manifest from ${manifestUrl}.`);
  }

  const manifest = await response.json() as ManifestFileList;
  await Promise.all(
    manifest.files.map(async (relativePath) => {
      const fileResponse = await fetch(`${baseUrl}/${relativePath}`);
      if (!fileResponse.ok) {
        throw new Error(`Failed to load JSBSim asset ${relativePath}.`);
      }
      const text = await fileResponse.text();
      sdk.writeDataFile(relativePath, text);
    }),
  );
}
