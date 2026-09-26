import type { FlightParameters } from "../settings/flightParameters";

/** How often the application reads the controller: every frame, or at most this many times a second. */
export type GamepadPollingRate = number | "frame";

export interface GamepadPollingController {
  /** Claim the scheduled poll immediately before flight consumes input. */
  claimFlightFrame(): boolean;
  /** Poll idle frames without competing with the active flight loop. */
  claimIdleFrame(): boolean;
}

function animationFrameTime(): number {
  // All rAF callbacks in one frame share this timestamp, even when the
  // flight callback and the idle callback execute several milliseconds apart.
  const time = typeof document === "undefined" ? null : document.timeline?.currentTime;
  return typeof time === "number" && Number.isFinite(time) ? time : performance.now();
}

/** Polls at osfs.input.gamepadPollingRate, read on every claim. */
export function createGamepadPollingController(parameters: FlightParameters): GamepadPollingController {
  let rate: GamepadPollingRate = parameters.get("osfs.input.gamepadPollingRate");
  let nextDueMs = -Infinity;
  let lastPolledFrame: number | null = null;
  let lastFlightFrame: number | null = null;
  let lastIdleFrame: number | null = null;

  const claim = (frame: number): boolean => {
    const current = parameters.get("osfs.input.gamepadPollingRate");
    if (current !== rate) {
      // A new rate starts a new schedule.
      rate = current;
      nextDueMs = -Infinity;
      lastPolledFrame = null;
    }
    if (frame === lastPolledFrame) return false;
    if (rate !== "frame") {
      // Allow timestamp rounding without accidentally halving a selected rate.
      if (frame + 0.1 < nextDueMs) return false;
      const intervalMs = 1000 / rate;
      if (!Number.isFinite(nextDueMs)) {
        nextDueMs = frame + intervalMs;
      } else {
        // Keep the deadline phase, skip missed polls, and never issue a burst
        // of catch-up reads of the same browser snapshot after a stalled frame.
        const intervals = Math.max(1, Math.floor((frame - nextDueMs) / intervalMs) + 1);
        nextDueMs += intervals * intervalMs;
      }
    }
    lastPolledFrame = frame;
    return true;
  };

  return {
    claimFlightFrame(): boolean {
      const frame = animationFrameTime();
      lastFlightFrame = frame;
      return claim(frame);
    },
    claimIdleFrame(): boolean {
      const frame = animationFrameTime();
      const previousIdleFrame = lastIdleFrame;
      lastIdleFrame = frame;
      // The idle rAF may run before this frame's flight callback. Recent
      // flight activity reserves polling for that callback, not an earlier
      // independent timer. Once flight stops, idle polling takes over.
      if (lastFlightFrame !== null
        && (lastFlightFrame === frame || lastFlightFrame === previousIdleFrame)) return false;
      return claim(frame);
    },
  };
}
