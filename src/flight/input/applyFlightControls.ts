import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import type { ControlSurfaceState } from "./flightInputManager";

/** The sole normalized control-to-physics boundary, shared by every input owner. */
export function applyFlightControls(sdk: JSBSimSdk, controls: ControlSurfaceState): void {
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
}
