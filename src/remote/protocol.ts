import type { ControlSurfaceState } from "../flight/input/flightInputManager";

export type { ControlSurfaceState };
export const PROTOCOL_VERSION = 1;
export const MAX_MESSAGE_BYTES = 2048;
export const STALE_MS = 250;
export const HANDOFF_MS = 2000;
export const CONTROL_INTERVAL_MS = 1000 / 60;
export const HEARTBEAT_MS = 50;
export const FLAP_PRESETS = [0, 1 / 3, 2 / 3, 1] as const;

export interface AircraftStatus {
  owner: "local" | "phone";
  paused: boolean;
  viewMode: "first" | "third";
  controls: ControlSurfaceState;
  airspeedKts: number;
  altitudeFt: number;
  headingDeg: number;
}
export interface Envelope { v: 1; session: string; epoch: number }
export type ActionName = "requestControl" | "releaseControl" | "setPaused" | "setViewMode";
export type ActionMessage = Envelope & {
  type: "action"; id: number; lease: number; action: ActionName; value?: boolean | "first" | "third";
};
export type ControlFrame = Envelope & {
  type: "controls"; seq: number; lease: number; controls: ControlSurfaceState;
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
  | (Envelope & { type: "heartbeat"; lease: number; status?: AircraftStatus; appliedSeq?: number; receiveToApplyMs?: number })
  | (Envelope & { type: "ping" | "pong"; id: number; sentAt: number });

export const NEUTRAL_CONTROLS: ControlSurfaceState = {
  elevator: 0, aileron: 0, rudder: 0, throttle: 0, pitchTrim: 0, flaps: 0, brake: 0,
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
  return ["elevator", "aileron", "rudder", "pitchTrim"].every(key => finite(value[key]) && Math.abs(value[key]) <= 1)
    && ["throttle", "flaps", "brake"].every(key => finite(value[key]) && value[key] >= 0 && value[key] <= 1);
}
function status(value: unknown): value is AircraftStatus {
  return record(value) && (value.owner === "local" || value.owner === "phone")
    && typeof value.paused === "boolean" && (value.viewMode === "first" || value.viewMode === "third")
    && isControls(value.controls) && finite(value.airspeedKts) && finite(value.altitudeFt) && finite(value.headingDeg);
}

/** All network inputs are bounded before validation; rejected frames never refresh a lease. */
export function parseMessage(input: unknown): RemoteMessage | null {
  let value: unknown;
  try {
    const encoded = typeof input === "string" ? input : JSON.stringify(input);
    if (typeof encoded !== "string" || encoded.length > MAX_MESSAGE_BYTES
      || new TextEncoder().encode(encoded).length > MAX_MESSAGE_BYTES) return null;
    value = JSON.parse(encoded);
  } catch { return null; }
  if (!record(value) || value.v !== PROTOCOL_VERSION) return null;
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
    case "controls": valid = isCounter(value.seq) && isCounter(value.lease) && isControls(value.controls); break;
    case "heartbeat": valid = isCounter(value.lease) && (value.status === undefined || status(value.status))
      && (value.appliedSeq === undefined || isCounter(value.appliedSeq))
      && (value.receiveToApplyMs === undefined || (finite(value.receiveToApplyMs) && value.receiveToApplyMs >= 0)); break;
    case "ping": case "pong": valid = isCounter(value.id) && finite(value.sentAt) && value.sentAt >= 0; break;
    case "action": valid = isCounter(value.id) && isCounter(value.lease) && (
      ((value.action === "requestControl" || value.action === "releaseControl") && value.value === undefined)
      || (value.action === "setPaused" && typeof value.value === "boolean")
      || (value.action === "setViewMode" && (value.value === "first" || value.value === "third"))
    ); break;
  }
  return valid ? value as RemoteMessage : null;
}
