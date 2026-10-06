/** 0sfs owns this explicitly artistic aircraft aerosol appearance. */
export interface EngineSmokeProfile {
  readonly id: string;
  readonly textureUrl: string;
  readonly provenanceUrl: string;
  readonly width: number;
  readonly height: number;
  readonly columns: number;
  readonly rows: number;
  readonly initialRadiusMeters: number;
  readonly finalRadiusMeters: number;
  /** Simple ambient-frame drift; this is neither exhaust CFD nor a contrail. */
  readonly exitSpeedMetersPerSecond: number;
  readonly colorLinear: readonly [number, number, number];
}

const profiles: ReadonlyMap<string, EngineSmokeProfile> = new Map([
  ["faint-aircraft-aerosol-v1", {
    id: "faint-aircraft-aerosol-v1",
    textureUrl: new URL("./generated/engine-smoke-flipbook.png", import.meta.url).href,
    provenanceUrl: new URL("./generated/engine-smoke-flipbook.manifest.json", import.meta.url).href,
    width: 128, height: 128, columns: 4, rows: 4,
    initialRadiusMeters: 0.12, finalRadiusMeters: 0.7,
    exitSpeedMetersPerSecond: 5, colorLinear: [0.3, 0.3, 0.3],
  }],
]);

export function getEngineSmokeProfile(id: string): EngineSmokeProfile | undefined {
  return profiles.get(id);
}
