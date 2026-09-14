export const GAMEPAD_POLLING_OPTIONS = [
  { id: "frame", label: "Every frame (recommended)" },
  { id: "120", label: "Up to 120 Hz (8.3 ms)" },
  { id: "60", label: "Up to 60 Hz (16.7 ms)" },
  { id: "30", label: "Up to 30 Hz (33.3 ms)" },
] as const;

export type GamepadPollingRate = typeof GAMEPAD_POLLING_OPTIONS[number]["id"];

export interface GamepadPollingController {
  getRate(): GamepadPollingRate;
  setRate(rate: string): void;
  subscribe(listener: () => void): () => void;
  /** Claim the scheduled poll immediately before flight consumes input. */
  claimFlightFrame(): boolean;
  /** Poll idle frames without competing with the active flight loop. */
  claimIdleFrame(): boolean;
}

const STORAGE_KEY = "osfs.gamepad-polling-rate";

function normalizeRate(value: unknown): GamepadPollingRate {
  return GAMEPAD_POLLING_OPTIONS.find(option => option.id === value)?.id ?? "frame";
}

function readRate(): GamepadPollingRate {
  try {
    return normalizeRate(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return "frame";
  }
}

function animationFrameTime(): number {
  // All rAF callbacks in one frame share this timestamp, even when the
  // flight callback and the idle callback execute several milliseconds apart.
  const time = typeof document === "undefined" ? null : document.timeline?.currentTime;
  return typeof time === "number" && Number.isFinite(time) ? time : performance.now();
}

export function createGamepadPollingController(): GamepadPollingController {
  let rate = readRate();
  let nextDueMs = -Infinity;
  let lastPolledFrame: number | null = null;
  let lastFlightFrame: number | null = null;
  let lastIdleFrame: number | null = null;
  const listeners = new Set<() => void>();

  const claim = (frame: number): boolean => {
    if (frame === lastPolledFrame) return false;
    if (rate !== "frame") {
      // Allow timestamp rounding without accidentally halving a selected rate.
      if (frame + 0.1 < nextDueMs) return false;
      const intervalMs = 1000 / Number(rate);
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
    getRate: () => rate,
    setRate(value): void {
      const next = normalizeRate(value);
      if (next === rate) return;
      rate = next;
      nextDueMs = -Infinity;
      lastPolledFrame = null;
      try {
        window.localStorage.setItem(STORAGE_KEY, rate);
      } catch {
        // The setting still applies for this session when storage is blocked.
      }
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
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
