// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PhoneBrake, PhoneStick } from './PhoneStick'

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, toJSON: () => ({}) })
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value: vi.fn() },
    hasPointerCapture: { configurable: true, value: () => true },
    releasePointerCapture: { configurable: true, value: vi.fn() },
  })
})
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks() })
function pointer(element: Element, type: string, id: number, x = 100, y = 100) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, { pointerId: id, clientX: x, clientY: y, button: 0 })
  act(() => element.dispatchEvent(event))
}

describe('phone touch controls', () => {
  it('keeps independent stick pointers, clamps the pad, and centers only the cancelled pointer', () => {
    const right = vi.fn()
    const left = vi.fn()
    act(() => root.render(<><PhoneStick label="Pitch/roll" disabled={false} onChange={right} /><PhoneStick label="Rudder" horizontal disabled={false} onChange={left} /></>))
    const [pitch, rudder] = container.querySelectorAll('button')
    pointer(pitch, 'pointerdown', 1, 100, 100)
    pointer(pitch, 'pointermove', 1, 400, 100)
    expect(right).toHaveBeenLastCalledWith(1, 0)
    pointer(rudder, 'pointerdown', 2, 0, 180)
    expect(left).toHaveBeenLastCalledWith(-1, 0)
    pointer(pitch, 'pointermove', 2, 0, 0)
    expect(right).toHaveBeenLastCalledWith(1, 0)
    pointer(pitch, 'pointercancel', 1)
    expect(right).toHaveBeenLastCalledWith(0, 0)
    expect(left).toHaveBeenLastCalledWith(-1, 0)
    pointer(rudder, 'lostpointercapture', 2)
    expect(left).toHaveBeenLastCalledWith(0, 0)
  })

  it('centers on rotation, disable and unmount; brake releases on lost capture and ignores disabled input', () => {
    const stick = vi.fn()
    const brake = vi.fn()
    const render = (disabled: boolean) => act(() => root.render(<><PhoneStick label="Pitch/roll" disabled={disabled} onChange={stick} /><PhoneBrake disabled={disabled} onChange={brake} /></>))
    render(false)
    const [pad, button] = container.querySelectorAll('button')
    pointer(pad, 'pointerdown', 1, 100, 0)
    pointer(button, 'pointerdown', 2)
    expect(stick).toHaveBeenLastCalledWith(0, -1)
    expect(brake).toHaveBeenLastCalledWith(true)
    pointer(button, 'lostpointercapture', 2)
    expect(brake).toHaveBeenLastCalledWith(false)
    act(() => window.dispatchEvent(new Event('orientationchange')))
    expect(stick).toHaveBeenLastCalledWith(0, 0)
    pointer(button, 'pointerdown', 3)
    render(true)
    expect(brake).toHaveBeenLastCalledWith(false)
    pointer(button, 'pointerdown', 4)
    expect(brake).toHaveBeenLastCalledWith(false)
    render(false)
    pointer(pad, 'pointerdown', 5, 100, 0)
    act(() => root.render(null))
    expect(stick).toHaveBeenLastCalledWith(0, 0)
  })
})
