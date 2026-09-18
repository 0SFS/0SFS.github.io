import { YAW_RETURN_MS_MAX, YAW_RETURN_MS_STEP, type GridPosition, type YawRelease, type YawSettings } from './phoneSettingsStore'

/**
 * The controller's settings: a ⚙ chip in the grid that opens as a full-screen
 * sheet, the way Connection details does, so a settings page never competes
 * with the controls for room.
 */
export function PhoneSettings({ gridPosition, onGridPositionChange, yaw, onYawChange }: {
  gridPosition: GridPosition
  onGridPositionChange(position: GridPosition): void
  yaw: YawSettings
  onYawChange(settings: YawSettings): void
}) {
  const option = (position: GridPosition, label: string) => (
    <label className="phone-settings__choice">
      <input type="radio" name="phone-grid-position" value={position} checked={gridPosition === position}
        onChange={() => onGridPositionChange(position)} />
      <span>{label}</span>
    </label>
  )
  const yawOption = (release: YawRelease, label: string) => (
    <label className="phone-settings__choice">
      <input type="radio" name="phone-yaw-release" value={release} checked={yaw.release === release}
        onChange={() => onYawChange({ ...yaw, release })} />
      <span>{label}</span>
    </label>
  )
  return <details className="phone-sheet phone-settings">
    <summary>
      <span className="phone-sheet__chip" aria-hidden="true">⚙</span>
      <span className="phone-sheet__title">Settings</span>
    </summary>
    <fieldset className="phone-settings__option">
      <legend>Button grid</legend>
      <p>The instruments and buttons, above or below the flight controls.</p>
      <div className="phone-settings__choices">
        {option('bottom', 'Bottom')}
        {option('top', 'Top')}
      </div>
    </fieldset>
    <fieldset className="phone-settings__option">
      <legend>Yaw</legend>
      <p>What the rudder does when your finger leaves its track. A real one springs back to centre; keeping it deflected on a phone otherwise means keeping a finger on the slider.</p>
      <div className="phone-settings__choices">
        {yawOption('center', 'Return to centre')}
        {yawOption('hold', 'Keep value')}
      </div>
      {/* Only the return has anything to time. */}
      {yaw.release === 'center' && <label className="phone-settings__slider">
        <span>Return time</span>
        <input type="range" min="0" max={YAW_RETURN_MS_MAX} step={YAW_RETURN_MS_STEP} value={yaw.returnMs}
          aria-label="Yaw return time" aria-valuetext={returnTime(yaw.returnMs)}
          onChange={event => onYawChange({ ...yaw, returnMs: Number(event.target.value) })} />
        <output>{returnTime(yaw.returnMs)}</output>
      </label>}
    </fieldset>
  </details>
}

/** A snap is not a duration, so it is not printed as one. */
function returnTime(returnMs: number): string {
  return returnMs === 0 ? 'Instant' : `${(returnMs / 1000).toFixed(2)}s`
}
