import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import type { InputTiming } from './phoneControllerClient'

interface PhoneStickProps { label: string; horizontal?: boolean; disabled: boolean; onChange(x: number, y: number, input?: InputTiming): void }

/** When the touch behind a change happened, for the opt-in camera trace. */
function timing(event: PointerEvent<HTMLElement>): InputTiming {
  return { at: event.timeStamp, coalesced: () => event.nativeEvent.getCoalescedEvents?.().length || 1 }
}

/**
 * The deflection ring: how far from centre counts as full travel. The knob is
 * drawn at that same radius, so it sits under the finger rather than lagging
 * behind it.
 */
const TRAVEL = .36

/** One captured pointer per pad; separate pads can operate simultaneously. */
export function PhoneStick({ label, horizontal = false, disabled, onChange }: PhoneStickProps) {
  const surface = useRef<HTMLButtonElement>(null)
  const knob = useRef<HTMLSpanElement>(null)
  const pointer = useRef<number | null>(null)
  const keyboard = useRef(new Set<string>())
  const radiusOf = useCallback((rect: DOMRect) =>
    Math.max(1, Math.min(rect.width, horizontal ? rect.width : rect.height) * TRAVEL), [horizontal])
  const setPosition = useCallback((x: number, y: number, radius?: number, input?: InputTiming) => {
    // Pixels, not a percentage: a percentage in `translate` resolves against
    // the knob's own 52px, so the ring crept a couple of centimetres while the
    // aircraft went to full deflection.
    const travel = radius ?? (surface.current ? radiusOf(surface.current.getBoundingClientRect()) : 0)
    if (knob.current) knob.current.style.transform = `translate(${x * travel}px, ${y * travel}px)`
    const response = (value: number) => Math.abs(value) <= .035 ? 0 : Math.sign(value) * (Math.abs(value) - .035) / .965
    if (input) onChange(response(x), horizontal ? 0 : response(y), input)
    else onChange(response(x), horizontal ? 0 : response(y))
  }, [horizontal, onChange, radiusOf])
  const cancel = useCallback(() => {
    const id = pointer.current
    pointer.current = null
    keyboard.current.clear()
    if (id !== null && surface.current?.hasPointerCapture?.(id)) surface.current.releasePointerCapture(id)
    surface.current?.removeAttribute('data-active')
    setPosition(0, 0)
  }, [setPosition])
  useEffect(() => { if (disabled) cancel() }, [disabled, cancel])
  useEffect(() => {
    const hide = () => { if (document.hidden) cancel() }
    window.addEventListener('orientationchange', cancel)
    window.addEventListener('resize', cancel)
    window.addEventListener('blur', cancel)
    document.addEventListener('visibilitychange', hide)
    return () => {
      cancel()
      window.removeEventListener('orientationchange', cancel)
      window.removeEventListener('resize', cancel)
      window.removeEventListener('blur', cancel)
      document.removeEventListener('visibilitychange', hide)
    }
  }, [cancel])
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    if (pointer.current !== event.pointerId || disabled) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const radius = radiusOf(rect)
    let x = (event.clientX - rect.left - rect.width / 2) / radius
    let y = horizontal ? 0 : (event.clientY - rect.top - rect.height / 2) / radius
    const magnitude = Math.hypot(x, y)
    if (magnitude > 1) { x /= magnitude; y /= magnitude }
    setPosition(x, y, radius, timing(event))
  }
  const key = (event: KeyboardEvent<HTMLButtonElement>, down: boolean) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || disabled || pointer.current !== null) return
    event.preventDefault()
    if (down) keyboard.current.add(event.key)
    else keyboard.current.delete(event.key)
    let x = Number(keyboard.current.has('ArrowRight')) - Number(keyboard.current.has('ArrowLeft'))
    let y = horizontal ? 0 : Number(keyboard.current.has('ArrowDown')) - Number(keyboard.current.has('ArrowUp'))
    const magnitude = Math.hypot(x, y)
    if (magnitude > 1) { x /= magnitude; y /= magnitude }
    setPosition(x, y)
  }
  return <button ref={surface} type="button" className={`phone-stick${horizontal ? ' phone-stick--rudder' : ''}`}
    aria-label={`${label}. Drag to steer; arrow keys also work.`} disabled={disabled}
    onPointerDown={event => {
      if (pointer.current !== null || disabled || event.button !== 0) return
      pointer.current = event.pointerId
      event.currentTarget.setPointerCapture(event.pointerId)
      event.currentTarget.setAttribute('data-active', '')
      move(event)
    }} onPointerMove={move}
    onPointerUp={event => { if (event.pointerId === pointer.current) cancel() }}
    onPointerCancel={event => { if (event.pointerId === pointer.current) cancel() }}
    onLostPointerCapture={event => { if (event.pointerId === pointer.current) cancel() }}
    onKeyDown={event => key(event, true)} onKeyUp={event => key(event, false)} onBlur={cancel}
    onContextMenu={event => event.preventDefault()}>
    <span className="phone-stick__cross" aria-hidden="true" />
    <span className="phone-stick__knob" ref={knob} aria-hidden="true" />
    <span className="phone-stick__label">{label}</span>
    {!horizontal && <><span className="phone-stick__top">NOSE DOWN</span><span className="phone-stick__bottom">NOSE UP</span></>}
    <span className="phone-stick__left" aria-hidden="true">←</span><span className="phone-stick__right" aria-hidden="true">→</span>
  </button>
}

export function PhoneBrake({ disabled, onChange }: { disabled: boolean; onChange(held: boolean): void }) {
  const button = useRef<HTMLButtonElement>(null)
  const pointer = useRef<number | null>(null)
  const release = useCallback(() => {
    const id = pointer.current
    pointer.current = null
    if (id !== null && button.current?.hasPointerCapture?.(id)) button.current.releasePointerCapture(id)
    button.current?.removeAttribute('data-active')
    onChange(false)
  }, [onChange])
  useEffect(() => { if (disabled) release() }, [disabled, release])
  useEffect(() => {
    const hide = () => { if (document.hidden) release() }
    window.addEventListener('blur', release)
    window.addEventListener('orientationchange', release)
    window.addEventListener('resize', release)
    document.addEventListener('visibilitychange', hide)
    return () => {
      release()
      window.removeEventListener('blur', release)
      window.removeEventListener('orientationchange', release)
      window.removeEventListener('resize', release)
      document.removeEventListener('visibilitychange', hide)
    }
  }, [release])
  return <button ref={button} type="button" className="phone-brake" disabled={disabled}
    onPointerDown={event => {
      if (disabled || pointer.current !== null || event.button !== 0) return
      event.preventDefault()
      pointer.current = event.pointerId
      event.currentTarget.setPointerCapture(event.pointerId)
      event.currentTarget.setAttribute('data-active', '')
      onChange(true)
    }}
    onPointerUp={event => { if (event.pointerId === pointer.current) release() }}
    onPointerCancel={event => { if (event.pointerId === pointer.current) release() }}
    onLostPointerCapture={event => { if (event.pointerId === pointer.current) release() }}
    onKeyDown={event => { if (!disabled && (event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); onChange(true); event.currentTarget.setAttribute('data-active', '') } }}
    onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); release() } }}
    onBlur={release} onContextMenu={event => event.preventDefault()}
    aria-label="Brake. Hold to apply brakes." title="Hold to brake">B</button>
}

/**
 * A trackpad, not a stick: one finger swipes the view, two pinch to zoom.
 *
 * It reports what the fingers *just did* — movement in CSS pixels, scaled to
 * the wire's -1..1, and a pinch as the ratio the spread changed by. Nothing
 * here is a position, so there is no knob to draw and nothing to centre: let go
 * and the view stays where you put it, the way dragging the desktop canvas does.
 *
 * CSS pixels rather than a fraction of the pad, deliberately. They are already
 * density-independent, so a swipe of a given length turns the view by the same
 * amount on any phone and in either orientation — a fraction of the pad would
 * make the same finger movement mean different things in portrait and landscape.
 */
const GESTURE_SCALE = 1000
const KEY_STEP = 30 / GESTURE_SCALE
interface CameraGesture { yaw: number; pitch: number; zoom?: number }

export function PhoneCameraPad({ disabled, onGesture }: { disabled: boolean; onGesture(gesture: CameraGesture, input?: InputTiming): void }) {
  const surface = useRef<HTMLButtonElement>(null)
  /** Every finger currently down, so a second one can start a pinch mid-swipe. */
  const points = useRef(new Map<number, { x: number; y: number }>())
  const spread = useRef<number | null>(null)
  const release = useCallback(() => {
    for (const id of points.current.keys()) {
      if (surface.current?.hasPointerCapture?.(id)) surface.current.releasePointerCapture(id)
    }
    points.current.clear()
    spread.current = null
    surface.current?.removeAttribute('data-active')
  }, [])
  useEffect(() => { if (disabled) release() }, [disabled, release])
  useEffect(() => {
    const hide = () => { if (document.hidden) release() }
    window.addEventListener('blur', release)
    window.addEventListener('orientationchange', release)
    window.addEventListener('resize', release)
    document.addEventListener('visibilitychange', hide)
    return () => {
      release()
      window.removeEventListener('blur', release)
      window.removeEventListener('orientationchange', release)
      window.removeEventListener('resize', release)
      document.removeEventListener('visibilitychange', hide)
    }
  }, [release])
  const distance = (): number | null => {
    const [first, second] = [...points.current.values()]
    return second ? Math.hypot(first.x - second.x, first.y - second.y) : null
  }
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const previous = points.current.get(event.pointerId)
    if (!previous || disabled) return
    event.preventDefault()
    const delta = { x: event.clientX - previous.x, y: event.clientY - previous.y }
    points.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (points.current.size > 1) {
      // Two fingers are a pinch, and only a pinch: swiping with both would
      // otherwise double the orbit while the view is being sized.
      const current = distance()
      const previousSpread = spread.current
      spread.current = current
      if (current !== null && previousSpread !== null && previousSpread > 0 && current > 0) {
        onGesture({ yaw: 0, pitch: 0, zoom: current / previousSpread }, timing(event))
      }
      return
    }
    if (delta.x === 0 && delta.y === 0) return
    onGesture({ yaw: delta.x / GESTURE_SCALE, pitch: delta.y / GESTURE_SCALE }, timing(event))
  }
  const lift = (event: PointerEvent<HTMLButtonElement>) => {
    if (!points.current.delete(event.pointerId)) return
    if (surface.current?.hasPointerCapture?.(event.pointerId)) surface.current.releasePointerCapture(event.pointerId)
    // The finger that stays keeps its last position, so dropping out of a pinch
    // continues the swipe from where it is instead of jumping.
    spread.current = distance()
    if (points.current.size === 0) surface.current?.removeAttribute('data-active')
  }
  return <button ref={surface} type="button" className="phone-camera" disabled={disabled}
    aria-label="Camera. Swipe to look around, pinch with two fingers to zoom; arrow keys also work."
    onPointerDown={event => {
      if (disabled || event.button !== 0 || points.current.size >= 2) return
      event.preventDefault()
      points.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      event.currentTarget.setPointerCapture(event.pointerId)
      event.currentTarget.setAttribute('data-active', '')
      spread.current = distance()
    }} onPointerMove={move}
    onPointerUp={lift} onPointerCancel={lift} onLostPointerCapture={lift}
    onKeyDown={event => {
      const step: Record<string, CameraGesture> = {
        ArrowLeft: { yaw: -KEY_STEP, pitch: 0 }, ArrowRight: { yaw: KEY_STEP, pitch: 0 },
        ArrowUp: { yaw: 0, pitch: -KEY_STEP }, ArrowDown: { yaw: 0, pitch: KEY_STEP },
      }
      const gesture = step[event.key]
      if (!gesture || disabled) return
      event.preventDefault()
      onGesture(gesture)
    }}
    onBlur={release} onContextMenu={event => event.preventDefault()}>
    <span className="phone-camera__label">CAMERA</span>
    <span className="phone-camera__hint" aria-hidden="true">SWIPE TO LOOK · PINCH TO ZOOM</span>
  </button>
}
