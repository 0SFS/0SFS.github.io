import { ChaseIcon, CockpitIcon } from './PhoneIcons'

/**
 * Cockpit or chase, as one switch rather than two buttons: there are exactly two
 * views and one of them is always on, which is what a switch says and a pair of
 * buttons does not. Both icons stay visible, and the thumb sits under the one in
 * use. It lives in the camera pad's corner because it is a camera control.
 */
export function PhoneViewSwitch({ mode, disabled, onChange }: {
  mode: 'first' | 'third' | undefined
  disabled: boolean
  onChange(mode: 'first' | 'third'): void
}) {
  const chase = mode === 'third'
  return <button type="button" role="switch" className="phone-view-switch" aria-checked={chase} disabled={disabled}
    aria-label="Chase view" title={chase ? 'Chase view. Tap for the cockpit.' : 'Cockpit view. Tap for chase.'}
    onClick={() => onChange(chase ? 'first' : 'third')}>
    <span className="phone-view-switch__option" data-selected={chase ? undefined : ''}><CockpitIcon /></span>
    <span className="phone-view-switch__option" data-selected={chase ? '' : undefined}><ChaseIcon /></span>
  </button>
}
