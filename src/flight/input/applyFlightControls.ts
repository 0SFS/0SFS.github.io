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
  rollStickGain?: { property: string; gain: number },
): void {
  if (stovl && (!Number.isFinite(stovl.commandNorm) || stovl.commandNorm < 0 || stovl.commandNorm > 1)) {
    throw new RangeError("STOVL conversion must be between 0 and 1.");
  }
  if (controlLaw && !Object.hasOwn(CONTROL_LAW_MODE_VALUES, controlLaw.mode)) {
    throw new RangeError("Unknown aircraft control law.");
  }
  if (rollStickGain && (!Number.isFinite(rollStickGain.gain) || rollStickGain.gain <= 0 || rollStickGain.gain > 1)) {
    throw new RangeError("Roll stick gain must be above 0 and at most 1.");
  }
  if (controlLaw) sdk.setPropertyValue(controlLaw.commandProperty, CONTROL_LAW_MODE_VALUES[controlLaw.mode]);
  if (automaticFlaps) sdk.setPropertyValue(automaticFlaps.commandProperty, Number(automaticFlaps.enabled));
  if (rollStickGain) sdk.setPropertyValue(rollStickGain.property, rollStickGain.gain);
  sdk.setPropertyValue("fcs/elevator-cmd-norm", controls.elevator);
  sdk.setPropertyValue("fcs/aileron-cmd-norm", controls.aileron);
  // Controls use positive yaw-right. Each FDM profile declares whether its
  // native yaw-surface convention needs conversion at this boundary.
  sdk.setPropertyValue("fcs/rudder-cmd-norm", controls.rudder * rudderSign);
  sdk.setPropertyValue("fcs/throttle-cmd-norm", controls.throttle);
  sdk.setPropertyValue("fcs/pitch-trim-cmd-norm", controls.pitchTrim);
  sdk.setPropertyValue("fcs/roll-trim-cmd-norm", controls.rollTrim);
  sdk.setPropertyValue("fcs/flap-cmd-norm", controls.flaps);
  sdk.setPropertyValue("fcs/brake-cmd-norm", controls.brake);
  sdk.setPropertyValue("fcs/left-brake-cmd-norm", controls.brake);
  sdk.setPropertyValue("fcs/right-brake-cmd-norm", controls.brake);
  // The SF50 FCS drives its physical actuator from this lever. The fixed-gear
  // C172 ignores it; presentation reads the resulting physical position.
  sdk.setPropertyValue("gear/gear-cmd-norm", gearDownNorm);
  if (stovl) sdk.setPropertyValue(stovl.commandProperty, stovl.commandNorm);
}
