# Development

This page is for people who want to change the code. If you just want to fly, open
[0sfs.github.io/fly](https://0sfs.github.io/fly/) — it is the same build, always current, and needs no setup.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for review expectations and asset provenance rules before
opening a pull request.

## Requirements

- Node.js 22 or newer
- npm
- A sibling checkout of [FOSS Earth](https://github.com/foss-earth/foss-earth.github.io)
- A sibling checkout of [gamepad-tools](https://github.com/Felipegalind0/gamepad-tools), built before
  installing OSFS
- Optional: a Google Maps Tiles API key with the Map Tiles API enabled

OSFS depends on both as local file dependencies, and FOSS Earth links gamepad-tools as well, so the
checkouts must sit at these relative paths:

```text
parent-directory/
├── 0sfs/                   this repository
├── foss-earth/
└── Felipegalind0/
    └── gamepad-tools/
```

gamepad-tools does not commit its compiled output, and its package exports point at it, so build it
before installing here:

```sh
git clone https://github.com/Felipegalind0/gamepad-tools.git Felipegalind0/gamepad-tools
(cd Felipegalind0/gamepad-tools && npm install && npm run build)
git clone https://github.com/foss-earth/foss-earth.github.io.git foss-earth
git clone https://github.com/0SFS/0SFS.github.io.git 0sfs
cd 0sfs
npm install
```

## Running locally

```sh
npm run dev
```

Vite serves source changes directly; no production build is needed first. Open the URL it prints.
The site root is an information page. The flight simulator is `/fly/`:

```text
http://127.0.0.1:5173/fly/?mapSource=osm-standard
```

To use Google Photorealistic 3D Tiles, pass your own key:

```text
http://127.0.0.1:5173/fly/?key=YOUR_GOOGLE_MAPS_API_KEY
```

Vite may choose a different port when `5173` is occupied. `/rc/` loads the phone controller route
on its own. `?mode=flight` redirects to `/fly/` and `?mode=remote` redirects to `/rc/`, keeping other
query parameters and the invitation hash. `?mode=globe` leaves OSFS and opens
[foss-earth.github.io](https://foss-earth.github.io/), the standalone globe.

Restart `npm run dev` after changing the FOSS Earth package manifest or exports.

## Quality checks

```sh
npm run lint
npm run test
npm run build
```

Or all three with `npm run ci`. Tests cover coordinate and attitude transforms, keyboard and throttle
behavior, engine bootstrap sequencing, controller profiles through gamepad-tools' sampling and
evaluation (`src/flight/input/gamepadProfiles.test.ts`), and real JSBSim/WASM C172 propulsion.
`npm run test:watch` reruns on change.

### Testing on a real phone

```sh
npm run dev:lan          # HTTPS on this machine's LAN address
npm run dev -- --host    # plain HTTP on the LAN, no certificate
```

Either one serves the site to other devices on the network, and the phone-controller QR then points
at this machine instead of the deployed site — so pairing can be tested without deploying.

`dev:lan` adds a self-signed certificate for the LAN address. That matters when something needs a
secure context: the screen wake lock and the clipboard button are secure-only and silently do nothing
over plain HTTP. Flight control itself does not need one. The certificate is self-signed, so **open
the printed address on the phone once and accept the warning before scanning a QR** — a
camera-launched tab cannot show the warning and the failure looks like a pairing problem.
`npm run dev:lan -- --print` shows the address and command without starting anything.

Both work because `vite.config.ts` injects the address the server is reachable on
(`window.__OSFS_LAN_ORIGIN__`), and only when it is bound to something other than loopback. A browser
cannot discover its own LAN address, so without that the QR would have nothing to point at.

### Phone controller layout

```sh
npm run check:phone-layout
```

jsdom has no layout engine, so the phone controller's geometry is checked in headless Chrome instead.
`scripts/phone-layout/render.tsx` renders the real `PhoneController` with the real stylesheet, and
[`scripts/check-phone-layout.mjs`](../scripts/check-phone-layout.mjs) measures it at three phone sizes
and exits non-zero when a rule breaks. Screenshots land in the gitignored `build/phone-layout/`;
`--keep-html` also keeps the rendered pages.

The same run also renders the desktop flight HUD, so the two can be compared: the phone controller is
the HUD rearranged, and they share a stylesheet. [Phone controller UI](phone-controller-ui.md)
explains that arrangement, the rules this script enforces and why, and the layout traps already paid
for.

`render.tsx` is deliberately not named `*.test.tsx`: it writes files, so it must not be collected by
`npm run test`. Its own config opts it in.

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
cd ../0sfs
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

## The gamepad-tools dependency

`package.json` links gamepad-tools from its own sibling folder:

```json
"@felipegalind0/gamepad-tools": "file:../Felipegalind0/gamepad-tools"
```

FOSS Earth declares the same link, so one checkout serves both applications. gamepad-tools provides
controller and keyboard sampling, binding profiles and their evaluation, the binding editor shown in
the flight panel's **Controls** tab, and the optional 3D controller view.

OSFS keeps the flight-specific half in `src/flight/input/gamepadToolsAdapter.ts`: the catalog of
flight actions, the built-in **Xbox** and **Classic** profiles including their keyboard defaults, and
the adapter that turns binding intents into flight controls. Reusable input work belongs in
gamepad-tools instead.

### Rebuilding gamepad-tools

Its package exports point at `dist/`, which is not committed, so rebuild it after changing its
source:

```sh
cd ../Felipegalind0/gamepad-tools
npm run build
```

Because the dependency is linked, the rebuilt output is picked up without reinstalling here; restart
Vite if it keeps serving an older module. Its `styles.css` export is read straight from `src/` and
needs no rebuild. Run `npm install` here when its package manifest or exports change.

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
