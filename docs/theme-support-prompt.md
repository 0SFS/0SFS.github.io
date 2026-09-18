# Work prompt: light and dark theme support

Execute this task when the user starts a fresh conversation with this file.
Work in `/Users/felg/gh/0sfs`. Read the current `AGENTS.md` before making changes.

OSFS has no theme support at all today — `grep -r "prefers-color-scheme" src/`
returns nothing, and `index.html` hard-codes `color-scheme: dark`. Every surface
assumes a dark cockpit. The user wants light and dark themes across the flight
UI and the phone controller.

This is a presentation task. Do not change flight behaviour, the phone control
protocol, or any layout geometry.

## Start from what is already tokenized

[`src/styles/flightControls.css`](../src/styles/flightControls.css) is the shared
appearance of every flight control, used by both the desktop HUD
(`src/styles/flight.css`) and the phone controller (`src/remote/phone.css`). It
already expresses everything colour-like as `--ctl-*` custom properties on
`:root`, and each host re-points them — the phone overrides them on `.phone-app`
for an OLED black theme. **That mechanism is the one to extend**, not to replace.

What is *not* tokenized yet, and needs to be before a theme can switch:

- `src/styles/flight.css` outside the shared rules — panels, modals, the HUD bar,
  the aircraft/airport/settings panels. It defines `--flight-panel-bg`,
  `--flight-panel-line`, `--flight-panel-muted`, `--flight-panel-text` and
  `--flight-panel-accent` on `.flight-app`, but plenty of rules below use literal
  `rgba(...)` instead. Audit the file; every literal colour becomes a token.
- `src/styles/globe.css`, `src/log/gameLog.css`,
  `src/flight/hud/engineMonitor.css`, `src/flight/hud/evaluationInstruments.css`,
  `src/flight/hud/phonePairing.css`, `src/remote/phone.css`.
- The inlined first-paint styles in `index.html`, which paint before any
  stylesheet loads and currently hard-code `#080e14`.
- `<meta name="theme-color">` in `index.html`.
- Any colour computed in TypeScript rather than CSS — the attitude indicator is
  drawn on a canvas in `src/flight/hud/flightHud.ts`, so its sky/ground/horizon
  colours are in code and must read from the theme too. Check the Babylon clear
  colour and any other renderer-side colour in `src/flight/createFlightSimApp.ts`.

## Decisions to confirm before writing code

1. **Does a light theme apply to the flight HUD over the 3D scene?** The HUD sits
   on photorealistic terrain that is itself bright or dark depending on time of
   day and location. A light HUD over a snowfield is unreadable. Options are: a
   light theme only for panels and modals with the HUD staying dark; a light HUD
   with stronger scrims; or no light HUD at all. This is the substantive question
   — ask it with the trade-off, not as a yes/no.
2. **Three-way or two-way?** `system` / `light` / `dark`, or just light and dark.
3. **Where does the control live and does it persist?** The settings modal
   (`src/hud/settingsModal.ts` in foss-earth, `src/flight/hud/` panels here) is
   the natural home. Persisting means `localStorage`; follow the existing
   preference pattern — see `src/flight/input/orbitInvertSettings.ts` and
   `PHONE_HAPTICS_PREFERENCE_KEY` in `src/remote/phoneControllerClient.ts` for how
   this codebase already stores per-device settings, including its try/catch
   discipline around blocked storage.
4. **Does the phone controller follow the desktop's theme or the phone's own?**
   It is a separate device with its own ambient light and its own OLED screen.
   The current black theme is deliberate — see the comment at the top of
   `src/remote/phone.css`. A phone in daylight may still want light.

## How to implement it

- Resolve the theme to a single attribute on the root element (`data-theme` on
  `<html>`), set before first paint by the inline script in `index.html` so there
  is no flash of the wrong theme. `index.html` already has an inline routing
  script; that is the right place and the right precedent.
- Define token values per theme in one place: `:root[data-theme="dark"]`,
  `:root[data-theme="light"]`, and a `@media (prefers-color-scheme: light)` block
  under `:root:not([data-theme])` for the system setting.
- Keep `color-scheme` in step with the resolved theme so form controls, scrollbars
  and `accent-color` follow.
- The phone controller loads independently of the flight app; whatever mechanism
  you build must work on a page that never imports `flight.css`.

## Verify it

- `npm run check:phone-layout` must still pass. It renders the real phone
  controller *and* the real flight HUD through headless Chrome and checks the
  layout rules; a theme change must not move anything. See
  [docs/development.md](development.md#phone-controller-layout).
- Extend that harness with a light-theme variant of both surfaces and eyeball the
  screenshots, rather than reasoning about contrast from the CSS.
- Check contrast reaches AA for text and UI components in both themes. Include
  the disabled and `is-on`/`is-down` states, which are easy to miss.
- `npm run lint` and `npm run test` must pass. `npx eslint .` currently reports 5
  pre-existing errors in `src/flight/hud/LoggingPanel.tsx` and
  `src/flight/hud/evaluationInstruments.test.ts`; do not let that total grow, and
  do not fix them here.
- **Do not start a development, preview or watch server.** `AGENTS.md` forbids it
  unless the user explicitly asks. `npx vite build` is not a server. For a real
  device, `npm run dev:lan` exists and the *user* runs it.

## Out of scope

Flight physics, the phone control protocol, routing, and the layout of any
surface. If a colour cannot be themed without moving something, say so and stop
rather than relocating it.
