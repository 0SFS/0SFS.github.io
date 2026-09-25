# Competitor performance techniques

This page lists the speed and memory techniques that the simulators in
[Open-source competitors](open-source-competitors.md) use and that OSFS and FOSS
Earth do not. It also says which repository would own each one.

Checked on 25 September 2026 by reading each project's source at the commits in
[Sources](#sources). Nothing here was measured in OSFS. An entry means a competitor
does something we don't. It does not mean the technique would make OSFS faster.
Measure before and after any change with `flightPerf=1` and
`window.osfsFlightPerformance.snapshot()` ([Near-ground CPU performance](near-ground-performance.md)).

Owners: **FE** is FOSS Earth, **OSFS** is this repository, and **upstream** is
3d-tiles-renderer, whose Babylon adapter FOSS Earth uses for Google Photorealistic
3D Tiles. Upstream fixes follow the usual rule: fix the defect where it lives, and
have FOSS Earth only adapt.

## Summary

| # | Technique | Who has it | Owner | Size |
|---:|---|---|---|---|
| 1 | Draw one pixel per CSS pixel on high-density screens | Aeronaut, Cesium Flight Simulator, Web Flight Simulator (CesiumJS default) | FE | Small |
| 2 | Render resolution scale as a quality setting | Web Flight Simulator | FE | Small |
| 3 | Frame-rate cap | FlightGear, Rigs of Rods | FE, OSFS picks the value | Small |
| 4 | Less 3D Tiles detail toward the horizon | Aeronaut, Cesium Flight Simulator (CesiumJS default) | FE | Medium |
| 5 | Load the centre of the screen first | Aeronaut (CesiumJS default) | FE | Medium |
| 6 | Hold back tile requests while the view turns fast | Cesium Flight Simulator (CesiumJS default) | FE | Medium |
| 7 | Skip levels of detail when loading | Cesium Flight Simulator | FE | Small to try |
| 8 | Bound the 3D Tiles cache by bytes | All CesiumJS apps | Upstream, then FE | Medium |
| 9 | Decode heights and build meshes off the main thread | Kestrel, Skybolt, Orbiter, FlightGear | FE | Medium |
| 10 | Read terrain heights on the GPU from shared geometry | OpenGL Flightsim, Skybolt | FE | Large |
| 11 | Skirts instead of edge stitching | Kestrel | FE | Medium |
| 12 | Hysteresis before terrain detail changes | Kestrel | FE | Small |
| 13 | Spatial index for ground and body collision | FlightGear, Kestrel, YS Flight, Rigs of Rods | FE query, OSFS caller | Medium |
| 14 | Flight model off the main thread | MScSim, Rigs of Rods | OSFS | Large |
| 15 | HUD text updated at 10 Hz, not every frame | OpenGL Flightsim, Aeronaut | OSFS | Small |
| 16 | Distance level of detail for models | FlightGear, Retro Flight Simulator | OSFS, FE for generic models | Small today |
| 17 | GPU-compressed texture cache | FlightGear | FE | Medium |

Numbers 4 to 8 apply only to Google Photorealistic 3D Tiles, and 9 to 12 only to
the free raster maps over streamed elevation. The rest apply to both.

## Rendering and frame pacing

### 1. One pixel per CSS pixel

The three CesiumJS simulators draw one pixel per CSS pixel on a high-density screen.
That is CesiumJS's default: `useBrowserRecommendedResolution` is `true`, which
"ignore[s] `window.devicePixelRatio`", and none of the three turns it off. FOSS Earth
sets `adaptToDeviceRatio: true` (`src/engine/babylon/createRendererMode.ts:53`) and
draws every device pixel. On a 2× screen it therefore shades four times as many
pixels as they do.

The cost is sharpness in the 3D view. The HUD and panels are DOM and stay sharp.
Tile detail would not drop: the adapter computes screen-space error from the CSS
size (`TilesRenderer.js:303–305` in 3d-tiles-renderer's Babylon adapter).

### 2. Resolution scale setting

Web Flight Simulator's low, medium and high presets set CesiumJS `resolutionScale`
to 0.5, 0.75 and 1.0 (`src/main.js:84–96`). In flight it uses 0.75
(`src/world/cesiumWorld.js:71`). FOSS Earth's raster quality profiles change tile
zoom, not render resolution (`src/engine/babylon/rasterQuality.ts`). Nothing scales
the Google Photorealistic view. Babylon's `setHardwareScalingLevel` would do it.

### 3. Frame-rate cap

- **FlightGear:** `/sim/frame-rate-throttle-hz` sleeps until the next frame. It
  rounds the wait so each frame covers a whole number of model steps
  (`src/Time/TimeManager.cxx:522–538`).
- **Rigs of Rods:** `gfx_fps_limit` caps between 5 and 240 FPS
  (`source/main/main.cpp:2033–2041`).
- **CesiumJS:** has `targetFrameRate`, but none of the browser simulators sets it.

OSFS draws a frame on every display refresh while flying: 120 frames a second on a
120 Hz display. A cap belongs in FOSS Earth's render scheduler. OSFS should choose a
rate that divides the 120 Hz physics evenly (60, 40 or 30). That is FlightGear's
rounding.

## Google Photorealistic 3D Tiles

The browser competitors that show Google or Cesium tiles use CesiumJS. CesiumJS
turns on items 4 to 6 by default (Cesium3DTileset reference, CesiumJS 1.145).
3d-tiles-renderer has no equivalent of these three. Its default load order ranks
tiles by explicit priority, then prior use, error, distance and depth, with no
screen-centre term (`src/core/renderer/tiles/TilesRendererBase.js:39–70`). Its core
lets a plugin change a tile's view error (`TilesRendererBase.js:953–973`). A FOSS
Earth plugin could implement 4 and 5 there, without forking.

### 4. Horizon detail

CesiumJS's `dynamicScreenSpaceError` relaxes the error target for tiles that are far
away and near the horizon. It is on by default.

- **Aeronaut:** lowers the factor to 8 to keep more distant detail
  (`src/engine.js:89–90`).
- **Cesium Flight Simulator:** uses 16 to 32, depending on its quality preset
  (`packages/web/src/cesium/bridge/GameBridge.ts:240–262`).

FOSS Earth uses one `errorTarget` for the whole view
(`src/engine/babylon/createTilesRuntime.ts`). A view from the cockpit is mostly
horizon, so this is the likeliest large saving in downloads and triangles.

### 5. Centre of the screen first

CesiumJS's `foveatedScreenSpaceError` loads tiles near the screen centre first and
defers the edges. It is on by default. Aeronaut widens the cone to 0.35 and removes
the 0.2 s delay (`src/engine.js:86–87`).

### 6. Requests while turning

CesiumJS's `cullRequestsWhileMoving` skips requests for tiles that will leave the
view before they arrive. It is on by default. Cesium Flight Simulator sets it
explicitly (`packages/web/src/cesium/core/Scene.ts:103–104`). Aeronaut turns it off,
"to request finer city geometry instead of waiting for a stationary camera"
(`src/engine.js:83–85`). It is a trade, not a free win.

### 7. Skip levels of detail

Cesium Flight Simulator sets `skipLevelOfDetail: true` with CesiumJS's default skip
parameters (`packages/web/src/cesium/core/Scene.ts:105–108`). 3d-tiles-renderer's
equivalent is `optimizedLoadStrategy`. It is marked experimental and off by default
(`TilesRendererBase.js:545–560`), and FOSS Earth does not set it. Trying it is a
one-line change plus a measurement.

### 8. Cache bounded by bytes

CesiumJS bounds its tile cache at 512 MB, plus 512 MB of overflow (`cacheBytes` and
`maximumCacheOverflowBytes` defaults). In 3d-tiles-renderer's Babylon adapter,
`calculateBytesUsed` returns 1 with a TODO (`TilesRenderer.js:285–288`). Its cache
therefore counts tiles, not memory, whatever the tiles weigh. This matters most on
phones. Fix it upstream, then set the limit in FOSS Earth.

## Raster terrain

### 9. Work off the main thread

- **Kestrel:** builds terrain tile meshes off the main thread, through Bevy's
  async compute pool (`src/scenery/terrain.rs:497–511`).
- **Skybolt:** loads tiles with `ConcurrentAsyncTileLoader`
  (`src/Skybolt/SkyboltVis/Renderable/Planet/Tile/`).
- **Orbiter:** runs a tile loader thread (`OVP/D3D9Client/Tilemgr2.cpp:829`).
- **FlightGear:** pages scenery with OpenSceneGraph's database pager
  (`src/Scenery/SceneryPager.cxx`).

FOSS Earth decodes the PNG off the main thread with `createImageBitmap`. It then runs
`drawImage`, `getImageData` and the Terrarium decode on the main thread
(`src/terrain/terrainTiles.ts:88–98`). Building the mesh and computing normals also
run there (`VertexData.ComputeNormals` at
`src/engine/babylon/createRasterTilesRuntime.ts:376`). FOSS Earth already decodes
imagery in a worker, so the pattern exists.

### 10. Heights on the GPU

- **OpenGL Flightsim:** draws geometry clipmaps, rings of one shared grid, and reads
  height and normal from textures in the vertex shader
  (`OpenGL_Flightsim/src/terrain.h`, `OpenGL_Flightsim/shaders/terrain.vert:37–51`).
- **Skybolt:** displaces tessellated tiles from a height texture
  (`Assets/Core/Shaders/TessDisplacement*`). A tile can draw from its parent's
  heightmap through a scale and offset
  (`src/Skybolt/SkyboltVis/Renderable/Planet/Tile/OsgTileFactory.cpp:39–48`).

In FOSS Earth, each tile has its own vertex, index and UV buffers. Normals are
computed on the CPU. These two are already listed as known gaps in FOSS Earth's
`docs/performance-pass.md`. Also, a refinement blends every position on the CPU and
uploads the whole buffer on each frame of its 1.2 s morph
(`src/terrain/meshRefinement.ts:20–30`).

With heights on the GPU, a new tile uploads a texture instead of a mesh, and a morph
becomes a shader uniform. This is large work. Raster ground contact reads the
rendered triangle grid ([Near-ground CPU performance](near-ground-performance.md)),
so the CPU height query must still match the surface the GPU draws.

### 11. Skirts

Kestrel hangs a skirt 0.15 chunk widths deep under each tile edge
(`src/scenery/terrain.rs:52`), so each tile is independent of its neighbours. FOSS
Earth stitches edges and corners to its neighbours on the CPU when a tile commits
(`patchesForGeometryCommit` in `src/terrain/meshRefinement.ts`). FOSS Earth's
performance pass already limited that stitching to the tiles affected. Skirts would
remove it entirely. The cost is short vertical walls that can show at steep angles.

### 12. Detail hysteresis

Kestrel splits a tile at 2.2 chunk widths and merges it at 2.8, "to avoid flickering"
(`src/scenery/terrain.rs:39–45`). It re-evaluates only after 250 m of movement
(`terrain.rs:56`).

FOSS Earth picks the focus zoom by rounding, with no margin
(`chooseTileZoom`, `src/engine/babylon/createRasterTilesRuntime.ts:199–205`). A
camera near a rounding boundary can flip the whole focus ring between two zooms, and
each flip queues a ring of tiles. FOSS Earth's imagery selector already applies
hysteresis (`src/terrain/imagery/imagerySelector.ts`). Terrain could reuse the idea.

## Collision

### 13. Spatial index for ground queries

- **FlightGear:** once per frame, collects the scenery BVH nodes within a radius of
  the aircraft. The radius is the aircraft's size plus 2 · dt · speed
  (`src/FDM/YASim/YASim.cxx:285`). Every gear and contact query in that frame then
  runs against the cache (`src/FDM/groundcache.hxx`, SimGear `simgear/bvh/`).
- **Kestrel:** collides against Parry trimesh colliders, which carry their own BVH
  (`src/scenery/terrain.rs`).
- **YS Flight:** keeps a simplified collision shell per scenery object, with a
  lattice for ray casts (`src/scenery/ysscenery.cpp:1423–1433, 3511`).
- **Rigs of Rods:** hashes collision triangles into 2 m cells. It stores each cell's
  maximum height so it can skip the cell without testing triangles
  (`source/main/physics/collision/Collisions.h:102–143`).

OSFS casts finite rays against the visible Google tile meshes and rejects meshes by
their bounds. A BVH prototype in FOSS Earth's `benchmarks/collision/` took 0.0008 ms
for five rays, where the production path took 2.25 ms. It is not integrated
([Collision compute comparison](collision-compute-comparison.md)).

This is the largest gap we have measured. FOSS Earth owns the query. OSFS owns the
per-frame cache and the radius.

## Simulation loop

### 14. Flight model off the main thread

MScSim runs its flight model on a high-priority Qt thread at 100 Hz
(`src/Simulation.cpp:71–88`). Rigs of Rods spreads vehicle physics across a thread
pool (`source/main/physics/ActorManager.cpp:1269, 1304`). OSFS runs JSBSim's 120 Hz
substeps inside the render tick (`src/flight/createFlightSimApp.ts:1698`).

The hard part is ground contact. JSBSim asks for terrain height, and the terrain
lives on the main thread. FlightGear's per-frame ground cache (13) is the pattern
that allows it: build the cache on the main thread, then send it to the worker.
Do 13 first.

### 15. HUD at 10 Hz

OpenGL Flightsim updates its HUD every 0.1 s (`OpenGL_Flightsim/src/main.cpp:495–496`).
Aeronaut publishes UI state every 90 ms (`src/engine.js:77`). OSFS already updates
its panels every 100 ms (`src/flight/createFlightSimApp.ts:1858`). But the flight
HUD writes `textContent` on every frame (`src/flight/hud/flightHud.ts:467–476`).
Writing only when the text changes would be enough.

## Scenery objects

### 16. Distance level of detail

FlightGear draws scenery objects at detailed, rough and bare ranges
(`/sim/rendering/static-lod/*`, `src/Scenery/tilemgr.cxx:104–108`). Retro Flight
Simulator picks a model's level from its projected size on screen
(`src/script/render/helpers.ts:263–272`). OSFS draws one aircraft mesh at every
distance. That hardly matters with one aircraft. It will matter with traffic or
multiplayer.

### 17. GPU-compressed texture cache

FlightGear converts textures to compressed DDS with mipmaps and caches them on disk
(`/sim/rendering/texture-cache`, SimGear
`simgear/scene/model/ModelRegistry.cxx:245–402`). FOSS Earth's persistent cache stores
the downloaded image files (`src/terrain/mapCache.ts`). Each visit decodes them again
to uncompressed textures. The browser equivalent is KTX2 or Basis transcoding in a
worker. It saves GPU memory and upload time rather than frame time.

## What we already have

These are not gaps, even though competitors have them too:

- **Rendering:**
  - render on demand (FOSS Earth `src/engine/babylon/renderScheduler.ts`)
  - raster Auto quality (`rasterQuality.ts`)
- **Tiles and caching:**
  - a persistent public tile cache (`src/terrain/mapCache.ts`)
  - corridor prefetch ahead of the aircraft
  - coarse fallback from the parent's triangles (`patchPoint` in
    `src/terrain/meshRefinement.ts`)
- **Main-thread budget:**
  - imagery decode in a worker
  - a 2 ms per-frame budget for rebuilding meshes
  - stitching only the affected tiles
- **Flight app:**
  - finite rays with mesh-bound rejection, and a per-tick height cache (OSFS)
  - 100 ms panel updates
  - a frame profiler
  - clamped frame time

## Looked at and left out

- **FXAA:** Cesium Flight Simulator runs it on top of 4× MSAA, and Web Flight
  Simulator offers it as its antialiasing switch. Neither uses it to save time.
- **3d-tiles-renderer's `loadSiblings`:** only applies with
  `optimizedLoadStrategy` (item 7).
- **Frustum culling:** the Babylon adapter already tests oriented bounding boxes
  (`TileBoundingVolume.js:116–126`), like CesiumJS.
- **Orbiter's coarse-first load queue** (`Tilemgr2.cpp`): FOSS Earth loads nearby
  detail first on purpose, and caches parents coarse-first.
- **Not applicable yet:**
  - Instanced and impostor vegetation (Skybolt `GpuForest`, Rigs of Rods
    PagedGeometry, Retro Flight Simulator's instanced models): OSFS draws no
    vegetation.
  - YS Flight's lattice for many aircraft and ground vehicles (`src/core/fslattice.h`):
    OSFS flies one aircraft.
- **Nothing found:**
  - The Little Plane Project draws 2D canvas terrain, batching same-coloured runs
    into one fill per colour. That doesn't carry over to a 3D globe.
  - Dogfight Sandbox has nothing beyond what its HARFANG engine does.
  - GeoFS is closed source.

## Suggested order

Cheapest first. Measure each before moving on.

1. Try 1 or 2, a lower render resolution, in FOSS Earth, behind a setting.
2. Try 7, `optimizedLoadStrategy`. Add 12, terrain zoom hysteresis.
3. Change 15, HUD writes only when the text changes.
4. Add 3, a frame cap that divides 120 Hz.
5. Write 4, horizon detail, as a FOSS Earth 3d-tiles-renderer plugin.
6. Integrate 13, the collision BVH, with a per-frame ground cache. Then consider 14.
7. Do 9, moving terrain decode and normals to a worker.
8. The large work: 10, heights on the GPU, and 8, the upstream byte count.

## Sources

| Project | Repository | Commit read |
|---|---|---|
| Aeronaut | vinny-palumbo/FlightSim | 4a47e8a (2026-09-22) |
| Cesium Flight Simulator | WilliamAvHolmberg/cesium-flight-simulator | 640f6dd (2025-10-28) |
| Web Flight Simulator | dimartarmizi/web-flight-simulator | 10cec1f (2026-02-12) |
| Retro Flight Simulator | ruben3d/retroflightsim | 1b373c1 (2023-05-10) |
| The Little Plane Project | Glowstick0017/Little-Plane-Project | 6f5383c (2026-03-20) |
| FlightGear | gitlab.com/flightgear/flightgear | 21b4969 (2026-09-22) |
| SimGear | gitlab.com/flightgear/simgear | e3c9d3f (2026-09-18) |
| YS Flight Simulator | captainys/YSFLIGHT | 3500fa3 (2022-08-19) |
| Kestrel | wesfly/kestrel | fe727c5 (2026-09-07) |
| MScSim | marek-cel/mscsim | 3bbcb09 (2024-05-31) |
| Orbiter | orbitersim/orbiter | 4137930 (2026-09-24) |
| Rigs of Rods | RigsOfRods/rigs-of-rods | e81b37c (2026-09-21) |
| Skybolt | Prograda/Skybolt | 0589ee5 (2026-02-10) |
| Dogfight Sandbox | harfang3d/dogfight-sandbox-hg2 | 8bf49a6 (2026-04-01) |
| OpenGL Flightsim | gue-ni/OpenGL_Flightsim | 7b865b0 (2023-07-30) |
| 3d-tiles-renderer | NASA-AMMOS/3DTilesRendererJS | 0.4.24, as installed in FOSS Earth |
| CesiumJS defaults | cesium.com reference for `Cesium3DTileset` and `Viewer` | 1.145 |

Line numbers refer to those commits. OSFS and FOSS Earth lines refer to the working
trees on 25 September 2026.
