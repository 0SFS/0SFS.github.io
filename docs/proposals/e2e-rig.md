# End-to-end rig: /fly and /rc in headless Chrome

Status: **Proposed**  
Date: 2026-09-18  
Reviewed checkout: OSFS `94c3e9d794cc`, dirty (the layout harness below is untracked)

## Intended result

One command runs the real simulator and the real phone controller against each
other, with no phone, no network and no server, and leaves a folder a person or
an agent can review in a minute:

```sh
npm run e2e -- take-control
open build/e2e/latest/index.html
```

`/fly/` runs in one headless Chrome as the computer. It draws its pairing QR,
and the rig decodes that QR from the canvas pixels. `/rc/` runs in a second
Chrome as the phone, with those pixels as its camera. The phone scans, the two
pair over real WebRTC, and a scenario drives the phone: take control, deflect
the stick, open Settings. Each step screenshots **both** screens and checks the
phone against the same layout rules the fast check enforces.

This makes UI work on either page something an agent can do and verify on its
own, instead of something that needs a person holding a phone for every
iteration. It does not replace that person: see [Non-goals](#non-goals).

## Why now

We built this in pieces while getting the phone controller working, as a side
quest. The pieces exist, but none of them is protected, and the most valuable
one was never finished.

| Piece | What it does | Where it lives |
| --- | --- | --- |
| `npm run check:phone-layout` | Renders the real `PhoneController` in jsdom against a **fake client with fixed state**. Screenshots it in headless Chrome at three sizes and enforces the layout rules. | `scripts/check-phone-layout.mjs`, `scripts/phone-layout/`. **Untracked; never committed.** |
| QR scan probe | The built `/rc/` with Chrome's fake camera playing a QR. The script draws that QR itself and points it at a desktop peer that does not exist, so it proves the decoder works; nothing pairs. | `build/scratch/scan-probe.mjs` (gitignored) |
| Remote Control tab probe | The built `/fly/` as a computer and as a phone: opens ⚙ → Remote Control, taps Switch to RC mode, screenshots. | `build/scratch/remote-tab-probe.mjs` (gitignored) |
| Manifest, notice and boot probes | One-off checks of the per-route manifest, the iPhone notice and `/fly/` booting offline. | `build/scratch/*-probe.mjs` (gitignored) |

Three tracked checks and five scratch probes each carry their own copy of the
code that serves `dist` through Chrome's Fetch interception.

The cost of leaving it like this has already been paid once. Scratch outside the
repository does not survive: the machine restarted on 2026-09-18 and
`/private/tmp` went with it, including SF50 validation trees that
`docs/validation/sf50-afm-audit.md` and `sf50-pilot-calibration-v6.json` still
cite. Uncommitted and gitignored files are one `git clean` or stash away from
the same fate.

## Non-goals

- **Replacing device testing.** Emulated touch is not touch. The layout check
  passed while a real iPhone scrolled the page under a thumb on the throttle
  ([session record](../ux/2026-09-17-iphone-session.md)). Nothing touch-related
  ships on the rig's word alone.
- **Pixel baselines in git.** Screenshots stay in the gitignored `build/`, as
  `AGENTS.md` already requires. The rules are the regression gate; the
  screenshots are for looking at.
- **CI.** The repository has none today. The rig needs only Node and an
  installed Chrome, so adding it later is a workflow file, not a redesign.
- **Changing production code to be testable.** The rig reads what the pages
  already render and fakes only what sits outside the browser.

## Layout

### Code (tracked)

```
e2e/
├── README.md          how to run it, write a scenario, and read a run
├── tsconfig.json      type-checks e2e/; referenced from the root tsconfig
├── run.ts             CLI: npm run e2e -- <scenario> [--device <name>] [--label <text>]
├── lib/               the engine: knows about browsers, not about features
│   ├── browser.ts     launches Chrome; one isolated context per simulated device
│   ├── devices.ts     phone and desktop profiles, in one list
│   ├── serveDist.ts   serves a build through Fetch interception, no listener
│   ├── signaling.ts   stands in for the PeerJS pairing service
│   ├── fakeCamera.ts  turns pixels into a .y4m for Chrome's fake camera
│   ├── actions.ts     tap, drag, swipe, waitFor, shot
│   └── report.ts      writes run.json and the index.html contact sheet
├── layout/            the fast tier: today's check:phone-layout, moved
│   ├── render.tsx     from scripts/phone-layout/render.tsx
│   ├── rules.ts       the layout rules, as pure functions of measured boxes
│   ├── rules.test.ts  proves every rule can fail
│   ├── check.ts       from scripts/check-phone-layout.mjs
│   └── vitest.config.ts
└── scenarios/         the live tier: what to do, as typed data
    ├── pair.ts
    ├── take-control.ts
    ├── settings.ts
    └── remote-tab.ts
```

### Output (gitignored)

```
build/e2e/
├── dist/                   the rig's own build; never overwrites the deployable dist/
├── .chrome/                throwaway Chrome profiles, kept out of the run folders
├── latest -> 2026-09-18_1432-take-control
└── 2026-09-18_1432-take-control/
    ├── index.html          contact sheet: phone | desktop per step, previous run alongside
    ├── run.json            commit, dirty flag, Chrome version, devices, measurements, verdicts
    ├── phone/01-scanning.png  phone/02-paired.png  …
    ├── desktop/01-qr.png      desktop/02-paired.png  …
    └── logs/
        ├── phone-console.txt
        ├── desktop-console.txt
        └── signaling.jsonl
```

Run folders are named by local date, time and scenario (or `--label`), so two
runs on the same day never overwrite each other. The layout check names its runs
`<date>_<time>-layout` in the same tree.

## Design decisions

**A top-level `e2e/`, not `scripts/`.** `scripts/` holds single-file tools such
as the SF50 calibration and the WASM build. This has a library, tests, config
and its own manual, the same standing as `benchmarks/`. It is named `e2e/`
because that is where an engineer or an agent will look first.

**Engine and scenarios are separate.** `lib/` knows nothing about the phone
controller. Scenarios never touch the Chrome DevTools Protocol. Adding a UI
state is a few lines of typed data, and a mistake is a type error rather than a
step that silently does nothing.

**TypeScript, run by plain `node`.** `package.json` already requires Node
≥ 22.18, which strips types natively, and the repo's tsconfigs already set
`erasableSyntaxOnly`. No build step, but `tsc -b` and ESLint cover the rig.
Today nothing type-checks `scripts/phone-layout/render.tsx`.

**Scenarios find controls by accessible role and name.** For example,
`tap('phone', { role: 'button', name: 'Scan QR code' })`. That survives CSS
refactors, and a control that loses its label fails the step. The layout rules
keep their class selectors, because they measure specific boxes.

**One set of rules, two tiers.** `rules.ts` takes measurements and returns
failures. It knows nothing about how the page got into that state. The fast tier
applies it to the jsdom render. The live tier applies it to the real, paired
`/rc/` page. The fast tier's fake client can then no longer drift from what a
real session renders without a run noticing.

**The QR is read from pixels.** The rig reads the `[data-qr]` canvas that `/fly/`
drew with `getImageData`, then:

- decodes it in Node with `jsqr`, which is already a dependency, to learn the
  pairing URL and fail the run on an unreadable code
- writes those same pixels into the fake camera's video

No production code exposes the URL for the rig.

**No server, no network, no open port.** Every headless check in this repo
already serves pages through Fetch interception instead of a server, and
`AGENTS.md` forbids starting one unasked. The rig does the same:

- Pages load from `https://0sfs.test/`. That origin is HTTPS, so the pages are
  secure contexts and the camera is allowed.
- Every other origin is refused, apart from the pairing service below.

Chrome processes belong to the run and are closed when it ends. Nothing is
written outside `build/`, including Chrome profiles.

**Two Chrome processes, one per device.** Chrome's fake camera is a launch flag,
and the phone's video cannot exist until the desktop has drawn its QR. The
desktop Chrome starts first; the phone Chrome starts once the QR is read.
Two processes are also closer to two devices than two tabs are.

## Pairing without the PeerJS cloud

`src/remote/peerTransport.ts` constructs `new Peer({ secure: true, port: 443, … })`
with no host. That means the public PeerJS cloud at `0.peerjs.com`, which
neither an offline nor a repeatable run can depend on. PeerJS reaches that
service in two ways, and the rig stands in for both:

1. **Peer ID.** PeerJS fetches `https://0.peerjs.com/peerjs/id?ts=…`. That
   request goes through Fetch interception like any other, and the rig answers
   with a known ID.
2. **Signaling socket.** PeerJS then opens a `WebSocket` to exchange `OPEN`,
   `OFFER`, `ANSWER`, `CANDIDATE`, `LEAVE` and `HEARTBEAT` messages. Fetch
   interception cannot fulfil WebSockets. The rig installs a small replacement
   `WebSocket` with `Page.addScriptToEvaluateOnNewDocument`. The replacement
   forwards each message to Node through `Runtime.addBinding`, and Node
   delivers it to the other device with `Runtime.evaluate`.

Node becomes the pairing service for exactly the length of the run. The PeerJS
client, the pairing handshake, ICE and the WebRTC data channels all run
unchanged over host candidates. `peerTransport.ts` is untouched. Every
signaling message is appended to `logs/signaling.jsonl`, the first thing to read
when pairing breaks.

The alternative is a configurable PeerJS host (a `VITE_PEER_*` variable beside
`VITE_ICE_SERVERS`) plus a local `peer` server. It was considered and not
chosen: it needs a production change, a new dependency and an open port, and
buys nothing the stand-in does not.

## Scenarios

A scenario is data. The step names below are illustrative; the exact API is
settled in phase 2.

```ts
import { scenario, pair, tap, drag, expectRules, shot } from '../lib/scenario.ts'

export default scenario({
  name: 'take-control',
  devices: { desktop: 'desktop', phone: 'iphone-portrait' },
  steps: [
    pair(),                                    // QR → fake camera → scan → paired
    shot('paired'),                            // both screens
    tap('phone', { role: 'button', name: 'Fly' }),
    expectRules('phone', 'flying'),            // same rules as the fast tier
    drag('phone', { selector: '.phone-stick' }, { dx: 40, dy: -30, ms: 400 }),
    shot('stick-deflected'),
  ],
})
```

`shot` captures every device unless told otherwise. A step that fails still
screenshots, so the contact sheet shows what the page looked like when it went
wrong.

## run.json

A person reads `index.html`; an agent reads `run.json`.

```json
{
  "scenario": "take-control",
  "commit": "94c3e9d794cc",
  "dirty": true,
  "chrome": "HeadlessChrome/…",
  "devices": { "desktop": "desktop 1280x800", "phone": "iphone-portrait 390x844" },
  "steps": [
    { "name": "paired", "ms": 2310, "shots": { "phone": "phone/02-paired.png", "desktop": "desktop/02-paired.png" }, "failures": [] }
  ],
  "result": "pass"
}
```

## What happens to what exists

| Today | Becomes |
| --- | --- |
| `scripts/check-phone-layout.mjs` | `e2e/layout/check.ts`, with its rules in `e2e/layout/rules.ts`. `npm run check:phone-layout` keeps its name. |
| `scripts/phone-layout/render.tsx`, `vitest.config.ts` | `e2e/layout/` |
| Phone sizes, repeated in the layout check and two scratch probes | `e2e/lib/devices.ts` |
| `scripts/headless-chrome.mjs`, `scripts/pagesDistFile.mjs` | Stay; three other checks import them. `lib/` builds on them. |
| Fetch-interception copies in `check-landing-page.mjs`, `check-aircraft-selection-headless.mjs`, `check-jsbsim-browser-artifact.mjs` | Adopt `serveDist.ts` when next touched; not part of this proposal. |
| `build/scratch/scan-probe.mjs` | The `pair` scenario |
| `build/scratch/remote-tab-probe.mjs` | The `remote-tab` scenario |
| `build/scratch/{manifest,notice,fly-debug}-probe.mjs` | Scenarios if they earn it; otherwise they stay scratch. |
| `build/scratch/camera-feel/` | Not this rig: it simulates the network under the real client and session, with no browser. It belongs in `benchmarks/phone-camera/`. |
| `build/phone-layout/<date>/` | Left as history; new runs go to `build/e2e/`. |

Documentation:

- `e2e/README.md` is the manual.
- [Development](../development.md#phone-controller-layout) keeps a short section
  that points to it.
- [Phone controller UI](../phone-controller-ui.md) keeps *why* each rule exists;
  `rules.ts` holds *what* the rules are.
- `AGENTS.md` gets two lines. After changing `/rc/` or the flight HUD, run the
  rig and review the contact sheet. Emulated touch is not touch.
- Dated records and completed prompts that cite `build/phone-layout/` are left
  as written.

## Plan

### Phase 1: move the fast tier and commit it

- Move the layout harness into `e2e/layout/` and extract `rules.ts`.
- Add `e2e/lib/devices.ts`, `e2e/tsconfig.json` and the ESLint block for Node
  globals.
- Write `rules.test.ts`. It gives each rule a measurement that breaks it, so a
  rule reading a stale selector can no longer measure nothing unnoticed, which
  happened to three of them.

**Done when:**

- `npm run check:phone-layout` gives the same verdicts as a run before the move,
  and byte-identical PNGs.
- `npm run test`, `npm run lint` and `tsc -b` cover `e2e/`.
- The harness is committed.

### Phase 2: the engine and pairing

- Build `lib/browser.ts`, `serveDist.ts`, `signaling.ts`, `fakeCamera.ts`,
  `actions.ts`, `run.ts` and the `pair` scenario.
- `npm run e2e` builds into `build/e2e/dist` with `vite build`, skipping the
  release verification that `npm run build` runs, unless `--no-build` is given.

**Done when:**

- `npm run e2e -- pair` pairs the real `/fly/` and `/rc/` with every outside
  origin refused.
- The run writes both screenshots and `signaling.jsonl`.
- A QR tampered with in the page fails the run at decoding, not at a timeout.

### Phase 3: scenarios, report, instructions

- Add the `take-control`, `settings` and `remote-tab` scenarios, and apply
  `rules.ts` to the live `/rc/` page.
- Write the contact sheet, `e2e/README.md` and the `AGENTS.md` lines.

**Done when:** an agent given only `AGENTS.md` can make a UI change, run the rig,
and report a contact sheet path with a pass/fail per step.

## Risks and open questions

- **mDNS host candidates.** Chrome hides local addresses behind `.local` names.
  Between two Chrome processes on one machine they normally resolve. If they do
  not, the rig launches both with
  `--disable-features=WebRtcHideLocalIpsWithMdns`. That is a rig-only flag, and
  pairing still runs over real ICE.
- **`/fly/` offline.** With map tiles refused, `/fly/` boots but its loading
  log never clears (seen in `remote-tab-probe.mjs`). Scenarios must not depend
  on tiles, and the desktop screenshots will show an empty globe. Serving a
  fixture tile set is possible later if a scenario needs terrain.
- **Live screenshots are not deterministic.** Sim time, RTT readouts and the
  engine widget change between runs. The live tier's gate is the rules and the
  step verdicts, never pixel equality. Only the fast tier promises
  byte-identical output.
- **Build time.** A full `vite build` per run is slow for iteration. `--no-build`
  reuses `build/e2e/dist`. `run.json` records the commit it was built from, so
  the contact sheet can warn when the build is older than the working tree.
- **Type declarations for the `.mjs` helpers.** `lib/` importing
  `scripts/headless-chrome.mjs` from TypeScript needs a `.d.mts` beside it, as
  `scripts/dev-lan.d.mts` already does for `dev-lan.mjs`.
