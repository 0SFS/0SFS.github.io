import type { EngineRotorBladeCounts } from "../aircraft/engineRotorDefinitions";

/** Aircraft shaft indicators, slowed to a readable visual speed; never physical rotor RPM. */
export interface EngineSpoolSpeeds { outer: number; inner: number | null }
export interface EngineSpoolFrame { outerAngle: number; innerAngle: number | null }

const TAU = Math.PI * 2;
const finiteSpeed = (value: number): number => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/**
 * Identical blade markers repeat once per blade pitch. Four frames per pitch
 * keeps the chosen cadence below that pattern's temporal Nyquist limit.
 * Both shafts share this scale, preserving their displayed speed ratio.
 * A stalled/lower-rate browser can still strobe; this is a readable cue, not
 * an instrument measuring physical blade motion.
 */
export function engineSpoolDisplayRate(
  requestedTurnsPerSecond: number, maxFps: number, blades?: EngineRotorBladeCounts,
): number {
  if (!blades || !Number.isFinite(requestedTurnsPerSecond) || !Number.isFinite(maxFps)) return 0;
  const mostBlades = Math.max(blades.outer, blades.inner ?? 0);
  if (!Number.isFinite(mostBlades) || mostBlades <= 0) return 0;
  return Math.max(0, Math.min(requestedTurnsPerSecond, maxFps / (4 * mostBlades)));
}

/** Integrates simulation time, so pause and redraws cannot advance the rotors. */
export function createEngineSpoolMotion() {
  const frame: EngineSpoolFrame = { outerAngle: 0, innerAngle: null };
  let previousTime: number | null = null;
  let outerRate = 0;
  let innerRate = 0;
  return {
    update(simTimeS: number | null, speeds: EngineSpoolSpeeds, maxTurnsPerSecond: number): EngineSpoolFrame {
      const scale = Number.isFinite(maxTurnsPerSecond) ? Math.max(0, maxTurnsPerSecond) * TAU : 0;
      const nextOuter = finiteSpeed(speeds.outer) * scale;
      const nextInner = finiteSpeed(speeds.inner ?? 0) * scale;
      const time = simTimeS !== null && Number.isFinite(simTimeS) ? simTimeS : null;
      const dt = time !== null && previousTime !== null ? time - previousTime : 0;
      const hadInner = frame.innerAngle !== null;
      if (speeds.inner === null) frame.innerAngle = null;
      else if (!hadInner) frame.innerAngle = 0;
      if (dt > 0) {
        frame.outerAngle = (frame.outerAngle + dt * (outerRate + nextOuter) / 2) % TAU;
        if (frame.innerAngle !== null) {
          frame.innerAngle = (frame.innerAngle + dt * ((hadInner ? innerRate : nextInner) + nextInner) / 2) % TAU;
        }
      }
      // Rewinds/missing time rebase without inventing a spin or replaying elapsed wall time.
      previousTime = time;
      outerRate = nextOuter;
      innerRate = nextInner;
      return frame;
    },
    reset() {
      previousTime = null;
      outerRate = innerRate = frame.outerAngle = 0;
      frame.innerAngle = null;
    },
  };
}
