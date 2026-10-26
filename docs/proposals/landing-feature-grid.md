# Landing-page feature grid

Implemented locally on 25 October 2026. The page uses a responsive bento grid to showcase the simulator’s features.

## Direction

Keep the existing dark aviation palette and amber accent. Replace the 44rem content column with a fluid 12-column feature grid, capped at 1600px. A large scenery card anchors four smaller graphics/physics/computation/phone cards; sky, systems, sound and multiplayer complete the board in a four-card row. The grid adapts through tablet layouts to one column on a small phone. Actual simulator imagery and catalogue thumbnails identify the product. The phone artwork uses real application captures baked into static images. The worker, graphics and sky diagrams are decorative illustrations.

The first viewport should communicate the actual engineering and invite a first flight. Aircraft notes retain the catalogue's exact qualifications. Keyboard, phone and documentation guides use native accessible disclosures. Roadmap work has explicit Planned labels. The landing route stays static HTML/CSS, with its existing two inline scripts and isolation helper; no graphics engine or new framework is added to it.

## Claims

The [dated research comparison](https://github.com/0SFS/research/blob/main/browser-flight-sim-positioning-2026-10-25.md) records the evidence. Avoid an unqualified most-advanced or world-first claim. JSBSim is C++ WASM; Rust cores serve world computation. The threaded shared-memory sky path is optional. Physics defaults to 60 Hz, with 120 Hz selectable. Two-pilot multiplayer is an early preview. ArduPilot requires future local SITL integration; a browser-only ArduPilot build is not the first target.

Raster scenery works without a Google key. Google Photorealistic 3D Tiles requires the user's key and provider terms. The existing preview screenshot shows USGS raster scenery, not Google photogrammetry. Third-party scenery and asset licences remain distinct from the application's AGPL licence.

## Local review

Start the site in your own terminal (the flight build already exists in this workspace):

```sh
cd ~/gh/0sfs/0sfs.github.io && npm run dev
```

Open http://127.0.0.1:4175/. Review the full laptop width, narrow the window, expand the three getting-started guides, and follow Start flying. Use http://127.0.0.1:4175/?renderer=webgl2 to check that the renderer setting reaches /fly/.

[Open the custom feedback checklist](http://127.0.0.1:4175/fly/#test=%7B%22version%22%3A1%2C%22id%22%3A%22landing-bento-20261025%22%2C%22title%22%3A%22Review%20the%200SFS%20feature%20grid%22%2C%22steps%22%3A%5B%7B%22id%22%3A%22laptop%22%2C%22text%22%3A%22At%20full%20laptop%20width%2C%20does%20the%20feature%20grid%20use%20the%20screen%20well%20and%20make%200SFS's%20capabilities%20clear%3F%22%7D%2C%7B%22id%22%3A%22small%22%2C%22text%22%3A%22Narrow%20the%20landing%20page%20window%20to%20phone%20width.%20Is%20the%20content%20readable%20without%20horizontal%20scrolling%3F%22%7D%2C%7B%22id%22%3A%22copy%22%2C%22text%22%3A%22Check%20the%20physical%20sky%2C%20sound%2C%20physics%2C%20Rust%2Fshared-memory%2C%20multiplayer%20preview%20and%20planned%20ArduPilot%20descriptions.%20Are%20they%20accurate%20and%20compelling%3F%22%7D%2C%7B%22id%22%3A%22start%22%2C%22text%22%3A%22Try%20the%20keyboard%2Fphone%2Fdocumentation%20disclosures%2C%20then%20Start%20flying.%20Do%20the%20controls%20and%20links%20work%20as%20expected%3F%22%7D%5D%2C%22sources%22%3A%5B%5D%2C%22instructions%22%3A%22Open%20http%3A%2F%2F127.0.0.1%3A4175%2F%20in%20another%20tab%20to%20review%20the%20landing%20page%2C%20then%20return%20here%20to%20record%20feedback.%20This%20Test%20tab%20belongs%20to%20the%20simulator%3B%20the%20landing%20page%20stays%20lightweight.%22%7D). This opens the simulator's existing Test tab; review the landing page in a second tab, then return to Test. Press Start, record Pass/Fail/Skip and comments, then Finish → Download feedback. The feedback stays local until you choose to share the downloaded JSON. No new feedback code is loaded by ordinary landing-page visits.

The plan source is retained at `build/test-plan.json`; the link is self-contained. The screenshot comparison is `build/shots/index.html`, with the old desktop/laptop/phone layouts archived alongside the new ones. Those are ignored local artifacts.

## Verification

- `npm test`: 48 existing tests passed, including legacy route redirects, URL-setting preservation, catalogue checks and documentation links.
- `npm run build`: passed using the existing sibling flight build. The simulator source and its pre-existing changes were not rebuilt or edited by this task.
- `npm run check`: passed. The check blocks external scenery services and verifies the JSBSim/aircraft startup, flight-route transition and phone-controller separation; it does not validate live terrain readiness or actual flight performance.
- Final screenshot review at 320, 390, 481, 600, 834, 1280, 1440 and 1920 CSS px found no horizontal overflow. At 1440px the main content is 1384px wide, compared with the previous 704px. The complete nine-card board, both rows of the narrow grid, aircraft, roadmap and expanded guides were inspected. The physical-sky card and sound copy are included in the custom feedback checklist.
- Enter opens the focused keyboard disclosure. The custom Test link displays all four steps, and Start/Finish produces valid downloadable feedback JSON.

The competitor assessment is a source review, not a benchmark or an aerodynamic comparison. The site is local and uncommitted; no source or deployment was pushed.

## Source handoff

This change is local and uncommitted. The affected repositories are both on `main`, with push remotes `https://github.com/0SFS/0SFS.github.io.git` and `https://github.com/0SFS/research.git`. Do not include unrelated work in a commit. Review and commit the intended source paths before running these exact source pushes; neither is a deployment command:

```sh
git -C ~/gh/0sfs/research push origin main
git -C ~/gh/0sfs/0sfs.github.io push origin main
```

Research paths: `browser-flight-sim-positioning-2026-10-25.md`, `open-source-competitors.md`.
Website paths: `index.html`, `landing.css`, `package.json`, `README.md`, `docs/proposals/landing-feature-grid.md`.

Push research before the site so its new documentation link resolves. Publishing the page requires a separate explicit request and the repository's normal publishing workflow.

## Scripted media and aircraft help follow-up

The world card now uses the [real five-second F-35B capture](landing-hero-video.md),
with WebM/MP4 sources, a still poster, native pause/play and reduced-motion/data-saving
behavior. Its script uses Google Photorealistic 3D Tiles and the requested Minneapolis
scene at 17:14 solar time (18:10:58 CDT). Throttle starts at 90% and changes to 100%
at 0.200 s; the real engine lights its augmentor at approximately 1.367 s. Fresh
flights have no external tanks, and the camera orbits counterclockwise viewed
from above. The guide documents the native ignition delay and tuning.

Aircraft summaries and notes now live in native popovers behind compact **?**
buttons. The Experimental badge stays visible for the F-35B. Exact catalogue text,
family ordering and thumbnail validation remain checked, including nested help
markup. The [supplementary-copy policy](supplementary-copy-policy.md) explains what
stays visible and what belongs in help. Popovers avoid the cards' overflow clipping
and support keyboard opening, Escape/focus return and light dismissal.

The updated local review is `build/hero-review.md`; its five-step custom Test link
includes the video and aircraft help and produces downloadable feedback. Screenshots
are in `build/shots/index.html`, including the afterburner frame, narrow video layout,
closed aircraft cards, and desktop/phone help. The local preview server now serves
video MIME types and byte ranges so seeking and replay work during review.

This follow-up passes 59 tests, the site build, both native video decoding checks,
and the built-site browser check. Video review covers 320, 390, 600, 834, 1280, 1440
and 1920 CSS pixels without horizontal overflow. The real phone artwork is integrated;
the physical-sky screenshot remains a separate handoff, and the original sky
illustration is preserved.
