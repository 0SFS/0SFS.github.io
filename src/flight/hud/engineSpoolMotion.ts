import type { EngineRotorBladeCounts } from "../aircraft/engineRotorDefinitions";

/** Aircraft shaft indicators, slowed to a readable visual speed; never physical rotor RPM. */
export interface EngineSpoolSpeeds { outer: number; inner: number | null }
export interface EngineSpoolFrame {
  /** Continuous requested phases; the renderer wraps only its displayed phases. */
  outerAngle: number;
  innerAngle: number | null;
  /** Phase at 100% shaft speed, used to keep the display limit proportional to RPM. */
  maxAngle?: number;
}

/** Below half a brightness-pattern pitch so its two lobes retain a forward correspondence. */
export const DEFAULT_MAX_PATTERN_STEP = 0.45;

const TAU = Math.PI * 2;
const finiteSpeed = (value: number): number => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/**
 * Both shafts share the selected scale, preserving their displayed speed ratio.
 * The renderer limits this requested scale using its actual accepted drawing cadence.
 * A zero drawing budget or missing blade metadata disables the indicators.
 */
export function engineSpoolDisplayRate(
  requestedTurnsPerSecond: number, maxFps: number, blades?: EngineRotorBladeCounts,
): number {
  if (!blades || !Number.isFinite(requestedTurnsPerSecond) || !Number.isFinite(maxFps) || maxFps <= 0) return 0;
  const mostBlades = Math.max(blades.outer, blades.inner ?? 0);
  if (!Number.isFinite(mostBlades) || mostBlades <= 0) return 0;
  return Math.max(0, requestedTurnsPerSecond);
}

/** Integrates simulation time, so pause and redraws cannot advance the rotors. */
export function createEngineSpoolMotion() {
  const frame: EngineSpoolFrame & { maxAngle: number } = { outerAngle: 0, innerAngle: null, maxAngle: 0 };
  let previousTime: number | null = null;
  let outerRate = 0;
  let innerRate = 0;
  let maxRate = 0;
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
        frame.outerAngle += dt * (outerRate + nextOuter) / 2;
        if (frame.innerAngle !== null) {
          frame.innerAngle += dt * ((hadInner ? innerRate : nextInner) + nextInner) / 2;
        }
        frame.maxAngle += dt * (maxRate + scale) / 2;
      }
      // Rewinds/missing time rebase without inventing a spin or replaying elapsed wall time.
      previousTime = time;
      outerRate = nextOuter;
      innerRate = nextInner;
      maxRate = scale;
      return frame;
    },
    reset() {
      previousTime = null;
      outerRate = innerRate = maxRate = frame.outerAngle = frame.maxAngle = 0;
      frame.innerAngle = null;
    },
  };
}
