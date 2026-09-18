import type { ControlSurfaceState } from "../flight/input/flightInputManager";

export type { ControlSurfaceState };
export const PROTOCOL_VERSION = 1;
export const PROTOCOL_MISMATCH_MESSAGE = "Unsupported phone protocol. Reload both devices.";
export const MAX_MESSAGE_BYTES = 2048;
export const STALE_MS = 250;
export const HANDOFF_MS = 2000;
export const CONTROL_INTERVAL_MS = 1000 / 60;
export const HEARTBEAT_MS = 50;
export const FLAP_PRESETS = [0, 1 / 3, 2 / 3, 1] as const;
/** Additive heartbeat field; v1 peers without it simply ignore the key. */
export const HAPTIC_FEEDBACK_VERSION = 1;
export const MAX_HAPTIC_PULSE_MS = 60;
/** Feedback older than this is dropped by the host and must not be scheduled beyond it by the phone. */
export const HAPTIC_FEEDBACK_TTL_MS = 90;

/**
 * Everything the desktop HUD's engine widget draws, so the phone can draw the
 * same widget. A value the flight model does not publish is absent, never zero
 * — the widget decides what an absent value looks like, on both screens.
 *
 * `phase` travels as the label the HUD already derived ("RUNNING", "STARTING"),
 * not as an id: a phase added to the flight model still prints on an older
 * controller, which only loses the colour it cannot look up.
 */
export interface EngineStatus {
  phase: string;
  n1?: number;
  n2?: number;
  /** A piston engine's shaft speed; a turbine shows its spools instead. */
  rpm?: number;
  thrustLbf?: number;
  fuelFlowPph?: number;
  /** Only when the model publishes volume flow; otherwise the widget converts. */
  fuelFlowGph?: number;
}

export interface AircraftStatus {
  owner: "local" | "phone";
  paused: boolean;
  viewMode: "first" | "third";
  controls: ControlSurfaceState;
  airspeedKts: number;
  altitudeFt: number;
  headingDeg: number;
  /**
   * Absent from a host that predates gear support. The phone treats that as
   * "this host has no gear control" and keeps its G button disabled, so it
   * never sends a `setGearDown` an older host would reject. Advertising the
   * capability this way avoids a protocol version bump for an additive field.
   */
  gearDown?: boolean;
  /** Absent from a host with no engine reading yet, and from one that predates this field. */
  engine?: EngineStatus;
}
/**
 * What the camera trackpad did since the last frame, not where it is: `yaw` and
 * `pitch` are the swipe as a fraction of the pad, and `zoom` is the ratio a
 * pinch changed the finger spread by. Deltas rather than a held rate, because a
 * trackpad is 1:1 with the finger — the host turns a fraction of a pad into an
 * angle with its own sensitivity, the way it already does for a mouse drag, and
 * neither end has to agree on a frame rate for the gesture to land.
 *
 * A dropped frame therefore costs that frame's movement rather than desyncing
 * anything, which is the right failure for a camera on an unreliable channel.
 *
 * Additive on v1, like `gearDown` and `feedback`: a frame without it moves no
 * camera, so a peer that never sends one behaves exactly as before.
 */
export interface CameraAim { yaw: number; pitch: number; zoom?: number }
/** A pinch cannot more than double or halve the view in one frame. */
export const MIN_CAMERA_ZOOM_STEP = 0.5;
export const MAX_CAMERA_ZOOM_STEP = 2;
export const NEUTRAL_CAMERA_AIM: CameraAim = { yaw: 0, pitch: 0 };
export function isCameraAim(value: unknown): value is CameraAim {
  if (!record(value)) return false;
  if (!["yaw", "pitch"].every(key => finite(value[key]) && Math.abs(value[key] as number) <= 1)) return false;
  return value.zoom === undefined
    || (finite(value.zoom) && value.zoom >= MIN_CAMERA_ZOOM_STEP && value.zoom <= MAX_CAMERA_ZOOM_STEP);
}
export function isAiming(aim: CameraAim | undefined): boolean {
  return Boolean(aim && (aim.yaw !== 0 || aim.pitch !== 0 || (aim.zoom !== undefined && aim.zoom !== 1)));
}

/**
 * The camera gesture so far rather than since the last frame: the sum of every
 * swipe this control epoch (`yaw`, `pitch`, in the same units as `CameraAim`),
 * the natural log of every pinch ratio multiplied together (`zoom`), and the
 * phone time the total is valid as of (`t`, its `performance.now()` — the
 * newest touch the total includes, or when the frame was built if the finger
 * has not moved since). A receiver draws the difference from the total it
 * last drew, so a lost frame costs nothing: any later one carries its movement.
 * `t` lets it draw on the phone's timeline instead of on arrival.
 *
 * Additive on v1 beside `camera`, which a phone keeps sending for hosts that
 * predate this. Never a control: it cannot refresh a lease or take authority.
 */
export interface CameraTotal { yaw: number; pitch: number; zoom: number; t: number }
/** A billion pixels of swiping: far beyond any flight, and still exact in a double. */
export const MAX_CAMERA_TOTAL = 1e6;
export function isCameraTotal(value: unknown): value is CameraTotal {
  return record(value) && ["yaw", "pitch", "zoom"].every(key => finite(value[key]) && Math.abs(value[key] as number) <= MAX_CAMERA_TOTAL)
    && finite(value.t);
}
/**
 * When the phone sends control frames. `timer` (the original, and what a
 * heartbeat without the field means): on each input event, at most 120 a
 * second, plus a 60 Hz timer. `batch`: once after each batch of touch events.
 * Chosen on the computer, which is where the A/B settings live.
 */
export type ControlSendMode = "timer" | "batch";

/**
 * Opt-in measurement, never control. A desktop opened with
 * `?phoneCameraTrace=1` puts `trace: 1` on its heartbeat, and a phone that
 * understands it attaches this to each control frame: when the frame was built,
 * what sent it, and the pointer events folded into it, all on the phone's own
 * clock. Additive on v1 like `camera`: an older desktop ignores the key, an
 * older phone never sends it, and a malformed one is dropped on its own. It
 * cannot move the camera, refresh a lease or take authority.
 */
export interface ControlTrace {
  /** Phone `performance.now()` when the frame was built. */
  at: number;
  /** What sent it: 0 an input event, 1 the control timer, 2 anything else. */
  by: 0 | 1 | 2;
  /** Send attempts the 120/s cap turned away since the previous frame. */
  gated: number;
  /** Control-channel bytes already buffered when it was queued. */
  buf: number;
  /**
   * Camera pointer events folded in: [ms since event.timeStamp, ms since its
   * handler ran, dx px, dy px, coalesced samples]. Ages before `at`, not
   * timestamps, to keep a traced frame small.
   */
  cam: number[][];
  /** Other control input events since the previous frame: [ms since event.timeStamp, ms since its handler ran]. */
  ctl: number[][];
  /** Frames the transport discarded unsent since the previous one: [count, camera dx px, camera dy px]. */
  drop: number[];
}
/** Per list, so a traced frame stays far below `MAX_MESSAGE_BYTES`. */
export const MAX_TRACE_EVENTS = 8;
export function isControlTrace(value: unknown): value is ControlTrace {
  const tuples = (list: unknown, width: number) => Array.isArray(list) && list.length <= MAX_TRACE_EVENTS
    && list.every(item => Array.isArray(item) && item.length === width && item.every(finite));
  return record(value) && finite(value.at) && (value.by === 0 || value.by === 1 || value.by === 2)
    && isCounter(value.gated) && finite(value.buf) && value.buf >= 0
    && tuples(value.cam, 5) && tuples(value.ctl, 2)
    && Array.isArray(value.drop) && value.drop.length === 3 && value.drop.every(finite);
}

export interface Envelope { v: 1; session: string; epoch: number }
export type ActionName = "requestControl" | "releaseControl" | "setPaused" | "setViewMode" | "setGearDown";
export type ActionMessage = Envelope & {
  type: "action"; id: number; lease: number; action: ActionName; value?: boolean | "first" | "third";
};
/** Latest-value presentation cue; pulseMs 0 means stop now. Never a history of impacts. */
export interface HapticFeedbackFrame { v: 1; id: number; pulseMs: number; ttlMs: number }
export type ControlFrame = Envelope & {
  type: "controls"; seq: number; lease: number; controls: ControlSurfaceState; camera?: CameraAim; aim?: CameraTotal; trace?: ControlTrace;
};
export type RemoteMessage =
  | { v: 1; type: "hello"; secret: string }
  | { v: 1; type: "reject"; reason: string }
  | (Envelope & { type: "welcome"; streamId: number; status: AircraftStatus })
  | (Envelope & { type: "ready" })
  | (Envelope & { type: "status"; status: AircraftStatus; message: string })
  | (Envelope & { type: "handoff"; controls: ControlSurfaceState; lease: number; requestId: number })
  | (Envelope & { type: "handoffAck"; requestId: number })
  | (Envelope & { type: "granted"; requestId: number; status: AircraftStatus })
  | ActionMessage
  | (Envelope & { type: "ack"; id: number; ok: boolean; message: string; status: AircraftStatus })
  | ControlFrame
  | (Envelope & { type: "heartbeat"; lease: number; status?: AircraftStatus; appliedSeq?: number; receiveToApplyMs?: number; feedback?: HapticFeedbackFrame; trace?: 1; controlSend?: ControlSendMode })
  | (Envelope & { type: "ping" | "pong"; id: number; sentAt: number });

export const NEUTRAL_CONTROLS: ControlSurfaceState = {
  elevator: 0, aileron: 0, rudder: 0, throttle: 0, pitchTrim: 0, rollTrim: 0, flaps: 0, brake: 0,
};
export function neutralize(controls: ControlSurfaceState): ControlSurfaceState {
  return { ...controls, elevator: 0, aileron: 0, rudder: 0, brake: 0 };
}
export function isCentered(controls: ControlSurfaceState): boolean {
  return Math.abs(controls.elevator) <= 0.03 && Math.abs(controls.aileron) <= 0.03
    && Math.abs(controls.rudder) <= 0.03 && controls.brake === 0;
}
export function isCounter(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function boundedString(value: unknown, limit = 256): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= limit;
}
export function isControls(value: unknown): value is ControlSurfaceState {
  if (!record(value)) return false;
  return ["elevator", "aileron", "rudder", "pitchTrim", "rollTrim"].every(key => finite(value[key]) && Math.abs(value[key]) <= 1)
    && ["throttle", "flaps", "brake"].every(key => finite(value[key]) && value[key] >= 0 && value[key] <= 1);
}
export function isHapticFeedback(value: unknown): value is HapticFeedbackFrame {
  return record(value) && value.v === HAPTIC_FEEDBACK_VERSION && isCounter(value.id)
    && Number.isInteger(value.pulseMs) && (value.pulseMs as number) >= 0 && (value.pulseMs as number) <= MAX_HAPTIC_PULSE_MS
    && Number.isInteger(value.ttlMs) && (value.ttlMs as number) > 0 && (value.ttlMs as number) <= HAPTIC_FEEDBACK_TTL_MS;
}
export function isEngineStatus(value: unknown): value is EngineStatus {
  if (!record(value)) return false;
  // A label, not free text: bounded and printable, because the phone renders it.
  if (typeof value.phase !== "string" || !/^[A-Z][A-Z ]{0,15}$/.test(value.phase)) return false;
  return (["n1", "n2", "rpm", "thrustLbf", "fuelFlowPph", "fuelFlowGph"] as const)
    .every(key => value[key] === undefined || finite(value[key]));
}
function status(value: unknown): value is AircraftStatus {
  return record(value) && (value.owner === "local" || value.owner === "phone")
    && typeof value.paused === "boolean" && (value.viewMode === "first" || value.viewMode === "third")
    && isControls(value.controls) && finite(value.airspeedKts) && finite(value.altitudeFt) && finite(value.headingDeg)
    && (value.gearDown === undefined || typeof value.gearDown === "boolean")
    && (value.engine === undefined || isEngineStatus(value.engine));
}

function parseBoundedRecord(input: unknown): Record<string, unknown> | null {
  let value: unknown;
  try {
    const encoded = typeof input === "string" ? input : JSON.stringify(input);
    if (typeof encoded !== "string" || encoded.length > MAX_MESSAGE_BYTES
      || new TextEncoder().encode(encoded).length > MAX_MESSAGE_BYTES) return null;
    value = JSON.parse(encoded);
  } catch { return null; }
  return record(value) ? value : null;
}

/** Classifies a bounded version envelope only; never accepts its controls or authority. */
export function isProtocolVersionMismatch(input: unknown): boolean {
  const value = parseBoundedRecord(input);
  return Boolean(value && isCounter(value.v) && value.v !== PROTOCOL_VERSION && boundedString(value.type, 64));
}

/** All network inputs are bounded before validation; rejected frames never refresh a lease. */
export function parseMessage(input: unknown): RemoteMessage | null {
  const value = parseBoundedRecord(input);
  if (!value || value.v !== PROTOCOL_VERSION) return null;
  if (value.type === "hello") return typeof value.secret === "string" && /^[A-Za-z0-9_-]{43}$/.test(value.secret) ? value as RemoteMessage : null;
  if (value.type === "reject") return boundedString(value.reason) ? value as RemoteMessage : null;
  if (!boundedString(value.session, 128) || !isCounter(value.epoch)) return null;
  let valid = false;
  switch (value.type) {
    case "ready": valid = true; break;
    case "welcome": valid = isCounter(value.streamId) && value.streamId <= 65534 && status(value.status); break;
    case "status": valid = status(value.status) && boundedString(value.message); break;
    case "handoff": valid = isControls(value.controls) && isCounter(value.lease) && isCounter(value.requestId); break;
    case "handoffAck": valid = isCounter(value.requestId); break;
    case "granted": valid = isCounter(value.requestId) && status(value.status); break;
    case "ack": valid = isCounter(value.id) && typeof value.ok === "boolean" && boundedString(value.message) && status(value.status); break;
    case "controls":
      valid = isCounter(value.seq) && isCounter(value.lease) && isControls(value.controls);
      // The camera is a view, not a flight surface. Malformed aim is dropped on
      // its own rather than costing the frame its control surfaces.
      if (valid && value.camera !== undefined && !isCameraAim(value.camera)) delete value.camera;
      if (valid && value.aim !== undefined && !isCameraTotal(value.aim)) delete value.aim;
      if (valid && value.trace !== undefined && !isControlTrace(value.trace)) delete value.trace;
      break;
    case "heartbeat": valid = isCounter(value.lease) && (value.status === undefined || status(value.status))
      && (value.appliedSeq === undefined || isCounter(value.appliedSeq))
      && (value.receiveToApplyMs === undefined || (finite(value.receiveToApplyMs) && value.receiveToApplyMs >= 0));
      // Unknown or malformed feedback is presentation-only: drop it, keep the lease.
      if (valid && value.feedback !== undefined && !isHapticFeedback(value.feedback)) delete value.feedback;
      if (valid && value.trace !== undefined && value.trace !== 1) delete value.trace;
      if (valid && value.controlSend !== undefined && value.controlSend !== "timer" && value.controlSend !== "batch") delete value.controlSend;
      break;
    case "ping": case "pong": valid = isCounter(value.id) && finite(value.sentAt) && value.sentAt >= 0; break;
    case "action": valid = isCounter(value.id) && isCounter(value.lease) && (
      ((value.action === "requestControl" || value.action === "releaseControl") && value.value === undefined)
      || ((value.action === "setPaused" || value.action === "setGearDown") && typeof value.value === "boolean")
      || (value.action === "setViewMode" && (value.value === "first" || value.value === "third"))
    ); break;
  }
  return valid ? value as RemoteMessage : null;
}
