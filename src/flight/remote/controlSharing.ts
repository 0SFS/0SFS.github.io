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

/**
 * `exclusive`: one device flies at a time, and `handover` says when control
 * passes. `blend`: a phone that has taken control flies together with this
 * computer, which keeps its own controls live; `priority` says whose input
 * wins where both move the same control. `handover` then only says when the
 * phone joins again after a loss.
 */
export type ControlSharingMode = "exclusive" | "blend";
export type BlendPriority = "phone" | "computer";

export interface ControlSharing {
  mode: ControlSharingMode;
  handover: ControlHandover;
  /** With `auto`, one device at a time: how long this computer's flight controls rest before control goes back to the phone. */
  returnIdleMs: number;
  priority: BlendPriority;
}

const PARAMETER_IDS = {
  mode: "osfs.remote.sharing",
  handover: "osfs.remote.handover",
  returnIdle: "osfs.remote.returnIdle",
  priority: "osfs.remote.blendPriority",
} as const satisfies Record<string, FlightParameterId>;

export const CONTROL_SHARING_PARAMETER_IDS: readonly FlightParameterId[] = Object.values(PARAMETER_IDS);

export function readControlSharing(parameters: FlightParameters): ControlSharing {
  return {
    mode: parameters.get(PARAMETER_IDS.mode),
    handover: parameters.get(PARAMETER_IDS.handover),
    returnIdleMs: parameters.get(PARAMETER_IDS.returnIdle) * 1000,
    priority: parameters.get(PARAMETER_IDS.priority),
  };
}

export const DEFAULT_CONTROL_SHARING: Readonly<ControlSharing> = Object.freeze(readControlSharing(flightParameterDefaults()));
