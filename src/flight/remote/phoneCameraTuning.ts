/**
 * Experimental A/B settings for how the phone's camera trackpad reaches the
 * view. Every default is the behaviour that shipped before these existed, so
 * nothing changes until a pilot picks something else. The investigation behind
 * each option, with the delay it costs, is `docs/phone-controller.md`
 * → *Camera trackpad tuning*.
 */
import {
  flightParameterDefaults,
  flightParameterSpec,
  type FlightParameterId,
  type FlightParameters,
  type FlightParameterValues,
} from "../settings/flightParameters";

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

/** The osfs.camera.* parameters the tuning is kept in, by field. */
const PARAMETER_IDS = {
  send: "osfs.camera.phone.send",
  source: "osfs.camera.phone.source",
  present: "osfs.camera.phone.present",
  bufferMs: "osfs.camera.phone.bufferMs",
  catchUp: "osfs.camera.phone.catchUp",
  predictMs: "osfs.camera.phone.predictMs",
  chaseFrame: "osfs.camera.chaseFrame",
} as const satisfies Record<keyof PhoneCameraTuning, FlightParameterId>;

export const PHONE_CAMERA_PARAMETER_IDS: readonly FlightParameterId[] = Object.values(PARAMETER_IDS);

/** The tuning as its parameters set it. A catch-up of "jump" is 0. */
export function readPhoneCameraTuning(parameters: FlightParameters): PhoneCameraTuning {
  const catchUp = parameters.get(PARAMETER_IDS.catchUp);
  return {
    send: parameters.get(PARAMETER_IDS.send),
    source: parameters.get(PARAMETER_IDS.source),
    present: parameters.get(PARAMETER_IDS.present),
    bufferMs: parameters.get(PARAMETER_IDS.bufferMs),
    catchUp: catchUp === "jump" ? 0 : catchUp,
    predictMs: parameters.get(PARAMETER_IDS.predictMs),
    chaseFrame: parameters.get(PARAMETER_IDS.chaseFrame),
  };
}

/** Tuning as parameter values, to write with `setMany`. */
export function phoneCameraTuningValues(tuning: Partial<PhoneCameraTuning>): Partial<FlightParameterValues> {
  const values: Partial<Record<FlightParameterId, unknown>> = {};
  for (const [field, value] of Object.entries(tuning) as [keyof PhoneCameraTuning, unknown][]) {
    if (value === undefined) continue;
    values[PARAMETER_IDS[field]] = field === "catchUp" && value === 0 ? "jump" : value;
  }
  return values as Partial<FlightParameterValues>;
}

export const DEFAULT_PHONE_CAMERA_TUNING: Readonly<PhoneCameraTuning> = Object.freeze(readPhoneCameraTuning(flightParameterDefaults()));

/** What the measurements recommend: every part of it costs no delay but the 12 ms buffer. */
export const RECOMMENDED_PHONE_CAMERA_TUNING: Readonly<PhoneCameraTuning> = Object.freeze({
  ...DEFAULT_PHONE_CAMERA_TUNING, send: "batch", source: "total", present: "playout", bufferMs: 12, catchUp: 2,
});

function oneOf<T>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? value as T : fallback;
}

function within(field: "bufferMs" | "catchUp" | "predictMs", value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_PHONE_CAMERA_TUNING[field];
  // A catch-up of 0 is "jump", outside the speed bounds.
  if (field === "catchUp" && value === 0) return 0;
  const bounds = flightParameterSpec(PARAMETER_IDS[field]).bounds();
  return value >= bounds.min && value <= bounds.max ? value : DEFAULT_PHONE_CAMERA_TUNING[field];
}

export function normalizePhoneCameraTuning(partial: Partial<PhoneCameraTuning> | null | undefined): PhoneCameraTuning {
  const base = DEFAULT_PHONE_CAMERA_TUNING;
  return {
    send: oneOf(partial?.send, ["timer", "batch"] as const, base.send),
    source: oneOf(partial?.source, ["delta", "total"] as const, base.source),
    present: oneOf(partial?.present, ["arrival", "playout"] as const, base.present),
    bufferMs: within("bufferMs", partial?.bufferMs),
    catchUp: within("catchUp", partial?.catchUp),
    predictMs: within("predictMs", partial?.predictMs),
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

/** The record the tuning used before the registry; migrated once, and kept for rollback. */
export const PHONE_CAMERA_TUNING_STORAGE_KEY = "osfs.phone-camera-tuning";

/** The parameters an old record held, or null when it means nothing here. */
export function migratePhoneCameraTuning(raw: string): Partial<FlightParameterValues> | null {
  try {
    const stored = JSON.parse(raw) as unknown;
    if (typeof stored !== "object" || stored === null) return null;
    return phoneCameraTuningValues(normalizePhoneCameraTuning(stored as Partial<PhoneCameraTuning>));
  } catch {
    return null;
  }
}
