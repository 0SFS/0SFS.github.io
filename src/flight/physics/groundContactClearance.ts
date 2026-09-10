import type { JSBSimSdk } from "@0x62/jsbsim-wasm";
import { C172_GROUND_CONTACTS } from "./collisionGeometry";

/** Lowest actual C172 contact below the CG, using the current fuel/payload CG.
 * Placement clearance is deliberately conservative and must not decide impact:
 * adding wing extent to wheel height can stop an intact aircraft above ground.
 */
export function groundContactClearanceMeters(sdk: JSBSimSdk, roll: number, pitch: number): number {
  const cgX = sdk.getPropertyValue("inertia/cg-x-in");
  const cgY = sdk.getPropertyValue("inertia/cg-y-in");
  const cgZ = sdk.getPropertyValue("inertia/cg-z-in");
  const downX = -Math.sin(pitch);
  const downY = Math.sin(roll) * Math.cos(pitch);
  const downZ = Math.cos(roll) * Math.cos(pitch);
  let lowest = -Infinity;
  for (const { xIn, yIn, zIn } of C172_GROUND_CONTACTS) {
    // Structural coordinates point aft/right/up; body coordinates point
    // forward/right/down. JSBSim's propagated location is its current CG.
    lowest = Math.max(lowest, downX * (cgX - xIn) + downY * (yIn - cgY) + downZ * (cgZ - zIn));
  }
  return lowest * 0.0254;
}
