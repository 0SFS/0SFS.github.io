import { f135ExhaustOpticalData } from "./generated/f135ExhaustOpticalData";

/** Data for one shared plume shader; no runtime spectral integration. */
export interface EngineExhaustOpticalProfile {
  readonly id: string;
  readonly textureUrl: string;
  /** Emitted assumptions, source/license attribution and deterministic artifact hashes. */
  readonly provenanceUrl: string;
  readonly width: number;
  readonly height: number;
  readonly colorSpace: "linear-srgb";
  readonly dry: { readonly firstRow: number; readonly rowCount: number };
  readonly afterburner: { readonly firstRow: number; readonly rowCount: number };
  /** Display sRGB accent sampled offline from the same afterburner spectrum. */
  readonly hudAccentHex: string;
  /** Baked linear RGB display emission for declared hot hardware, not gas. */
  readonly surfaceEmission?: { readonly samples: readonly (readonly [number, number, number])[] };
  /** Baked artistic brightness only; interpolate periodically using native simulation time. */
  readonly temporalEmission?: { readonly periodSeconds: number; readonly samples: readonly number[] };
}

const f135OpticalProfile: EngineExhaustOpticalProfile = {
  ...f135ExhaustOpticalData,
  textureUrl: new URL("./generated/f135-exhaust-lut.png", import.meta.url).href,
  provenanceUrl: new URL("./generated/f135-exhaust-lut.manifest.json", import.meta.url).href,
};

const profiles: ReadonlyMap<string, EngineExhaustOpticalProfile> = new Map([
  [f135OpticalProfile.id, f135OpticalProfile],
]);

export function getEngineExhaustOpticalProfile(id: string): EngineExhaustOpticalProfile | undefined {
  return profiles.get(id);
}
