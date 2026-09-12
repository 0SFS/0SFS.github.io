# Fresh conversation prompt: aircraft selection UI

Implement the aircraft selection UI in `/Users/felg/gh/0sfs`. This task comes before the next SF50 calibration task.

## What I want

A **scrollable gallery containing a grid of aircraft images**. The user picks an aircraft, and **aircraft-specific controls appear underneath the gallery, outside its scrollable region**.

For example:

- A Cessna 172 image card selects the C172 family and shows the controls applicable to it.
- A Cirrus Vision Jet image card selects the SF50 family; the section underneath includes the G1 / G2 / G3 selector and all the other applicable aircraft-specific UI we already have.

Do not represent G1, G2 and G3 as three nearly identical gallery cards. The gallery chooses the aircraft family; the controls below choose its generation/configuration and presentation settings.

Conceptual layout, not a prescribed visual style:

```text
Aircraft
+------------------------------------------+
| Scrollable image gallery                 |
| [ Cessna 172 image ] [ Vision Jet image ] |
| [ Other aircraft, when available ... ]    |
+------------------------------------------+

Selected aircraft: Cirrus Vision Jet
Generation: [ G1 ] [ G2 ] [ G3 ]
Existing applicable aircraft/model controls
Credits, development status and errors
[Deliberate activation action if needed]
```

## Read the handoff, then inspect only the relevant UI

Start with `docs/validation/sf50-development-handoff.md` and the selection sections of `docs/validation/sf50-variant-models.md`.

Likely implementation files:

- `src/flight/aircraft/aircraftIds.ts`
- `src/flight/aircraft/aircraftCatalog.ts`
- `src/flight/aircraft/sf50Variants.ts`
- `src/flight/hud/FlightControlPanel.tsx`
- The relevant selection/persistence portions of `src/flight/createFlightSimApp.ts`
- The existing panel styles and applicable image/model assets, located with a targeted search

Read the relevant current files before editing; the handoff is historical context, not a substitute for current source. Avoid unrelated exploration or rereading the entire project.

## Architecture and compatibility requirements

- Introduce or use an explicit aircraft-family grouping rather than conflating family with the active FDM variant.
- Preserve the existing runtime IDs: `cessna-172`, `cirrus-vision-jet` for G1, `cirrus-vision-jet-g2`, and `cirrus-vision-jet-g3`.
- Preserve existing saved selections. The legacy Vision Jet ID must continue to resolve to G1.
- Keep gallery metadata, available variants and applicable controls data-driven; avoid spreading SF50-specific conditionals throughout the panel.
- Inventory and retain all existing aircraft-specific controls. Known examples include LOD/Auto selection, opt-in HD meshes, model credits and loading/error/development status. Do not accidentally remove other applicable controls when replacing the radio list.
- Keep genuinely global controls, such as weather/location settings, global instead of duplicating them per aircraft.
- Only show a generation selector for a family that has generations. Switching family must not leave stale generation controls or stale model status visible.
- Keep the actual aircraft activation atomic. The existing app saves an aircraft ID and reloads so physics, controls, contact geometry, gauges and visuals change together. Do not switch only the mesh while leaving another aircraft's physics active.
- Prefer choosing a family to reveal its controls without immediately triggering repeated reloads. If the existing activation mechanism requires it, use a clear Apply/Fly action for the complete family/variant choice. This is a recommendation to preserve coherent activation, not a requirement to invent a larger onboarding flow.
- Make staged selection versus currently active aircraft clear if they differ.

## Images, layout and interaction

Use the existing application's design language, not an unrelated full-page redesign.

- Use real aircraft thumbnails from existing appropriately licensed assets, or lightweight images rendered from the existing meshes. Preserve provenance and required attribution. Do not assume arbitrary internet aircraft images are reusable.
- Prefer static optimized thumbnails over mounting a live 3D viewer for every card.
- Show a readable aircraft name, an unmistakable selected state and a stable image aspect ratio. Handle missing/failed images gracefully.
- The gallery itself has a bounded, scrollable area. The selected-aircraft controls live below it, not inside the gallery's scroller or hidden in a card overlay.
- Keep the grid responsive on desktop and mobile, and usable with touch, mouse and keyboard.
- Use accessible single-selection semantics, meaningful labels, visible focus and sensible focus order between the gallery and the controls below.
- Do not add fake aircraft, speculative search/filter systems, unnecessary animation or a second unrelated settings workflow.

## SF50 truthfulness matters

G1/G2/G3 currently have separate runtime identities/packages, but share development physics and exterior meshes. Preserve the development-status disclosure. Do not imply that choosing G3 provides calibrated G3 performance, a new cabin or complete generation-specific avionics.

G2+ is a separate evidence configuration, not a currently selectable generation in this task. Do not silently turn G2 into G2+ or add a fourth choice merely because data tables exist.

Do not change flight-model coefficients, JSBSim, SDK lifecycle behavior or calibration targets as part of this UI task.

## Working boundaries

The app belongs in 0sfs. Native engine work belongs in `/Users/felg/gh/Felipegalind0/jsbsim`; SDK work belongs in `/Users/felg/gh/Felipegalind0/jsbsim-wasm`. Neither dependency should need changes for this UI task. Do not recreate task-named repository copies/worktrees.

Preserve user changes. Do not run Git, start a dev server, take over the user's visible browser/cursor, run tests or perform an extra verification pass without explicit authorization. This prompt does not carry forward an assumed approval from the previous conversation. If checks are authorized, prefer focused tests and terminal/headless UI checks.

Implement the UI, update its documentation, and summarize what changed and what remains untested. Relevant acceptance checks, when authorized, are family-card selection, generation changes, legacy preference restoration, atomic package activation, preservation of existing controls/credits, image failure handling, keyboard accessibility and responsive scrolling. Do not claim those checks passed unless they actually ran.

Keep the later SF50 calibration handoff usable; update selection-related file references if the UI refactor moves them.
