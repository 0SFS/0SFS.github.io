/** Settings → Button grid: where the chip grid sits relative to the flight controls. */
export type GridPosition = 'bottom' | 'top'

/**
 * Settings → Yaw: what the rudder does when the finger leaves its track.
 *
 * `center` is the aircraft's own spring — let go of a real rudder and it comes
 * back — and it is the default, because a deflection nobody is holding is how a
 * phone flies into a slow spiral. `hold` keeps the deflection, which is what a
 * long crosswind leg or a taxi turn wants, since a finger cannot stay on a
 * 40-pixel track for a minute while the other hand flies.
 */
export type YawRelease = 'center' | 'hold'
/**
 * How long the return takes, as a slider rather than a snap: a rudder that
 * slams to centre is a yaw transient the aircraft feels. 0 is the instant
 * release the controller has always done, and stays the default.
 */
export const YAW_RETURN_MS_MAX = 1500
export const YAW_RETURN_MS_STEP = 50
export interface YawSettings { release: YawRelease; returnMs: number }
export const DEFAULT_YAW_SETTINGS: YawSettings = { release: 'center', returnMs: 0 }

const GRID_POSITION_PREFERENCE_KEY = 'osfs.phone-grid-position'
const YAW_RELEASE_PREFERENCE_KEY = 'osfs.phone-yaw-release'
const YAW_RETURN_MS_PREFERENCE_KEY = 'osfs.phone-yaw-return-ms'

export function readGridPosition(): GridPosition {
  try { return window.localStorage.getItem(GRID_POSITION_PREFERENCE_KEY) === 'top' ? 'top' : 'bottom' } catch { return 'bottom' }
}

export function writeGridPosition(position: GridPosition): void {
  try {
    if (position === 'top') window.localStorage.setItem(GRID_POSITION_PREFERENCE_KEY, 'top')
    else window.localStorage.removeItem(GRID_POSITION_PREFERENCE_KEY)
  } catch { /* Private browsing: the choice lasts for this visit only. */ }
}

export function readYawSettings(): YawSettings {
  try {
    const release = window.localStorage.getItem(YAW_RELEASE_PREFERENCE_KEY) === 'hold' ? 'hold' : 'center'
    // A stored time from a newer build, or one edited by hand, must never leave
    // the rudder crawling back for a minute: anything unreadable is the snap.
    const stored = Number(window.localStorage.getItem(YAW_RETURN_MS_PREFERENCE_KEY))
    const returnMs = Number.isFinite(stored) ? Math.min(YAW_RETURN_MS_MAX, Math.max(0, Math.round(stored))) : 0
    return { release, returnMs }
  } catch { return { ...DEFAULT_YAW_SETTINGS } }
}

export function writeYawSettings(settings: YawSettings): void {
  try {
    if (settings.release === 'hold') window.localStorage.setItem(YAW_RELEASE_PREFERENCE_KEY, 'hold')
    else window.localStorage.removeItem(YAW_RELEASE_PREFERENCE_KEY)
    if (settings.returnMs > 0) window.localStorage.setItem(YAW_RETURN_MS_PREFERENCE_KEY, String(settings.returnMs))
    else window.localStorage.removeItem(YAW_RETURN_MS_PREFERENCE_KEY)
  } catch { /* Private browsing: the choice lasts for this visit only. */ }
}
