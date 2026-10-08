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
  installing 0SFS
- Optional: a Google Maps Tiles API key with the Map Tiles API enabled

0SFS depends on both as local file dependencies, and FOSS Earth links gamepad-tools as well, so the
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

To use Google Photorealistic 3D Tiles, pass your own key once, or paste it in Map → Source:

```text
http://127.0.0.1:5173/fly/?key=YOUR_GOOGLE_MAPS_API_KEY
```

FOSS Earth's settings registry saves the key in this origin's local storage and removes it from the
address bar, so later visits need no `?key=` and copied links do not carry it. The basemap and
elevation provider chosen in the Map tab are written back to the URL as `mapSource` and
`elevationSource`.

Vite may choose a different port when `5173` is occupied. `/rc/` loads the phone controller route
on its own. `?mode=flight` redirects to `/fly/` and `?mode=remote` redirects to `/rc/`, keeping other
query parameters and the invitation hash. `?mode=globe` leaves 0SFS and opens
[foss-earth.github.io](https://foss-earth.github.io/), the standalone globe.

Restart `npm run dev` after changing the FOSS Earth package manifest or exports.

### Flying in VS Code's built-in browser

VS Code's built-in browser injects a script into every page that adds a `keydown` listener to
`window` before the page's own scripts run. It hands VS Code every key press the page has not
already called `preventDefault()` on, if the press is a Ctrl or Cmd chord, Escape, a function key or
a media key, or, outside the Mac, an Alt chord. The page still receives the key. A modifier pressed
alone is not handed on. On a Mac, Option chords, Ctrl+Space, and Cmd with A, C, V, X, Z, an arrow,
Backspace or Delete also stay with the page. A page listener added to `window` later runs
after VS Code's, so the page prevents the key too late: holding Ctrl to throttle down while pressing
W opened VS Code's window switcher (Ctrl+W on a Mac), and Ctrl+R for flaps up opened Open Recent.

So every flight key listener on `window` runs in the capture phase,
`addEventListener("keydown", handler, { capture: true })`, and calls `preventDefault()` on the keys
it handles. A capture listener on `window` runs before any bubbling listener there, whenever
it was added. A new keyboard shortcut needs the same pattern. Keys typed into a text field are not
prevented, so they reach VS Code as they should. A key rebound in gamepad-tools away from the default
flight keys is not prevented. If one of those chords gets in the way, unbind it in VS Code's
Keyboard Shortcuts: Ctrl+W is `workbench.action.switchWindow`.

The script is `out/vs/platform/browserView/electron-browser/preload-browserView.js` inside the
VS Code app; this was read from version 1.140. VS Code's main process forwards keys itself only while
the browser view is hidden, crashed or paused in the debugger.

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

### Committing one piece of work from a shared working tree

Several sessions often leave uncommitted work in the same files. To commit one piece without the
others, and without touching the working tree:

1. Write `git diff -U0 -- <file>` to a log under `build/` and pick out your hunks. Where another
   session's lines sit next to yours, one hunk holds both, and only some of its added lines are
   yours.
2. Build HEAD's copy of the file plus your lines under `build/`. Stage it with
   `git hash-object -w <copy>` and `git update-index --cacheinfo <mode>,<hash>,<path>`. The index
   gets your change and the working tree keeps everyone's.
3. Confirm the split: `git diff --cached` shows nothing of anyone else's, and `git diff` no longer
   shows any of your lines.
4. Check the commit on its own. `npm run ci` checks the working tree, which is not the commit.
   - Export the index with `git ls-files -z -- src public/jsbsim-data scripts 'tsconfig*.json'
     vite.config.ts package.json index.html | git checkout-index -z --stdin --prefix=<folder under build/>/`.
   - Give the export a `node_modules` folder of links to each entry of the real one, except
     `.tmp`, `.cache`, `.vite` and `.vite-temp`, so its typecheck and Vite caches are its own.
   - In the export, `vite.config.ts` allows `../foss-earth`, which there points into `build/`: give
     the export's copy FOSS Earth's absolute path.
   - Link `public/aircraft` into the export, which the F135 tests read.
   - Run `npx tsc -b` and `npx vitest related --run` there.

### Looking at one component in Chrome, without a server

A panel or control can be seen and driven in headless Chrome without starting the dev server.
Write an entry that imports the component and its stylesheets and mounts it into a page, build it
with Vite's API as a library in `iife` format into a folder under `build/`, write an `index.html`
beside it that loads the bundle with a plain `<script>`, and open it as a `file://` URL through
`openHeadlessChrome` from `scripts/headless-chrome.mjs`. Chrome refuses module scripts from
`file://`, which is why the bundle has to be `iife`. The Chrome DevTools Protocol then takes the
screenshots (`Page.captureScreenshot`) and real pointer input (`Input.dispatchMouseEvent`). Close
Chrome with `chrome.close()` in a `finally`. The throttle lever and the Fuel tab were checked this
way, including holding and dragging them.

### Testing on a real phone

```sh
npm run dev:lan          # HTTPS on this machine's LAN address
npm run dev -- --host    # plain HTTP on the LAN, no certificate
```

Either one serves the site to other devices on the network, and the phone-controller QR then points
at this machine instead of the deployed site — so pairing can be tested without deploying.

`dev:lan` adds a self-signed certificate for the LAN address and `localhost`, and listens on both:
open `https://localhost:5173/fly/` on the computer, and the QR still sends the phone to the LAN
address. That matters when something needs a secure context: the screen wake lock and the clipboard
button are secure-only and silently do nothing over plain HTTP, and the phone controller's QR scanner
cannot open the camera without one. Flight control itself does not need one. The certificate is
self-signed, so **open the printed address on the phone once and accept the warning before scanning
a QR** — a camera-launched tab cannot show the warning and the failure looks like a pairing problem.
The computer's browser warns once too.
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
input UI. 0SFS owns the flight physics, aircraft rendering, controls, and instruments. Shared
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

Then refresh and validate 0SFS:

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
3. Import the public package path from 0SFS instead of copying it.
4. Run `npm run ci` in 0SFS and manually verify flight mode.

Note that FOSS Earth's stylesheets are exported as separate entry points. 0SFS imports
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

0SFS keeps the flight-specific half in `src/flight/input/gamepadToolsAdapter.ts`: the catalog of
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

Note the terms in [NOTICE](../NOTICE) before publishing a modified copy: 0SFS is AGPL-3.0-only, so a
network-accessible deployment must offer its users the corresponding source. Bundled aircraft and
other assets carry their own terms — see [ASSET_LICENSES.md](../ASSET_LICENSES.md) and
[THIRD_PARTY_LICENSES.md](../THIRD_PARTY_LICENSES.md).
