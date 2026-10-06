import type { JSBSimSdk } from "@felipegalind0/jsbsim";

export const POUND_FORCE_TO_NEWTONS = 4.4482216152605;
const INCH_TO_METERS = 0.0254;
const FOOT_TO_METERS = 0.3048;
export type ForceVector = readonly [number, number, number];

export interface AircraftForce {
  id: string;
  label: string;
  color: string;
  /** Native body axes: X forward, Y starboard, Z down, converted from lbf to N. */
  bodyNewtons: ForceVector;
  /** Observed force application point relative to CG, display left/up/forward metres. */
  anchorMeters: ForceVector;
}

export interface AircraftForcesSnapshot {
  simulationTimeSeconds: number;
  forces: readonly AircraftForce[];
  unavailable: readonly string[];
  /** Raw same-read native sources of the displayed net vector; native total excludes weight. */
  nativeAppliedBodyPounds: ForceVector | null;
  nativeWeightBodyPounds: ForceVector | null;
}

/** Only coordinate conversion: display axes are left/up/forward. */
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

/** Loaded-model observer. Recreate after native loadModel; RunIC/relocation retain it. */
export function createAircraftForceReader(sdk: JSBSimSdk, engineLabels: Readonly<Record<number, string>> = {}) {
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
      const unavailable: string[] = [];
      const origin: ForceVector = [0, 0, 0];
      const cgInches = readTriple(cg);
      const rpBodyFeet = readTriple(aeroRp);
      const rpForce = readTriple(aeroAtRp);
      if (rpBodyFeet && rpForce && Number.isFinite(values[alpha]) && Number.isFinite(values[beta])) {
        const rpDisplay = bodyForceToDisplay(rpBodyFeet);
        const anchor: ForceVector = [rpDisplay[0] * FOOT_TO_METERS, rpDisplay[1] * FOOT_TO_METERS, rpDisplay[2] * FOOT_TO_METERS];
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
      return { simulationTimeSeconds: values[time], forces, unavailable, nativeAppliedBodyPounds, nativeWeightBodyPounds };
    },
    dispose(): void { if (!disposed) { disposed = true; batch.dispose(); } },
  };
}
