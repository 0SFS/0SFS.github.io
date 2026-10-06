/**
 * Who flies when a phone and this computer could both: the Remote Control
 * tab's *Who flies* section. Read live by the phone session at every decision,
 * so a change applies at once. Spec: `docs/proposals/phone-controller.md`
 * → *Sharing the controls*.
 */
import {
  flightParameterDefaults,
  type FlightParameterId,
  type FlightParameters,
} from "../settings/flightParameters";

/**
 * How control changes hands while one device flies at a time.
 *
 * - `auto`: flight input on this computer takes control, and control goes back
 *   to the phone by itself as soon as nothing is in the way — these controls
 *   have rested, this tab is showing, and the phone is heard from.
 * - `stay`: whichever device has control keeps it until the other takes it on
 *   purpose. The phone's pilot taps Take control to fly again.
 * - `phone`: latched to the phone. It flies whenever it is heard from, and
 *   flight input here does not take control from it.
 * - `computer`: latched to this computer. The phone cannot take control.
 *
 * In every mode Take control in the Remote Control tab takes control on
 * purpose, and the phone then waits to be asked again.
 */
export type ControlHandover = "auto" | "stay" | "phone" | "computer";

export interface ControlSharing {
  handover: ControlHandover;
  /** With `auto`: how long this computer's flight controls rest before control goes back to the phone. */
  returnIdleMs: number;
}

const PARAMETER_IDS = {
  handover: "osfs.remote.handover",
  returnIdle: "osfs.remote.returnIdle",
} as const satisfies Record<string, FlightParameterId>;

export const CONTROL_SHARING_PARAMETER_IDS: readonly FlightParameterId[] = Object.values(PARAMETER_IDS);

export function readControlSharing(parameters: FlightParameters): ControlSharing {
  return {
    handover: parameters.get(PARAMETER_IDS.handover),
    returnIdleMs: parameters.get(PARAMETER_IDS.returnIdle) * 1000,
  };
}

export const DEFAULT_CONTROL_SHARING: Readonly<ControlSharing> = Object.freeze(readControlSharing(flightParameterDefaults()));
