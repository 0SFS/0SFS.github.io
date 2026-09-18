import type { PhoneControllerSnapshot } from './phoneControllerClient'

/** What the client says when there is nothing to add to the popup's own title. */
const ROUTINE = new Set(['Phone controls', 'Desktop controls', 'Connected · Desktop controls', 'Taking control…'])
const RECOVERY = 'On the computer, open the Remote Control tab and create a new QR, then scan it.'

/**
 * Taking control, as a popup over the flight controls rather than a chip in the
 * grid: without control every flight control behind it is disabled anyway, so
 * the only thing worth doing on that screen is this. It is up whenever the
 * phone is not flying — connecting, the computer flying, or the session over.
 *
 * It dims the flight controls and not the chip grid. Connection details,
 * settings, fullscreen and haptics all work without control, and a popup that
 * covered them would leave no way to find out why Take control is unavailable.
 * For the same reason it is where the client's status sentence is shown.
 */
export function PhoneControlPrompt({ state, onTakeControl, onScan }: {
  state: PhoneControllerSnapshot
  onTakeControl(): void
  /** Opens the page's QR scanner: an ended session's way back, in the app itself. */
  onScan?(): void
}) {
  const ended = state.phase === 'error' || state.phase === 'disconnected'
  const connected = state.phase === 'ready'
  const title = ended ? (state.phase === 'disconnected' ? 'Disconnected' : 'Connection failed')
    : !connected ? 'Connecting to the computer'
      : state.requestingControl ? 'Taking control…'
        : 'The computer is flying'
  const detail = ROUTINE.has(state.message) ? null : state.message
  return <div className="phone-popup phone-popup--control" role="dialog" aria-labelledby="phone-control-title">
    <div className="phone-popup__card">
      <p id="phone-control-title" className="phone-popup__title">{title}</p>
      {detail && <p className="phone-popup__detail" role="status">{detail}</p>}
      {ended
        ? <>
          <p className="phone-popup__detail">{RECOVERY}</p>
          {onScan && <div className="phone-popup__actions">
            <button type="button" className="phone-popup__primary phone-popup__wide" onClick={onScan}>Scan QR code</button>
          </div>}
        </>
        : <div className="phone-popup__actions">
          <button type="button" className="phone-popup__primary phone-popup__wide" disabled={!state.canFly}
            onClick={onTakeControl}>{state.requestingControl ? 'Taking control…' : 'Take control'}</button>
        </div>}
    </div>
  </div>
}
