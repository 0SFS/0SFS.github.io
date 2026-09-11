/**
 * Fixed-step contact boundary required before any coupled wheel force model.
 *
 * A coupled solver needs genuine per-wheel contact state from the same native
 * step that integrates the aircraft, and must return one accepted impulse set to
 * that step. Loose JSBSim string properties read after Run() (compression-
 * derived load, wheel-speed-fps) are adequate for one-way feedback only.
 */
export interface Vec3 { x: number; y: number; z: number }

export type ContactWheelName = "NOSE" | "LEFT_MAIN" | "RIGHT_MAIN";

export interface WheelContact {
  wheel: ContactWheelName;
  /** Axle point relative to the CG, world axes, metres. */
  axleOffsetM: Vec3;
  normalWorld: Vec3;
  forwardWorld: Vec3;
  lateralWorld: Vec3;
  wheelCenterVelocityMps: Vec3;
  groundVelocityMps: Vec3;
  /** Normal load already resolved by the native contact step; never invented for spin. */
  normalLoadN: number;
  compressionM: number;
  steeringRad: number;
  radiusM: number;
  groundRevision: number;
  /** Increments on contact enter, reset, teleport, fault and terrain re-placement. */
  contactEpoch: number;
}

export interface WheelForceResult {
  bodyImpulseNs: Vec3;
  bodyAngularImpulseNms: Vec3;
  wheelAngularImpulseNms: number;
  longitudinalSlipMps: number;
  lateralSlipMps: number;
  normalImpulseNs: number;
  dissipatedJ: number;
}

/**
 * What a native/WASM JSBSim build must provide. `readContacts` and
 * `applyAcceptedImpulses` bracket one fixed step; the bridge owns brake and
 * rolling friction exclusively while `exclusiveLongitudinalFriction` is true.
 */
export interface NativeWheelContactBridge {
  readonly contractVersion: 1;
  /** True only after the native gear model has disabled its own longitudinal rolling/brake friction. */
  readonly exclusiveLongitudinalFriction: boolean;
  readContacts(out: WheelContact[]): number;
  applyAcceptedImpulses(stepId: number, results: readonly WheelForceResult[]): boolean;
}

export type WheelContactCapability =
  | { available: true; bridge: NativeWheelContactBridge }
  | { available: false; reason: string };

const REQUIRED_METHODS = ["readContacts", "applyAcceptedImpulses"] as const;

/**
 * Detects a typed contact bridge on the SDK object. The installed
 * @0x62/jsbsim-wasm exposes whole-simulation Run() and string properties
 * only, so today this reports unavailable and the JSBSim path stays active.
 */
export function probeWheelContactCapability(sdk: unknown): WheelContactCapability {
  const candidate = (sdk as { wheelContactBridge?: unknown } | null)?.wheelContactBridge;
  if (!candidate || typeof candidate !== "object") {
    return { available: false, reason: "the installed JSBSim WASM exposes no per-wheel contact packet or accepted-impulse entry point" };
  }
  const bridge = candidate as Partial<NativeWheelContactBridge>;
  if (bridge.contractVersion !== 1) return { available: false, reason: "the native contact bridge uses an unsupported contract version" };
  for (const method of REQUIRED_METHODS) {
    if (typeof bridge[method] !== "function") return { available: false, reason: `the native contact bridge lacks ${method}()` };
  }
  if (bridge.exclusiveLongitudinalFriction !== true) {
    return { available: false, reason: "JSBSim still owns brake/rolling friction; a second tire solver would double-count it" };
  }
  return { available: true, bridge: bridge as NativeWheelContactBridge };
}

const isFiniteVec = (value: Vec3 | undefined) =>
  !!value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
const length = (value: Vec3) => Math.hypot(value.x, value.y, value.z);
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

/** Rejects a packet before solving. Bounds are fault containment, not aircraft limits. */
export function wheelContactProblem(contact: WheelContact): string | null {
  for (const key of ["axleOffsetM", "normalWorld", "forwardWorld", "lateralWorld", "wheelCenterVelocityMps", "groundVelocityMps"] as const) {
    if (!isFiniteVec(contact[key])) return `${key} is not finite`;
  }
  for (const key of ["normalLoadN", "compressionM", "steeringRad", "radiusM"] as const) {
    if (!Number.isFinite(contact[key])) return `${key} is not finite`;
  }
  if (!Number.isSafeInteger(contact.contactEpoch) || contact.contactEpoch < 0) return "contactEpoch is invalid";
  if (!Number.isSafeInteger(contact.groundRevision) || contact.groundRevision < 0) return "groundRevision is invalid";
  if (contact.normalLoadN < 0 || contact.normalLoadN > 500_000) return "normalLoadN is out of bounds";
  if (contact.radiusM < 0.05 || contact.radiusM > 2) return "radiusM is out of bounds";
  if (length(contact.axleOffsetM) > 50) return "axleOffsetM is out of bounds";
  if (length(contact.wheelCenterVelocityMps) > 400 || length(contact.groundVelocityMps) > 400) return "velocity is out of bounds";
  for (const key of ["normalWorld", "forwardWorld", "lateralWorld"] as const) {
    if (Math.abs(length(contact[key]) - 1) > 1e-3) return `${key} is not a unit vector`;
  }
  if (Math.abs(dot(contact.normalWorld, contact.forwardWorld)) > 1e-3
    || Math.abs(dot(contact.normalWorld, contact.lateralWorld)) > 1e-3
    || Math.abs(dot(contact.forwardWorld, contact.lateralWorld)) > 1e-3) return "contact frame is not orthogonal";
  return null;
}
