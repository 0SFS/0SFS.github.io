# Release audit — OSFS candidate

**Scope.** Read-only audit of the OSFS repository (then named `flight-sim`) at commit
`07ad7eee08e69f672c0feca33cc00a5021868abc`, plus its required sibling
dependency `../foss-earth` at `c434df9c7cc9473aa184c5d613b7e3d1deaef66e`.
The working tree contained unrelated aircraft and phone-controller work before
this audit; it was not changed. This document records facts observed on
2026-09-09. It is not legal advice.

## Release decision

**Do not publish an OSFS release yet.** The application builds and tests, but
the release cannot truthfully claim a clean AGPL asset and dependency story
until the blocking items below are resolved.

1. `public/jsbsim-data/aircraft/c172p/c172p.xml` says “This model is not to
   be sold.” Its author is `Unknown`. That restriction cannot be silently
   relicensed under AGPL and needs upstream provenance and permission, or a
   replacement aircraft definition.
2. The author represents the Cessna and Cirrus runtime models as original work
   based on publicly available reference material. The surrounding source trees
   still include a Sketchfab kitbash, PDFs, photographs, and other reference
   files without a complete license/provenance record. Do not distribute those
   references in a public release without a path-by-path rights decision.
3. The dual-license policy now keeps the commercial threshold as an invitation,
   not a condition of the AGPL grant. Any separately negotiated commercial
   license must be offered only by the relevant copyright holders.

## Application structure and entry points

| Area | Observed implementation |
| --- | --- |
| Browser entry | `index.html` loads `src/main.tsx`. |
| Routes | `?mode=flight` dynamically loads `src/flight/createFlightSimApp.ts`; `?mode=remote` loads the phone controller; all other routes load FOSS Earth globe mode. |
| Flight core | `src/flight/` contains JSBSim lifecycle, 120 Hz fixed-step integration, bridge and floating-origin math, aircraft models, controls, HUD, diagnostics, and terrain contact. |
| Shared globe | `foss-earth` is linked from `../foss-earth` and provides the Babylon map/runtime, globe UI, windowing, input, terrain, and geospatial functions. |
| Static runtime data | `public/jsbsim-data/` has five XML definitions and a manifest. `public/aircraft/` has aircraft GLBs. |
| Authoring material | `planes/` contains Blender, GLB, image, PDF, script, measurement, and render material. It is not all production runtime content, but git will distribute tracked material. |

## Build, test, generated files, and deployment

The project uses npm, TypeScript 5.9, Vite 8, React 19, ESLint, and Vitest.
`npm run ci` runs lint, 270 tests in 37 files, and a production build. It
passed in this audit. The linked FOSS Earth `npm run ci` also passed. Both
builds emit a chunk-size warning over Vite's 500 kB threshold; OSFS's
largest emitted `shell` chunk was about 6.5 MB minified (1.46 MB gzip), and
FOSS Earth's main chunk was about 6.8 MB (1.52 MB gzip). Treat that as a
performance release risk, not a failing build.

The repositories intentionally do not track `node_modules/` or `dist/`.
Build outputs are generated. Some Blender exports, renders, validation
artefacts, and reference sources are tracked under `planes/`; their release
status must be decided explicitly.

`npm run deploy` invokes `gh-pages` after a Vite build with base
`/`. There is no checked-in CI workflow or GitHub Pages
configuration. The local sibling package link is convenient for development
but is not a reproducible release dependency: a clean CI/deployment must check
out the exact FOSS Earth revision alongside it, or use a published/pinned
package.

## Runtime services and external data

| Service or data source | Use | Release concern |
| --- | --- | --- |
| Google Maps Tiles API / Photorealistic 3D Tiles | Optional streamed world data through `3d-tiles-renderer` | API key, Google terms, required attribution and quotas apply; source data is not part of OSFS. |
| USGS, OpenStreetMap, CARTO, OpenTopoMap | Raster basemaps supplied by FOSS Earth | Provider terms and visible attribution apply. |
| MapTilerhorn / AWS Terrarium | Streamed terrain elevation | Provider terms and attribution apply. |
| Nominatim / Overpass / FreeAirportDB | Location/airport search | Rate limits and service policies apply; this is not a guaranteed OSFS service. |
| PeerJS Cloud and Google STUN | Phone pairing signal path / direct WebRTC setup | External availability and privacy dependency; PeerJS documents separate hosting for high-volume use. |
| GitHub Pages / GitHub API | Static hosting and displayed release-version lookup | Configure a real release URL and hosting policy before announcement. |

## Software dependency assessment

The exact resolved package tree is committed in `package-lock.json`: 347
registry package entries plus the linked `foss-earth` target. `npm ls --all`
passed during the audit. The complete direct-dependency assessment and the
transitive-license review boundary are in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

The runtime is primarily permissive Apache-2.0, MIT, ISC, and LGPL-2.1
components. Those permissive licenses can generally be included in an AGPL
application if their notice obligations are met. The JSBSim engine is LGPL-2.1
inside a separate WASM binary, so its corresponding-source and notice duties
must be preserved; the npm wrapper's `MIT` field alone is not sufficient.

## Security review

Runtime `npm audit --omit=dev` completed successfully for both repositories
against the npm advisory service on the audit date. This is a point-in-time
result, not a security guarantee. No browser security review, secrets scan, or
provider-account review was performed in this phase.

## Known implementation release risks

* Product labels, package metadata, Pages base, controller URL, GitHub
  repository, and local-storage migration now use OSFS. Internal TypeScript
  names and legacy preference keys remain deliberately for compatibility.
* JSBSim bootstrap calls its geographic latitude field `lat-gc-deg` while
  higher-level code describes geodetic coordinates; the existing design notes
  identify this as an accuracy concern.
* JSBSim disposal removes different callback instances and does not call the
  SDK's destroy lifecycle. Validate repeated start/stop use before public
  release.
* GitHub Pages deployment needs an interactive flight-mode and phone-pairing
  check at the organization-site root, even though the static entry page and
  JSBSim data manifest are reachable.

## Required next actions

1. Resolve the remaining asset/data release blockers and record license/provenance evidence.
2. Add a reproducible FOSS Earth release dependency.
3. Deploy-test JSBSim data paths and phone pairing on the intended public URL.
4. Complete the post-rename checks in the separate rename record.
5. Publish an SBOM or an automated complete transitive-license report in CI;
   manually maintained prose cannot reliably substitute for 347 packages.
