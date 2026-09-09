# Third-party software and service review

This is a release-audit record, not a replacement for the license texts
distributed in dependencies. Versions below are the installed versions resolved
by `package-lock.json` on 2026-09-09. “Generally compatible” means the stated
license is normally combinable with AGPLv3 when its notice and source terms are
met; it is not a legal opinion.

## Direct dependencies

| Component | Version | License | Usage | AGPLv3 assessment and notes |
| --- | ---: | --- | --- | --- |
| [@0x62/jsbsim-wasm](https://github.com/0x62/jsbsim-wasm) | 1.2.4-beta.4 | MIT SDK; bundled JSBSim WASM is LGPL-2.1 | Flight dynamics engine and virtual filesystem SDK | Conditional. Preserve LGPL notice and corresponding source for the engine and its Emscripten patch; see [JSBSim WASM integration](docs/jsbsim-wasm.md). Package metadata alone is incomplete. |
| [@babylonjs/core](https://www.babylonjs.com/) | 8.56.2 | Apache-2.0 | WebGL/WebGPU renderer | Generally compatible; retain Apache notice. |
| [@babylonjs/loaders](https://www.babylonjs.com/) | 8.56.2 | Apache-2.0 | glTF and asset loading | Generally compatible; retain Apache notice. |
| [3d-tiles-renderer](https://github.com/NASA-AMMOS/3DTilesRendererJS) | 0.4.24 | Apache-2.0 | 3D Tiles renderer and Google auth plugin | Generally compatible; retain Apache notice and Caltech/JPL non-endorsement notice. Provider data has separate terms. |
| `foss-earth` | 0.0.0 local link | AGPL-3.0-only | Globe, maps, shared UI/input/runtime | Project-owned code under the same core-code license. The current sibling link still needs an immutable release pin. |
| [lucide-react](https://lucide.dev) | 1.41.0 | ISC; Feather-derived icon notice is MIT | UI icons | Generally compatible; preserve both applicable notices. |
| [peerjs](https://peerjs.com) | 1.5.5 | MIT | WebRTC pairing/signalling client | Generally compatible; PeerJS Cloud is an external service with its own operational terms. |
| [qrcode](https://github.com/soldair/node-qrcode) | 1.5.4 | MIT | Phone-controller QR generation | Generally compatible. |
| [react](https://react.dev) | 19.2.6 | MIT | UI runtime | Generally compatible. |
| [react-dom](https://react.dev) | 19.2.6 | MIT | DOM renderer | Generally compatible. |

## Direct development dependencies

| Component | Version | License | Usage | AGPLv3 assessment |
| --- | ---: | --- | --- | --- |
| [@eslint/js](https://eslint.org) | 9.39.4 | MIT | Lint rules | Generally compatible; build-time only. |
| [@types/node](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node) | 24.12.4 | MIT | Node typings | Generally compatible; build-time only. |
| [@types/qrcode](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/qrcode) | 1.5.5 | MIT | QR typings | Generally compatible; build-time only. |
| [@types/react](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react) | 19.2.14 | MIT | React typings | Generally compatible; build-time only. |
| [@types/react-dom](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react-dom) | 19.2.3 | MIT | React DOM typings | Generally compatible; build-time only. |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | 6.0.2 | MIT | Vite React transform | Generally compatible; build-time only. |
| [eslint](https://eslint.org) | 9.39.4 | MIT | Linter | Generally compatible; build-time only. |
| [eslint-plugin-react-hooks](https://react.dev) | 7.1.1 | MIT | Hooks lint rules | Generally compatible; build-time only. |
| eslint-plugin-react-refresh | 0.5.2 | MIT | Vite refresh lint rules | Generally compatible; build-time only. |
| [gh-pages](https://github.com/tschaub/gh-pages) | 6.3.0 | MIT | Pages publisher | Generally compatible; build-time only. |
| globals | 17.6.0 | MIT | ESLint globals | Generally compatible; build-time only. |
| [jsdom](https://github.com/jsdom/jsdom) | 29.1.1 | MIT | Browser-like test runtime | Generally compatible; build-time only. |
| [TypeScript](https://www.typescriptlang.org/) | 5.9.3 | Apache-2.0 | Type checker/compiler | Generally compatible; build-time only. |
| [typescript-eslint](https://typescript-eslint.io/packages/typescript-eslint) | 8.59.3 | MIT | TypeScript linting | Generally compatible; build-time only. |
| [Vite](https://vite.dev) | 8.0.13 | MIT | Dev server and production bundle | Generally compatible; build-time only. |
| [Vitest](https://vitest.dev) | 4.1.6 | MIT | Test runner | Generally compatible; build-time only. |

## Transitive dependency boundary

The OSFS lockfile contains 347 registry packages and one local link;
FOSS Earth contains 314 registry packages. `npm ls --all` succeeded for both.
The installed package metadata declared licenses for the registry packages
reviewed. In addition to permissive MIT/ISC/Apache/BSD families, the resolved
tree includes MPL-2.0 Lightning CSS, CC-BY-4.0 `caniuse-lite`, Python-2.0
`argparse`, and BlueOak-1.0.0 `minimatch`/`lru-cache`; each needs its required
notice retained where applicable. Optional platform packages were not installed
on this machine.

This audit deliberately does not claim a hand-verified license for every
transitive package from a summary field. Before release, add CI that emits a
versioned SPDX or CycloneDX SBOM and a full dependency-license report from the
committed lockfiles; review all `UNKNOWN`, custom, copyleft, and bundled-binary
results. The lockfiles remain the authoritative exact package lists for this
audit snapshot.

## Non-package components requiring separate review

* JSBSim aircraft, engine, and propeller XML are simulation data, not simply
  code under the SDK's MIT label. The bundled C172 definition is restricted;
  see the release audit.
* GLB/Blender models, images, PDFs, textures, icons, and reference material
  require per-asset provenance. The asset audit found unresolved items.
* Google Tiles, OSM, USGS, CARTO, OpenTopoMap, MapTilerhorn, AWS Terrarium,
  Nominatim, Overpass, FreeAirportDB, PeerJS Cloud, and Google STUN are live
  external services/data sources, not dependencies relicensed by AGPL.
