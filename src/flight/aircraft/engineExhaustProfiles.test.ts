import { describe, expect, it } from "vitest";
import { getEngineExhaustOpticalProfile } from "./engineExhaustProfiles";

describe("engine exhaust optical data", () => {
  it("exposes baked mode banks and shared display accent without substituting an unknown engine", () => {
    const profile = getEngineExhaustOpticalProfile("f135-visible-approximation-v1");
    expect(profile).toMatchObject({
      width: 64, height: 32, colorSpace: "linear-srgb",
      dry: { firstRow: 0, rowCount: 16 }, afterburner: { firstRow: 16, rowCount: 16 },
    });
    expect(profile?.textureUrl).toContain("f135-exhaust-lut.png");
    expect(profile?.provenanceUrl).toContain("f135-exhaust-lut.manifest.json");
    expect(profile?.hudAccentHex).toMatch(/^#[0-9a-f]{6}$/);
    expect(profile?.temporalEmission?.periodSeconds).toBe(0.8);
    expect(profile?.temporalEmission?.samples).toHaveLength(32);
    expect(getEngineExhaustOpticalProfile("unrecognized-engine")).toBeUndefined();
  });
});
