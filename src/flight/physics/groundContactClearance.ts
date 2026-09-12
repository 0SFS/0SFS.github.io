import type { JSBSimSdk } from "@0x62/jsbsim-wasm";

// Cache only property availability, never native nodes or geometry. Positions
// and CG stay live so fuel/payload changes and supported geometry edits apply.
const contactCapabilities = new WeakMap<JSBSimSdk, {
  count: number;
  contacts: Array<{ prefix: string; retractable: boolean }>;
}>();

/** Lowest active contact in the loaded FDM below the current fuel/payload CG.
 * Placement clearance is deliberately conservative and must not decide impact:
 * adding wing extent to wheel height can stop an intact aircraft above ground.
 */
export function groundContactClearanceMeters(sdk: JSBSimSdk, roll: number, pitch: number): number {
  const count = sdk.getPropertyValue("gear/num-units");
  if (!Number.isInteger(count) || count < 0) throw new Error("JSBSim contact count is unavailable.");
  if (count === 0) return 0;
  let capabilities = contactCapabilities.get(sdk);
  if (!capabilities || capabilities.count !== count) {
    // BOGEY units are under gear/unit; STRUCTURE units are under contact/unit.
    // Both use the same native unit numbering, including an unindexed unit 0.
    const catalog = sdk.queryPropertyCatalog("/unit");
    const contacts: Array<{ prefix: string; retractable: boolean }> = [];
    for (const match of catalog.matchAll(/^((?:gear|contact)\/unit(?:\[\d+\])?)\/x-position\s/gm)) {
      const prefix = match[1] + "/";
      contacts.push({ prefix, retractable: catalog.includes(prefix + "pos-norm ") });
    }
    if (contacts.length !== count) throw new Error("JSBSim contact geometry is incomplete.");
    capabilities = { count, contacts };
    contactCapabilities.set(sdk, capabilities);
  }
  const gearPosition = sdk.getPropertyValue("gear/gear-pos-norm");
  const cgX = sdk.getPropertyValue("inertia/cg-x-in");
  const cgY = sdk.getPropertyValue("inertia/cg-y-in");
  const cgZ = sdk.getPropertyValue("inertia/cg-z-in");
  const downX = -Math.sin(pitch);
  const downY = Math.sin(roll) * Math.cos(pitch);
  const downZ = Math.cos(roll) * Math.cos(pitch);
  let lowest = -Infinity;
  for (const { prefix, retractable } of capabilities.contacts) {
    // Both bundled aircraft use the common FCS gear position. Native BOGEY
    // support is active only above 0.99 for retractable units; fixed contacts
    // still participate regardless of the pilot's gear lever.
    if (retractable && gearPosition <= 0.99) continue;
    const xIn = sdk.getPropertyValue(prefix + "x-position");
    const yIn = sdk.getPropertyValue(prefix + "y-position");
    const zIn = sdk.getPropertyValue(prefix + "z-position");
    // Structural coordinates point aft/right/up; body coordinates point
    // forward/right/down. JSBSim's propagated location is its current CG.
    lowest = Math.max(lowest, downX * (cgX - xIn) + downY * (yIn - cgY) + downZ * (cgZ - zIn));
  }
  return lowest === -Infinity ? 0 : lowest * 0.0254;
}
