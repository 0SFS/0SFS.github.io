import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import type { ControlSurfaceState } from "./flightInputManager";

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
): void {
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
}
