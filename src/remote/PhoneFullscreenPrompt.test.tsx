// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PhoneFullscreenButton, PhoneFullscreenPrompt } from './PhoneFullscreenPrompt'
import { useFullscreenOffer } from './useFullscreenOffer'

let root: Root
let container: HTMLDivElement
let fullscreenElement: Element | null
const change = () => document.dispatchEvent(new Event('fullscreenchange'))
const requestFullscreen = vi.fn(async () => { fullscreenElement = document.documentElement; change() })
const exitFullscreen = vi.fn(async () => { fullscreenElement = null; change() })

function stubMedia(matches: (query: string) => boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: matches(query) }))
}
function stubFullscreen(enabled: boolean): void {
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: enabled })
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenElement })
  document.documentElement.requestFullscreen = requestFullscreen
  document.exitFullscreen = exitFullscreen
}
/** The popup and the grid button share one offer, the way the controller wires them. */
function Harness() {
  const offer = useFullscreenOffer()
  return <><PhoneFullscreenPrompt offer={offer} /><PhoneFullscreenButton offer={offer} /></>
}
const render = () => act(() => root.render(<Harness />))
const remount = () => { act(() => root.unmount()); root = createRoot(container); render() }
const popup = () => container.querySelector('[role="dialog"]')
const button = (label: string) => [...container.querySelectorAll('button')]
  .find(candidate => (candidate.textContent ?? '').includes(label) || candidate.getAttribute('aria-label') === label)

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  })
  fullscreenElement = null
  requestFullscreen.mockClear()
  exitFullscreen.mockClear()
  stubMedia(() => false)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(document, 'fullscreenEnabled')
  Reflect.deleteProperty(document, 'fullscreenElement')
  Reflect.deleteProperty(document, 'exitFullscreen')
  Reflect.deleteProperty(document.documentElement, 'requestFullscreen')
})

describe('phone fullscreen', () => {
  it('asks in a popup, enters on the tap, and leaves the ⛶ button to go back and forth', async () => {
    stubFullscreen(true)
    render()
    expect(popup()?.textContent).toContain('Hide the browser bars')
    await act(async () => { button('Fullscreen')!.click() })
    expect(requestFullscreen).toHaveBeenCalledOnce()
    expect(popup()).toBeNull()
    const toggle = button('Leave fullscreen')!
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    await act(async () => { toggle.click() })
    expect(exitFullscreen).toHaveBeenCalledOnce()
    // Answered this visit: leaving fullscreen does not bring the popup back.
    expect(popup()).toBeNull()
    expect(button('Enter fullscreen')?.getAttribute('aria-pressed')).toBe('false')
  })

  it('remembers a dismissal instead of asking again, and keeps the button', () => {
    stubFullscreen(true)
    render()
    act(() => { button('Dismiss')!.click() })
    expect(popup()).toBeNull()
    remount()
    expect(popup()).toBeNull()
    expect(requestFullscreen).not.toHaveBeenCalled()
    expect(button('Enter fullscreen')).toBeDefined()
  })

  it('says so in the popup when the browser declines', async () => {
    stubFullscreen(true)
    requestFullscreen.mockRejectedValueOnce(new Error('denied'))
    render()
    act(() => { button('Dismiss')!.click() })
    await act(async () => { button('Enter fullscreen')!.click() })
    expect(popup()?.textContent).toContain('The browser declined fullscreen.')
  })

  it('makes the iPhone case once, with the argument folded away, and says nothing on a desktop or an installed app', () => {
    // iPhone Safari: a coarse pointer and no fullscreen API at all.
    stubFullscreen(false)
    stubMedia(query => query.includes('coarse'))
    render()
    // There is no button that could hide the bars, so there is none — what
    // there is instead is the reason, which is what being told to install
    // something without one was missing.
    expect(button('⛶ Fullscreen')).toBeUndefined()
    const asked = popup()!.textContent ?? ''
    // The headline names the actor, the act and the motive. It is a protest
    // notice, not an apology for the platform.
    expect(asked).toContain('Apple blocks fullscreen websites on iPhone')
    expect(asked).toContain('get a cut when you are pushed into paying for an app')
    // Plain English, not a legal filing: the thing a reader can verify in five
    // seconds by trying to install anything on their own phone.
    expect(asked).toContain('practical monopoly')
    expect(asked).toContain('We did not do this to you')
    // The cut, said up front where everyone sees it, not buried in the fold.
    expect(asked).toContain('15–30%')
    expect(asked).toContain('Add to Home Screen')
    expect(asked).toContain('Fly in the browser anyway')
    expect(asked).toContain('buy a phone that is yours')
    // The case is there to be checked, and collapsed until it is.
    const why = container.querySelector<HTMLDetailsElement>('.phone-popup__why')!
    expect(why.open).toBe(false)
    expect(why.querySelector('summary')?.textContent).toContain('The full story')
    expect(why.textContent).toContain('fullscreenEnabled: false')
    // The load-bearing claim: the courtroom argument that makes "this is an
    // oversight" unavailable to the company making it.
    expect(why.textContent).toContain('reach people through')

    // Asked once. A controller that asks every time you pick the phone up is
    // the thing being complained about.
    act(() => { button('Got it')!.click() })
    expect(popup()).toBeNull()
    remount()
    expect(popup()).toBeNull()
    // ⛶ is how to read it again afterwards.
    act(() => { button('Full screen: blocked by Apple, add to Home Screen')!.click() })
    expect(popup()?.textContent).toContain('Share → Add to Home Screen')

    // A desktop browser without the API has nothing useful to be told.
    stubMedia(() => false)
    remount()
    expect(container.textContent).toBe('')

    // Already launched from the Home Screen: there are no bars to hide.
    stubFullscreen(true)
    stubMedia(query => query.includes('display-mode'))
    remount()
    expect(container.textContent).toBe('')
  })

  it('takes the first tap for someone who already chose fullscreen every visit, without asking', () => {
    localStorage.setItem('osfs.fullscreen-every-visit', '1')
    stubFullscreen(true)
    render()
    expect(popup()).toBeNull()
    act(() => { window.dispatchEvent(new Event('pointerup')) })
    expect(requestFullscreen).toHaveBeenCalledOnce()
    // One tap, not every tap.
    act(() => { window.dispatchEvent(new Event('pointerup')) })
    expect(requestFullscreen).toHaveBeenCalledOnce()
  })
})
