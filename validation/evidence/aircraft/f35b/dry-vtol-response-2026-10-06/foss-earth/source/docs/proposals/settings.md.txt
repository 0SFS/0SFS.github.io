# Settings: every choice named, visible and changeable

Status: Stages 1 to 5 implemented (2026-09-25 and 26): the registry, the
record, migration, export and import, URL values, the section controls, host
markers, the Loading and memory and Imagery selection parameters, detail focus
on both maps, terrain detail as a continuous target, the automatic
adjustment, the camera, input and renderer parameters, presets, the moved
Toolbar and Performance debug sections, and a test that fails on a tuning
constant outside the registry. [Implementation](#implementation)
says what exists, how a host uses it, and where it differs from this spec.
Owner: FOSS Earth. Applications built on it, 0sfs included, register their own
settings through the same system. 0sfs's catalogue:
[`0sfs/docs/proposals/flight-settings.md`](../../../0sfs/docs/proposals/flight-settings.md).

## Why

FOSS Earth is open source so that anyone who disagrees with a choice the
programmers made can change it. Changing the source should be the last resort,
not the usual one. Wherever the program decides how to spend a machine's compute,
memory, bandwidth or the user's attention, that decision is a setting the user can
see and change, with its real unit, its real value and the reason for its default.

Three buckets named Low, Balanced and High are the opposite of that. They bundle
unrelated decisions (terrain mesh density, how far the high-detail ring reaches,
how many tiles to cache, how much GPU memory imagery may use) behind a word that
tells a programmer nothing and hides what is being traded. This spec removes them.

Presets stay, for people who want to pick something and fly. A preset is a
visible list of parameter values, never a hidden mode.

## Principles

1. **No hidden tunables.** Any constant that decides what is loaded, drawn,
   kept, computed or shown to the user is a parameter: a stable id, a unit, a
   range, a default, a home, and a one-line description of what it changes.
   Physical constants (WGS84, the tile grid) and file formats are not
   parameters.
2. **Continuous where the quantity is continuous.** A budget in MiB is a number;
   a detail target is a position on a scale. Discrete choices exist only where
   the thing itself is discrete: a renderer backend, a map source, on or off.
3. **One control for one range.** Choosing an acceptable part of one scale is
   one track with two thumbs (see [Controls](#controls)), never two sliders.
4. **Presets are data.** A preset is a named set of parameter values stored as
   JSON, shown in full before and after it is applied. Selecting one copies its
   values; nothing keeps a live link to it. Users can save, edit, export and
   import their own. No code branches on a preset's name.
5. **Automatic is a range, not a mode.** Where the program adapts a value
   itself (to frame time, to the device), the user sets the range it may move
   in, sees where it is now and why, and can pin it to one value.
6. **Every value has a provenance.** The UI shows whether a value is the
   default, a preset's, the user's, a URL's, or the automatic controller's, and
   what the default was derived from (a constant, a device hint, a renderer
   limit).
7. **Limits are shown, not hidden.** When the device or a source cannot deliver
   what a setting asks for, the setting stays as asked and the UI says what
   limited it: source, memory, backend, loading, or a host requirement. Hard
   device limits (maximum texture size, WebGL 1 restrictions) are shown as the
   bounds of the control, with the reason.
8. **One home per setting.** Each setting lives in exactly one tab section, the
   one where its effect is seen ([UI layout](../ui-layout.md)). A tab called
   "Settings" that collects whatever has no obvious home is not a home.
9. **Cost is visible next to the knob.** A budget setting shows the live reading
   it bounds (bytes resident, requests in flight, frame time), so the user can
   see what their compute is being spent on.
10. **The source is one click away.** Every parameter links to the file that
    uses it, so the next step after "I want different behaviour" is obvious.

## The settings registry

All parameters are declared in one registry per owner (FOSS Earth, and each
host application), not as scattered constants and `localStorage` keys.

```ts
interface ParameterSpec<T> {
  id: string;                 // "map.imagery.gpuBudget"
  label: string;              // "Imagery GPU memory"
  description: string;        // one sentence: what changes when this changes
  unit: Unit;                 // "MiB" | "px" | "ms" | "m" | "count" | "levels" | "ratio" | "deg" | ...
  kind: "number" | "range" | "choice" | "boolean" | "text";
  bounds: (context: DeviceContext) => { min: T; max: T; reason?: string };
  step?: number;
  scale?: "linear" | "log2";  // how the control spaces values
  default: T | ((context: DeviceContext) => { value: T; derivedFrom: string });
  persistDefault?: boolean;   // retain an explicit choice equal to the default
  home: { tab: TabId; section: string; level: "main" | "all" };
  auto?: AutoSpec<T>;         // present when the program may adapt it
  appliesLive: boolean;       // false: takes effect on next start, and says so
  source: string;             // repository path of the code that reads it
}
```

- The registry is the only place a default is written. Code reads parameters
  through it; a unit test fails when a module under `src/engine/`, `src/terrain/`,
  `src/camera/` or `src/input/` exports a tuning constant that is not in the
  registry (allow-listed physical constants excepted).
- Values are validated against their bounds on every write. An invalid saved
  value is dropped with a note in the section, never silently repaired into
  something else.
- `DeviceContext` carries what defaults and bounds may depend on: renderer
  backend and limits, device pixel ratio, `hardwareConcurrency`,
  `deviceMemory`, touch capability, and measured frame time once running.

### Where values come from

In increasing priority: registry default → preset applied → value saved by the
user → URL parameter for this session → host-forced value. Each layer is
visible in the parameter's detail view. The automatic controller, where
enabled, moves the effective value inside the range the winning layer set.

### Persistence

One versioned record per application origin, `foss-earth.settings.v1`, holding
saved values keyed by parameter id. Normally only values that differ from their
defaults are saved. A parameter with `persistDefault: true` also retains an
explicit choice equal to its default: toolbar visibility retains an explicit Auto
choice, so a later host default does not override it. Fitting follows the named
On, Auto or Off value regardless of its provenance. Reset forgets
the choice and returns to the default. A session parameter retains it only until
the page reloads. Hosts keep
their parameters in the same record under their own prefix (`osfs.`). The
existing scattered keys migrate once (table in [Migration](#migration)) and are
then left in place for one release for rollback, as `foss-earth.map-detail.v1`
did for `osfs.world-detail-target`.

### Export, import and URL

- **Export** writes the record, or one section of it, as JSON the user can copy
  or save; **Import** validates each entry, applies the valid ones, and lists the
  rejected ones with the reason.
- Any parameter can be set for one session from the URL:
  `?set.map.imagery.gpuBudget=256&set.renderer.resolutionScale=0.75`. URL values
  are never saved unless the user presses **Keep these values**. The existing
  `mapSource`, `elevationSource`, `renderer`, `rasterImagery` and
  `terrainQuality` parameters keep working and map onto registry ids;
  `terrainQuality` is retired (see [Migration](#migration)).
- Secrets are the exception: a sensitive parameter given in the URL (`key`,
  `googleKey`, or `set.<id>`) is saved on this device at once, in the record
  that never exports it, and taken off the address bar, so links, bookmarks and
  history do not carry it. A later URL key replaces the saved one.
- The basemap and elevation provider in use are written back to the address bar
  as `mapSource` and `elevationSource` whenever they change, from whichever
  control, so a link or a reload opens the same map. A default that moves by
  itself, such as the Google default a key sets at startup, is written only
  when the URL already names the parameter; a host-forced value is never
  written. Back and Forward, which scenes use, bring back an entry's older
  URL; settings are not history, so the values in use are written to it again.

## Controls

Only a few control types are needed; each has one implementation in
`foss-earth/shell`, used by FOSS Earth and by hosts.

- **Value track.** One thumb on a continuous scale, linear or log2, with the
  unit and the value shown, keyboard steps, and the default marked by a tick.
- **Range track.** One track, two thumbs for the ends of the acceptable range.
  The part of the scale outside them stays visible but dimmed. A default, a
  session value and host markers (0sfs's flight minimum) sit on the same track.
  A thumb dragged into the other stops there: equal ends are allowed, reversed
  ends are not. *Implemented for Map → Detail on 2026-09-25, replacing two
  separate end sliders.*
- **Colours.** Detail tracks use one ramp, green (finer, more work) through
  yellow to red (coarser, less work), anchored to the scale, so the same value
  has the same colour on the HUD rail and in the Map tab. Budget tracks use a
  neutral ramp; colour is not decoration.
- **Choice pills** for discrete choices, and **switches** for on/off.
- **Toolbar visibility** is a three-way choice: On (switch icon), Auto (`A`),
  Off (switch icon). All toolbar indicators have their control in Interface →
  Toolbar. Auto fits by priority; On can wrap; Off hides. These are named values,
  with older saved booleans migrated to On or Off.
- **Toolbar priorities** use an Auto / Custom slider, starting in Auto. Auto uses
  the default order; Custom applies saved numbers and reveals a compact field at
  the left of each existing visibility row, including under Show all parameters.
  Returning to Auto hides the fields and retains the custom values for later.
- **Theme** uses one two-position sun / moon slider in both views.
- **Readings** beside a budget: the live value it bounds, in the same unit.

Every section has a **Show all parameters** toggle. Off, it shows the main
controls; on, it lists every parameter of the section in a paragraph grid.
Main controls and this list use the same compact row: optional priority field,
control, `?`, label and source-link icon. Per-setting reset buttons are removed;
the section's Reset all remains. The `?` tooltip holds the explanation, default
and its
reason, current value and provenance, ID and any limits or restart notes.
Nothing is reachable only through the URL or the console.

## Automatic adjustment

Today `rasterQuality`'s Auto hops between three profiles on one-second frame-time
windows (down after two windows over 20 ms, up after ten under 14 ms, at most
every five seconds). It is replaced by one continuous controller:

- **Goal:** a frame time target (default: the display's refresh interval,
  measured; unit ms), and how much of it the globe may use.
- **What it may move:** each auto-capable parameter lists itself; the user
  enables or disables each one and sets its range on a range track. Defaults:
  terrain detail and imagery detail may coarsen toward the ends of their ranges;
  budgets may not change at runtime unless enabled.
- **How fast:** the observation window, the thresholds for coarsening and
  refining, the step per adjustment and the minimum time between adjustments
  are parameters (defaults are today's 1 s, 20 ms, 14 ms and 5 s, applied as
  quarter-level steps instead of profile hops).
- **What it did:** the section shows the current adjustment of each parameter
  and the frame time that caused it. The HUD rail's existing marker shows an
  effective detail below the request.

## Detail focus: what the view is loaded around

**This answers a reported problem.** Orbiting the camera around the aircraft
makes new ground load, because both the Google 3D Tiles renderer and the raster
runtime choose what to load from the camera's view: its frustum decides what is
visible, and only visible tiles are refined. 0sfs's "Terrain detail follows:
Aircraft / Camera" changes only how Google's mesh refines with distance; the
camera still decides visibility. There is no way today to load around the
aircraft regardless of where the camera looks.

`map.focus.mode` (choice, Map → Detail):

| Mode | Loads | Orbiting the camera |
| --- | --- | --- |
| **View** (today's behaviour) | What the camera sees, refined by projected size | Loads newly visible ground; least memory and bandwidth |
| **Around focus** | Everything within `map.focus.radius` of the focus point in every direction, refined as if seen from the focus point with the current field of view and resolution | Loads nothing new while the focus point stays still; the most memory |
| **View and focus** | The union of both | Loads only what lies outside the focus radius |

- **Focus point:** the camera's orbit target by default. A host may register
  others; 0sfs registers the aircraft. `map.focus.point` chooses among them.
- **Parameters:** `map.focus.radius` (m, log2 scale, 250 m – 200 km, default
  10 km), `map.focus.detailBelow` (the finest detail the omnidirectional part
  may ask for, on the same scale as the detail range; default the range's
  default), and `map.focus.horizonCull` (switch: skip ground below the focus
  point's horizon, default on).
- **Cost shown:** the section estimates the extra pages and tiles the radius
  implies before it is applied, and the Loading and memory readings show the
  result. With the atlas at its budget, Around focus lowers delivered detail
  rather than exceeding memory, and says so through the memory limit.
- **Mechanism:** the raster selector measures footprints from the focus point
  over a full sphere of directions, ignoring the frustum inside the radius; the
  Google renderer gets a plugin that keeps tiles within the radius active and
  refines them by distance from the focus point. Whether that is best done with
  the renderer's extra-camera support or a custom visibility check is to be
  confirmed against the Babylon build of 3d-tiles-renderer. Rendering still
  culls by the real camera; only loading changes.

## Catalogue

Values are today's. "Hardcoded" marks what is not changeable at all today.

### Map → Source (exists)

| Parameter | Unit / kind | Today |
| --- | --- | --- |
| `map.source.basemap` | choice | Saved per origin; USGS Imagery Topo by default, Google 3D Tiles with a key |
| `map.source.elevation` | choice | Mapterhorn |
| `map.source.googleKey` | text | Saved per origin from the Map tab, or from URL `key`/`googleKey`, which is then removed from the address bar |
| `map.source.cartoKey` | text | **Missing.** CARTO has required an API key since August 2026 and answers keyless requests with an "API KEY REQUIRED" placeholder, so both CARTO basemaps are broken until this exists |

### Map → Detail

The HUD rail is the session control; this section holds the saved policy.

| Parameter | Unit / kind | Today |
| --- | --- | --- |
| `map.detail.imagery.range` | range, levels (−3…+1, 0.25 steps) | Exists; one track since 2026-09-25 |
| `map.detail.imagery.default` | Normal or a value | Exists |
| `map.detail.google.range` | range, px error target (1…524,288, log2) | Exists |
| `map.detail.google.default` | recommended, device hint or a value | Exists |
| `map.detail.terrain.range` / `.default` | range, px screen-space error of the mesh | **Hardcoded** in the three profiles as `zoomBias`, `baseZoom`, `min/maxSegments` |
| `map.detail.linkTerrainToImagery` | switch | New: on, the HUD rail moves imagery and terrain together (each on its own scale); off, the rail moves imagery only |
| `map.detail.imageryPath` | choice: projected atlas, per-tile | URL `rasterImagery` only |
| `map.focus.*` | see above | Missing |

Terrain detail becomes a screen-space error target for the mesh, chosen per tile
from its projected geometric error the way imagery now uses projected pixel
size. The focus ring (`ringRadius`, `corridorSteps`) is replaced by
`map.focus.*`: the ring was a fixed-radius stand-in for "load around the focus".

### Map → Loading and memory

| Parameter | Unit | Today |
| --- | --- | --- |
| `map.imagery.gpuBudget` | MiB, 32 … backend limit | 64 / 128 / 256 by profile; atlas sized once at start |
| `map.imagery.stagingBudget` | MiB | 8 / 16 / 32 by profile |
| `map.imagery.concurrentRequests` | count | 4 / 6 / 8 by profile |
| `map.imagery.queuedRequests` | count | 64 / 128 / 256 by profile |
| `map.imagery.uploadPerFrame` | MiB | 2, hardcoded |
| `map.imagery.selectionTimePerFrame` | ms | 2, hardcoded |
| `map.imagery.reselectWhileMoving` | ms between traversals | 100, hardcoded |
| `map.imagery.anisotropy` | samples | 4, hardcoded |
| `map.terrain.cachedTiles` | count | 96 / 160 / 256 by profile |
| `map.terrain.reselectWhileMoving` | ms between selections | 100, as imagery (was `requestDebounce`, 5 m of the view anchor's travel, until terrain followed the camera) |
| `map.terrain.maxLevel` | levels | 16 with the atlas, hardcoded |
| `map.google.cacheTiles` | range, count | 6,000 – 8,000, library default |
| `map.google.cacheBytes` | range, MiB | 300 – 400 MB, library default |
| `map.google.downloads` / `.parses` | count | 25 / 5, library default |
| `map.cache.httpBytes` | MiB | 128, hardcoded (`MAP_CACHE_MAX_BYTES`) |
| `map.cache.httpEntries` / `.maxTileBytes` | count / MiB | 1,024 / 8, hardcoded |

Changing `map.imagery.gpuBudget` reallocates the atlas (a short reload of imagery,
stated in the section). Its default is derived from the device: a share of
`deviceMemory` bounded by the backend's texture limit, replacing the fixed 128
MiB that the 0sfs flight test showed was too small for continuous motion at
Normal (about 50 images replaced per second).

The HTTP map cache (today in 0sfs Settings as `MapCachePanel`) moves here.

### Map → Imagery selection (all parameters)

For people tuning the selector; these are the constants the projected-imagery
implementation marked as starting values.

| Parameter | Unit | Today |
| --- | --- | --- |
| `map.imagery.refineAbove` / `.coarsenBelow` | ratio of target | 1.2 / 0.8 |
| `map.imagery.coarsenAfter` / `.pinFor` | ms | 500 / 1,000 |
| `map.imagery.fallbackGap` / `.fallbackStep` | levels | 4 / 3 |
| `map.imagery.maxNodes` | count per traversal | 12,000 |
| `map.imagery.pageTableDepth` | levels below a patch | 6, fixed by the binding (read-only, with reason) |

### Renderer

| Parameter | Unit / kind | Today |
| --- | --- | --- |
| `renderer.backend` | choice | Exists (Auto, WebGPU, WebGL 2, WebGL) |
| `renderer.resolutionScale` | ratio of device pixels, 0.25 – 2 | **Hardcoded**: device pixel ratio on WebGPU, 1 on the safe fallback |
| `renderer.antialias` | switch (MSAA samples where the backend allows) | **Hardcoded** on |
| `renderer.frameRateCap` | fps or off | **Missing** |
| `renderer.clipping` | choice: automatic, fixed near/far (m) | Set every frame by Babylon's geospatial clipping behaviour; not changeable |

Implemented on 2026-10-06 in **Renderer → Lighting and exposure**:

| Parameter | Unit / bounds / default | Behavior |
| --- | --- | --- |
| `renderer.exposureEV` | EV, −16…16, default 0 | Sets shared material exposure to `2 ** EV`; +1 EV doubles linear intensity. Fixed relative exposure, with no camera calibration or automatic adaptation. |
| `renderer.ambientFillMultiplier` | ratio, 0…4, default 1 | Multiplies the existing fallback/simulation/Google hemispheric intensities (0.95/1.1/1.0). New lights inherit the current value; local emitters are unchanged. |

These controls apply live through the shared registry, including imports and
presets. A combined change requests one frame; unchanged values request none.
Zero ambient fill affects lit surfaces, not emissive map imagery or the clear
background, and is not a night simulation. Exposure affects materials using
the shared image-processing configuration; custom panorama shaders currently
encode their own output. This change introduces no HDR postprocess or new
render target. Linear HDR composition, calibrated illumination and day/night
lighting remain separate work. Runtime and UI behavior are checked with
NullEngine/jsdom; GPU appearance remains unverified.

### Camera and input (Controls tab)

Today's sensitivities exist; their curves do not.

| Parameter | Unit | Today |
| --- | --- | --- |
| `camera.fieldOfView` | deg | 0.8 rad (46°), Babylon's default; not changeable |
| `camera.pitchLimits` | range, deg | 1 – 89, hardcoded |
| `camera.zoomLimits` | range, m (log2) | 25 m – 80,000 km, hardcoded |
| `camera.inertiaDecay` | per frame | 0.82, hardcoded |
| `input.mouse.orbitRate` | deg per px | 0.3, hardcoded |
| `input.mouse.dragThreshold` | px | 4, hardcoded |
| `input.wheel.zoomRate` | per notch | 0.03 base, scaled by the saved sensitivity |
| `input.touch.orbitRate` / `.panRate` / `.zoomExponent` | deg per px / ratio | 0.1 / 0.48 / 0.24, hardcoded |
| `input.gamepad.deadzone` | ratio | 0.15, hardcoded (globe navigation) |
| `input.sensitivity.*` | ratio | Exists (`foss-earth.inputSensitivity`) |

### Interface

HUD buttons, theme, the performance HUD metrics, and the compass and POI tuners
exist. Their sections move to the tabs they affect: Toolbar to an
**Interface** tab, Performance debug to **Renderer**. *Moved on 2026-09-26.*

## Presets

Presets live in `src/settings/presets/*.json`, one file each, with a name, a
description written as what it trades, and the values it sets. Built-in ones:

- **This device (default).** Every value at its device-derived default.
- **Save battery and data.** Coarser detail ranges, a smaller GPU budget, a
  frame-rate cap, fewer concurrent requests.
- **Sharpest.** The finest detail ranges, the largest GPU budget the backend
  allows, Around focus at a moderate radius.
- **Smooth motion.** A lower resolution scale and coarser terrain, so frame time
  holds while flying fast.

Applying a preset shows a before/after list of every value it changes and asks
once. The section header then says "Matches *Sharpest*" until any value differs,
when it says "Custom". **Save as preset** stores the current values of a section,
or of everything, under a name; saved presets can be renamed, exported and
deleted. Presets never apply automatically and never follow later edits to the
file they came from.

## Migration

| Today | Becomes |
| --- | --- |
| `?terrainQuality=low|balanced|high|auto` and `RASTER_QUALITY_PROFILES` | The Loading and memory and Detail parameters; a URL value applies the matching built-in values for that session only, with a note that the parameter is retired |
| `IMAGERY_RESOURCE_PROFILES` (low / balanced / high) | `map.imagery.*` budgets, defaults derived from the device |
| `foss-earth.map-detail.v1` | `map.detail.*` in the new record |
| `foss-earth:renderer-preference` | `renderer.backend` |
| `foss-earth.inputSensitivity`, `.inputMode`, `.hudButtons`, `.theme`, `.performanceMetricVisibility`, `.panelSectionsOpen`, `.globeAnchorRotation`, compass and POI keys | Parameters under `input.`, `interface.` and `visualization.` |
| `foss-earth-map-source`, `foss-earth-elevation-source` | `map.source.*` |
| `?rasterImagery` | `map.detail.imageryPath` |

## Acceptance

- A registry test lists every parameter with id, unit, bounds, default, home and
  source path, and fails on a tuning constant outside it.
- Every parameter can be changed from its section, reset through the registry, exported,
  imported and set from the URL; each path has a test.
- No UI or code path names Low, Balanced or High except the built-in preset
  files and the `terrainQuality` migration.
- Range settings use the range track; a UI test fails on two sliders editing the
  ends of one scale.
- Around focus: with the camera orbiting a fixed focus point, zero new tile and
  image requests after settling inside the radius, on both Google and raster
  maps, recorded by a headless check like `benchmarks/map-detail/`.
- Changing a budget changes the measured resident bytes, request concurrency or
  frame work it bounds, recorded before and after.
- The automatic controller moves only enabled parameters, only inside their
  ranges, and its decisions are visible in the UI and the log.

## Implementation

### Stage 1 (2026-09-25)

The registry is `foss-earth/settings` (`src/settings/`); the controls are in
`foss-earth/shell` (`src/shell/settings/`).

- `getAppSettings()` is the page's registry with FOSS Earth's catalogue
  (`src/settings/catalogue/`) registered and its legacy keys migrated. It reads
  the page's query once, for `?set.<id>=` and the older parameters mapped onto
  ids (`mapSource`, `tiles`, `elevationSource`, `terrainSource`, `renderer`,
  `rasterImagery`, `key`, `googleKey`), and follows the record when another
  tab saves it. `createSettingsRegistry` makes an isolated one.
- The record is `foss-earth.settings.v1`: `values` (values that differ from
  their default, plus explicit defaults for `persistDefault` parameters),
  `presets` (which preset set a value), `migrated` (legacy
  keys already read) and `userPresets`.
- Layers, lowest to highest: the registered default, a host default
  (`setHostDefault`), the saved value (the user's or a preset's), a URL value
  for this visit, and a host-forced value (`force`, which returns a release).
  `get` reads a cache, so it is cheap every frame; `watch` fires when the
  effective value changes through any layer or a device change.
- Values are checked, never repaired: `set` refuses one outside its bounds. A
  saved value outside static bounds is dropped with a note; one outside bounds
  a device sets (a reason is given) is kept and limited, with a note saying
  what limited it. `setNote` adds a host's explanation, such as which renderer
  an instrument fell back to.
- Every valid migrated value is saved as the user's, even one equal to a
  default, so a host default set later does not replace an old choice.
- Units are the built-in ones (`fraction` is stored 0 to 1 and shown as a
  percentage) or a host's own `{ id, text }`.
- `createParameterSection(settings, { tab, section, main?, covers?, footer? })`
  is one section of a tab: the section's own controls, a control for every
  main-level parameter homed there that they don't cover (hosts' included,
  registered at any time), and **Show all parameters**, which lists every
  parameter of the section with its control, help tooltip, label and
  source-link icon, and exports, imports and resets the section. The tooltip
  contains its description, current value, default and what that was derived
  from, where the value came from, its ID and any limits or restart notes.
  `createSavedSettingsSection` does the same for the whole record and offers
  **Keep these values** for URL values; FOSS Earth shows it in Settings →
  Saved settings.
- The Map and Renderer tabs are collapsible sections, and each appends a
  section for every section of its tab that a host's parameters are homed in
  (`appendHostSections`), titled by `setSectionTitle`.
- One track implementation (`createTrack`) draws value tracks, range tracks and
  the Map → Detail track. `MapDetailController.setTrackMarker` puts a host's
  marker on the detail track: its colour, label, whether it can be dragged
  (`onChange` gets the value; it is not clamped into the range), whether it is
  hollow, whether it is a requirement (the part of the range coarser than it is
  striped), and whether the HUD rail shows it.
- The runtime reads `renderer.backend`, `map.source.*`,
  `map.detail.imageryPath` and `map.focus.refineFrom` from the registry it is
  given (the app's by default), and follows changes to the basemap, elevation,
  CARTO key and refinement point wherever they are made.
- The HTTP map cache moved to Map → Loading and memory
  (`createMapCacheSection`). `MapCachePanel` is deprecated.

Where stage 1 differs from this spec:

- `map.detail.*` holds one policy per kind: one for every 2D basemap (offsets
  are relative to Normal, so they mean the same on any source) and one for
  Google. The legacy record kept one per source; migration takes the default
  basemap's, or the first 2D one saved.
- `foss-earth:renderer-preference` is not migrated into `renderer.backend`: it
  is the renderer that last started, written by auto-detect, not a choice the
  user made. It stays as what auto-detect starts from, and choosing
  Auto-detect clears it.
- `foss-earth.panelSectionsOpen` stays its own key: which sections are open is
  the panel's memory, not a setting.
- `map.focus.refineFrom` (camera or focus point) exists now, ahead of the rest
  of `map.focus.*`: the focus point is the simulation origin in simulation mode
  and the orbit target otherwise. It replaces
  `setGoogleTerrainDetailAnchor`, which remains for existing callers.
- `map.source.cartoKey` is added to CARTO requests as `?api_key=`. That query
  name has not been checked against a working key.
- `?terrainQuality` and the quality profiles are unchanged until stages 2 and
  4 replace them.
- The Toolbar, Camera and Performance debug sections stay in the Settings tab,
  as the spec allows, until the Interface and Renderer tabs take them.

### Stage 2 (2026-09-25)

- Map → Loading and memory holds every budget in the catalogue's table plus
  `map.imagery.pageTablePatches` (the patches that can each have their own
  page table, 256, which also sizes the atlas). Map → Imagery selection holds
  the selector's calibration. `IMAGERY_RESOURCE_PROFILES` is gone, the quality
  profiles no longer carry a terrain cache size, and the automatic quality
  controller no longer changes any budget.
- The raster, imagery and Google runtimes read these parameters from the
  registry they are given and follow changes live. A new
  `map.imagery.gpuBudget` or page-table count reallocates the atlas; the old
  atlas keeps drawing, with its pages and tables, until the new one's fallback
  coverage is resident, so there is no blank frame. If the renderer cannot
  create the new atlas, the old one stays and the budget's note says why.
- `map.imagery.gpuBudget` defaults to 1/32 of the memory the browser reports
  (256 MiB for the 8 GiB Chrome reports on most desktops), or 128 MiB where
  the browser reports none, and is bounded by the largest atlas the
  renderer's texture limit allows (the 8192 px cap is gone; WebGL 1 keeps
  4096 px). Before the renderer starts the bound is unknown, so saved values
  are kept and limited later rather than dropped.
- A budget shows what it bounds beside it (`setReadingSource`): atlas pages in
  use, bytes waiting, requests in flight and queued, upload rate, the last
  selection's time and regions, terrain and Google tiles kept, bytes held and
  jobs running. Sections read them once a second, only while shown.
- The HTTP tile cache takes its limits from `map.cache.*`, applied by the
  runtime; until then it neither adds nor prunes, so a page that opens the
  cache panel before a map exists cannot empty it.

### Stage 3 (2026-09-26)

- Map → Detail holds `map.focus.mode` (View, Around focus, View and focus),
  `map.focus.point`, `map.focus.radius`, `map.focus.horizonCull` and
  `map.focus.refineFrom`. `map.focus.detailBelow` is two parameters,
  `.imagery` (levels) and `.google` (px), because the two maps' detail scales
  differ; each defaults to "As the detail setting".
- **Focus points.** `BabylonRuntime.registerFocusPoint({ id, label,
  getPosition })` adds a choice to `map.focus.point` and returns a function
  that removes it; `getPosition` returns ECEF metres or null and is read once
  per rendered frame, so both maps see one position. The built-in
  `orbit-target` is the globe camera's target, or a simulation's floating
  origin. A saved point that is not registered waits for it; until then the
  orbit target is used. `getFocusPosition()` reads the selected one.
- **2D imagery.** The selector measures each tile within the radius from the
  focus point, facing it, at the view's pixel angle and never nearer than the
  camera is to the point, so the region's detail does not depend on where the
  camera looks. Around focus selects only the region: turning the camera
  selects nothing again, and only a move of the point over 0.5 m, a change of
  more than 2% in the camera's distance to it, or a parameter change does.
  View and focus adds the region to the view and never asks for less than the
  view does. With `horizonCull`, tiles below the horizon of a viewer raised
  above the point by the camera's distance are left out.
- **Terrain mesh.** The ring of terrain tiles stays centred on the view's
  anchor, the orbit target or the host's simulation view, which orbiting does
  not move; its heading corridor is off while a region is loaded, since it
  follows the camera's heading. Stage 4 replaces both.
- **Google 3D Tiles.** Not a plugin: the runtime already replaces the
  renderer's `calculateTileViewError`. Around focus makes every tile the point
  can see take part and refines only those within the radius, by distance from
  the point; the rest of the globe stays coarse. View and focus marks tiles
  within the radius as seen and takes the larger error. Babylon still culls
  what is drawn by the real camera. `map.focus.refineFrom` = focus now measures
  the view's detail from the selected focus point, and
  `GoogleTerrainDetailAnchor` is `"camera" | "focus-point"`.
- **Cost.** The radius's reading gives the pages the region holds and about
  how many the current radius needs from this view,
  2π/(W·α·t)² · (1 + 2 ln(R/D)) for page width W, pixel angle α, target t and
  camera distance D, with R cut at the horizon when that is culled. It is
  shown while a region is loaded, and for 2D imagery only: Google tiles have no
  size before they load, so their cost shows in the Loading and memory
  readings. When the GPU budget is what limits the region, the reading says so.
- **Acceptance.** `createRasterTilesRuntime.atlas.test.ts` orbits a fixed
  focus point through six headings and asserts zero new image and elevation
  requests after settling, with View as the control that does request. The
  Google measure is unit-tested in `createTilesRuntime.test.ts`; the headless
  check against real Google tiles is 0sfs's `scripts/validation/map-focus/`.

### Stage 4 (2026-09-26)

- **Terrain selection** (`src/terrain/terrainSelector.ts`). From the 16 tiles
  of level 2, a tile splits while its geometric error, projected from the
  active camera, exceeds `map.detail.terrain`'s target in px. Its error is
  `map.terrain.errorPerSpacing` (0.25, Cesium's share for heightmaps) times
  its vertex spacing: its width at its centre's latitude over
  `map.terrain.tileSegments` (64). Tiles outside the view or below the horizon
  stay as coarse as the root, so turning the camera in View loads what it
  reveals. Around a focus point, tiles within the radius are measured from the
  point, as imagery is. `map.terrain.refineAbove` / `.coarsenBelow` (1.2 /
  0.8) keep a level at the threshold, and `map.terrain.maxTiles` (512) bounds
  a selection. These are in Map → Terrain selection. Where the coarse heights
  put the ground above the camera, in a valley the coarse grid fills in, the
  ground is taken to reach below the camera by the relief's span, so it still
  refines.
- **Terrain follows the camera.** `getViewState` and `setSimViewState` no
  longer decide terrain. With no active camera only the root level is kept. A
  host that needs ground refined in every direction, such as a flight for its
  collision surface, sets `map.focus.mode` to Around or View and focus with its
  focus point. `map.terrain.requestDebounce` (m of the anchor's travel) became
  `map.terrain.reselectWhileMoving` (ms, 100): the view it stops at is always
  selected.
- **Map → Detail** adds `map.detail.terrain.range` (2–16 px) and `.default`
  (4 px, about what terrain showed before) on log2 tracks, and
  `map.detail.linkTerrainToImagery` (on): each level the rail moves finer
  halves the terrain's target, within its range.
- **Retired:** `RASTER_QUALITY_PROFILES` and its controller, the focus ring
  and heading corridor, `setRasterQuality` / `getRasterQuality`,
  `status.rasterQuality`, `getRasterQualityPreferenceFromSearchParams` and
  `setRasterQualityPreference`. The `rasterQuality` options of
  `createGlobe`, `createGlobeApp`, `resolveMapRuntimeConfig` and
  `createBabylonRuntime` remain as deprecated fields that are ignored, so hosts
  compile until they drop them. `?terrainQuality` sets, for the visit only,
  `map.detail.terrain.default` to 8, 4 or 2 px with `map.auto.terrainDetail`
  off for low, balanced and high, or turns the adjustment on for auto, and
  the Detail section says the parameter is retired.
- **Automatic adjustment** (`src/terrain/autoDetail.ts`, Map → Automatic
  adjustment). One adjustment in levels applies to every detail allowed to
  move: `map.auto.terrainDetail` multiplies the terrain target by 2 to its
  power, up to the range's coarse end, and `map.auto.imageryDetail` lowers the
  imagery offset by it, down to its range's coarse end. It never goes finer
  than asked. The goal, `map.auto.frameTimeGoal`, is the display's refresh
  interval by default, estimated as the fastest median from complete observation
  windows. A lone short scheduling interval cannot lower that goal. The
  thresholds are multiples of it (1.2 and 1.05: 20 and 17.5 ms at 60 Hz),
  with 1 s windows, 2 slow or 10 fast windows, quarter-level steps and 5 s
  between steps: today's values, as parameters. Returning to the display rate
  for ten windows permits a refinement step; recovery does not require frames
  faster than the display. Suspension and long stalls discard incomplete
  windows and their consecutive slow/fast counts. Both switches remain off by
  default, so requested detail changes only after opting in. The Smooth motion preset and
  `?terrainQuality=auto` turn it on.
- **What it did** shows in readings on the auto switches, the goal and the
  terrain default: where each is, what was asked for, and the frame time that
  caused it. The rail lists "coarsened to hold the frame time" (`frame-time`,
  a new `DetailLimit`). Both apps connect `connectMapDetailLog` from
  `foss-earth/shell`; each decision goes to the app's log ("Map detail
  coarsened 0.25 levels to hold the frame time: frames averaged 23.1 ms
  against a 16.7 ms goal."), to the console as `[map auto]`, to the map debug
  log as `detail-adjusted`, and to hosts through
  `BabylonRuntime.onDetailAdjusted(listener)`.
- **Differences from the spec.** How much of the goal the globe may use is
  not a parameter: the measure is the whole frame interval, and splitting out
  the globe's share needs GPU timer queries. No budget is auto-capable yet;
  none moves at run time. Google detail is not adjusted: its renderer keeps
  its own target.
- **Found on the way.** With 64 segments, the fast surface sampler and the
  ray-cast reference differ by about 5 cm at a stitched dateline seam; the
  sampler test pins the 128 segments it was written for. `vite.config.ts` now
  keeps `build/` out of test discovery, since bisect worktrees live there.
- **Fixed after stage 4** (0sfs's orbit check). Around the aircraft on the 2D
  map, one turn of the chase camera requested elevation. Anything that
  reselected, such as automatic adjustment, chose tiles the still view had not:
  a split tile whose children were on screen was measured with the
  −500–9,000 m fallback instead of its own heights, and a still view never
  reselected after heights arrived, so its selection rested on its ancestors'
  coarser heights. Terrain is now measured with the nearest heights known for
  a tile, its own or an ancestor's, and heights arriving reselect like a moving
  view, at most every `map.terrain.reselectWhileMoving`. A test around a low
  focus point beside a peak that only fine tiles show now counts 0 requests
  where it counted 112. The atlas tests had counted elevation requests after
  answering them, so they always read 0; they now count every request. On
  Google, a start could take coarse tiles for the ground: preparation counted
  the renderer idle with tiles still waiting to parse, or with children still
  being prepared, which is all Around's first seconds are. It now counts
  what the renderer's own idle test counts.

### Stage 5 (2026-09-26)

- **Camera** (Controls → Camera). `camera.fieldOfView` (°, 45.8: Babylon's
  0.8 rad), `camera.pitchLimits` (range, 1–89°, also the bounds: a level view
  can flip the camera and a vertical one loses its heading),
  `camera.zoomLimits` (range, m, log2, 25 m to 25,512 km) and
  `camera.inertiaDecay` (per 60 Hz frame, 0.82). New limits apply at once: a
  view outside them moves inside. The table above gave 80,000 km as today's
  far limit; that was the controller's clamp, but Babylon's camera stopped at
  four Earth radii, so that is the default, and 80,000 km the bound. Grab the
  globe (`input.globeAnchorRotation`) and the compass orbit height moved here
  from Settings → Camera, which is gone; its line on pitch is the section's
  note.
- **Device rates**, at sensitivity 1, which multiplies them. Mouse and
  trackpad: `input.mouse.orbitRate` (0.03 °/px), `input.mouse.dragThreshold`
  (4 px), `input.wheel.zoomRate` (0.23% of the distance per notch),
  `input.wheel.orbitRate` (0.015 °/px) and `input.trackpad.pinchZoomRate`
  (0.1% per px). Touch: `input.touch.orbitRate` (0.1 °/px), `.panRate` (0.48×)
  and `.zoomExponent` (0.24). Controller: `input.gamepad.deadzone` (15%),
  applied to every stick bound to a navigation rate, the user's own bindings
  included. The spec's 0.3 °/px for the mouse was a rate before a shared ×0.1;
  each parameter is now the rate the view actually moves at, and the wheel
  orbit and trackpad pinch, which the table left out, are parameters too, as
  are the four rates still on that shared ×0.1: `input.mouse.panRate` (a
  drag with Grab the globe off), `input.trackpad.panRate`, and Safari's
  `input.trackpad.rotateRate` and `.gestureZoomExponent` (0.1 each).
  Behaviour at the defaults is unchanged. The touch recognizer's jitter guards
  stay constants: they filter the touch stream and decide nothing about the
  camera.
- **API.** `CameraController.setLimits` / `getLimits`,
  `createInertialCameraController(target, { decayPerFrame })`,
  `InputController.setRates` / `getRates`, `createStandardGlobeProfile(slot,
  deadzone)` and `withStickDeadzone(profile, deadzone)`. The runtime applies
  the camera and rate parameters itself and follows their changes, so a host's
  globe camera gets them without wiring.
- **Renderer** (Renderer → Resolution and frame rate, and Depth range).
  `renderer.resolutionScale` (pixels drawn per device pixel, 0.25–2×): 1, or
  what the safe WebGPU fallback draws, a pixel per CSS pixel, which is
  derived from a new `DeviceContext.rendererDevicePixels`; it follows changes
  in the device pixel ratio on resize. `renderer.antialias` (on) applies on the
  next start, and says so when WebGPU could only start without it.
  `renderer.frameRateCap` (10–240 fps, or Off): the scheduler waits out frames
  due sooner, and automatic adjustment takes the cap's interval as its least
  goal, so capped frames are not counted slow. `renderer.clipping`
  (automatic or fixed) with `renderer.clipping.fixed` (a range in m, 1 m to
  10,000 km) sets the globe camera's near and far planes; a host's own
  cameras keep theirs.
- **Tabs.** Toolbar moved to a new Interface tab (`WindowOverlay`'s
  `interfaceSections`, the app's `interfaceSections`), and Performance debug to
  the end of the Renderer tab (`createRendererPanel`'s `sections`, for a
  section the app draws itself). The Settings tab keeps Saved settings and
  About, after a new Presets section.
- **Presets** (Settings → Presets). The four built-in ones are
  `src/settings/presets/*.json`, in file-name order. A preset may list
  `reset`: ids, or prefixes ending in ".", that it returns to their defaults.
  This device is nothing but a reset list (the map's detail, automatic
  adjustment, focus, imagery, terrain, Google and cache parameters, and the
  renderer's resolution scale, antialiasing and frame-rate cap), so it follows
  the device, where a list of values could not. Secrets, read-only and
  URL-only values are never reset, and a value the app holds is listed as left
  as it is. Two differences from the text above: Sharpest sets a 512 MiB GPU
  budget, not the largest the backend allows, since that bound depends on the
  device and a value beyond it would be refused; and its focus is View and
  around (`both`) within 5 km, so the view still loads as before.
  Each preset shows every value it sets or resets. Apply lists every change,
  from and to, and the values it cannot apply, and asks once. A status line
  at the top of the Presets section, and of each section a preset has values
  in, says "Matches *name*" or "Custom"; of several matching presets it names
  the one with the most values in that section, so This device is not
  outranked by a preset saved from one section. Every parameter section ends
  with Save as preset (its values, secrets, read-only and URL-only values
  aside), and the Presets section with one for everything; saved presets are
  renamed, exported as JSON and deleted (a second click confirms) in the
  Presets section. **Import a preset…** adds an exported one back as the
  user's (`importPreset`), with its values kept as given, so applying it lists
  any this app cannot take; 0sfs moves its old ground profiles in this way.
  `subscribe` listeners are called with no ids when the saved presets change.
  `createPresetsSection`, `createPresetStatus` and `createSavePresetControl`
  are exported for hosts.
- **The constants test** (`src/settings/tuningConstants.test.ts`) parses the
  source and finds every `const NAME = …` holding a number, at any depth, and
  every number given as a default (`?? n`, `|| n`, `name = n`), other than 0,
  1 and -1 and outside `src/settings/`. Each must be in its ledger with a kind
  and a reason: a parameter's default or bound (the parameter must exist), a
  fact (WGS84, tile sizes, a source's description, a service's usage
  policy), structure (a grid, a root level, a sort key), a guard (tolerances
  and filters against float error, jitter and stalls), layout (where panels
  sit and how overlays look), a host's argument (the start view, a readiness
  request's defaults), or a tool's (the profiler, test views). A new number
  fails the test until it is one of those or a parameter, and so does an
  entry whose constant is gone. A number written inline in an expression
  is out of its reach, so tuning values are named. Layout counts as outside
  the registry: pixel geometry and colours are the theme's and the UI spec's,
  not a spend of the machine; say if that line should move.
- **What the test found**, now parameters, at the values they had:
  `camera.surfaceFollowSpeed` (160 m/s, the orbit target and the compass),
  `camera.orbitTargetZoomStep` (750 m per e-fold of zoom) and
  `camera.surfaceRetry` (1,500 ms), all under Show all parameters in
  Controls → Camera; `map.imagery.missingRetryAfter` (600 s) and
  `map.retryDelay` (2–30 s, one range for failed terrain and 2D imagery
  downloads, which This device resets) in Map → Loading and memory;
  `interface.log.lineDuration` (8 s) and `.maxLines` (40) in a new
  Interface → Log; and `search.cacheDuration` (24 h), `.cacheEntries` and
  `.timeout` (20 s), for place and airport lookups, in a new Interface →
  Search. Two differ at their defaults: the airport lookup keeps 64 answers
  as the place lookup did, not 32; and a mouse press selects a point of
  interest only while it moves less than `input.mouse.dragThreshold` (4 px,
  not 5), so a press the map took as a drag no longer also selects. New API:
  `CameraController.setGroundFollow`, `AnchorHeightResolver.setTuning`,
  `createPoiTracking(scene, camera, { dragThresholdPx })`,
  `createGameLog(settings)`, and the `m/s` and `h` units.

## Sequence

1. Registry, record, migration, export/import and URL, with the existing
   settings moved into it unchanged in behaviour. Remove 0sfs's Settings tab
   ([flight settings](../../../0sfs/docs/proposals/flight-settings.md)).
2. Loading and memory parameters, replacing `IMAGERY_RESOURCE_PROFILES` and the
   profile budgets; atlas reallocation on change.
3. Detail focus modes on the raster runtime, then on Google 3D Tiles.
4. Terrain detail as a continuous target, retiring `RASTER_QUALITY_PROFILES`
   and the focus ring; the continuous automatic controller.
5. Renderer, camera and input parameters; presets.
