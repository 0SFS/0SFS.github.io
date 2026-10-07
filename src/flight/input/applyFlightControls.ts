import type { JSBSimSdk } from "@felipegalind0/jsbsim";
import type { ControlSurfaceState } from "./flightInputManager";
import { CONTROL_LAW_MODE_VALUES, type FlightControlLawMode } from "../jsbsim/fdmProfiles";

/**
 * The sole normalized control-to-physics boundary, shared by every input owner.
 *
 * `gearDownNorm` (1 down, 0 up) is a separate argument rather than a member of
 * `ControlSurfaceState` because that record is the smoothed continuous axes -
 * every field of it is gamepad-mapped, phone-synced and range-checked on the
 * wire. The gear is a latching switch, like the pause key, and it is owned the
 * same way.
 */
export function applyFlightControls(
  sdk: JSBSimSdk,
  controls: ControlSurfaceState,
  gearDownNorm = 1,
  rudderSign: 1 | -1 = -1,
  stovl?: { commandProperty: string; commandNorm: number },
  controlLaw?: { commandProperty: string; mode: FlightControlLawMode },
  automaticFlaps?: { commandProperty: string; enabled: boolean },
  fullStickRollRate?: { property: string; degPerSec: number },
  /** osfs.aircraft.rollTrimRange: what full roll trim asks for, as a share of full stick. */
  rollTrimRange = 1,
): void {
  if (stovl && (!Number.isFinite(stovl.commandNorm) || stovl.commandNorm < 0 || stovl.commandNorm > 1)) {
    throw new RangeError("STOVL conversion must be between 0 and 1.");
  }
  if (controlLaw && !Object.hasOwn(CONTROL_LAW_MODE_VALUES, controlLaw.mode)) {
    throw new RangeError("Unknown aircraft control law.");
  }
  if (fullStickRollRate && (!Number.isFinite(fullStickRollRate.degPerSec) || fullStickRollRate.degPerSec <= 0)) {
    throw new RangeError("Full-stick roll rate must be a positive number of degrees per second.");
  }
  if (!Number.isFinite(rollTrimRange) || rollTrimRange <= 0 || rollTrimRange > 1) {
    throw new RangeError("Roll trim range must be above 0 and at most 1.");
  }
  if (controlLaw) sdk.setPropertyValue(controlLaw.commandProperty, CONTROL_LAW_MODE_VALUES[controlLaw.mode]);
  if (automaticFlaps) sdk.setPropertyValue(automaticFlaps.commandProperty, Number(automaticFlaps.enabled));
  if (fullStickRollRate) sdk.setPropertyValue(fullStickRollRate.property, fullStickRollRate.degPerSec);
  sdk.setPropertyValue("fcs/elevator-cmd-norm", controls.elevator);
  sdk.setPropertyValue("fcs/aileron-cmd-norm", controls.aileron);
  // Controls use positive yaw-right. Each FDM profile declares whether its
  // native yaw-surface convention needs conversion at this boundary.
  sdk.setPropertyValue("fcs/rudder-cmd-norm", controls.rudder * rudderSign);
  sdk.setPropertyValue("fcs/throttle-cmd-norm", controls.throttle);
  sdk.setPropertyValue("fcs/pitch-trim-cmd-norm", controls.pitchTrim);
  // Each aircraft takes roll trim in its stick's units, so this is a share of full stick.
  sdk.setPropertyValue("fcs/roll-trim-cmd-norm", controls.rollTrim * rollTrimRange);
  sdk.setPropertyValue("fcs/flap-cmd-norm", controls.flaps);
  sdk.setPropertyValue("fcs/brake-cmd-norm", controls.brake);
  sdk.setPropertyValue("fcs/left-brake-cmd-norm", controls.brake);
  sdk.setPropertyValue("fcs/right-brake-cmd-norm", controls.brake);
  // The SF50 FCS drives its physical actuator from this lever. The fixed-gear
  // C172 ignores it; presentation reads the resulting physical position.
  sdk.setPropertyValue("gear/gear-cmd-norm", gearDownNorm);
  if (stovl) sdk.setPropertyValue(stovl.commandProperty, stovl.commandNorm);
}
