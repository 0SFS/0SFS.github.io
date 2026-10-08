import { MAX_YAW_RETURN_MS, type PhoneControllerSettings } from './protocol'

/** Settings → Button grid: where the chip grid sits relative to the flight controls. */
export type GridPosition = PhoneControllerSettings['grid']

/**
 * Settings → Yaw: what the rudder does when the finger leaves its track.
 *
 * `center` is the aircraft's own spring — let go of a real rudder and it comes
 * back — and it is the default, because a deflection nobody is holding is how a
 * phone flies into a slow spiral. `hold` keeps the deflection, which is what a
 * long crosswind leg or a taxi turn wants, since a finger cannot stay on a
 * 40-pixel track for a minute while the other hand flies.
 */
export type YawRelease = PhoneControllerSettings['yawRelease']
/**
 * How long the return takes, as a slider rather than a snap: a rudder that
 * slams to centre is a yaw transient the aircraft feels. 0 is the instant
 * release the controller has always done, and stays the default.
 */
export const YAW_RETURN_MS_MAX = MAX_YAW_RETURN_MS
export const YAW_RETURN_MS_STEP = 50
export interface YawSettings { release: YawRelease; returnMs: number }

/**
 * The phone's copy of its settings, for when it is not paired. Paired, the
 * computer holds them with its own (Remote Control → Phone controller), so an
 * export holds the whole setup, and this copy follows what it says. The same
 * values are the defaults there; a test keeps the two in step.
 */
export const DEFAULT_PHONE_SETTINGS: Readonly<PhoneControllerSettings> = Object.freeze({
  grid: 'bottom', yawRelease: 'center', yawReturnMs: 0, haptics: false,
})

/** The keys predate the computer holding these, and are kept so a phone's choices carry over. */
const KEYS = {
  grid: 'osfs.phone-grid-position',
  yawRelease: 'osfs.phone-yaw-release',
  yawReturnMs: 'osfs.phone-yaw-return-ms',
  haptics: 'osfs.phone-haptics',
} as const satisfies Record<keyof PhoneControllerSettings, string>

export type PhoneSettingsStorage = Pick<Storage, 'getItem' | 'setItem'>

export function loadPhoneSettings(storage: PhoneSettingsStorage | null): PhoneControllerSettings {
  if (!storage) return { ...DEFAULT_PHONE_SETTINGS }
  try {
    // A stored time from a newer build, or one edited by hand, must never leave
    // the rudder crawling back for a minute: anything unreadable is the snap.
    const returnMs = Number(storage.getItem(KEYS.yawReturnMs))
    return {
      grid: storage.getItem(KEYS.grid) === 'top' ? 'top' : 'bottom',
      yawRelease: storage.getItem(KEYS.yawRelease) === 'hold' ? 'hold' : 'center',
      yawReturnMs: Number.isFinite(returnMs) ? Math.min(YAW_RETURN_MS_MAX, Math.max(0, Math.round(returnMs))) : 0,
      haptics: storage.getItem(KEYS.haptics) === 'on',
    }
  } catch { return { ...DEFAULT_PHONE_SETTINGS } }
}

export function savePhoneSettings(storage: PhoneSettingsStorage | null, settings: PhoneControllerSettings): void {
  try {
    storage?.setItem(KEYS.grid, settings.grid)
    storage?.setItem(KEYS.yawRelease, settings.yawRelease)
    storage?.setItem(KEYS.yawReturnMs, String(settings.yawReturnMs))
    storage?.setItem(KEYS.haptics, settings.haptics ? 'on' : 'off')
  } catch { /* Private browsing: the choice lasts for this visit only. */ }
}
