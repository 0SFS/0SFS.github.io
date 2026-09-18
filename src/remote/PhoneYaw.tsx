import { useCallback, useEffect, useRef } from 'react'
import type { YawSettings } from './phoneSettingsStore'

/**
 * The desktop HUD's yaw slider, plus what happens when the finger leaves it.
 *
 * The track is drawn from the client's control state, not from the DOM's own
 * value, so the thumb is always where the rudder actually is — including while
 * it returns to centre, which is animated here rather than in the client: a
 * return is this screen's idea of a control, not something the wire or the host
 * knows about. Each step of it goes out as an ordinary rudder update, so the
 * aircraft sees the sweep the pilot sees.
 */
export function PhoneYaw({ value, disabled, settings, onChange }: {
  value: number
  disabled: boolean
  settings: YawSettings
  onChange(rudder: number): void
}) {
  const track = useRef<HTMLInputElement>(null)
  const frame = useRef<number | null>(null)
  const { release, returnMs } = settings
  const stop = useCallback(() => {
    if (frame.current === null) return
    cancelAnimationFrame(frame.current)
    frame.current = null
  }, [])
  const settle = useCallback(() => {
    // `lostpointercapture` arrives right behind `pointerup`, and a blur behind
    // both: a return already in flight finishes rather than starting over.
    if (frame.current !== null) return
    const from = Number(track.current?.value ?? 0)
    if (release === 'hold' || !Number.isFinite(from) || from === 0) return
    if (returnMs <= 0) { onChange(0); return }
    const started = performance.now()
    const step = () => {
      const progress = Math.min(1, (performance.now() - started) / returnMs)
      // Rounded to the track's own step, so the number beside YAW counts down
      // the way dragging it does and lands on an exact centre.
      onChange(progress === 1 ? 0 : Math.round(from * (1 - progress) * 100) / 100)
      frame.current = progress < 1 ? requestAnimationFrame(step) : null
    }
    frame.current = requestAnimationFrame(step)
  }, [onChange, release, returnMs])
  // Losing control mid-return leaves nothing to return: the client has already
  // centred every transient control itself.
  useEffect(() => { if (disabled) stop() }, [disabled, stop])
  // Choosing the return back in Settings applies to a rudder parked off centre
  // right now, rather than only to the next finger. Never on mount: nothing has
  // been released yet, and a fresh client's rudder is centred already.
  const chosen = useRef(release)
  useEffect(() => {
    if (chosen.current === release) return
    chosen.current = release
    if (release === 'center') settle()
  }, [release, settle])
  useEffect(() => stop, [stop])
  return <label className="flight-hud__yaw-control phone-yaw">
    <span className="flight-hud__yaw-heading"><span>YAW</span><output>{`${Math.round(value * 100)}%`}</output></span>
    <input ref={track} type="range" min="-1" max="1" step=".01" value={value} disabled={disabled}
      aria-label={release === 'center' ? 'Yaw rudder. Releases to centre.' : 'Yaw rudder. Holds where you leave it.'}
      onPointerDown={stop}
      onChange={event => { stop(); onChange(Number(event.target.value)) }}
      onPointerUp={settle} onPointerCancel={settle} onLostPointerCapture={settle} onBlur={settle} />
  </label>
}
