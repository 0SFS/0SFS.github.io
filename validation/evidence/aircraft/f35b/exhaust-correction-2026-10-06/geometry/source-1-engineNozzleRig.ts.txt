import { Quaternion, Vector3, type TransformNode } from "@babylonjs/core";

/** 0sfs owns articulated aircraft engine visuals; this never integrates an actuator. */
export interface EngineNozzleRigDefinition {
  bearingNames: readonly [string, string, string];
  /** Equal half-cut angle; four times this is the maximum bend, radians. */
  bearingInclinationRad: number;
  apertureMechanism: RigidNozzleProfile;
}

const X = new Vector3(1, 0, 0), Z = new Vector3(0, 0, 1);

/** Geometric hypotheses for a rigid, slotted flap mechanism; not a native A8/A9 calibration. */
export interface RigidNozzleProfile {
  segmentCount: number; inletRadius: number; convergentLength: number; divergentLength: number;
  closedConvergentRad: number; openConvergentRad: number; closedDivergentRad: number; openDivergentRad: number;
  sealHalfWidth: number; fairingBaseRadius: number; fairingBaseZ: number; fairingSealHalfWidth: number; fairingFollowerNormalOffset: number;
}

export function nozzleApertureGeometry(command: number, p: RigidNozzleProfile) {
  const u = Number.isFinite(command) ? Math.max(0, Math.min(1, command)) : 0;
  const convergent = p.closedConvergentRad + (p.openConvergentRad - p.closedConvergentRad) * u;
  const divergent = p.closedDivergentRad + (p.openDivergentRad - p.closedDivergentRad) * u;
  const throatRadius = p.inletRadius - p.convergentLength * Math.sin(convergent);
  const throatZ = p.convergentLength * Math.cos(convergent);
  const exitRadius = throatRadius + p.divergentLength * Math.sin(divergent);
  const exitZ = throatZ + p.divergentLength * Math.cos(divergent);
  const half = Math.PI / p.segmentCount;
  const sealRadius = (radius: number) => (radius - p.sealHalfWidth * Math.sin(half)) / Math.cos(half);
  // Polygon bounded by the contacting main-flap and gap-seal planes. These are
  // geometric areas at the joint/exit stations, not flow-calibrated native areas.
  const area = (radius: number) => {
    const r = sealRadius(radius), h = p.sealHalfWidth, step = 2 * half;
    return p.segmentCount * (r * h * (1 - Math.cos(step)) + (r * r - h * h) * Math.sin(step) / 2);
  };
  const fairingAngle = Math.atan2(exitRadius + p.fairingFollowerNormalOffset * Math.cos(divergent) - p.fairingBaseRadius, exitZ - p.fairingFollowerNormalOffset * Math.sin(divergent) - p.fairingBaseZ);
  return { convergent, divergent, throatRadius, throatZ, exitRadius, exitZ,
    throatArea: area(throatRadius), exitArea: area(exitRadius),
    sealBaseRadius: sealRadius(p.inletRadius), sealThroatRadius: sealRadius(throatRadius),
    sealConvergent: Math.atan(Math.tan(convergent) / Math.cos(half)),
    sealDivergent: Math.atan(Math.tan(divergent) / Math.cos(half)),
    fairingAngle, fairingSealAngle: Math.atan(Math.tan(fairingAngle) / Math.cos(half)),
    fairingSealBaseRadius: (p.fairingBaseRadius - p.fairingSealHalfWidth * Math.sin(half)) / Math.cos(half) };
}

/** Two inclined circular joints with counter-rotation; the first bearing supplies yaw. */
export function threeBearingAngles(pitch: number, yaw: number, beta: number): readonly [number, number, number] {
  // Rz(a) Ry(beta) Rz(b) Ry(-2beta) Rz(-b) Ry(beta).
  // This stable half-angle inverse matches native direction
  // [-sin(p)sin(y), -sin(p)cos(y), cos(p)] without a near-zero acos singularity.
  // End roll is mechanically coupled, not a separately invented actuator.
  const middle = 2 * Math.asin(Math.min(1, Math.max(0, Math.sin(pitch / 4) / Math.sin(beta))));
  const compensation = Math.atan2(Math.cos(beta) * Math.sin(middle / 2), Math.cos(middle / 2));
  return [-yaw - compensation, middle, -middle];
}

export function bindEngineNozzleRig(nodes: readonly TransformNode[], definition: EngineNozzleRigDefinition) {
  const bearings = definition.bearingNames.map(name => nodes.find(node => node.name === name));
  if (bearings.some(node => !node)) throw new Error("Engine asset is missing a declared swivel bearing");
  const parts = bearings.map(node => ({ node: node!, rest: node!.rotationQuaternion?.clone()
    ?? Quaternion.FromEulerVector(node!.rotation) }));
  const profile = definition.apertureMechanism;
  const required = (name: string) => {
    const node = nodes.find(candidate => candidate.name === name);
    if (!node) throw new Error(`Engine asset is missing rigid nozzle part ${name}`);
    return node;
  };
  const apertureParts = Array.from({ length: profile.segmentCount }, (_, index) => {
    const theta = index * 2 * Math.PI / profile.segmentCount;
    return (["Convergent", "Divergent", "ConvergentSeal", "DivergentSeal", "ConvergentSealShoe", "Fairing", "FairingSeal"] as const).map(role => {
      const angle = theta + (role.includes("Seal") ? Math.PI / profile.segmentCount : 0);
      return { role, node: required(`F135_${role}_${String(index + 1).padStart(2, "0")}`),
        cos: Math.cos(angle), sin: Math.sin(angle), azimuth: Quaternion.RotationAxis(Z, angle - Math.PI / 2) };
    });
  }).flat();
  const exhaust = required("F135_Exhaust");
  let geometry = nozzleApertureGeometry(0, profile);
  let lastPitch = Number.NaN, lastYaw = Number.NaN, lastAperture = Number.NaN;
  return {
    update(pitch: number | undefined, yaw: number | undefined, aperture: number | undefined): void {
      // Missing native values preserve the authored/last valid state. Render-only
      // frames with the same observations perform no transform writes.
      if (pitch !== undefined && yaw !== undefined && Number.isFinite(pitch) && Number.isFinite(yaw)
        && (pitch !== lastPitch || yaw !== lastYaw)) {
        const angles = threeBearingAngles(pitch, yaw, definition.bearingInclinationRad);
        for (let i = 0; i < parts.length; i++) parts[i].node.rotationQuaternion =
          parts[i].rest.multiply(Quaternion.RotationAxis(Z, angles[i]));
        lastPitch = pitch; lastYaw = yaw;
      }
      if (aperture !== undefined && Number.isFinite(aperture)) {
        const bounded = Math.max(0, Math.min(1, aperture));
        if (bounded === lastAperture) return;
        geometry = nozzleApertureGeometry(bounded, profile);
        for (const part of apertureParts) {
          let radius: number, z: number, angle: number;
          switch (part.role) {
            case "Convergent": radius = profile.inletRadius; z = 0; angle = geometry.convergent; break;
            case "Divergent": radius = geometry.throatRadius; z = geometry.throatZ; angle = -geometry.divergent; break;
            case "ConvergentSeal": radius = geometry.sealBaseRadius; z = 0; angle = geometry.sealConvergent; break;
            case "ConvergentSealShoe": radius = geometry.sealThroatRadius; z = geometry.throatZ; angle = geometry.sealConvergent; break;
            case "DivergentSeal": radius = geometry.sealThroatRadius; z = geometry.throatZ; angle = -geometry.sealDivergent; break;
            case "FairingSeal": radius = geometry.fairingSealBaseRadius; z = profile.fairingBaseZ; angle = -geometry.fairingSealAngle; break;
            case "Fairing": radius = profile.fairingBaseRadius; z = profile.fairingBaseZ; angle = -geometry.fairingAngle; break;
          }
          part.node.position.set(radius * part.cos, radius * part.sin, z);
          part.node.rotationQuaternion = part.azimuth.multiply(Quaternion.RotationAxis(X, angle));
        }
        exhaust.position.z = geometry.exitZ;
        lastAperture = bounded;
      }
    },
    partCount: apertureParts.length,
    get apertureGeometry() { return geometry; },
  };
}
