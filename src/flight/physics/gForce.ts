import type { NumberRange } from "foss-earth/settings";

/**
 * The load on the pilot, and what a load that stays on does to their sight.
 *
 * Positive load drains blood from the head: sight narrows from the edges
 * inward and then goes black. Negative load forces it there, and sight goes
 * red. Neither follows the load at once, and both pass when it is taken off.
 * The model is a vignette's worth of that and no more: one level for each,
 * rising with the load between two thresholds and lagging it. If the person
 * opts in, a pilot whose sight has gone completely black passes out for a
 * time drawn at random, and comes to with sight returning from black.
 */

/**
 * JSBSim's acceleration at the pilot's eyepoint along body Z, in g, without
 * gravity: what an accelerometer under the seat reads. Body Z points down, so
 * level flight reads -1.
 */
export const PILOT_NORMAL_ACCELERATION = "accelerations/n-pilot-z-norm";

export interface GForceReader {
  getPropertyValue(property: string): number;
}

/** The load at the pilot's seat in g: 1 in level flight, more in a pull, negative in a push. */
export function readPilotG(reader: GForceReader): number {
  const g = -reader.getPropertyValue(PILOT_NORMAL_ACCELERATION);
  return Number.isFinite(g) ? g : 1;
}

export interface GVisionSettings {
  /** The loads, in g, at which the black vignette starts (`min`) and covers the view (`max`). */
  blackout: NumberRange;
  /** The negative loads, in g, at which the red vignette covers the view (`min`) and starts (`max`). */
  redout: NumberRange;
  /** Seconds for sight to follow a load that stays on, to within 5%. */
  onsetSeconds: number;
  /** Seconds for sight to come back once the load is off, to within 5%. */
  recoverySeconds: number;
}

/** How far each vignette has closed: 0 is clear, 1 is the whole view. */
export interface GVision {
  blackout: number;
  redout: number;
}

export const CLEAR_G_VISION: GVision = { blackout: 0, redout: 0 };

/** A first-order lag is within 5% of its target after three time constants. */
const SETTLE_TIME_CONSTANTS = 3;
/** Closer than this the level is its target, so a settled vignette stops changing. */
const SETTLED = 1e-4;

function share(value: number, from: number, to: number): number {
  if (from === to) return value >= to ? 1 : 0;
  return Math.min(1, Math.max(0, (value - from) / (to - from)));
}

/** Where each vignette settles if the load stays at `g`. */
export function gVisionTarget(g: number, settings: GVisionSettings): GVision {
  return {
    blackout: share(g, settings.blackout.min, settings.blackout.max),
    redout: share(-g, -settings.redout.max, -settings.redout.min),
  };
}

function follow(level: number, target: number, deltaSeconds: number, settleSeconds: number): number {
  if (settleSeconds <= 0) return target;
  const next = target + (level - target) * Math.exp(-deltaSeconds * SETTLE_TIME_CONSTANTS / settleSeconds);
  return Math.abs(next - target) < SETTLED ? target : next;
}

/** The vignettes after `deltaSeconds` of simulated time at `g`. */
export function stepGVision(vision: GVision, g: number, deltaSeconds: number, settings: GVisionSettings): GVision {
  if (!(deltaSeconds > 0)) return vision;
  const target = gVisionTarget(g, settings);
  const toward = (level: number, goal: number): number =>
    follow(level, goal, deltaSeconds, goal > level ? settings.onsetSeconds : settings.recoverySeconds);
  return { blackout: toward(vision.blackout, target.blackout), redout: toward(vision.redout, target.redout) };
}

export interface PassOutSettings {
  /** The mean time out, in simulated seconds. */
  meanSeconds: number;
  /** The standard deviation of the time out, in seconds. */
  spreadSeconds: number;
}

/** Draws below zero are drawn again; this many in a row leave the mean. */
const MAX_DRAWS = 32;

/** A time out from a bell curve around the mean, cut off at zero. */
export function drawSecondsOut(settings: PassOutSettings, random: () => number = Math.random): number {
  for (let draw = 0; draw < MAX_DRAWS; draw += 1) {
    // Box–Muller: two uniform draws make one standard normal draw. `1 - random()` is never 0.
    const normal = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
    const seconds = settings.meanSeconds + settings.spreadSeconds * normal;
    if (seconds >= 0) return seconds;
  }
  return Math.max(0, settings.meanSeconds);
}

export interface PilotState {
  vision: GVision;
  /** Simulated seconds the pilot has yet to stay out: 0 while conscious. */
  secondsOut: number;
}

export const ALERT_PILOT: PilotState = { vision: CLEAR_G_VISION, secondsOut: 0 };

/**
 * The pilot after `deltaSeconds` of simulated time at `g`. Out, they see
 * nothing and their sight holds at black; coming to, it recovers from there
 * like any other. With `passOut`, sight closing completely puts them out.
 */
export function stepPilot(
  pilot: PilotState,
  g: number,
  deltaSeconds: number,
  settings: GVisionSettings,
  passOut: PassOutSettings | null,
  random: () => number = Math.random,
): PilotState {
  if (!(deltaSeconds > 0)) return pilot;
  if (pilot.secondsOut >= deltaSeconds) return { vision: pilot.vision, secondsOut: pilot.secondsOut - deltaSeconds };
  const vision = stepGVision(pilot.vision, g, deltaSeconds - pilot.secondsOut, settings);
  if (passOut && vision.blackout >= 1) return { vision, secondsOut: drawSecondsOut(passOut, random) };
  return vision === pilot.vision && pilot.secondsOut === 0 ? pilot : { vision, secondsOut: 0 };
}
