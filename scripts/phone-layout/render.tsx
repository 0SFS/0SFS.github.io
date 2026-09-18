// @vitest-environment jsdom
/**
 * Renders the real phone controller and the real flight HUD, each with its own
 * real stylesheet, into a dated folder under `build/phone-layout/`.
 *
 * The flight HUD is rendered as a *reference*: the phone controller is supposed
 * to look and sit like it, and the only honest way to check that is to put the
 * two through the same pipeline and compare. Neither page is hand-written, so
 * neither can drift from what ships.
 *
 * Run through `scripts/check-phone-layout.mjs`, not `npm run test`.
 */
import { describe, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PhoneController } from '../../src/remote/PhoneController'
import { PhoneQrScanner } from '../../src/remote/PhoneQrScanner'
import { PhoneUnpaired } from '../../src/remote/PhoneUnpaired'
import { createConnectionLog } from '../../src/remote/connectionDiagnostics'
import { NEUTRAL_CONTROLS } from '../../src/remote/protocol'
import type { PhoneControllerClient } from '../../src/remote/phoneControllerClient'
import { createFlightHud } from '../../src/flight/hud/flightHud'
import { createFullscreenNotice } from '../../src/fullscreen/createFullscreenNotice'

const ROOT = path.resolve(import.meta.dirname, '../..')
const OUT = process.env.UI_LAYOUT_OUT ?? path.join(ROOT, 'build', 'phone-layout', 'undated')

function page(css: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<style>${css}</style></head><body>${body}</body></html>`
}

function client(failed: boolean, owner: 'phone' | 'local' = 'phone'): PhoneControllerClient {
  const log = createConnectionLog('phone', () => 0)
  log.record('signaling', 'registered', 'Registered as abc123 in 412 ms')
  log.record('ice', 'local-candidate', 'host udp 192.168.1.x:51820')
  if (failed) {
    log.update(value => {
      value.signaling.registered = true
      value.signaling.registeredAtMs = 412
      value.ice.local.host = 2
      value.ice.local.srflx = 1
      value.ice.remote.srflx = 2
      value.ice.connectionState = 'failed'
      value.ice.gatheringState = 'complete'
      value.ice.servers = ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478']
      value.ice.serverErrors.push({ url: 'stun:stun.cloudflare.com:3478', code: 701, text: 'STUN host lookup received error.', count: 3 })
    })
    log.recordFailure('channel', 'setup-timeout',
      'Could not connect directly. Tried 3 local and 2 remote candidates with no working pair, and no TURN relay is configured.')
  }
  const snapshot = {
    phase: 'ready' as const,
    message: failed ? 'Could not connect directly.' : owner === 'phone' ? 'Phone controls' : 'Connected · Desktop controls',
    canFly: owner === 'local', canControl: !failed && owner === 'phone', requestingControl: false, hostFresh: true,
    signalingAvailable: true, pendingActions: 0, rttMs: 23.4,
    diagnostics: { path: 'direct' as const, iceRttMs: 23, ordered: false, maxRetransmits: 0, bufferedAmount: 0 },
    appliedSeq: 812, receiveToApplyMs: 4.2, hapticsSupported: true, hapticsEnabled: true,
    controls: { ...NEUTRAL_CONTROLS, throttle: .62, pitchTrim: -.18, rollTrim: .05, flaps: 1 / 3 },
    status: {
      owner, paused: false, viewMode: 'third' as const, controls: NEUTRAL_CONTROLS,
      airspeedKts: 148, altitudeFt: 4250, headingDeg: 271, gearDown: true,
      engine: { phase: 'RUNNING', n1: 72.4, n2: 88.1, thrustLbf: 1180, fuelFlowPph: 412, fuelFlowGph: 61.5 },
    },
  }
  return {
    log, subscribe: () => () => {}, getSnapshot: () => snapshot,
    updateControls: () => {}, nudgeCamera: () => {}, cancelTransientControls: () => {}, requestControl: () => true,
    setPaused: () => true, setViewMode: () => true, setGearDown: () => true, releaseControl: () => true,
    setHapticsEnabled: () => {}, destroy: () => {},
  }
}

/**
 * jsdom reports no fullscreen support, so the controller's ⛶ button and its
 * popup would never render and could not be reviewed. Every phone page but
 * `failed` is rendered as a browser that grants it.
 */
function setFullscreenEnabled(enabled: boolean): void {
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: enabled })
}

/**
 * Node's own experimental `localStorage` global shadows jsdom's and is undefined
 * without a backing file, so the preferences each page starts from live here.
 */
function stubLocalStorage(): Map<string, string> {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)) },
    removeItem: (key: string) => { values.delete(key) },
    clear: () => values.clear(),
  })
  return values
}

/**
 * The phone pages, each a state someone reviewing the screenshots needs to see.
 * Only `offer` leaves the fullscreen popup up: over the others it would hide
 * the controls the screenshots exist to show.
 */
const PHONE_PAGES: {
  name: string; failed: boolean; owner?: 'phone' | 'local'; prefs: Record<string, string>; open?: string
  /** A browser with no page fullscreen and a finger on it: an iPhone. */
  homeScreen?: boolean
}[] = [
  { name: 'flying', failed: false, prefs: { 'osfs.fullscreen-prompt-dismissed': '1' } },
  // The computer is flying: the take-control popup is up.
  { name: 'control', failed: false, owner: 'local', prefs: { 'osfs.fullscreen-prompt-dismissed': '1' } },
  { name: 'grid-top', failed: false, prefs: { 'osfs.fullscreen-prompt-dismissed': '1', 'osfs.phone-grid-position': 'top' } },
  { name: 'offer', failed: false, prefs: {} },
  // The same question on an iPhone, where the answer is Add to Home Screen and
  // the popup has to make its case instead of offering a button.
  { name: 'home-screen', failed: false, prefs: {}, homeScreen: true },
  { name: 'settings', failed: false, prefs: { 'osfs.fullscreen-prompt-dismissed': '1' }, open: '.phone-settings' },
  { name: 'failed', failed: true, prefs: { 'osfs.fullscreen-prompt-dismissed': '1' } },
]

/** jsdom has no canvas; the HUD only needs the element to occupy its box. */
function stubCanvas(): void {
  const noop = new Proxy({}, { get: () => () => undefined }) as unknown as CanvasRenderingContext2D
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => noop })
}

describe('UI layout harness', () => {
  it('writes the phone controller and the flight HUD reference', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    stubCanvas()
    mkdirSync(OUT, { recursive: true })

    // phone.css pulls in the popup card, which the flight page shares; it goes
    // where the import stood.
    const popupCss = readFileSync(path.join(ROOT, 'src/remote/phonePopup.css'), 'utf8')
    const phoneCss = popupCss + '\n' + readFileSync(path.join(ROOT, 'src/remote/phone.css'), 'utf8')
      .replace(/@import\s+["'][^"']*phonePopup\.css["'];?/g, '')
    const sharedCss = readFileSync(path.join(ROOT, 'src/styles/flightControls.css'), 'utf8')
    // The phone draws the desktop's own engine widget, with its own stylesheet.
    const engineCss = readFileSync(path.join(ROOT, 'src/flight/hud/engineMonitor.css'), 'utf8')
    const storage = stubLocalStorage()
    for (const { name, failed, owner, prefs, open, homeScreen } of PHONE_PAGES) {
      setFullscreenEnabled(!failed && !homeScreen)
      // jsdom answers every media query with false, which reads as a desktop.
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: homeScreen === true && query.includes('coarse') }))
      storage.clear()
      for (const [key, value] of Object.entries(prefs)) storage.set(key, value)
      const host = document.createElement('div')
      document.body.append(host)
      const root = createRoot(host)
      act(() => { root.render(<PhoneController client={client(failed, owner)} />) })
      if (open) host.querySelector<HTMLDetailsElement>(open)!.open = true
      writeFileSync(path.join(OUT, `${name}.html`),
        page(`${sharedCss}\n${engineCss}\n${phoneCss}`, host.innerHTML))
      act(() => root.unmount())
      host.remove()
    }
    // No invitation — every launch from the Home Screen icon — and the scanner
    // it opens, caught while the camera starts: there is no camera here to show.
    for (const [name, element] of [
      ['unpaired', <PhoneUnpaired onPair={() => {}} />],
      ['scanner', <main className="phone-app"><PhoneQrScanner onScan={() => {}} onClose={() => {}} /></main>],
    ] as const) {
      const host = document.createElement('div')
      document.body.append(host)
      const root = createRoot(host)
      act(() => { root.render(element) })
      writeFileSync(path.join(OUT, `${name}.html`), page(`${sharedCss}\n${engineCss}\n${phoneCss}`, host.innerHTML))
      act(() => root.unmount())
      host.remove()
    }
    vi.unstubAllGlobals()

    setFullscreenEnabled(false)
    // The reference. Its stylesheet pulls in the shared control rules, so a
    // change to those shows up on both pages of this run.
    const flightCss = readFileSync(path.join(ROOT, 'src/styles/flight.css'), 'utf8')
      .replace(/@import\s+["'][^"']*flightControls\.css["'];?/g, '')
    const hudHost = document.createElement('div')
    document.body.append(hudHost)
    const noop = () => undefined
    createFlightHud(hudHost, {
      onGearChange: noop, onThrottleChange: noop, onPitchTrimChange: noop, onRollTrimChange: noop,
      onPitchAutoTrimChange: noop, onRollAutoTrimChange: noop, onAutopilotEngageChange: noop,
      onFlapsChange: noop, onRudderChange: noop, onStickChange: noop,
    })
    writeFileSync(path.join(OUT, 'flight-hud.html'),
      page(`${sharedCss}\n${flightCss}\nhtml,body{margin:0}`,
        `<div class="flight-app">${hudHost.innerHTML}</div>`))

    // The flight page on an iPhone: the controller's own notice over the HUD,
    // through the same component, hook and card stylesheet.
    stubLocalStorage()
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('coarse') }))
    const noticeHost = document.createElement('div')
    document.body.append(noticeHost)
    act(() => { createFullscreenNotice(noticeHost) })
    writeFileSync(path.join(OUT, 'fly-home-screen.html'),
      page(`${sharedCss}\n${flightCss}\n${popupCss}\nhtml,body{margin:0}`,
        `<div class="flight-app">${hudHost.innerHTML}</div>${noticeHost.innerHTML}`))
    noticeHost.remove()
    vi.unstubAllGlobals()
    hudHost.remove()
  })
})
