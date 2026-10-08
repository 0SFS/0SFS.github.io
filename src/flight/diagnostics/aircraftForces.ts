import type { JSBSimSdk } from "@felipegalind0/jsbsim";

export const POUND_FORCE_TO_NEWTONS = 4.4482216152605;
const INCH_TO_METERS = 0.0254;
const FOOT_TO_METERS = 0.3048;
export const POUND_FOOT_TO_NEWTON_METERS = POUND_FORCE_TO_NEWTONS * FOOT_TO_METERS;
export type ForceVector = readonly [number, number, number];

export type AeroAxis = "drag" | "side" | "lift" | "roll" | "pitch" | "yaw";

/**
 * One control surface's native aerodynamic terms: the property of each
 * `<function>` the model sums into that axis. The model applies them at its
 * reference point in JSBSim's default frames, drag, side and lift in wind axes
 * and roll, pitch and yaw about body axes; tests hold each aircraft to that.
 */
export interface ControlSurfaceTerms {
  id: string;
  label: string;
  terms: Readonly<Partial<Record<AeroAxis, string>>>;
}

/**
 * One of the model's `<external_reactions>` forces. JSBSim publishes its unit
 * direction and location but not its frame, and publishes its magnitude only
 * under the name of the `<function>` that computes it, so the profile names
 * both as the model declares them.
 */
export interface ExternalForceTerms {
  /** The `<force name>`: direction and location under `external_reactions/<name>/`. */
  name: string;
  label: string;
  frame: "body" | "wind";
  /** The force's `<function name>`; without one, `external_reactions/<name>/magnitude`. */
  magnitude?: string;
}

export interface AircraftForce {
  id: string;
  label: string;
  color: string;
  /** Native body axes: X forward, Y starboard, Z down, converted from lbf to N. */
  bodyNewtons: ForceVector;
  /** Observed force application point relative to CG, display left/up/forward metres. */
  anchorMeters: ForceVector;
}

export interface AircraftMoment {
  id: string;
  label: string;
  color: string;
  /** Native body axes: roll, pitch and yaw about X forward, Y starboard, Z down, converted from lbf·ft to N·m. */
  bodyNewtonMeters: ForceVector;
  /** The point it is taken about relative to CG, display left/up/forward metres. */
  anchorMeters: ForceVector;
}

export interface AircraftForcesSnapshot {
  simulationTimeSeconds: number;
  forces: readonly AircraftForce[];
  moments: readonly AircraftMoment[];
  unavailable: readonly string[];
  /** Raw same-read native sources of the displayed net vector; native total excludes weight. */
  nativeAppliedBodyPounds: ForceVector | null;
  nativeWeightBodyPounds: ForceVector | null;
}

/**
 * Only coordinate conversion: display axes are left/up/forward. The change of
 * axes is a proper rotation, so it carries moments as it carries forces.
 */
export function bodyForceToDisplay(body: ForceVector): ForceVector {
  return [-body[1], -body[2], body[0]];
}

/** Exact Tw2b basis used by native FGAuxiliary; no force or magnitude is estimated. */
export function windForceToBody(wind: ForceVector, alpha: number, beta: number): ForceVector {
  const ca = Math.cos(alpha), sa = Math.sin(alpha), cb = Math.cos(beta), sb = Math.sin(beta);
  return [ca * cb * wind[0] - ca * sb * wind[1] - sa * wind[2],
    sb * wind[0] + cb * wind[1], sa * cb * wind[0] - sa * sb * wind[1] + ca * wind[2]];
}

function bodyForceToWind(body: ForceVector, alpha: number, beta: number): ForceVector {
  const ca = Math.cos(alpha), sa = Math.sin(alpha), cb = Math.cos(beta), sb = Math.sin(beta);
  return [ca * cb * body[0] + sb * body[1] + sa * cb * body[2],
    -ca * sb * body[0] + cb * body[1] - sa * sb * body[2], -sa * body[0] + ca * body[2]];
}

export function structuralPointToDisplay(pointInches: ForceVector, cgInches: ForceVector): ForceVector {
  return [(cgInches[1] - pointInches[1]) * INCH_TO_METERS,
    (pointInches[2] - cgInches[2]) * INCH_TO_METERS,
    (cgInches[0] - pointInches[0]) * INCH_TO_METERS];
}

const SURFACE_COLORS = ["#ff8f3f", "#3fd7e0", "#ff5fd2", "#a6e22e", "#8c9eff", "#e0c08a", "#ff9e9e", "#5fe0a8"];

/** Loaded-model observer. Recreate after native loadModel; RunIC/relocation retain it. */
export function createAircraftForceReader(sdk: JSBSimSdk, engineLabels: Readonly<Record<number, string>> = {},
  controlSurfaces: readonly ControlSurfaceTerms[] = [], externalForces: readonly ExternalForceTerms[] = []) {
  const paths: string[] = [];
  const slot = (path: string) => {
    const existing = paths.indexOf(path);
    return existing >= 0 ? existing : paths.push(path) - 1;
  };
  const triple = (names: readonly string[]) => names.map(slot);
  const bodyPaths = (kind: string) => ["x", "y", "z"].map(axis => `forces/fb${axis}-${kind}-lbs`);
  const time = slot("simulation/sim-time-sec");
  const cg = triple(["inertia/cg-x-in", "inertia/cg-y-in", "inertia/cg-z-in"]);
  const alpha = slot("aero/alpha-rad"), beta = slot("aero/beta-rad");
  const aeroRp = triple(["aero/rp-body-x-ft", "aero/rp-body-y-ft", "aero/rp-body-z-ft"]);
  const aeroAtRp = triple(bodyPaths("aero-rp"));
  const aeroAtCg = triple(bodyPaths("aero-cg"));
  const aeroTotal = triple(bodyPaths("aero"));
  const propulsion = triple(bodyPaths("prop"));
  const weight = triple(bodyPaths("weight"));
  const applied = triple(bodyPaths("total"));
  const aeroMoment = triple(["l", "m", "n"].map(axis => `moments/${axis}-aero-lbsft`));
  const surfaces = controlSurfaces.map((surface, index) => ({
    ...surface,
    color: SURFACE_COLORS[index % SURFACE_COLORS.length],
    slots: Object.fromEntries(Object.entries(surface.terms).map(([axis, path]) => [axis, slot(path)])) as Partial<Record<AeroAxis, number>>,
  }));
  const externals = externalForces.map(force => {
    const base = `external_reactions/${force.name}/`;
    return { ...force, magnitude: slot(force.magnitude ?? base + "magnitude"), direction: triple(["x", "y", "z"].map(axis => base + axis)),
      acting: triple(["x", "y", "z"].map(axis => base + `location-${axis}-in`)) };
  });
  const indices = new Set<number>();
  for (const match of sdk.queryPropertyCatalog("propulsion/engine").matchAll(/propulsion\/engine(?:\[(\d+)\])?\/(?:thrust-lbs|x-position)(?:\s|$)/g)) {
    indices.add(match[1] === undefined ? 0 : Number(match[1]));
  }
  const engines = [...indices].sort((a, b) => a - b).map(index => {
    const base = `propulsion/engine[${index}]/`;
    return { index,
      forces: triple(["x", "y", "z"].map(axis => base + `body-force-${axis}-lbs`)),
      acting: triple(["x-position", "y-position", "z-position"].map(name => base + name)),
    };
  });
  const batch = sdk.createPropertyBatch(paths, { create: false });
  const values = new Float64Array(paths.length);
  let disposed = false;
  const readTriple = (slots: readonly number[]): ForceVector | null => {
    const vector: ForceVector = [values[slots[0]], values[slots[1]], values[slots[2]]];
    return vector.every(Number.isFinite) ? vector : null;
  };
  const toNewtons = (force: ForceVector): ForceVector => [force[0] * POUND_FORCE_TO_NEWTONS,
    force[1] * POUND_FORCE_TO_NEWTONS, force[2] * POUND_FORCE_TO_NEWTONS];
  const toNewtonMeters = (moment: ForceVector): ForceVector => [moment[0] * POUND_FOOT_TO_NEWTON_METERS,
    moment[1] * POUND_FOOT_TO_NEWTON_METERS, moment[2] * POUND_FOOT_TO_NEWTON_METERS];
  const addForce = (forces: AircraftForce[], unavailable: string[], id: string, label: string, color: string,
    slots: readonly number[], anchor: ForceVector | null) => {
    const vector = readTriple(slots);
    if (vector && anchor) forces.push({ id, label, color, bodyNewtons: toNewtons(vector), anchorMeters: anchor });
    else unavailable.push(label);
  };
  return {
    read(): AircraftForcesSnapshot {
      if (disposed) throw new Error("Aircraft force reader has been disposed.");
      batch.read(values);
      const forces: AircraftForce[] = [];
      const moments: AircraftMoment[] = [];
      const unavailable: string[] = [];
      const origin: ForceVector = [0, 0, 0];
      const cgInches = readTriple(cg);
      const rpBodyFeet = readTriple(aeroRp);
      const rpForce = readTriple(aeroAtRp);
      const windAngles = Number.isFinite(values[alpha]) && Number.isFinite(values[beta]);
      const rpDisplay = rpBodyFeet && bodyForceToDisplay(rpBodyFeet);
      const anchor: ForceVector | null = rpDisplay
        && [rpDisplay[0] * FOOT_TO_METERS, rpDisplay[1] * FOOT_TO_METERS, rpDisplay[2] * FOOT_TO_METERS];
      if (anchor && rpForce && windAngles) {
        const wind = bodyForceToWind(rpForce, values[alpha], values[beta]);
        for (const [i, label, color] of [[0, "Drag", "#ff6b73"], [1, "Side force", "#cf8aff"], [2, "Lift", "#54df8a"]] as const) {
          const component: [number, number, number] = [0, 0, 0];
          component[i] = wind[i];
          forces.push({ id: `aero-${i}`, label, color,
            bodyNewtons: toNewtons(windForceToBody(component, values[alpha], values[beta])), anchorMeters: anchor });
        }
        addForce(forces, unavailable, "aero-cg", "Aero applied at CG", "#3dab70", aeroAtCg, origin);
      } else {
        // A total may include both RP and CG terms. Never pretend it all acts at a guessed RP.
        addForce(forces, unavailable, "aero-total", "Aero total (CG display anchor)", "#54df8a", aeroTotal, origin);
        unavailable.push("Resolved aerodynamic components");
      }
      let componentCount = 0;
      for (const engine of engines) {
        const label = engineLabels[engine.index] ?? `Engine ${engine.index + 1}`;
        const acting = readTriple(engine.acting), vector = readTriple(engine.forces);
        if (!acting || !vector || !cgInches) { unavailable.push(label); continue; }
        forces.push({ id: `engine-${engine.index}`, label, color: "#ffc15a",
          bodyNewtons: toNewtons(vector), anchorMeters: structuralPointToDisplay(acting, cgInches) });
        componentCount++;
      }
      for (const force of externals) {
        const magnitude = values[force.magnitude], direction = readTriple(force.direction), acting = readTriple(force.acting);
        const wind = force.frame === "wind";
        if (!Number.isFinite(magnitude) || !direction || !acting || !cgInches || (wind && !windAngles)) {
          unavailable.push(force.label); continue;
        }
        // As FGExternalForce: magnitude times the declared unit direction, in its frame.
        const own: ForceVector = [magnitude * direction[0], magnitude * direction[1], magnitude * direction[2]];
        forces.push({ id: `external-${force.name}`, label: force.label, color: "#ffc15a",
          bodyNewtons: toNewtons(wind ? windForceToBody(own, values[alpha], values[beta]) : own),
          anchorMeters: structuralPointToDisplay(acting, cgInches) });
      }
      if (componentCount < engines.length || engines.length === 0) {
        addForce(forces, unavailable, "propulsion", "Propulsion total (CG display anchor)", "#ffc15a", propulsion, origin);
      }
      addForce(forces, unavailable, "weight", "Weight", "#66bcff", weight, origin);
      addForce(forces, unavailable, "applied", "Applied total (excludes gravity)", "#ffffff", applied, origin);
      const nativeAppliedBodyPounds = readTriple(applied), nativeWeightBodyPounds = readTriple(weight);
      if (nativeAppliedBodyPounds && nativeWeightBodyPounds) {
        forces.push({ id: "net", label: "Net force (with gravity)", color: "#ffed67", anchorMeters: origin,
          bodyNewtons: toNewtons([nativeAppliedBodyPounds[0] + nativeWeightBodyPounds[0],
            nativeAppliedBodyPounds[1] + nativeWeightBodyPounds[1], nativeAppliedBodyPounds[2] + nativeWeightBodyPounds[2]]) });
      } else unavailable.push("Net force (with gravity)");
      const aeroMomentPoundFeet = readTriple(aeroMoment);
      if (aeroMomentPoundFeet) {
        moments.push({ id: "aero-moment", label: "Aero moment about CG", color: "#7cf0b0", anchorMeters: origin,
          bodyNewtonMeters: toNewtonMeters(aeroMomentPoundFeet) });
      } else unavailable.push("Aero moment about CG");
      for (const surface of surfaces) {
        const term = (axis: AeroAxis): number => {
          const index = surface.slots[axis];
          return index === undefined ? 0 : values[index];
        };
        const native = (["drag", "side", "lift", "roll", "pitch", "yaw"] as const).map(term);
        if (!anchor || !windAngles || !native.every(Number.isFinite)) { unavailable.push(surface.label); continue; }
        const { drag, side, lift, roll, pitch, yaw } = surface.slots;
        if (drag !== undefined || side !== undefined || lift !== undefined) {
          // JSBSim's wind frame reports drag aft and lift up; its axes point forward and down.
          const body = windForceToBody([-native[0], native[1], -native[2]], values[alpha], values[beta]);
          forces.push({ id: `surface-${surface.id}`, label: surface.label, color: surface.color, bodyNewtons: toNewtons(body), anchorMeters: anchor });
        }
        if (roll !== undefined || pitch !== undefined || yaw !== undefined) {
          moments.push({ id: `surface-${surface.id}-moment`, label: surface.label, color: surface.color, anchorMeters: anchor,
            bodyNewtonMeters: toNewtonMeters([native[3], native[4], native[5]]) });
        }
      }
      return { simulationTimeSeconds: values[time], forces, moments, unavailable, nativeAppliedBodyPounds, nativeWeightBodyPounds };
    },
    dispose(): void { if (!disposed) { disposed = true; batch.dispose(); } },
  };
}
