/**
 * The phone controller's own settings — its chip grid, its yaw slider, its
 * haptics — kept here with the flight's other settings, in Remote Control →
 * Phone controller, so one export or preset holds the whole setup. The phone
 * changes them from its ⚙ sheet and Haptics chip over the link, and keeps a
 * copy for when it is not paired. Spec: `docs/phone-controller.md` → *The
 * screen itself*; the message: `PhoneSettingsMessage` in the protocol.
 */
import type { PhoneControllerSettings } from "../../remote/protocol";
import {
  flightParameterDefaults,
  type FlightParameterId,
  type FlightParameters,
  type FlightParameterValues,
} from "../settings/flightParameters";

const PARAMETER_IDS = {
  grid: "osfs.phone.gridPosition",
  yawRelease: "osfs.phone.yawRelease",
  yawReturnMs: "osfs.phone.yawReturnMs",
  haptics: "osfs.phone.haptics",
} as const satisfies Record<keyof PhoneControllerSettings, FlightParameterId>;

export const PHONE_CONTROLLER_PARAMETER_IDS: readonly FlightParameterId[] = Object.values(PARAMETER_IDS);

export function readPhoneControllerSettings(parameters: FlightParameters): PhoneControllerSettings {
  return {
    grid: parameters.get(PARAMETER_IDS.grid),
    yawRelease: parameters.get(PARAMETER_IDS.yawRelease),
    yawReturnMs: parameters.get(PARAMETER_IDS.yawReturnMs),
    haptics: parameters.get(PARAMETER_IDS.haptics),
  };
}

/** Settings as parameter values, to write with `setMany`. */
export function phoneControllerSettingsValues(settings: PhoneControllerSettings): Partial<FlightParameterValues> {
  return {
    [PARAMETER_IDS.grid]: settings.grid,
    [PARAMETER_IDS.yawRelease]: settings.yawRelease,
    [PARAMETER_IDS.yawReturnMs]: settings.yawReturnMs,
    [PARAMETER_IDS.haptics]: settings.haptics,
  };
}

export const DEFAULT_PHONE_CONTROLLER_SETTINGS: Readonly<PhoneControllerSettings> =
  Object.freeze(readPhoneControllerSettings(flightParameterDefaults()));

/**
 * What a phone pairing with its own settings ends up with: this computer's,
 * except where it still has the default and the phone has chosen something
 * else. An imported or preset setup reaches the phone, and a phone's choices
 * made before its computer kept them are not lost at the first pairing.
 */
export function mergePairedPhoneSettings(held: PhoneControllerSettings, phone: PhoneControllerSettings): PhoneControllerSettings {
  const merged = { ...held };
  for (const key of Object.keys(PARAMETER_IDS) as (keyof PhoneControllerSettings)[]) {
    if (held[key] === DEFAULT_PHONE_CONTROLLER_SETTINGS[key]) (merged as Record<string, unknown>)[key] = phone[key];
  }
  return merged;
}
