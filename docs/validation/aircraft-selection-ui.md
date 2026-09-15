# Aircraft family selection UI

Implemented: 2026-09-12. Current bounded acceptance passed on 2026-09-13 during dependency centralization. The original implementation-time notes below remain historical.

## Acceptance update: 2026-09-13

The installed-fork run passed the 21 app-shell and eight selection-panel tests, within 97 focused app tests. Headless component checks passed wide (1440×900), narrow (360×760) and short (740×360) viewport layouts, native family-radio keyboard navigation, Tab and Enter/Apply. The actual production app separately booted C172 and G1/G2/G3 with matching SDK/aircraft bytes. No dev server or visible browser was used.

A minor LOD-select focus-outline clipping measurement remains on wide/narrow layouts; controls remain usable, and keyboard navigation scrolls Apply into view with its full focus outline. External terrain requests were blocked during the built-app artifact check, so these results do not establish terrain readiness or aircraft fidelity. Screenshots, measured bounds and scope are in the [centralization execution record](../old/jsbsim-centralization-2026-09-13.md).

## Selection and activation

The Aircraft tab contains a bounded, scrollable image grid with one card per aircraft family: Cessna 172 Skyhawk and Cirrus Vision Jet. The selected aircraft's controls are below the gallery, outside its scrolling element. The grid adapts to the panel width; images keep an 8:5 aspect ratio. A failed or missing image leaves the aircraft name, radio control and an image-unavailable fallback usable.

Selecting a family stages its settings. The Vision Jet exposes G1, G2, G2+ and G3 in a compact native generation dropdown underneath the gallery, with its label inline; the C172 has no generation selector. G2+ currently maps to the existing G2 runtime until separate physics and package support is introduced. Draft generation and model choices are remembered separately for each family while the panel exists, including when visiting other tabs. They are not saved until Apply.

The current aircraft is named above the gallery. Pending choices and verbose explanatory text are now hidden behind a compact `?` details toggle in the control heading to reduce visual space. Apply & fly saves the complete choice and reloads the application once if the runtime aircraft ID changes, so the FDM package, control conventions, contact geometry, gauges and exterior change together. Merely selecting a card or generation does not load a mesh or change live physics. Applying model settings for the active runtime ID updates presentation without reloading, using one model resolve/load. Return to active aircraft settings restores the displayed selection to the live configuration.

The existing `osfs.aircraft`, `osfs.aircraft-lod`, `osfs.aircraft-generation` and `osfs.aircraft-opt-in-lods` preferences remain in use. Legacy `flight-sim.aircraft` and `flight-sim.aircraft-lod` reads remain supported. Runtime IDs are unchanged:

| Family | Configuration | Runtime ID |
| --- | --- | --- |
| Cessna 172 | Default | `cessna-172` |
| Cirrus Vision Jet | G1 | `cirrus-vision-jet` |
| Cirrus Vision Jet | G2 | `cirrus-vision-jet-g2` |
| Cirrus Vision Jet | G2+ (current placeholder) | `cirrus-vision-jet-g2` |
| Cirrus Vision Jet | G3 | `cirrus-vision-jet-g3` |

An unavailable concrete LOD normalizes to Auto. The existing HD opt-in preference is retained across families, including families where it has no applicable control or mesh. Apply writes the presentation preferences, generation label, and aircraft ID and rolls back prior values on a save failure. A failed save is shown in the panel and does not activate the pending choice. Other global preference behavior is unchanged.

## Retained controls and disclosures

The selected runtime definition supplies the available LODs, Auto choice, triangle counts, HD opt-in controls and model credits. Optional models disclose their credit and limitations before enabling them. The Vision Jet's third-party HD model remains opt-in, with hilos run's CC Attribution/source link and gear-up limitation. A still-loaded licensed mesh keeps its credit visible even while another aircraft is staged.

Loading/ready/placeholder/error status, actual triangle count and the Auto-selected LOD describe only the exact active runtime ID. A staged different family or generation receives an activation hint instead of another aircraft's model status or error. Camera mode, airspeed/altitude/heading/throttle metrics, pause/resume and the flight keymap remain in the Aircraft tab. Weather, location and other global settings retain their existing locations.

SF50 variants still share development physics and exterior meshes. Both the selected variant summary and family disclosure explain the limitations; G3 does not promise calibrated performance, a new cabin or complete generation-specific avionics. G2 remains original G2. G2+ currently selects the same runtime as G2 while remaining a separate future physics target. No flight-model coefficients, calibration targets, JSBSim or SDK lifecycle behavior changed.

## Source navigation and images

- `src/flight/aircraft/aircraftIds.ts`: separate family and runtime ID types.
- `src/flight/aircraft/aircraftCatalog.ts`: `AIRCRAFT_FAMILIES`, family lookup, variants, thumbnail metadata, LOD capabilities, credits and selection normalization.
- `src/flight/aircraft/sf50Variants.ts`: existing SF50 runtime/generation metadata and development summaries.
- `src/flight/hud/AircraftSelectionPanel.tsx`: gallery, generation/model controls, attribution, draft/active labels and Apply UI.
- `src/flight/hud/FlightControlPanel.tsx`: drafts retained across tabs and the remaining flight controls.
- `src/flight/createFlightSimApp.ts`: preference restoration, complete Apply persistence and runtime activation.
- `src/flight/aircraft/createAircraftModel.ts`: `setPresentation` updates LOD and opt-in together for the active aircraft.
- `src/styles/flight.css`: responsive image grid, separate controls, touch target sizes and focus styles.
- `scripts/render-aircraft-thumbnails.py`: dependency-free offline thumbnail generation from the shipped GLB geometry and material colors.
- `public/aircraft/thumbnails/`: static PNG renders of the shipped procedural LOD3 meshes; see the adjacent [provenance and regeneration instructions](../../public/aircraft/thumbnails/README.md).

The thumbnails derive from the app-owned C172 and Vision Jet procedural meshes credited to felipegalin0. They do not use the third-party HD model or downloaded aircraft photography. There is no live 3D viewer mounted in a card. The accessible aircraft name comes from each card's native radio label; the image is decorative to avoid announcing the name twice. The family gallery uses a native radio group for single-selection and arrow-key behavior, with focus highlighting and focused cards brought into view. The separate generation dropdown uses a labeled native select; its keyboard behavior remains untested.

## Pending acceptance checks

Per the task's working boundaries, no Git commands, tests, builds, development servers, browser checks or extra verification pass ran. `python3 scripts/render-aircraft-thumbnails.py` generated the two 640×400 PNG assets (21,917 and 33,030 bytes). Static asset generation is implementation work, not a passing UI check; the resulting images have not been visually inspected. The following remain untested:

1. Family selection and independent draft generation/model settings; drafts surviving tab changes; return to active settings.
2. G1/G2/G2+/G3 restoration, including the legacy Vision Jet ID and both legacy preference keys; unavailable LOD normalization and retained HD preference.
3. Exactly one complete-package reload for a changed runtime ID; no live mesh/physics change while staging; one presentation update for same-aircraft Apply.
4. Save-failure feedback and rollback, plus activation/reload error handling.
5. LOD/Auto, HD opt-in, credits, gear-up disclosure and development status; accurate active-model triangles, loading and errors without stale status on another selection.
6. Thumbnail load failure, visible names/selected state, family-radio and generation-dropdown keyboard behavior, focus order and touch targets.
7. Responsive grid and bounded scrolling on narrow, wide and short panels; selected controls remaining outside the gallery scroller.

The later calibration task can resume from [the SF50 development handoff](../old/sf50-development-handoff.md) and [variant models](sf50-variant-models.md). The UI implementation does not validate aircraft performance or supersede the recorded evidence gates.
