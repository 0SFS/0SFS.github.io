> **Superseded.** The routes are now `/fly/` and `/rc/`, and the info page
> exists. This file is kept for the constraints it records; its routing
> advice (arguing for `?mode=` query parameters over paths) is out of date.

# Work prompt: turn the site root into an information page

Execute this task when the user starts a fresh conversation with this file.
Work in `/Users/felg/gh/0sfs`. Read the current `AGENTS.md` before making changes.

Today, opening `https://0sfs.github.io/` boots the simulator directly: a visitor
gets a loading screen, a WebAssembly download and a cockpit before they have been
told what the project is. The user wants the root to be an **information page**
in the spirit of `https://www.geo-fs.com/` — a page that explains the project and
has a prominent control that starts the simulator — with the simulator itself
moved behind an explicit route.

## Confirm two decisions before writing code

Both change behaviour for existing users, so ask rather than assume:

1. **Does every visit to `/` land on the information page**, including someone
   who was flying five minutes ago? The alternative is remembering a "skip the
   landing page" preference, or honouring the installed-PWA launch differently
   from a browser visit.
2. **What is the simulator's URL?** `?mode=flight` already works and needs no new
   infrastructure. See the GitHub Pages constraint below before proposing a path
   like `/fly`.

Do the research and the survey of the current routing first, so the questions
arrive with context attached.

## How routing works now

[`src/main.tsx`](../src/main.tsx) is the whole router:

```ts
function appRoute(): AppRoute {
  const mode = new URLSearchParams(window.location.search).get("mode");
  return mode === "remote" || mode === "globe" ? mode : "flight";
}
```

Every unrecognised value falls through to `flight`, which is exactly the default
this task changes. Each route dynamically imports its own entry point, which is
what keeps Babylon and JSBSim out of the phone-controller bundle — preserve that
property, and verify it in the build output rather than assuming it.

`isFlightMode()` also gates the boot log (`createGameLog`), the loading screen
(`createFlightLoadingScreen`) and `offerFullscreen`. None of those should run for
the information page.

## Constraints that must not break

- **`?mode=remote` must keep working from a cold load.** The phone-controller QR
  encodes exactly `https://0sfs.github.io/?mode=remote#v=1&peer=…&join=…`; see
  `createPairingUrl` in [`src/remote/pairing.ts`](../src/remote/pairing.ts), which
  hard-codes that search string and validates it on the phone in
  `parsePairingUrl`. A phone opening the QR must reach the controller, never the
  information page. `docs/phone-controller.md` describes the flow.
- **`?mode=globe` keeps opening the FOSS Earth globe.**
- **Deep links keep their parameters.** `?renderer=` is read in
  `src/flight/createFlightSimApp.ts` and `?flightPerf=1` in
  `src/flight/diagnostics/flightPerformanceCapture.ts`. A link from the
  information page into the simulator must not drop parameters a user already had
  in the URL.
- **GitHub Pages has no SPA fallback.** A real path like `/fly` returns 404 on
  reload or when shared, unless you also add a `404.html` redirect shim. A query
  parameter or hash route needs none of that. If you propose a path anyway, say
  exactly how a hard refresh on that URL is served.
- **The base path is not always `/`.** `vite.config.ts` builds a project-site fork
  at `/<repository>/`. Every link and asset reference on the new page must be
  base-relative (`import.meta.env.BASE_URL`), never a hard-coded leading slash.
- **The manifest.** `public/manifest.webmanifest` uses `"start_url": "./"` with
  `"display": "fullscreen"`. Decide deliberately whether an installed OSFS should
  launch into the information page or straight into the simulator, and make the
  manifest say so.
- **First paint.** `index.html` inlines the boot-log styles and shows
  "Downloading the application…" before any bundle arrives. That text is wrong for
  an information page; whatever replaces it must still paint something useful if
  the module bundle fails to load, and must keep the existing `addEventListener`
  error hook working.
- **No new heavy dependencies.** The page is static content; it should be the
  lightest route in the build.

## What the page needs to contain

Source the substance from the repository rather than inventing claims:

- [`README.md`](../README.md) — the feature list, the controls table, and the
  honest description of what the simulator does.
- [`docs/`](.) — `phone-controller.md`, `sound.md`, `jsbsim.md`,
  `development.md`, `deploying.md`, `foss-earth-relationship.md`. Link to them
  rather than restating them.
- `src/flight/aircraft/aircraftCatalog.ts` — what actually flies.
- `src/assets/hero.png` is the only image in the tree. If the page wants
  screenshots, capture them from the running simulator with
  `scripts/headless-chrome.mjs`, commit them deliberately, and keep the page's
  total weight reasonable.

Cover at minimum: what OSFS is, that it needs no install or account, the
prominent "start flying" control, what the simulator can do, that it is
AGPL-3.0-only free software with a link to the repository, the phone controller,
and the credits/licences the project already owes (`NOTICE`,
`THIRD_PARTY_LICENSES.md`, `ASSET_LICENSES.md`). Do not claim capabilities the
simulator does not have — check each claim against the code or the validation
records in `docs/validation/`.

Match the existing dark visual language (`src/styles/flight.css`,
`src/remote/phone.css`, `src/flight/hud/phonePairing.css`) rather than
introducing a third palette. The page must work at phone width, respond to
`prefers-reduced-motion`, reach AA contrast, and be navigable by keyboard and
screen reader.

## Verify it

- Unit-test the router: each of `/`, `?mode=flight`, `?mode=remote`, `?mode=globe`
  and an unknown `?mode=` value resolves to the intended route, and the existing
  `src/main.test.ts` expectations are updated rather than deleted.
- Test that the pairing URL produced by `createPairingUrl` still resolves to the
  remote route — a direct test of the QR contract, not of the parser alone.
- Drive the built site headlessly with `scripts/headless-chrome.mjs`: load the
  root, follow the start control, and confirm the simulator boots. Screenshot the
  page at phone and desktop widths.
- `npm run lint` and `npm run test` must pass. `npx eslint .` currently reports 5
  pre-existing errors in `src/flight/hud/LoggingPanel.tsx` and
  `src/flight/hud/evaluationInstruments.test.ts`; do not let that total grow, and
  do not fix them as part of this task.
- Check the build output: the root route must not pull in the Babylon, JSBSim or
  phone-controller chunks.
- **Do not start a development, preview or watch server.** `AGENTS.md` forbids it
  unless the user explicitly asks. `npx vite build` is not a server and is the
  right tool here. If browser verification genuinely needs a server, give the user
  the exact command and ask them to run it.

## Also update

`README.md` (the "Start flying" link and any description of what the root URL
does), `docs/deploying.md` (what a fork now serves at its root), and
`docs/phone-controller.md` and `docs/development.md` if the routing change
touches anything they describe.

## Out of scope

The simulator's own UI, the phone controller, flight physics, and the FOSS Earth
globe. This task adds a route and a page, and moves the default; it does not
redesign what those routes already render.
