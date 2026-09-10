import type { SurfaceHit, SurfaceQuery } from "foss-earth/runtime";

/** Share exact height queries within one synchronous flight tick. Tiles can
 * change between ticks, so even a parked aircraft must start with fresh data.
 * Never round coordinates or reuse a nearby height: that could hide a kerb,
 * building edge, coverage miss, or a refinement beneath the wheels. */
export function createFrameSurfaceQuery(surface: SurfaceQuery) {
  const samples: { lat: number; lon: number; hit: SurfaceHit | null }[] = [];
  return {
    beginFrame(): void { samples.length = 0; },
    sample(lat: number, lon: number): SurfaceHit | null {
      const cached = samples.find(sample => sample.lat === lat && sample.lon === lon);
      if (cached) return cached.hit;
      const hit = surface.sample(lat, lon);
      // A normal frame has at most six physics steps plus an interpolated view
      // and refinement anchors. Bound storage even for an unexpected caller.
      if (samples.length < 16) samples.push({ lat, lon, hit });
      return hit;
    },
    raycast: ((...args) => surface.raycast(...args)) as SurfaceQuery["raycast"],
  };
}
