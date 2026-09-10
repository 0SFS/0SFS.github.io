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
): void {
  sdk.setPropertyValue("fcs/elevator-cmd-norm", controls.elevator);
  sdk.setPropertyValue("fcs/aileron-cmd-norm", controls.aileron);
  // Controls use positive yaw-right; the C172 rudder coefficient makes
  // positive surface deflection yaw left. Convert at the physics boundary.
  sdk.setPropertyValue("fcs/rudder-cmd-norm", -controls.rudder);
  sdk.setPropertyValue("fcs/throttle-cmd-norm", controls.throttle);
  sdk.setPropertyValue("fcs/pitch-trim-cmd-norm", controls.pitchTrim);
  sdk.setPropertyValue("fcs/flap-cmd-norm", controls.flaps);
  sdk.setPropertyValue("fcs/brake-cmd-norm", controls.brake);
  sdk.setPropertyValue("fcs/left-brake-cmd-norm", controls.brake);
  sdk.setPropertyValue("fcs/right-brake-cmd-norm", controls.brake);
  // The lever. Nothing in the c172p acts on it - it has fixed gear - but it is
  // where the visual rig reads the gear from, and it is the right property for
  // a retractable flight model to pick up when one arrives.
  sdk.setPropertyValue("gear/gear-cmd-norm", gearDownNorm);
}
