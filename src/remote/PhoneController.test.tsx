// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
/** The camera has its own tests; here only what the controller hands it matters. */
const scanner = vi.hoisted(() => ({ props: null as null | { onScan(url: string): void; onClose(): void } }))
vi.mock('./PhoneQrScanner', async () => {
  const { createElement } = await import('react')
  return { PhoneQrScanner: (props: { onScan(url: string): void; onClose(): void }) => {
    scanner.props = props
    return createElement('div', { className: 'phone-scanner' })
  } }
})
import { PhoneController } from './PhoneController'
import { createConnectionLog } from './connectionDiagnostics'
import { NEUTRAL_CONTROLS, type AircraftStatus, type EngineStatus } from './protocol'
import type { PhoneControllerClient, PhoneControllerSnapshot } from './phoneControllerClient'

let root: Root
let container: HTMLDivElement
let storage: Map<string, string>
const nudgeCamera = vi.fn()
const updateControls = vi.fn()
const setPaused = vi.fn(() => true)
const setHapticsEnabled = vi.fn()
const setViewMode = vi.fn(() => true)
const requestControl = vi.fn(() => true)

function mount({ engine, status, snapshot, onPair }: {
  engine?: EngineStatus
  status?: Partial<AircraftStatus>
  snapshot?: Partial<PhoneControllerSnapshot>
  onPair?(url: string): void
} = {}): void {
  const aircraft: AircraftStatus = {
    owner: 'phone', paused: false, viewMode: 'third', controls: NEUTRAL_CONTROLS,
    airspeedKts: 148, altitudeFt: 4250, headingDeg: 271, gearDown: true, ...(engine ? { engine } : {}), ...status,
  }
  const state: PhoneControllerSnapshot = {
    phase: 'ready', message: 'Phone controls', status: aircraft, controls: { ...NEUTRAL_CONTROLS },
    canFly: false, canControl: true, requestingControl: false, hostFresh: true, signalingAvailable: true,
    pendingActions: 0, rttMs: 20, diagnostics: null, appliedSeq: 1, receiveToApplyMs: 2,
    hapticsSupported: true, hapticsEnabled: false, ...snapshot,
  }
  const client: PhoneControllerClient = {
    log: createConnectionLog('phone', () => 0), subscribe: () => () => {}, getSnapshot: () => state,
    updateControls, nudgeCamera, cancelTransientControls: vi.fn(), requestControl,
    setPaused, setViewMode, setGearDown: () => true, releaseControl: () => true,
    setHapticsEnabled, destroy: vi.fn(),
  }
  act(() => root.render(<PhoneController client={client} onPair={onPair} />))
}
const remount = (options?: Parameters<typeof mount>[0]) => {
  act(() => root.unmount())
  root = createRoot(container)
  mount(options)
}
const grid = () => container.querySelector('.phone-actions')!
const button = (label: string) => [...container.querySelectorAll('button')]
  .find(candidate => candidate.getAttribute('aria-label') === label || candidate.textContent === label)
const text = (selector: string) => container.querySelector(selector)?.textContent
/** jsdom has no PointerEvent; React delegates on the name alone. */
const pointer = (target: Element, type: string, detail: Record<string, number> = {}) => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, { pointerId: 1, button: 0, ...detail })
  act(() => { target.dispatchEvent(event) })
}
/** React listens for `input`, so a range has to be moved the way a finger does. */
const drag = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  act(() => { input.dispatchEvent(new Event('input', { bubbles: true })) })
}
const yawTrack = () => container.querySelector<HTMLInputElement>('.phone-yaw input[type="range"]')!
const yawReturn = () => updateControls.mock.calls.at(-1)![0].rudder as number

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  storage = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
  })
  nudgeCamera.mockClear()
  updateControls.mockClear()
  setPaused.mockClear()
  setHapticsEnabled.mockClear()
  setViewMode.mockClear()
  requestControl.mockClear()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    { x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, toJSON: () => ({}) })
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: () => true },
    releasePointerCapture: { configurable: true, value: vi.fn() },
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('phone controller screen', () => {
  it('draws the desktop engine widget over the throttle, not engine chips in the grid', () => {
    mount({ engine: { phase: 'WINDMILLING', n1: 12.5, n2: 30, fuelFlowPph: 0 } })
    const engine = container.querySelector('.phone-yaw-throttle--engine > .phone-engine')!
    expect(engine.querySelector('.flight-engine__phase')?.textContent).toBe('WINDMILLING')
    // The id the desktop colours by, recovered from the label that travelled.
    expect(engine.querySelector<HTMLElement>('.flight-engine__phase')?.dataset.phase).toBe('windmilling')
    expect(engine.querySelector('.flight-engine__spool-n1 .flight-engine__spool-value')?.textContent).toBe('12.5')
    // Zero is a reading, and it prints as one.
    expect(engine.querySelector('.flight-engine__flow-value')?.textContent).toBe('0000')
    // No engine tapes: the grid has instruments the widget does not draw.
    const labels = [...grid().querySelectorAll('.flight-hud__label')].map(label => label.textContent)
    expect(labels).toEqual(['IAS', 'ALT', 'HDG'])
  })

  it('switches fuel flow units on a tap, and remembers the choice', () => {
    mount({ engine: { phase: 'RUNNING', n1: 72.4, n2: 88.1, fuelFlowPph: 412, fuelFlowGph: 61.5 } })
    act(() => { container.querySelector<HTMLElement>('.flight-engine__flow')!.click() })
    expect(text('.flight-engine__flow-value')).toBe('0062')
    expect(text('.flight-engine__flow-unit')).toBe('gal/h')
    remount({ engine: { phase: 'RUNNING', fuelFlowPph: 412 } })
    // No volume flow from this host: the widget converts, as the desktop does.
    expect(text('.flight-engine__flow-value')).toBe('0061')
  })

  it('keeps a phase label it does not know, uncoloured, and gives the throttle the column with no engine', () => {
    mount({ engine: { phase: 'FLAMED OUT' } })
    const phase = container.querySelector<HTMLElement>('.flight-engine__phase')!
    expect(phase.textContent).toBe('FLAMED OUT')
    expect(phase.dataset.phase).toBeUndefined()
    remount()
    expect(container.querySelector('.phone-engine')).toBeNull()
    expect(container.querySelector('.phone-yaw-throttle--engine')).toBeNull()
  })

  it('puts nothing above the controls: no banner for a delayed connection, just the link chip', () => {
    mount({ snapshot: { hostFresh: false, message: 'Connection delayed · Waiting for the computer' } })
    // jsdom offers no fullscreen, so no popup either: the controls are the page.
    expect([...container.querySelector('main')!.children].map(child => child.className))
      .toEqual(['phone-controls phone-controls--grid-bottom'])
    const link = container.querySelector('.phone-link')!
    expect(link.classList.contains('phone-link--live')).toBe(false)
    expect(link.firstChild?.nextSibling?.textContent).toBe('DELAYED')
    // Still said, to assistive tech.
    expect(link.querySelector('[role="status"]')?.textContent).toBe('Connection delayed · Waiting for the computer')
  })

  it('lays the grid out instruments first, then the buttons, with the brake last', () => {
    mount()
    const describe = (child: Element) => child.querySelector('.flight-hud__label')?.textContent
      ?? (child.matches('.phone-sheet') ? child.className : child.getAttribute('aria-label') ?? child.textContent)
    expect([...grid().children].map(describe)).toEqual([
      'IAS', 'ALT', 'HDG', 'G', expect.stringContaining('PHONE'), 'Pause simulation', 'Release',
      'Haptics', 'phone-sheet phone-diagnostics', 'phone-sheet phone-settings',
      expect.stringContaining('brake'),
    ])
    expect(text('.phone-diagnostics .phone-sheet__chip')).toBe('🌐 20ms')
  })

  it('offers Take control in a popup, not the grid, whenever the phone is not flying', () => {
    mount({ status: { owner: 'local' }, snapshot: { canFly: true, canControl: false, message: 'Connected · Desktop controls' } })
    const popup = container.querySelector('.phone-popup--control')!
    expect(popup.querySelector('.phone-popup__title')?.textContent).toBe('The computer is flying')
    // A routine status adds nothing to the title, so it is not repeated.
    expect(popup.querySelector('.phone-popup__detail')).toBeNull()
    expect(container.querySelector('main')?.classList.contains('phone-app--needs-control')).toBe(true)
    act(() => { button('Take control')!.click() })
    expect(requestControl).toHaveBeenCalledOnce()
    // The grid has nothing to take control with, and nothing that needs it.
    expect(grid().querySelector('.phone-primary')).toBeNull()
    expect(button('Pause simulation')).toBeUndefined()
    expect(button('Release')).toBeUndefined()

    // Why it cannot be taken is said where the button is.
    remount({ status: { owner: 'local' }, snapshot: { canFly: true, canControl: false, message: 'Center controls to take over.' } })
    expect(text('.phone-popup--control .phone-popup__detail')).toBe('Center controls to take over.')
    remount({ status: { owner: 'local' }, snapshot: { canFly: false, canControl: false, requestingControl: true, message: 'Taking control…' } })
    expect(button('Taking control…')?.disabled).toBe(true)

    // Connecting, and over: no button to press, and the way back for the latter.
    remount({ status: { owner: 'local' }, snapshot: { phase: 'connecting', canFly: false, canControl: false, message: 'Opening direct control channel…' } })
    expect(text('.phone-popup__title')).toBe('Connecting to the computer')
    expect(button('Take control')?.disabled).toBe(true)
    remount({ snapshot: { phase: 'disconnected', canFly: false, canControl: false, message: 'The computer ended the session.' } })
    expect(text('.phone-popup__title')).toBe('Disconnected')
    expect(button('Take control')).toBeUndefined()
    expect(container.querySelector('.phone-popup--control')?.textContent).toContain('create a new QR')

    // Flying: no popup at all, and pause and release are back in the grid.
    remount()
    expect(container.querySelector('.phone-popup--control')).toBeNull()
    expect(button('Pause simulation')).toBeDefined()
  })

  it('offers the page\'s own QR scanner as the way back from an ended session', () => {
    const ended = { phase: 'disconnected', canFly: false, canControl: false, message: 'The computer ended the session.' } as const
    mount({ snapshot: ended })
    // Without a way to pair, there is nothing to scan into.
    expect(button('Scan QR code')).toBeUndefined()

    const onPair = vi.fn()
    remount({ snapshot: ended, onPair })
    expect(container.querySelector('.phone-scanner')).toBeNull()
    act(() => { button('Scan QR code')!.click() })
    expect(container.querySelector('.phone-scanner')).not.toBeNull()
    act(() => { scanner.props!.onScan('https://0sfs.github.io/rc/#v=1&peer=d&join=s') })
    expect(onPair).toHaveBeenCalledWith('https://0sfs.github.io/rc/#v=1&peer=d&join=s')

    act(() => { scanner.props!.onClose() })
    expect(container.querySelector('.phone-scanner')).toBeNull()
    // A session in progress has no Scan button: its popup is for taking control.
    remount({ status: { owner: 'local' }, snapshot: { canFly: true, canControl: false }, onPair })
    expect(button('Scan QR code')).toBeUndefined()
  })

  it('pauses with the flight page glyphs and toggles haptics from the grid', () => {
    mount()
    const pause = button('Pause simulation')!
    expect(pause.textContent).toBe('Ⅱ')
    expect(pause.getAttribute('aria-pressed')).toBe('false')
    act(() => { pause.click() })
    expect(setPaused).toHaveBeenCalledWith(true)
    remount({ status: { paused: true } })
    const resume = button('Resume simulation')!
    expect(resume.textContent).toBe('▶')
    expect(resume.getAttribute('aria-pressed')).toBe('true')

    act(() => { button('Haptics')!.click() })
    expect(setHapticsEnabled).toHaveBeenCalledWith(true)
  })

  it('switches cockpit and chase from a switch in the camera pad corner, not the grid', () => {
    mount()
    const view = container.querySelector<HTMLButtonElement>('[role="switch"]')!
    expect(view.parentElement?.className).toBe('phone-camera-slot')
    // Beside the pad, never inside its button.
    expect(view.closest('.phone-camera')).toBeNull()
    expect(grid().querySelector('[role="switch"]')).toBeNull()
    // Chase is on, and the thumb is under the second icon.
    expect(view.getAttribute('aria-checked')).toBe('true')
    expect([...view.children].map(option => option.hasAttribute('data-selected'))).toEqual([false, true])
    act(() => { view.click() })
    expect(setViewMode).toHaveBeenLastCalledWith('first')
    remount({ status: { viewMode: 'first' } })
    const cockpit = container.querySelector<HTMLButtonElement>('[role="switch"]')!
    expect(cockpit.getAttribute('aria-checked')).toBe('false')
    expect([...cockpit.children].map(option => option.hasAttribute('data-selected'))).toEqual([true, false])
    act(() => { cockpit.click() })
    expect(setViewMode).toHaveBeenLastCalledWith('third')
  })

  it('moves the grid above the controls from Settings, and keeps it there', () => {
    mount()
    const top = container.querySelector<HTMLInputElement>('.phone-settings input[value="top"]')!
    act(() => { top.click() })
    expect(container.querySelector('.phone-controls')?.className).toBe('phone-controls phone-controls--grid-top')
    expect(storage.get('osfs.phone-grid-position')).toBe('top')
    remount()
    expect(container.querySelector('.phone-controls')?.className).toBe('phone-controls phone-controls--grid-top')
    act(() => { container.querySelector<HTMLInputElement>('.phone-settings input[value="bottom"]')!.click() })
    expect(storage.has('osfs.phone-grid-position')).toBe(false)
  })

  it('draws the yaw slider where the rudder is, and returns it to centre on release', () => {
    // The regression this component exists for: the value comes from the
    // client's control state, so the thumb is wherever the aircraft's rudder is.
    mount({ snapshot: { controls: { ...NEUTRAL_CONTROLS, rudder: -.42 } } })
    expect(yawTrack().value).toBe('-0.42')
    expect(text('.phone-yaw output')).toBe('-42%')
    pointer(yawTrack(), 'pointerup')
    expect(updateControls).toHaveBeenLastCalledWith({ rudder: 0 })
  })

  it('keeps the yaw where the finger left it when Settings says so, and remembers that', () => {
    mount({ snapshot: { controls: { ...NEUTRAL_CONTROLS, rudder: .5 } } })
    act(() => { container.querySelector<HTMLInputElement>('.phone-settings input[value="hold"]')!.click() })
    expect(storage.get('osfs.phone-yaw-release')).toBe('hold')
    // No return time to set: there is no return.
    expect(container.querySelector('.phone-settings__slider')).toBeNull()
    updateControls.mockClear()
    pointer(yawTrack(), 'pointerup')
    pointer(yawTrack(), 'pointercancel')
    // React's onBlur is focusout; a bubbling `blur` would reach the window
    // listeners the stick and brake centre themselves from instead.
    act(() => { yawTrack().dispatchEvent(new Event('focusout', { bubbles: true })) })
    expect(updateControls).not.toHaveBeenCalled()
    expect(yawTrack().getAttribute('aria-label')).toBe('Yaw rudder. Holds where you leave it.')

    // The choice survives the page, and centring again returns the parked rudder.
    remount({ snapshot: { controls: { ...NEUTRAL_CONTROLS, rudder: .5 } } })
    expect(container.querySelector<HTMLInputElement>('.phone-settings input[value="hold"]')!.checked).toBe(true)
    act(() => { container.querySelector<HTMLInputElement>('.phone-settings input[value="center"]')!.click() })
    expect(updateControls).toHaveBeenLastCalledWith({ rudder: 0 })
    expect(storage.has('osfs.phone-yaw-release')).toBe(false)
  })

  it('sweeps the yaw home over the return time Settings sets', () => {
    vi.useFakeTimers()
    mount({ snapshot: { controls: { ...NEUTRAL_CONTROLS, rudder: 1 } } })
    const time = container.querySelector<HTMLInputElement>('.phone-settings__slider input')!
    expect(text('.phone-settings__slider output')).toBe('Instant')
    drag(time, '500')
    expect(text('.phone-settings__slider output')).toBe('0.50s')
    expect(storage.get('osfs.phone-yaw-return-ms')).toBe('500')

    updateControls.mockClear()
    pointer(yawTrack(), 'pointerup')
    // Each step of the sweep is an ordinary rudder update, so the aircraft
    // yaws its way back rather than snapping.
    act(() => { vi.advanceTimersByTime(250) })
    expect(yawReturn()).toBeGreaterThan(.3)
    expect(yawReturn()).toBeLessThan(.7)
    act(() => { vi.advanceTimersByTime(300) })
    expect(updateControls).toHaveBeenLastCalledWith({ rudder: 0 })
    // It ends: no frame goes on writing zeroes.
    const finished = updateControls.mock.calls.length
    act(() => { vi.advanceTimersByTime(300) })
    expect(updateControls.mock.calls.length).toBe(finished)
    vi.useRealTimers()
  })

  it('sends a camera swipe with the desktop drag signs', () => {
    mount()
    const pad = container.querySelector('.phone-camera')!
    const touch = (type: string, x: number, y: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.assign(event, { pointerId: 1, clientX: x, clientY: y, button: 0 })
      act(() => { pad.dispatchEvent(event) })
    }
    touch('pointerdown', 100, 100)
    // Down and to the right, the way dragging the desktop canvas goes.
    touch('pointermove', 140, 120)
    const [{ yaw, pitch }] = nudgeCamera.mock.calls.at(-1)!
    expect(yaw).toBeGreaterThan(0)
    expect(pitch).toBeGreaterThan(0)
  })
})
