import type { AircraftId } from "./aircraftIds";

/**
 * Aircraft lights: where each aircraft carries them, and what each kind
 * sends in each direction, in candelas. Pure: createAircraftLights draws them
 * through FOSS Earth's light points and lights the ground with the beams.
 *
 * Intensities are the certification minimums of 14 CFR Part 25, which a
 * light at the minimum meets and most exceed: navigation lights by sector
 * (25.1389 to 25.1395) and anti-collision lights by effective intensity
 * (25.1401). Landing and taxi lights have no required intensity; theirs are
 * a typical sealed-beam lamp's, stated below.
 */

export type AircraftLightKind = "position-left" | "position-right" | "position-tail" | "strobe" | "beacon" | "landing" | "taxi";
export type Rgb = [number, number, number];
type Vec3 = readonly [number, number, number];

export interface AircraftLightInstallation {
  kind: AircraftLightKind;
  /**
   * In the model's own frame as measured from its mesh, m: the body's axes,
   * +X left, +Y up, +Z nose, with the ground the mesh stands on at zero.
   * The aircraft's model offset is added when it is placed.
   */
  position: Vec3;
  /** A beam's axis, a unit vector in the body's axes. */
  direction?: Vec3;
  /** Lit only with the landing gear down, as a lamp on a gear leg is. */
  onGear?: boolean;
  /** The share of its kind's intensity this lamp gives, where two share one light's duty. */
  share?: number;
}

const RAD = Math.PI / 180;
/** A beam pitched down from the body's longitudinal axis by an angle, degrees. */
const pitchedDown = (degrees: number): Vec3 => [0, -Math.sin(degrees * RAD), Math.cos(degrees * RAD)];

/**
 * Lights on each aircraft, measured from its LOD3 or airframe mesh
 * (0sfs build/aircraft-lights/measure.mjs, which loads each model as the app
 * does): wingtip lights 3 cm outboard of the wing's outermost vertex, tail
 * lights at the rearmost or the fins' tops, beacons on the fin or the spine.
 * Landing and taxi lamps where the type carries them: the Cessna 172's in its
 * left wing's leading edge, the F-35B's on its nose gear leg; the Vision
 * Jet's are placed in its wing roots' leading edges, not from a source.
 */
export const AIRCRAFT_LIGHTS: Readonly<Record<AircraftId, readonly AircraftLightInstallation[]>> = (() => {
  const cessna: readonly AircraftLightInstallation[] = [
    { kind: "position-left", position: [5.53, 2.134, 0] },
    { kind: "position-right", position: [-5.53, 2.134, 0] },
    { kind: "position-tail", position: [0, 1.7, -5.75] },
    { kind: "strobe", position: [5.53, 2.134, -0.05] },
    { kind: "strobe", position: [-5.53, 2.134, -0.05] },
    { kind: "beacon", position: [0, 2.75, -4.68] },
    { kind: "landing", position: [2.0, 2.06, 0.62], direction: pitchedDown(2) },
    { kind: "taxi", position: [2.3, 2.06, 0.6], direction: pitchedDown(6) },
  ];
  const visionJet: readonly AircraftLightInstallation[] = [
    { kind: "position-left", position: [5.93, 1.408, -0.8] },
    { kind: "position-right", position: [-5.93, 1.408, -0.8] },
    { kind: "position-tail", position: [0, 1.62, -5.38] },
    { kind: "strobe", position: [5.93, 1.408, -0.85] },
    { kind: "strobe", position: [-5.93, 1.408, -0.85] },
    { kind: "landing", position: [1.3, 0.85, 0.66], direction: pitchedDown(2) },
    { kind: "taxi", position: [-1.3, 0.85, 0.66], direction: pitchedDown(6) },
  ];
  const f35b: readonly AircraftLightInstallation[] = [
    { kind: "position-left", position: [5.36, 2.15, -1.2] },
    { kind: "position-right", position: [-5.36, 2.15, -1.2] },
    { kind: "position-tail", position: [2.25, 4.73, -4.82], share: 0.5 },
    { kind: "position-tail", position: [-2.25, 4.73, -4.82], share: 0.5 },
    { kind: "strobe", position: [5.36, 2.15, -1.3] },
    { kind: "strobe", position: [-5.36, 2.15, -1.3] },
    { kind: "beacon", position: [0, 3.32, 1.6] },
    { kind: "beacon", position: [0, 1.03, 1.4] },
    { kind: "landing", position: [0.06, 1.0, 5.42], direction: pitchedDown(3), onGear: true },
    { kind: "taxi", position: [-0.06, 1.0, 5.42], direction: pitchedDown(6), onGear: true },
  ];
  return {
    "cessna-172": cessna,
    "cirrus-vision-jet": visionJet,
    "cirrus-vision-jet-g2": visionJet,
    "cirrus-vision-jet-g3": visionJet,
    "f-35b": f35b,
  };
})();

/** Each kind's colour, linear red, green and blue: aviation red, green and white, and a halogen lamp's warmer white. Scaled to luminance one where used. */
const COLOURS: Record<AircraftLightKind, Rgb> = {
  "position-left": [1, 0.03, 0.01],
  "position-right": [0.02, 1, 0.45],
  "position-tail": [1, 0.95, 0.88],
  strobe: [1, 0.97, 0.95],
  beacon: [1, 0.03, 0.01],
  landing: [1, 0.9, 0.75],
  taxi: [1, 0.9, 0.75],
};

/**
 * Navigation lights in the horizontal plane (25.1391): forward red and
 * green, 40 cd within 10° of dead ahead, 30 cd to 20°, 5 cd to 110° on their
 * own side; the rear white, 20 cd within 70° of dead aft. Above and below, a
 * share of that by the angle from the horizontal (25.1393's table).
 */
export const NAVIGATION_PHOTOMETRY = {
  forward: [[10, 40], [20, 30], [110, 5]] as const,
  rearCd: 20,
  rearFromDeg: 110,
  vertical: [[0, 1], [5, 0.9], [10, 0.8], [15, 0.7], [20, 0.5], [30, 0.3], [40, 0.1], [90, 0.05]] as const,
  /** Sector edges are softened over this many degrees, so a light does not flicker on its edge. */
  edgeDeg: 2,
} as const;

/**
 * Anti-collision lights flash, so their peak is above the 400 cd effective
 * intensity 25.1401 requires: by the Blondel-Rey relation a flash of t
 * seconds at peak I reads as I t / (0.2 + t). Strobes on the wingtips, white,
 * 50 flashes a minute; beacons red, 45 a minute, between the strobes' flashes.
 */
export const ANTI_COLLISION = {
  effectiveCd: 400,
  blondelReySeconds: 0.2,
  strobe: { periodSeconds: 1.2, flashSeconds: 0.1, phaseSeconds: 0 },
  beacon: { periodSeconds: 60 / 45, flashSeconds: 0.15, phaseSeconds: 0.6 },
} as const;

/**
 * Beams: a 100 W sealed-beam landing lamp gives about 100,000 cd on its axis
 * across a narrow beam, a taxi lamp about 30,000 cd across a wide one. Seen
 * from outside the beam, from in front, the lens still glows at a small
 * share of the peak.
 */
export const BEAMS = {
  landing: { peakCd: 100_000, innerDeg: 5, outerDeg: 12 },
  taxi: { peakCd: 30_000, innerDeg: 12, outerDeg: 25 },
  lensGlowShare: 0.002,
} as const;

/** The gear position, of 0 to 1, above which a gear leg's lamps are lit. */
export const GEAR_LIGHTS_DOWN = 0.95;

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * The share of the horizontal intensity above or below the horizontal. 25.1393
 * gives each range's minimum (0.9 from 0° to 5°, 0.8 to 10°, …); this runs
 * straight between those minimums at each range's far end, so it meets all
 * of them and never steps as a viewer crosses a range's edge.
 */
function verticalShare(elevationDeg: number): number {
  const angle = Math.min(90, Math.abs(elevationDeg));
  const table = NAVIGATION_PHOTOMETRY.vertical;
  for (let index = 1; index < table.length; index++) {
    const [from, high] = table[index - 1];
    const [to, low] = table[index];
    if (angle <= to) return high + ((low - high) * (angle - from)) / (to - from);
  }
  return table[table.length - 1][1];
}

/**
 * A navigation light's intensity, cd, towards a viewer along a unit vector
 * in the body's axes. Bearings are measured from dead ahead, positive to the
 * left (+X).
 */
export function navigationIntensityCd(kind: "position-left" | "position-right" | "position-tail", towardViewer: Vec3): number {
  const [x, y, z] = towardViewer;
  const bearingDeg = Math.atan2(x, z) / RAD;
  const elevationDeg = Math.asin(Math.max(-1, Math.min(1, y))) / RAD;
  const { edgeDeg } = NAVIGATION_PHOTOMETRY;
  let horizontal = 0;
  if (kind === "position-tail") {
    horizontal = NAVIGATION_PHOTOMETRY.rearCd * smoothstep(NAVIGATION_PHOTOMETRY.rearFromDeg - edgeDeg / 2, NAVIGATION_PHOTOMETRY.rearFromDeg + edgeDeg / 2, Math.abs(bearingDeg));
  } else {
    // Its own side only: the left light from dead ahead round to the left, the right one to the right.
    const own = kind === "position-left" ? bearingDeg : -bearingDeg;
    horizontal = smoothstep(-edgeDeg / 2, edgeDeg / 2, own) * forwardIntensityCd(Math.abs(own));
  }
  return horizontal * verticalShare(elevationDeg);
}

/** The forward lights' table by bearing from dead ahead, its steps softened. */
function forwardIntensityCd(bearingDeg: number): number {
  const { forward, edgeDeg } = NAVIGATION_PHOTOMETRY;
  let intensity = 0;
  for (let index = forward.length - 1; index >= 0; index--) {
    const [limit, value] = forward[index];
    const beyond = index + 1 < forward.length ? intensity : 0;
    intensity = beyond + (value - beyond) * (1 - smoothstep(limit - edgeDeg / 2, limit + edgeDeg / 2, bearingDeg));
  }
  return intensity;
}

/** Whether a flashing light is lit at a time, s, and its peak, cd, that makes its effective intensity the required one. */
export function flash(kind: "strobe" | "beacon", timeSeconds: number): { lit: boolean; peakCd: number; nextChangeSeconds: number } {
  const { periodSeconds, flashSeconds, phaseSeconds } = ANTI_COLLISION[kind];
  const peakCd = (ANTI_COLLISION.effectiveCd * (ANTI_COLLISION.blondelReySeconds + flashSeconds)) / flashSeconds;
  const into = (((timeSeconds - phaseSeconds) % periodSeconds) + periodSeconds) % periodSeconds;
  const lit = into < flashSeconds;
  return { lit, peakCd, nextChangeSeconds: timeSeconds + (lit ? flashSeconds - into : periodSeconds - into) };
}

/** A beam's intensity, cd, at an angle from its axis given by its cosine: the beam, and the lens's glow from in front. */
export function beamIntensityCd(kind: "landing" | "taxi", cosineFromAxis: number): number {
  const beam = BEAMS[kind];
  if (cosineFromAxis <= 0) return 0;
  const inBeam = smoothstep(Math.cos(beam.outerDeg * RAD), Math.cos(beam.innerDeg * RAD), cosineFromAxis);
  return beam.peakCd * Math.max(inBeam, BEAMS.lensGlowShare * cosineFromAxis);
}

/** A kind's colour as per-band candelas for one candela of luminous intensity. */
export function lightColour(kind: AircraftLightKind): Rgb {
  const colour = COLOURS[kind];
  const luminance = 0.2126 * colour[0] + 0.7152 * colour[1] + 0.0722 * colour[2];
  return [colour[0] / luminance, colour[1] / luminance, colour[2] / luminance];
}
