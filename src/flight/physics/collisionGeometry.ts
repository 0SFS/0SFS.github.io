export interface BodyCollisionProbe { name: string; left: number; up: number; forward: number }

/** Body points swept against visible terrain/building triangles each physics step.
 * Offsets are metres from the propagated aircraft centre: left, up, forward.
 * These are point probes, not the vertices of a solid collision hull.
 */
export const BODY_COLLISION_PROBES: readonly BodyCollisionProbe[] = [
  { name: "nose", left: 0, up: 0.7, forward: 4.5 },
  { name: "center", left: 0, up: -0.2, forward: 0 },
  { name: "left-wing", left: 5.5, up: 0.6, forward: 0.2 },
  { name: "right-wing", left: -5.5, up: 0.6, forward: 0.2 },
  { name: "tail", left: 0, up: 1.4, forward: -3.8 },
] as const;

export const MAX_BODY_COLLISION_ALTITUDE_METERS = 150;

/** SF50 three-view approximation, relative to the initial model's empty CG.
 * Source: planes/Cirrus_Vision_Jet/agent_workspace/measurements/sf50_reference.md.
 * These are conservative body probes, not wheel contacts or a validated hull.
 */
export const SF50_BODY_COLLISION_PROBES: readonly BodyCollisionProbe[] = [
  { name: "nose", left: 0, up: 0.2, forward: 4.064 },
  { name: "belly", left: 0, up: -0.82, forward: 0 },
  { name: "left-wing", left: 5.898, up: 0.14, forward: -0.25 },
  { name: "right-wing", left: -5.898, up: 0.14, forward: -0.25 },
  { name: "left-tail", left: 2.24, up: 2.2, forward: -4.94 },
  { name: "right-tail", left: -2.24, up: 2.2, forward: -4.94 },
];

/** JSBSim c172p.xml ground contacts, in structural inches (aft, right, up).
 * Wheel locations are uncompressed; suspension compression is handled by JSBSim.
 * The test checks these against the aircraft XML used by the simulation.
 */
export const C172_GROUND_CONTACTS = [
  { name: "NOSE", kind: "wheel", xIn: -6.8, yIn: 0, zIn: -19.5 },
  { name: "LEFT_MAIN", kind: "wheel", xIn: 58.2, yIn: -43, zIn: -15.5 },
  { name: "RIGHT_MAIN", kind: "wheel", xIn: 58.2, yIn: 43, zIn: -15.5 },
  { name: "NOSE_SKID", kind: "structure", xIn: -37.7, yIn: 0, zIn: 26.6 },
  { name: "TAIL_SKID", kind: "structure", xIn: 188, yIn: 0, zIn: 8 },
  { name: "LEFT_TIP", kind: "structure", xIn: 43.2, yIn: -214.8, zIn: 59.4 },
  { name: "RIGHT_TIP", kind: "structure", xIn: 43.2, yIn: 214.8, zIn: 59.4 },
] as const;

interface StructuralPosition { xIn: number; yIn: number; zIn: number }

/** Convert structural inches to renderer/probe metres using the current CG. */
export function groundContactBodyPosition(contact: StructuralPosition, cg: StructuralPosition): { left: number; up: number; forward: number } {
  return {
    left: (cg.yIn - contact.yIn) * 0.0254,
    up: (contact.zIn - cg.zIn) * 0.0254,
    forward: (cg.xIn - contact.xIn) * 0.0254,
  };
}
