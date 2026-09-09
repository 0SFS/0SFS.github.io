import { describe, expect, it } from "vitest";
import {
  MAX_MESSAGE_BYTES, NEUTRAL_CONTROLS, isCentered, isControls, isCounter, neutralize, parseMessage,
  type AircraftStatus, type ControlSurfaceState, type RemoteMessage,
} from "./protocol";

const controls: ControlSurfaceState = {
  elevator: -0.3, aileron: 0.4, rudder: -0.5, throttle: 0.83, pitchTrim: 0.2, flaps: 1 / 3, brake: 0,
};
const status: AircraftStatus = {
  owner: "local", paused: false, viewMode: "third", controls, airspeedKts: 110, altitudeFt: 4321, headingDeg: 231,
};
const envelope = { v: 1 as const, session: "flight-session", epoch: 3 };
const frame = { ...envelope, type: "controls" as const, seq: 123, lease: 4, controls };
const accepted: RemoteMessage[] = [
  { v: 1, type: "hello", secret: "a".repeat(43) },
  { v: 1, type: "reject", reason: "Reload both devices." },
  { ...envelope, type: "welcome", streamId: 1, status },
  { ...envelope, type: "ready" },
  { ...envelope, type: "status", status, message: "Phone paired · Desktop controls" },
  { ...envelope, type: "handoff", controls: neutralize(controls), lease: 5, requestId: 6 },
  { ...envelope, type: "handoffAck", requestId: 6 },
  { ...envelope, type: "granted", requestId: 6, status: { ...status, owner: "phone" } },
  { ...envelope, type: "action", id: 1, lease: 2, action: "requestControl" },
  { ...envelope, type: "action", id: 2, lease: 3, action: "releaseControl" },
  { ...envelope, type: "action", id: 3, lease: 3, action: "setPaused", value: true },
  { ...envelope, type: "action", id: 4, lease: 3, action: "setPaused", value: false },
  { ...envelope, type: "action", id: 5, lease: 3, action: "setViewMode", value: "first" },
  { ...envelope, type: "action", id: 6, lease: 3, action: "setViewMode", value: "third" },
  { ...envelope, type: "ack", id: 2, ok: false, message: "Center controls to take over.", status },
  frame,
  { ...envelope, type: "heartbeat", lease: 7 },
  { ...envelope, type: "heartbeat", lease: 8, status, appliedSeq: 123, receiveToApplyMs: 3.1 },
  { ...envelope, type: "ping", id: 8, sentAt: 1432.45 },
  { ...envelope, type: "pong", id: 8, sentAt: 1432.45 },
];

describe("phone protocol parsing", () => {
  it.each(accepted)("accepts $type as JSON or decoded PeerJS data", (message) => {
    expect(parseMessage(message)).toEqual(message);
    expect(parseMessage(JSON.stringify(message))).toEqual(message);
  });

  it("rejects malformed JSON, primitives, arrays, unsupported versions, and unknown message types", () => {
    for (const input of ["{", "null", "[]", "123", "true", "", null, undefined, 123, false, [],
      { ...frame, v: 2 }, { ...frame, v: "1" }, { ...frame, type: "invented" }, { type: "ready" },
      { ...frame, session: "" }, { ...frame, session: "a".repeat(129) }]) {
      expect(parseMessage(input), JSON.stringify(input)).toBeNull();
    }
  });

  it("rejects missing controls, every invalid range, nonfinite values, and nonnumeric values", () => {
    for (const key of Object.keys(controls)) {
      const signed = ["elevator", "aileron", "rudder", "pitchTrim"].includes(key);
      for (const invalid of [1.001, signed ? -1.001 : -0.001, NaN, Infinity, -Infinity, "0", null, undefined]) {
        const value = { ...controls, [key]: invalid };
        expect(isControls(value), `${key}: ${String(invalid)}`).toBe(false);
        expect(parseMessage({ ...frame, controls: value })).toBeNull();
      }
      expect(isControls({ ...controls, [key]: signed ? -1 : 0 })).toBe(true);
      expect(isControls({ ...controls, [key]: 1 })).toBe(true);
    }
    expect(parseMessage({ ...frame, controls: undefined })).toBeNull();
    expect(parseMessage({ ...frame, controls: [] })).toBeNull();
  });

  it("rejects fractional, negative, nonnumeric, and unsafe counters on all counter-bearing messages", () => {
    for (const message of accepted) {
      for (const key of ["epoch", "streamId", "seq", "lease", "requestId", "id", "appliedSeq"] as const) {
        if (!(key in message)) continue;
        for (const invalid of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, "0", null]) {
          expect(parseMessage({ ...message, [key]: invalid }), `${message.type}.${key}: ${String(invalid)}`).toBeNull();
        }
        expect(parseMessage({ ...message, [key]: 0 })).not.toBeNull();
      }
    }
  });

  it("validates SCTP stream IDs, telemetry, action values, and pairing secrets", () => {
    const action = { ...envelope, type: "action", id: 1, lease: 2 };
    const invalid = [
      { v: 1, type: "hello", secret: "a".repeat(42) },
      { v: 1, type: "hello", secret: "a".repeat(44) },
      { v: 1, type: "hello", secret: `${"a".repeat(42)}+` },
      { v: 1, type: "reject", reason: "" },
      { v: 1, type: "reject", reason: "a".repeat(257) },
      { ...envelope, type: "welcome", streamId: 65535, status },
      { ...envelope, type: "status", status, message: "" },
      { ...envelope, type: "ack", status, message: "Applied", id: 1, ok: 1 },
      { ...envelope, type: "heartbeat", lease: 0, receiveToApplyMs: -1 },
      { ...envelope, type: "heartbeat", lease: 0, receiveToApplyMs: Infinity },
      { ...envelope, type: "ping", id: 0, sentAt: -1 },
      { ...envelope, type: "pong", id: 0, sentAt: Infinity },
      { ...action, action: "requestControl", value: true },
      { ...action, action: "releaseControl", value: false },
      { ...action, action: "setPaused" },
      { ...action, action: "setPaused", value: "false" },
      { ...action, action: "setViewMode", value: "cockpit" },
      { ...action, action: "setViewMode", value: true },
      { ...action, action: "reset" },
    ];
    for (const value of invalid) expect(parseMessage(value), JSON.stringify(value)).toBeNull();
    expect(parseMessage({ ...envelope, type: "welcome", streamId: 65534, status })).not.toBeNull();
    for (const [key, value] of Object.entries({
      owner: "spectator", paused: "false", viewMode: "cockpit", controls: null,
      airspeedKts: Infinity, altitudeFt: "4321", headingDeg: NaN,
    })) {
      expect(parseMessage({ ...envelope, type: "heartbeat", lease: 0, status: { ...status, [key]: value } })).toBeNull();
    }
  });

  it("enforces UTF-8 bytes, including the exact 2 KiB boundary", () => {
    const base = JSON.stringify({ ...frame, padding: "" });
    const remaining = MAX_MESSAGE_BYTES - new TextEncoder().encode(base).byteLength;
    const exact = JSON.stringify({ ...frame, padding: "x".repeat(remaining) });
    expect(new TextEncoder().encode(exact).byteLength).toBe(MAX_MESSAGE_BYTES);
    expect(parseMessage(exact)).not.toBeNull();
    expect(parseMessage(JSON.stringify({ ...frame, padding: "x".repeat(remaining + 1) }))).toBeNull();
    const unicode = JSON.stringify({ ...frame, padding: "😀".repeat(Math.floor(remaining / 4) + 1) });
    expect(unicode.length).toBeLessThan(MAX_MESSAGE_BYTES);
    expect(new TextEncoder().encode(unicode).byteLength).toBeGreaterThan(MAX_MESSAGE_BYTES);
    expect(parseMessage(unicode)).toBeNull();
  });

  it("fails closed for unencodable values and copies incoming objects", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(parseMessage(cycle)).toBeNull();
    expect(parseMessage({ ...frame, seq: 1n })).toBeNull();
    const input = { ...frame, controls: { ...controls } };
    const parsed = parseMessage(input);
    input.controls.throttle = 0;
    expect(parsed).toEqual(frame);
  });
});

describe("phone control helpers", () => {
  it("neutralizes only transient controls without mutating the source", () => {
    const original = { ...controls, brake: 1 };
    expect(neutralize(original)).toEqual({ ...controls, elevator: 0, aileron: 0, rudder: 0, brake: 0 });
    expect(original).toEqual({ ...controls, brake: 1 });
  });

  it("requires centered sticks and a fully released brake while retaining arbitrary persistent settings", () => {
    expect(isCentered(neutralize(controls))).toBe(true);
    expect(isCentered({ ...NEUTRAL_CONTROLS, elevator: 0.03, aileron: -0.03, rudder: 0.03 })).toBe(true);
    for (const key of ["elevator", "aileron", "rudder"]) {
      expect(isCentered({ ...NEUTRAL_CONTROLS, [key]: 0.031 })).toBe(false);
      expect(isCentered({ ...NEUTRAL_CONTROLS, [key]: -0.031 })).toBe(false);
    }
    expect(isCentered({ ...NEUTRAL_CONTROLS, brake: 0.001 })).toBe(false);
  });

  it("permits safe nonnegative counters including zero", () => {
    expect(isCounter(0)).toBe(true);
    expect(isCounter(Number.MAX_SAFE_INTEGER)).toBe(true);
    for (const value of [-1, 0.1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, "1", null]) {
      expect(isCounter(value)).toBe(false);
    }
  });
});
