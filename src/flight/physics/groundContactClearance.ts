import type { JSBSimSdk } from "@0x62/jsbsim-wasm";

// All seven ground contacts in aircraft/c172p/c172p.xml, in structural inches:
// nose/main wheels, nose/tail skids, then wingtips. These are separate contact
// points, not the sum of a wing envelope and a landing-gear envelope.
const C172_CONTACTS = [
  [-6.8, 0, -19.5], [58.2, -43, -15.5], [58.2, 43, -15.5],
  [-37.7, 0, 26.6], [188, 0, 8], [43.2, -214.8, 59.4], [43.2, 214.8, 59.4],
] as const;

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
  for (const [x, y, z] of C172_CONTACTS) {
    // Structural coordinates point aft/right/up; body coordinates point
    // forward/right/down. JSBSim's propagated location is its current CG.
    lowest = Math.max(lowest, downX * (cgX - x) + downY * (y - cgY) + downZ * (cgZ - z));
  }
  return lowest * 0.0254;
}
