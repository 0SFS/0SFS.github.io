import { describe, expect, it } from "vitest";
import { resolveMapRuntimeConfig } from "./resolveMapRuntimeConfig";

describe("resolveMapRuntimeConfig", () => {
  it("uses Google tiles when a key is present and no map source override exists", () => {
    const config = resolveMapRuntimeConfig({
      googleApiKey: "test-key",
      searchParams: new URLSearchParams(),
    });
    expect(config.googleApiKey).toBe("test-key");
    expect(config.rasterBaseMap.id).toBe("usgs-imagery-topo");
  });

  it("uses a free raster source when mapSource requests it even with a Google key", () => {
    const config = resolveMapRuntimeConfig({
      googleApiKey: "test-key",
      searchParams: new URLSearchParams("mapSource=osm-standard"),
    });
    expect(config.googleApiKey).toBeNull();
    expect(config.rasterBaseMap.id).toBe("osm-standard");
  });

  it("forces Google when mapSource=google and a key is available", () => {
    const config = resolveMapRuntimeConfig({
      googleApiKey: "test-key",
      searchParams: new URLSearchParams("mapSource=google"),
    });
    expect(config.googleApiKey).toBe("test-key");
  });

  it("defaults to raster basemap when no Google key is provided", () => {
    const config = resolveMapRuntimeConfig({
      searchParams: new URLSearchParams(),
    });
    expect(config.googleApiKey).toBeNull();
    expect(config.rasterBaseMap.id).toBe("usgs-imagery-topo");
  });
});
