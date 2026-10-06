import { useEffect, useRef } from 'react'
import { createThrottleLever, type ThrottleLeverHandle } from '../flight/hud/throttleLever'
import type { EngineStatus } from './protocol'

/**
 * The desktop HUD's throttle lever — the same DOM, drawn and driven by the
 * same code from `throttleLever.ts` — fed from this phone's own throttle and
 * the host's engine reading. Holding it to start, or at idle to shut down,
 * sends the intents the desktop's lever acts on, over the control channel.
 * A host that reports no engine `state` gets a plain throttle.
 */
export function PhoneThrottle({ value, engine, disabled, onChange, onStartHold, onShutdown }: {
  value: number
  engine: EngineStatus | undefined
  disabled: boolean
  onChange(value: number): void
  onStartHold(held: boolean): void
  onShutdown(): void
}) {
  const box = useRef<HTMLDivElement>(null)
  const lever = useRef<ThrottleLeverHandle | null>(null)
  const held = useRef(false)
  const handlers = useRef({ onChange, onStartHold, onShutdown })
  useEffect(() => { handlers.current = { onChange, onStartHold, onShutdown } })
  useEffect(() => {
    const created = createThrottleLever(box.current!, {
      onThrottleChange: next => handlers.current.onChange(next),
      onStartHold: next => { held.current = next; handlers.current.onStartHold(next) },
      onShutdown: () => handlers.current.onShutdown(),
    })
    lever.current = created
    return () => { created.destroy(); lever.current = null }
  }, [])
  const state = engine?.state
  const start = engine?.start ?? 0
  const blocked = engine?.blocked ?? null
  useEffect(() => {
    lever.current?.update({
      throttle: value,
      engine: state === undefined ? null : { state, startProgress: start, blocked },
      disabled,
    })
  }, [value, state, start, blocked, disabled])
  // Engine off, the lever rests at idle, and so does the throttle this phone sends.
  useEffect(() => {
    if (state === 'stopped' && value > 0 && !held.current) handlers.current.onChange(0)
  }, [state, value])
  return <div ref={box} className="flight-hud__slider-control flight-hud__slider-control--throttle phone-throttle" />
}
