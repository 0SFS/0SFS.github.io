# Delegation prompt: reproducible FOSS Earth sunset captures

Build a reusable script that takes **UI-less screenshots of actual FOSS Earth scenes**, then use it to create the sunset background for the 0SFS landing page's sky feature card. The main agent will integrate the image and a switch between it and the current illustration.

## Context and ownership

Workspace includes `/Users/felg/gh/foss-earth/app`, `sky`, `engine`, `renderer`, `browser-testing` and `/Users/felg/gh/0sfs/0sfs.github.io`.

Read each relevant `AGENTS.md` and the shared instructions. Preserve unrelated uncommitted changes. Other agents are working concurrently. **Do not edit the website's `index.html`, `landing.css`, `package.json`, phone-rendering files or flight-video capture scripts. Do not delete or replace the existing `.feature__sky-art` illustration.** Avoid application/library changes when the existing runtime/camera/settings contracts suffice. Coordinate any necessary application hook with the main agent first. Do not commit, push or deploy.

You own:

- New FOSS Earth capture source under `foss-earth/app/scripts/capture-scenes/`, with a `capture.mjs` entry point and scenario configuration.
- `foss-earth/app/docs/proposals/scene-screenshot-capture.md` for the reusable workflow.
- The final website image `0sfs.github.io/public/media/sky-sunset-orbit.webp` and optional JPEG/PNG fallback.
- Website handoff notes at `0sfs.github.io/docs/proposals/bento-sunset-capture.md`.
- Scratch captures/logs under each owning repository's ignored `build/`.

## Visual target

The current sky card is an illustration of a curved dark Earth limb, a thin illuminated atmosphere, a low Sun and a dark blue upper sky. Inspect it in `0sfs.github.io/index.html` / `landing.css` and the existing `build/shots/landing/phone-sky.png` if present.

Recreate that general composition using the real FOSS Earth globe and sky, viewed **from high orbital altitude**. Keep the curved Earth low in the image, with the luminous atmospheric edge and sunset as the focus. Do not substitute a generated image, a stock photograph or a separate toy shader.

Use:

- Date/time: **25 October 2026, 17:16 in America/Chicago**, which is **`2026-10-25T22:16:00Z`**. This is civil local time, not UTC 17:16 or solar-clock time.
- Geographic reference: Mississippi River beside UMN, approximately latitude `44.974516`, longitude `-93.2375`.
- Initial view toward the western horizon; tune orbital position, altitude, heading, pitch and field of view for a pleasing limb/sunset composition. Make those choices explicit in configuration. A starting altitude around 400 km is reasonable, but the result should drive the final choice.
- Use the real physical sky with fixed time. Use Google 3D Tiles where appropriate to the Earth view and available at orbital scale, without silently substituting another source. Record the actual source. Follow the documented local Google-key lookup; never print or commit the key.

## Reusable script requirements

1. Accept scene configuration for position, altitude, camera orientation/FOV, date/time, scenery, resolution and destination. Support more than this one hardcoded sunset.
2. **Build FOSS Earth if no usable build exists; reuse an existing build by default.** Provide an explicit rebuild option. Record the build/source revision and any dirty-state limitation, so an existing build is not falsely described as current source.
3. Capture the actual FOSS Earth rendering. Wait for concrete app/sky/scenery readiness signals; do not rely on an arbitrary sleep or capture a loading/fallback view.
4. Hide application controls for the screenshot while preserving relevant map/provider attribution. Keep this capture-only behavior out of ordinary visits.
5. Make the same scenario easy to rerun and tune. Preserve the uncompressed original in ignored `build/` and produce a compact final WebP with a full-size preview.
6. Use the existing browser tooling, bounded runs and owned-process cleanup. Keep laptop checks to a few minutes. Do not launch a broad benchmark or full CI suite for a screenshot task.

## Preserve the comparison

The user explicitly wants to switch back and forth while tuning. Preserve the original CSS illustration unchanged. Deliver the real image and a short integration suggestion for a **Sunset / Illustration** switch; the main agent owns that control and its final default. Do not replace the old art in place or discard intermediate scene configurations needed to reproduce alternatives.

## Handoff

Return the final asset and inspected preview, its dimensions/byte size, the exact capture command, selected scenario values, build provenance and remaining visual limitations. Explain whether the date/time and Earth location were held exactly or whether the camera observer moved to obtain the orbital composition. Complete an actual capture, not just the script skeleton.
