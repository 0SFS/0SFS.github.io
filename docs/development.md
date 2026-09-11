# Development

This page is for people who want to change the code. If you just want to fly, open
[0sfs.github.io](https://0sfs.github.io/) — it is the same build, always current, and needs no setup.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for review expectations and asset provenance rules before
opening a pull request.

## Requirements

- Node.js 22 or newer
- npm
- A sibling checkout of [`foss-earth`](https://github.com/Felipegalind0/foss-earth)
- Optional: a Google Maps Tiles API key with the Map Tiles API enabled

OSFS depends on FOSS Earth as a local file dependency, so the two repositories must sit side by side:

```text
parent-directory/
├── OSFS/
└── foss-earth/
```

```sh
git clone https://github.com/Felipegalind0/foss-earth.git
git clone https://github.com/Felipegalind0/OSFS.git
cd OSFS
npm install
```

## Running locally

```sh
npm run dev
```

Vite serves source changes directly; no production build is needed first. Open the URL it prints;
the flight simulator is the default route:

```text
http://127.0.0.1:5173/?mapSource=osm-standard
```

To use Google Photorealistic 3D Tiles, pass your own key:

```text
http://127.0.0.1:5173/?key=YOUR_GOOGLE_MAPS_API_KEY
```

Vite may choose a different port when `5173` is occupied. `?mode=globe` starts the globe application
exported by the linked FOSS Earth checkout, and `?mode=remote` loads the phone controller route on
its own. Older `?mode=flight` links still open the simulator.

Restart `npm run dev` after changing the FOSS Earth package manifest or exports.

## Quality checks

```sh
npm run lint
npm run test
npm run build
```

Or all three with `npm run ci`. Tests cover coordinate and attitude transforms, keyboard and throttle
behavior, engine bootstrap sequencing, and real JSBSim/WASM C172 propulsion. `npm run test:watch`
reruns on change.

## The FOSS Earth dependency

`package.json` declares FOSS Earth as a local file dependency:

```json
"foss-earth": "file:../foss-earth"
```

The lockfile links `node_modules/foss-earth` to that sibling checkout. FOSS Earth provides the
Babylon.js globe renderer, Google/raster map selection, application bar, and shared windowing and
input UI. OSFS owns the flight physics, aircraft rendering, controls, and instruments. Shared
functionality is imported through FOSS Earth's public package exports; compatibility modules forward
to that package.

See [FOSS Earth relationship](foss-earth-relationship.md) for architectural background.

### Bringing in FOSS Earth changes

Update the sibling checkout first:

```sh
cd ../foss-earth
git switch main
git pull --ff-only
```

Then refresh and validate OSFS:

```sh
cd ../OSFS
npm install
npm run ci
```

Because the dependency is linked, source edits under `../foss-earth` are normally visible to Vite
immediately. Restart Vite if dependency optimization caches an older module. Run `npm install`
whenever package manifests, exports, or the lockfile relationship change.

When both applications need new shared functionality:

1. Implement and export it from FOSS Earth through its `package.json` `exports` map.
2. Test it in the FOSS Earth repository.
3. Import the public package path from OSFS instead of copying it.
4. Run `npm run ci` in OSFS and manually verify flight mode.

Note that FOSS Earth's stylesheets are exported as separate entry points. OSFS imports
`foss-earth/shell.css` and `foss-earth/input-mode.css` but **not** its `base.css`, so any CSS custom
property a shell rule depends on has to be defined within the entry point that ships it — otherwise
the declaration is invalid at computed-value time here and silently falls back to its initial value.

## Project layout

```text
src/compat/         Compatibility re-exports for existing package subpaths
src/flight/         JSBSim runtime, physics, aircraft, input, and flight UI
src/remote/         Phone controller UI, pairing, and WebRTC transport
src/main.tsx        Route selection for globe, flight, and phone modes
public/jsbsim-data/ Bundled JSBSim aircraft, engine, and propeller definitions
planes/             Aircraft model sources, references, and validation renders
```

## Running your own copy

You generally should not need to. The hosted site is the same code, it updates automatically, and
self-hosting gains you nothing unless you are modifying the source. If you are — or you want a copy
that will not change under you — build the static bundle:

```sh
npm run build
npx vite preview
```

`dist/` is a plain static directory that any static host will serve, so long as Vite's `base` matches
the path it is served from and `VITE_PHONE_CONTROLLER_URL` points at your own deployment. For GitHub
Pages specifically, see [Deploying to GitHub Pages](deploying.md).

Note the terms in [NOTICE](../NOTICE) before publishing a modified copy: OSFS is AGPL-3.0-only, so a
network-accessible deployment must offer its users the corresponding source. Bundled aircraft and
other assets carry their own terms — see [ASSET_LICENSES.md](../ASSET_LICENSES.md) and
[THIRD_PARTY_LICENSES.md](../THIRD_PARTY_LICENSES.md).
