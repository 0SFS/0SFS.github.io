import { describe, expect, it } from "vitest";
import { createPhoneCameraTrace, isPhoneCameraTraceEnabled } from "./phoneCameraTrace";
import { NEUTRAL_CONTROLS, type ControlFrame } from "../../remote/protocol";

const frame = (seq: number, extra: Partial<ControlFrame> = {}): ControlFrame => ({
  v: 1, type: "controls", session: "s", epoch: 2, seq, lease: 1, controls: { ...NEUTRAL_CONTROLS }, ...extra,
});
const render = { intervalMs: 16.7, dyPx: 0, zoom: 1, orbitYaw: 0, orbitPitch: 0, rollDeg: 0, pitchDeg: 0, headingDeg: 0,
  viewMode: "third" as const, mapDownloadBytesPerSecond: 0 };

describe("phone camera trace", () => {
  it("is opt-in through the flight URL", () => {
    expect(isPhoneCameraTraceEnabled("?phoneCameraTrace=1")).toBe(true);
    expect(isPhoneCameraTraceEnabled("?flightPerf=1")).toBe(false);
  });

  it("keeps both ends of every hop and says where movement went missing", () => {
    const trace = createPhoneCameraTrace({ getSettings: () => ({ recenterMode: "hold", phoneSwipeRadians: 5 }) });
    const phone = { at: 10, by: 0 as const, gated: 0, buf: 0, cam: [[8, 9, 12, 0, 1]], ctl: [], drop: [1, 6, 0] };
    trace.controlFrame(frame(0, { camera: { yaw: .012, pitch: 0 }, trace: phone }), "accepted", 100);
    trace.controlFrame(frame(3), "accepted", 150);
    trace.controlFrame(frame(2), "out-of-order", 151);
    trace.renderFrame({ ...render, at: 101, dxPx: 12, gestureActive: true });
    trace.renderFrame({ ...render, at: 118, dxPx: 0, gestureActive: true });
    expect(trace.summary()).toEqual({
      controlFrames: 3,
      outcomes: { "accepted": 2, "not-owner": 0, "out-of-order": 1, "stale-lease": 0, "handoff-mismatch": 0, "rate-window": 0 },
      missingSeq: 1, discardedOnPhone: 1, renderFrames: 2, idleGestureFrames: 1,
    });
    const exported = JSON.parse(JSON.stringify(trace.export()));
    expect(exported).toMatchObject({ version: 1, settings: { recenterMode: "hold", phoneSwipeRadians: 5 } });
    expect(exported.controlFrames[0]).toMatchObject({ receivedAt: 100, seq: 0, dxPx: 12, outcome: "accepted", phone });
    trace.clear();
    expect(trace.summary().controlFrames).toBe(0);
  });

  it("keeps only the most recent records", () => {
    const trace = createPhoneCameraTrace({ capacity: 2 });
    for (let seq = 0; seq < 5; seq += 1) trace.controlFrame(frame(seq), "accepted", seq);
    expect(trace.export().controlFrames.map((record) => record.seq)).toEqual([3, 4]);
  });
});
