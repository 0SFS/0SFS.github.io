import type { JSBSimSdk } from "@0x62/jsbsim-wasm";

interface ManifestFileList {
  files: string[];
}

export async function hydrateJsbsimData(sdk: JSBSimSdk, baseUrl = "/jsbsim-data"): Promise<void> {
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
