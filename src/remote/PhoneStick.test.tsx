// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PhoneBrake, PhoneCameraPad, PhoneStick } from './PhoneStick'

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
/** Pointer-driven changes carry when their touch happened, for the opt-in camera trace. */
const timed = expect.objectContaining({ at: expect.any(Number) })
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
    expect(right).toHaveBeenLastCalledWith(1, 0, timed)
    pointer(rudder, 'pointerdown', 2, 0, 180)
    expect(left).toHaveBeenLastCalledWith(-1, 0, timed)
    pointer(pitch, 'pointermove', 2, 0, 0)
    expect(right).toHaveBeenLastCalledWith(1, 0, timed)
    pointer(pitch, 'pointercancel', 1)
    expect(right).toHaveBeenLastCalledWith(0, 0)
    expect(left).toHaveBeenLastCalledWith(-1, 0, timed)
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
    expect(stick).toHaveBeenLastCalledWith(0, -1, timed)
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

  it('moves the stick knob the whole deflection radius, not a fraction of itself', () => {
    const stick = vi.fn()
    act(() => root.render(<PhoneStick label="Pitch/roll" disabled={false} onChange={stick} />))
    const pad = container.querySelector('button')!
    const knob = container.querySelector<HTMLElement>('.phone-stick__knob')!
    // Full right deflection on a 200px pad: the ring sits at the radius the pad
    // reads deflection from, 72px, not at 70% of the knob's own 52px.
    pointer(pad, 'pointerdown', 1, 200, 100)
    expect(stick).toHaveBeenLastCalledWith(1, 0, timed)
    expect(knob.style.transform).toBe('translate(72px, 0px)')
    pointer(pad, 'pointerup', 1)
    expect(knob.style.transform).toBe('translate(0px, 0px)')
    // One circle, no needle inside it.
    expect(knob.children).toHaveLength(0)
  })

  it('reads the camera pad as swipes and pinches rather than a position', () => {
    const gesture = vi.fn()
    act(() => root.render(<PhoneCameraPad disabled={false} onGesture={gesture} />))
    const pad = container.querySelector('button')!
    expect(pad.className).toBe('phone-camera')
    // Not a flight control: it must not tell anyone to raise the nose.
    expect(container.textContent).not.toContain('NOSE')

    // Touching reports nothing: a trackpad has no position to send.
    pointer(pad, 'pointerdown', 1, 100, 100)
    expect(gesture).not.toHaveBeenCalled()
    pointer(pad, 'pointermove', 1, 130, 90)
    expect(gesture).toHaveBeenLastCalledWith({ yaw: .03, pitch: -.01 }, timed)
    // Deltas, not absolutes: a finger that has not moved moves no camera.
    gesture.mockClear()
    pointer(pad, 'pointermove', 1, 130, 90)
    expect(gesture).not.toHaveBeenCalled()

    // A second finger turns the gesture into a pinch, and only a pinch.
    pointer(pad, 'pointerdown', 2, 230, 90)
    expect(gesture).not.toHaveBeenCalled()
    pointer(pad, 'pointermove', 2, 280, 90)
    expect(gesture).toHaveBeenCalledTimes(1)
    expect(gesture).toHaveBeenLastCalledWith({ yaw: 0, pitch: 0, zoom: 1.5 }, timed)

    // Lifting one finger resumes swiping from where the other one is.
    pointer(pad, 'pointerup', 2)
    gesture.mockClear()
    pointer(pad, 'pointermove', 1, 140, 90)
    expect(gesture).toHaveBeenLastCalledWith({ yaw: .01, pitch: 0 }, timed)
  })
})
