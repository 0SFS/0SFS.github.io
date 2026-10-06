import { describe, expect, it } from "vitest";
import { getEngineExhaustOpticalProfile } from "./engineExhaustProfiles";

describe("engine exhaust optical data", () => {
  it("exposes baked mode banks and shared display accent without substituting an unknown engine", () => {
    const profile = getEngineExhaustOpticalProfile("f135-visible-approximation-v1");
    expect(profile).toMatchObject({
      width: 1, height: 1024, colorSpace: "linear-srgb",
      dry: { firstRow: 0, rowCount: 1024, temperatureKelvinRange: [150, 3200] },
      afterburner: { firstRow: 0, rowCount: 1024, temperatureKelvinRange: [150, 3200] },
      surfaceEmission: { temperatureKelvinRange: [300, 1800], unit: "cd/m2" },
      spatialEmission: { width: 128, height: 128, downstreamMixFraction: 0.65 },
    });
    expect(profile?.textureUrl).toContain("f135-exhaust-lut.png");
    expect(profile?.provenanceUrl).toContain("f135-exhaust-lut.manifest.json");
    expect(profile?.hudAccentHex).toMatch(/^#[0-9a-f]{6}$/);
    expect(profile?.gasEmission?.spatialField?.model).toBe("axisymmetric-gas-bath-v2");
    expect(profile?.gasEmission?.model).toBe("imposed-gas-bath-v2");
    expect(profile?.gasEmission?.chemistryStatus).toBe("surrogate-parcel");
    expect(profile?.surfaceEmission?.samples).toHaveLength(512);
    expect(profile?.spatialEmission?.textureUrl).toContain("f135-exhaust-spatial.png");
    expect(getEngineExhaustOpticalProfile("unrecognized-engine")).toBeUndefined();
  });
});
