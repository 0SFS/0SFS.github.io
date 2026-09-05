# Smooth Elevation Height Model Proposal

Status: Proposed  
Date: 2026-05-18

## Problem

The current terrain height path is tied to loaded Google Photorealistic 3D Tiles. `src/terrain/tileHeightProvider.ts` casts local rays against visible tile meshes, and `src/terrain/anchorHeight.ts` caches and smooths those samples before the app uses them for the orbit compass and camera anchor height.

That gives useful local height when tiles are loaded, but it has two major drawbacks:

- It is geometry-dependent. Moving across a roof, bridge, tree, or tall building can change the sampled height even when the desired value is approximate ground elevation.
- It is view/data-dependent. If a tile has not loaded, or if different tile LODs are loaded, the sampled height can change discontinuously.

The same issue affects external layers that place POIs at `geodeticToEcef(lat, lon, 0)`: in above-sea-level regions such as Minneapolis, sprites can be visually under terrain because the ellipsoid height is not the local ground height.

We need a deterministic function:

```ts
heightMeters = smoothSurfaceHeightMeters(latDeg, lonDeg)
```

Requirements:

- Continuous output over the whole globe.
- Smoothed topography, not building or tree height.
- Small client payload, ideally tens of KB, not multi-MB.
- No backend requirement.
- Synchronous and fast enough to call while building large POI layers.
- Returns a height compatible with `geodeticToEcef`, meaning height above the WGS84 ellipsoid, or documents any approximation clearly.

## Recommended Approach

Use a low-degree spherical harmonic topography model baked into the package.

This is the sphere equivalent of a polynomial on a line. A 1D polynomial approximates a smooth curve with basis terms like `1, x, x^2, x^3`. A spherical harmonic model approximates a smooth scalar field on a sphere with basis functions `Y(n,m)(lat, lon)`.

Conceptually:

```text
h(lat, lon) = sum over n,m of coefficient[n,m] * sphericalHarmonic[n,m](lat, lon)
```

Truncating the series at a low degree removes high-frequency details. That is exactly what we want: mountain ranges, plateaus, and broad coastal terrain remain; buildings, trees, small ridges, and Google tile LOD artifacts disappear.

Recommended first target:

- Degree 36 spherical harmonics.
- `(36 + 1)^2 = 1369` real coefficients.
- Store as compact JSON or a generated TypeScript numeric array.
- Expected payload: roughly 10-30 KB depending on encoding.
- Smooth enough for camera anchors and POI placement.

If degree 36 is too smooth, increase to degree 60:

- `(60 + 1)^2 = 3721` coefficients.
- Expected payload: roughly 30-80 KB depending on encoding.
- Still small compared with a raster heightmap.

## Data Source

Use a public global topography model that already publishes spherical harmonic coefficients, then truncate offline.

Candidate sources:

- Earth2014 / Earth2014 topography coefficients.
- ETOPO-derived spherical harmonic coefficients.
- Any public-domain or permissively licensed global topography coefficient set with clear units and datum.

The generated runtime bundle should not fetch anything. It should contain only the truncated coefficients needed by the chosen degree.

Important datum detail:

- `geodeticToEcef` expects altitude above the WGS84 ellipsoid.
- Many topography models describe orthometric height above mean sea level / geoid.
- The generation step should either convert topography to approximate ellipsoid height by adding a low-degree geoid undulation model, or the runtime API must document that the returned height is an orthometric approximation.

For the first implementation, an orthometric approximation is acceptable for visual marker placement because the dominant error being fixed is hundreds of meters in elevated terrain. The follow-up improvement should bake a low-degree geoid correction so the API can honestly return `heightAboveEllipsoidMeters`.

## Proposed API

Add a new terrain module:

```text
src/terrain/smoothElevation.ts
src/terrain/smoothElevationCoefficients.ts
src/terrain/smoothElevation.test.ts
```

Public functions:

```ts
export interface SmoothElevationOptions {
  clampMinMeters?: number;
  clampMaxMeters?: number;
}

export function smoothSurfaceHeightMeters(
  latDeg: number,
  lonDeg: number,
  options?: SmoothElevationOptions,
): number;

export function smoothSurfaceEcef(
  latDeg: number,
  lonDeg: number,
  offsetMeters?: number,
): EcefCoord;
```

`smoothSurfaceHeightMeters` returns the approximate smoothed terrain height. `smoothSurfaceEcef` is a convenience wrapper around `geodeticToEcef(lat, lon, height + offset)` for markers, compass anchors, and low-poly close-up POIs.

Export from `src/index.ts`:

```ts
export { smoothSurfaceHeightMeters, smoothSurfaceEcef } from "./terrain/smoothElevation";
```

## Runtime Evaluation

Use real spherical harmonics to avoid complex numbers. The evaluator should:

1. Convert `latDeg` to geocentric/spherical colatitude as needed by the coefficient convention.
2. Normalize `lonDeg` to radians.
3. Evaluate associated Legendre functions with a stable recurrence.
4. Accumulate cosine and sine longitude terms incrementally instead of calling `Math.sin(m * lon)` and `Math.cos(m * lon)` repeatedly.
5. Return a finite number, clamped to a broad physical range by default.

Pseudo-code:

```ts
export function smoothSurfaceHeightMeters(latDeg: number, lonDeg: number): number {
  const latRad = latDeg * DEG_TO_RAD;
  const lonRad = lonDeg * DEG_TO_RAD;
  const x = Math.sin(latRad);

  let height = C00;
  const legendre = computeNormalizedAssociatedLegendre(MAX_DEGREE, x);
  const trig = computeLonTrig(MAX_DEGREE, lonRad);

  for (let n = 1; n <= MAX_DEGREE; n++) {
    height += coeffCos[n][0] * legendre[n][0];
    for (let m = 1; m <= n; m++) {
      height += legendre[n][m] * (
        coeffCos[n][m] * trig.cos[m] +
        coeffSin[n][m] * trig.sin[m]
      );
    }
  }

  return clamp(height, -500, 9000);
}
```

Performance target: degree 36 should be well below 0.1 ms per call on modern desktop hardware. Large POI layers should evaluate once per point during layer construction, not every frame.

## Integration Plan

### Phase 1: Add the model

Add `smoothElevation.ts`, generated coefficients, and tests.

Tests should cover:

- Known broad elevations: Denver / Minneapolis above sea level, Death Valley below sea level, Himalayas high positive, ocean near 0 or below depending on source.
- Continuity: small lat/lon deltas should not create large jumps.
- Longitude wrap: `lon = -180`, `180`, and `540` normalize consistently.
- Poles: no NaN near +/-90 degrees.
- Determinism: same input returns same output without scene/tile dependencies.

### Phase 2: Replace default anchor provider

In `src/app/createGlobeApp.ts`, replace the default provider path:

```ts
provider: createTileHeightProvider(runtime.scene),
```

with:

```ts
provider: smoothSurfaceHeightMeters,
```

Keep `createTileHeightProvider` available as an optional advanced provider, but do not use it by default for the compass. This removes building/roof jitter by making the anchor follow smoothed terrain instead of loaded mesh geometry.

`createAnchorHeightResolver` can remain mostly unchanged. It already accepts a synchronous `AnchorHeightProvider`, caches by cell, and smooths vertical motion. With a pure smooth model, cache misses disappear and `providerMissRetryMs` becomes irrelevant for the default provider.

### Phase 3: Support explicit layer placement

External apps using `foss-earth`, such as the property map, need to place points above terrain without independently solving elevation.

Recommended usage:

```ts
const pos = smoothSurfaceEcef(point.lat, point.lng, markerOffsetMeters);
sprite.position.set(pos.x, pos.y, pos.z);
```

For close-up spheres:

```ts
const pos = smoothSurfaceEcef(point.lat, point.lng, sphereRadiusMeters);
mesh.position.set(pos.x, pos.y, pos.z);
```

This fixes elevated cities without requiring Google tile sampling per marker.

### Phase 4: Optional exact-height override for POIs

Keep existing `anchorHeightSamples` support for layers that know a precise local height. The resolution order should be:

1. Explicit layer sample or tracked POI mesh position.
2. Smooth global elevation model.
3. Ellipsoid fallback only if the model is unavailable or disabled.

Do not use Google tile ray sampling for the default camera anchor. If a product needs exact rooftop placement, expose it as an opt-in provider mode so users understand it may follow buildings and tile LOD.

## Why Not a Raster Heightmap

A raster heightmap is simpler conceptually, but it has tradeoffs:

- A useful global grid is larger than the proposed coefficient table.
- Bilinear interpolation is continuous but not smooth at cell boundaries.
- Bicubic interpolation is smoother but still requires enough grid resolution and payload.
- Tiling the heightmap adds cache/fetch complexity.

Spherical harmonics better match this requirement: a tiny coefficient table, closed-form evaluation, global coverage, and analytic continuity.

## Why Not Keep Google Tile Height Sampling

Google tile sampling is useful for exact visible geometry, but it is the wrong default for approximate earth surface height:

- It samples buildings, bridges, trees, and tile artifacts.
- It depends on which meshes are currently loaded and pickable.
- It can change when the camera moves even if the requested lat/lon only changes slightly.
- It cannot help external layer setup before tiles are loaded.

The smooth model should become the default baseline. Tile sampling should become an opt-in refinement, not the first source of truth.

## Coefficient Generation Script

Add an offline script, not part of the runtime bundle:

```text
scripts/generate_smooth_elevation_coefficients.py
```

Responsibilities:

- Download or read the chosen public coefficient source.
- Truncate to the configured maximum degree.
- Convert units and datum if necessary.
- Emit `src/terrain/smoothElevationCoefficients.ts` with:
  - `MAX_DEGREE`
  - coefficient arrays
  - source metadata
  - generation date
  - datum notes

The generated file should be committed so app users do not need Python or network access.

## Acceptance Criteria

- `smoothSurfaceHeightMeters(lat, lon)` is synchronous and has no scene dependency.
- Default compass/camera anchor height no longer jumps over buildings or changes due to tile LOD.
- Property/tenant/rental markers can call a public `smoothSurfaceEcef` helper and no longer appear underground in above-sea-level cities.
- Degree 36 bundle size remains under 50 KB uncompressed, or the proposal must justify moving to degree 60.
- Unit tests prove continuity, wrapping, pole handling, and rough known-location sanity.
- `npm run test` and `npm run build` pass.

## Open Questions

- Which coefficient source and license should be selected for the committed bundle?
- Should v1 return orthometric height with documentation, or should the generator include low-degree geoid correction immediately?
- Should `createTileHeightProvider` remain wired behind a runtime option for exact-height debug/inspection?
- What marker offset should downstream apps use by default for sprites versus close-up spheres?

## Proposed First Implementation Scope

Implement degree 36 first, export the helper API, and switch the default compass anchor provider to the smooth model. Keep `createTileHeightProvider` in the codebase but stop using it by default. After that, update downstream map layers to call `smoothSurfaceEcef` for sprite and close-up sphere placement.