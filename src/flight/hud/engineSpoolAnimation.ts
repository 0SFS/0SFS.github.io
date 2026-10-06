import { createEngineSpoolMotion, type EngineSpoolFrame, type EngineSpoolSpeeds } from "./engineSpoolMotion";

export interface EngineSpoolAnimationSample {
  simTimeS: number | null;
  speeds: EngineSpoolSpeeds;
  turnsPerSecond: number;
  enabled: boolean;
  held?: boolean;
  /** Playback duration for a received interval; otherwise use the source's wall-clock interval. */
  interpolationMs?: number;
}

export interface EngineSpoolAnimationOptions {
  draw(frame: EngineSpoolFrame, now: number): void;
  now?: () => number;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
  document?: Pick<Document, "hidden" | "addEventListener" | "removeEventListener">;
  /** Uses the renderer's existing visibility/backend readiness, without another observer. */
  canDraw?: () => boolean;
}

/**
 * Aircraft instruments own this small animation loop independently of the globe.
 * It plays only simulation time already received, then sleeps until a new sample.
 * The callback draws the shaft canvas; it never polls physics or refreshes other UI.
 */
export function createEngineSpoolAnimation(options: EngineSpoolAnimationOptions) {
  const now = options.now ?? (() => performance.now());
  const requestFrame = options.requestFrame ?? (callback => requestAnimationFrame(callback));
  const cancelFrame = options.cancelFrame ?? (id => cancelAnimationFrame(id));
  const visibility = options.document ?? globalThis.document;
  const motion = createEngineSpoolMotion();
  let sample: EngineSpoolAnimationSample | null = null;
  let receivedTime: number | null = null;
  let receivedAt: number | null = null;
  let displayedTime: number | null = null;
  let interval: { start: number; target: number; at: number; duration: number } | null = null;
  let pending: number | null = null;
  let destroyed = false;
  let suspended = visibility?.hidden ?? false;
  let lastDrawn: EngineSpoolFrame | null = null;
  const canAnimate = (): boolean => !visibility?.hidden && (options.canDraw?.() ?? true);

  const stop = (): void => {
    if (pending !== null) cancelFrame(pending);
    pending = null;
    interval = null;
  };
  const emit = (frame: EngineSpoolFrame, at: number): void => {
    if (visibility?.hidden || (lastDrawn?.outerAngle === frame.outerAngle && lastDrawn.innerAngle === frame.innerAngle)) return;
    lastDrawn = { ...frame };
    options.draw(lastDrawn, at);
  };
  const rebase = (time: number | null, at: number): void => {
    stop();
    displayedTime = time;
    motion.update(null, sample!.speeds, sample!.turnsPerSecond);
    emit(motion.update(time, sample!.speeds, sample!.turnsPerSecond), at);
  };
  const advance = (at: number, draw: boolean): void => {
    if (!interval || !sample) return;
    const fraction = Math.min(1, Math.max(0, (at - interval.at) / interval.duration));
    displayedTime = interval.start + (interval.target - interval.start) * fraction;
    const frame = motion.update(displayedTime, sample.speeds, sample.turnsPerSecond);
    if (draw) emit(frame, at);
    if (fraction === 1) interval = null;
  };
  const tick = (at: number): void => {
    pending = null;
    const drawable = canAnimate();
    if (destroyed || !drawable) {
      if (!drawable) suspended = true;
      stop();
      return;
    }
    advance(at, true);
    if (interval) pending = requestFrame(tick);
  };
  const onVisibility = (): void => {
    stop();
    suspended = true;
  };
  visibility?.addEventListener("visibilitychange", onVisibility);

  return {
    update(next: EngineSpoolAnimationSample): void {
      if (destroyed) return;
      const at = now();
      const time = next.simTimeS !== null && Number.isFinite(next.simTimeS) ? next.simTimeS : null;
      const previous = receivedTime;
      const changedTime = time !== previous;
      const elapsed = receivedAt === null ? 0 : Math.max(0, at - receivedAt);
      const changedConfiguration = sample !== null && (sample.enabled !== next.enabled
        || sample.held !== next.held || sample.turnsPerSecond !== next.turnsPerSecond
        || (sample.speeds.inner === null) !== (next.speeds.inner === null));
      const spinning = (Number.isFinite(next.speeds.outer) && next.speeds.outer > 0)
        || (next.speeds.inner !== null && Number.isFinite(next.speeds.inner) && next.speeds.inner > 0);
      const drawable = canAnimate();
      const active = next.enabled && !next.held && spinning && Number.isFinite(next.turnsPerSecond)
        && next.turnsPerSecond > 0 && drawable;
      if (active && time !== null && previous !== null && time > previous && !changedConfiguration && !suspended) advance(at, false);
      sample = { ...next, speeds: { ...next.speeds } };
      if (receivedAt === null || changedTime) receivedAt = at;
      receivedTime = time;
      if (!drawable) suspended = true;
      if (!active || changedConfiguration || time === null || previous === null || time < previous || suspended) {
        rebase(time, at);
        if (active && time !== null && previous !== null && time > previous) suspended = false;
        return;
      }
      // Repeated physics timestamps must not cancel an interval in progress:
      // displays can refresh faster than the fixed-step simulation advances.
      if (!changedTime) return;
      const duration = next.interpolationMs !== undefined && Number.isFinite(next.interpolationMs)
        ? Math.max(0, next.interpolationMs) : elapsed;
      if (displayedTime === null || duration <= 0) {
        displayedTime = time;
        emit(motion.update(time, next.speeds, next.turnsPerSecond), at);
        return;
      }
      interval = { start: displayedTime, target: time, at, duration };
      if (pending === null) pending = requestFrame(tick);
    },
    destroy(): void {
      destroyed = true;
      stop();
      visibility?.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
