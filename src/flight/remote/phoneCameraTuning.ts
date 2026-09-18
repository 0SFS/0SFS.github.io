/**
 * Experimental A/B settings for how the phone's camera trackpad reaches the
 * view. Every default is the behaviour that shipped before these existed, so
 * nothing changes until a pilot picks something else. The investigation behind
 * each option, with the delay it costs, is `docs/phone-controller.md`
 * → *Camera trackpad tuning*.
 */
export interface PhoneCameraTuning {
  /**
   * When the phone sends a control frame. `timer`: on each input event, at most
   * 120 a second, plus a 60 Hz timer (the original). `batch`: once, right after
   * each batch of touch events, carrying stick and camera together.
   */
  send: "timer" | "batch";
  /**
   * What a frame's camera movement is read from. `delta`: the movement since
   * the previous frame, so a lost or late frame loses its movement (the
   * original). `total`: the gesture's running total, so any later frame
   * carries what a lost one did.
   */
  source: "delta" | "total";
  /**
   * When arrived movement is drawn. `arrival`: all of it in the next rendered
   * frame (the original). `playout`: on the phone's own timeline, `bufferMs`
   * behind the fastest delivery seen, catching up after a stall at no more
   * than `catchUp` times real speed.
   */
  present: "arrival" | "playout";
  bufferMs: number;
  /** Playout only. 0 draws a backlog at once, like `arrival`. */
  catchUp: number;
  /** Playout only: how far past the newest touch to extrapolate. 0 never guesses. */
  predictMs: number;
  /**
   * Which of the aircraft's rotations the chase camera turns with. `attitude`:
   * all of them (the original). `no-roll`: pitch and heading, wings level.
   * `heading`: heading only, horizon level. Affects every chase view, not only
   * the phone's.
   */
  chaseFrame: "attitude" | "no-roll" | "heading";
}

export const PHONE_CAMERA_BUFFER_OPTIONS = [0, 4, 8, 12, 16, 24, 33] as const;
export const PHONE_CAMERA_CATCH_UP_OPTIONS = [1.5, 2, 3, 0] as const;
export const PHONE_CAMERA_PREDICT_OPTIONS = [0, 8, 16] as const;

export const DEFAULT_PHONE_CAMERA_TUNING: Readonly<PhoneCameraTuning> = Object.freeze({
  send: "timer", source: "delta", present: "arrival", bufferMs: 12, catchUp: 2, predictMs: 0, chaseFrame: "attitude",
});

/** What the measurements recommend: every part of it costs no delay but the 12 ms buffer. */
export const RECOMMENDED_PHONE_CAMERA_TUNING: Readonly<PhoneCameraTuning> = Object.freeze({
  ...DEFAULT_PHONE_CAMERA_TUNING, send: "batch", source: "total", present: "playout", bufferMs: 12, catchUp: 2,
});

function oneOf<T>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? value as T : fallback;
}

export function normalizePhoneCameraTuning(partial: Partial<PhoneCameraTuning> | null | undefined): PhoneCameraTuning {
  const base = DEFAULT_PHONE_CAMERA_TUNING;
  return {
    send: oneOf(partial?.send, ["timer", "batch"] as const, base.send),
    source: oneOf(partial?.source, ["delta", "total"] as const, base.source),
    present: oneOf(partial?.present, ["arrival", "playout"] as const, base.present),
    bufferMs: oneOf<number>(partial?.bufferMs, PHONE_CAMERA_BUFFER_OPTIONS, base.bufferMs),
    catchUp: oneOf<number>(partial?.catchUp, PHONE_CAMERA_CATCH_UP_OPTIONS, base.catchUp),
    predictMs: oneOf<number>(partial?.predictMs, PHONE_CAMERA_PREDICT_OPTIONS, base.predictMs),
    chaseFrame: oneOf(partial?.chaseFrame, ["attitude", "no-roll", "heading"] as const, base.chaseFrame),
  };
}

export function samePhoneCameraTuning(left: PhoneCameraTuning, right: PhoneCameraTuning): boolean {
  return (Object.keys(DEFAULT_PHONE_CAMERA_TUNING) as Array<keyof PhoneCameraTuning>).every(key => left[key] === right[key]);
}

/**
 * A short name for a combination, recorded with every traced frame so one
 * trace can hold several variants and still be split apart afterwards.
 */
export function describePhoneCameraTuning(tuning: PhoneCameraTuning): string {
  const present = tuning.present === "arrival" ? "arrival"
    : `playout ${tuning.bufferMs}ms ${tuning.catchUp > 0 ? `${tuning.catchUp}x` : "jump"}${tuning.predictMs ? ` predict${tuning.predictMs}` : ""}`;
  return [tuning.send, tuning.source, present, tuning.chaseFrame].join(" · ");
}

const PREFERENCE_KEY = "osfs.phone-camera-tuning";

export function loadPhoneCameraTuning(storage: Pick<Storage, "getItem"> | null = safeStorage()): PhoneCameraTuning {
  try {
    const raw = storage?.getItem(PREFERENCE_KEY);
    return normalizePhoneCameraTuning(raw ? JSON.parse(raw) as Partial<PhoneCameraTuning> : null);
  } catch {
    return normalizePhoneCameraTuning(null);
  }
}

export function savePhoneCameraTuning(tuning: PhoneCameraTuning, storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try {
    storage?.setItem(PREFERENCE_KEY, JSON.stringify(normalizePhoneCameraTuning(tuning)));
  } catch {
    // Preference persistence is best-effort.
  }
}

function safeStorage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}
