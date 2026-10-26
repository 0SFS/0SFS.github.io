# Delegation prompt: real interfaces on 3D smartphones

You are working on the local 0SFS landing-page prototype. Implement the smartphone artwork for its **phone remote** and **multiplayer** feature cards. Deliver repeatable rendering scripts and finished assets; the main agent will integrate them into the landing page.

## Context and ownership

Workspace: `/Users/felg/gh/0sfs`. Website: `0sfs.github.io/`. Simulator: `fly/`. Real remote controller: `rc/`. Shared rendering/browser tools: `/Users/felg/gh/foss-earth/`.

Read the relevant `AGENTS.md` files and their shared instructions. Preserve all existing uncommitted work. Other agents are working concurrently. **Do not edit `index.html`, `landing.css`, `package.json`, the flight-video capture scripts, or simulator/remote application source.** If a new application hook is genuinely needed, send the main agent the exact proposed change before editing those files. Do not commit, push or deploy.

You own:

- `0sfs.github.io/scripts/bento-phones/` for model, capture and rendering source/configuration.
- `0sfs.github.io/public/media/bento-remote-phone.webp` and `bento-multiplayer-phones.webp`, plus matching PNG fallbacks if useful.
- `0sfs.github.io/docs/proposals/bento-phone-renderings.md` for reproduction and provenance.
- Ignored scratch files and original screenshots under `0sfs.github.io/build/bento-phones/`.

## Required result

1. **Remote card:** render the actual current 0SFS remote-controller interface as the screen texture of a convincingly three-dimensional smartphone. Use a Samsung Note 20 Ultra 5G or a similar large Android phone as the visual reference: thin bezels, a slim metallic frame, rounded corners and believable thickness/buttons. A generic model with those characteristics is fine; exact branded CAD fidelity is unnecessary. Favor landscape orientation if that best presents the real controller.
2. **Multiplayer card:** render two phones in one composition, each showing a different real current 0SFS flight screenshot. Show enough aircraft, world and sky to make both screens recognizable. Use complementary angles/overlap without obscuring the screens. This is an illustration of two devices; do not claim a live connected multiplayer session unless you actually establish and capture one.
3. The screens must come from the real applications. Do not invent their UI, paint fake controls or use the old website `public/preview.jpg`. Capture the actual remote UI and simulator. Prefer a genuinely paired controller; if a test fixture is needed, render the real UI components with explicitly documented fixture state rather than drawing a substitute. Record which path was used.
4. Build/render the phone geometry in code, or use an appropriately licensed reusable 3D asset. Apply the screenshots as textures with correct orientation and aspect ratio. Preserve the model/rendering source. Bake the final artwork to static images; the landing page must not need a 3D engine to display it.
5. Use transparent backgrounds and restrained shadows/highlights suitable for the existing dark green remote card and dark blue multiplayer card. Check the composition at roughly 300–400 CSS pixels wide. Avoid unreadable labels or a screen reduced to an indistinct sliver. Target a compact WebP; report actual dimensions and byte sizes rather than promising an arbitrary compression ratio.

## Capture and reproduction

- Use the installed Babylon/rendering/browser tools where practical. Avoid unnecessary dependencies or downloading a whole toolchain.
- Follow the shared browser screenshot workflow for application captures/review. Use `npm run llm-dev` for owned dev servers and stop owned processes before returning. Leave other people's servers alone.
- Expose camera angles, device poses, lights, texture inputs and output resolution in a small configuration file. Provide a single documented command to reproduce both finished assets, plus a way to rerender using existing captures.
- The main thread is preparing a real F-35B sunset flight over the Mississippi by UMN, with Google Photorealistic 3D Tiles at `2026-10-25T17:16:00-05:00`. Its scratch outputs may appear under `0sfs.github.io/build/hero/f35-westbound-umn/`; reuse suitable finished frames if available, but do not change those files or wait on them to build the phone renderer.
- Keep scenery attribution visible where it is part of the captured screen. Do not publish keys, pairing secrets or raw credential-bearing URLs in screenshots or metadata.

## Handoff

Deliver the assets, all source/config needed to regenerate them, and a short report with:

- Exact reproduction command and required existing checkouts/tools.
- Screenshot provenance, application revision/build and whether the controller was live paired or a fixture.
- Model source/license if an external model was used.
- Final image dimensions/bytes and inspected previews on a dark background.
- Suggested static HTML image markup and aspect ratios, without editing the landing page.

Complete the local rendering work before returning; do not stop at a mockup description or a plan.
