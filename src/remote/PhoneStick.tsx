import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'

interface PhoneStickProps { label: string; horizontal?: boolean; disabled: boolean; onChange(x: number, y: number): void }

/** One captured pointer per pad; separate pads can operate simultaneously. */
export function PhoneStick({ label, horizontal = false, disabled, onChange }: PhoneStickProps) {
  const surface = useRef<HTMLButtonElement>(null)
  const knob = useRef<HTMLSpanElement>(null)
  const pointer = useRef<number | null>(null)
  const keyboard = useRef(new Set<string>())
  const setPosition = useCallback((x: number, y: number) => {
    if (knob.current) knob.current.style.transform = `translate(${x * 70}%, ${y * 70}%)`
    const response = (value: number) => Math.abs(value) <= .035 ? 0 : Math.sign(value) * (Math.abs(value) - .035) / .965
    onChange(response(x), horizontal ? 0 : response(y))
  }, [horizontal, onChange])
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
    const radius = Math.max(1, Math.min(rect.width, horizontal ? rect.width : rect.height) * .36)
    let x = (event.clientX - rect.left - rect.width / 2) / radius
    let y = horizontal ? 0 : (event.clientY - rect.top - rect.height / 2) / radius
    const magnitude = Math.hypot(x, y)
    if (magnitude > 1) { x /= magnitude; y /= magnitude }
    setPosition(x, y)
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
    <span className="phone-stick__knob" ref={knob} aria-hidden="true"><span /></span>
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
    aria-label="Brake. Hold to apply brakes.">Hold brake</button>
}
