import { describe, expect, it } from "vitest";
import { NEUTRAL_CONTROLS, type ControlFrame } from "../../remote/protocol";
import { createPhoneCameraReceiver, type PhoneCameraPresentation } from "./phoneCameraPlayout";

let seq = 0;
/** A frame with a delta and, when `total` is given, the phone's running total as of phone time `t`. */
function frame(delta: number, total?: number, t?: number, zoom?: number): ControlFrame {
  return {
    v: 1, type: "controls", session: "s", epoch: 1, seq: seq++, lease: 1, controls: { ...NEUTRAL_CONTROLS },
    ...(delta || zoom ? { camera: { yaw: delta, pitch: 0, ...(zoom ? { zoom } : {}) } } : {}),
    ...(total === undefined ? {} : { aim: { yaw: total, pitch: 0, zoom: zoom ? Math.log(zoom) : 0, t: t ?? 0 } }),
  };
}
const setup = (tuning: Partial<PhoneCameraPresentation> = {}) => {
  const settings: PhoneCameraPresentation = { source: "delta", present: "arrival", bufferMs: 0, catchUp: 2, predictMs: 0, ...tuning };
  return { settings, receiver: createPhoneCameraReceiver(() => settings) };
};
const yawOf = (aim: { yaw: number } | null) => aim?.yaw ?? 0;

describe("phone camera receiver", () => {
  it("draws everything that arrived, once, by default: the original behaviour", () => {
    const { receiver } = setup();
    expect(receiver.receive(frame(.02), 0)).toBe(true);
    receiver.receive(frame(.01, undefined, undefined, 1.5), 5);
    const drawn = receiver.take(10)!;
    expect(drawn.yaw).toBeCloseTo(.03);
    expect(drawn.zoom).toBeCloseTo(1.5);
    expect(receiver.take(20)).toBeNull();
    expect(receiver.receive(frame(0), 25)).toBe(false);
    // Undrawn movement from a connection that then went quiet for longer than
    // the input window is dropped, not lurched into view on resume.
    receiver.receive(frame(.05), 30);
    expect(receiver.take(300)).toBeNull();
    receiver.receive(frame(.04), 310);
    receiver.receive(frame(.01), 600);
    expect(receiver.take(601)!.yaw).toBeCloseTo(.01);
  });

  it("recovers a lost frame's movement from the running total, and ignores the total when told to", () => {
    const total = setup({ source: "total" });
    total.receiver.receive(frame(.01, .01, 0), 0);
    // The frame carrying the next .02 never arrives; the one after carries it anyway.
    total.receiver.receive(frame(.01, .04, 34), 36);
    expect(total.receiver.take(40)!.yaw).toBeCloseTo(.04);
    const delta = setup({ source: "delta" });
    delta.receiver.receive(frame(.01, .01, 0), 0);
    delta.receiver.receive(frame(.01, .04, 34), 36);
    expect(delta.receiver.take(40)!.yaw).toBeCloseTo(.02);
  });

  it("draws the first frame that carries a total, after frames that carried none", () => {
    const { receiver } = setup({ source: "total" });
    receiver.receive(frame(0), 0);
    receiver.receive(frame(0), 16);
    receiver.receive(frame(.03, .03, 30), 32);
    expect(receiver.take(33)!.yaw).toBeCloseTo(.03);
  });

  it("paces irregular arrival into even movement on the phone's timeline", () => {
    const { receiver } = setup({ source: "total", present: "playout", bufferMs: 12 });
    // A steady finger, one touch every 16 ms on the phone, delivered 2 ms or 14 ms late at random.
    const arrivals = [2, 14, 2, 2, 14, 14, 2, 14, 2, 2, 14, 2, 14, 14, 2, 2];
    const events = arrivals.map((late, index) => ({ at: index * 16 + late, stamp: 1_000 + index * 16, total: (index + 1) * .01 }))
      .sort((left, right) => left.at - right.at);
    const drawn: number[] = [];
    let next = 0;
    for (let now = 16; now <= 16 * 16; now += 16) {
      while (next < events.length && events[next].at <= now) {
        receiver.receive(frame(0, events[next].total, events[next].stamp), events[next].at);
        next += 1;
      }
      drawn.push(yawOf(receiver.take(now)));
    }
    // After the first frames fill the buffer, every frame moves exactly one touch's worth.
    for (const movement of drawn.slice(3, -1)) expect(movement).toBeCloseTo(.01, 6);
  });

  it("catches up after a stall at the chosen speed, or jumps when told to", () => {
    for (const [catchUp, largest] of [[2, .02], [0, .03]] as const) {
      const { receiver } = setup({ source: "total", present: "playout", bufferMs: 0, catchUp });
      for (let index = 0; index < 4; index += 1) {
        receiver.receive(frame(0, index * .01, index * 16), index * 16 + 2);
        receiver.take(index * 16 + 3);
      }
      // 48 ms of nothing, rendered frame after rendered frame, then all three frames at once.
      for (const now of [67, 83]) expect(receiver.take(now)).toBeNull();
      for (let index = 4; index < 7; index += 1) receiver.receive(frame(0, index * .01, index * 16), 98);
      const moves = [99, 115, 131, 147].map(now => yawOf(receiver.take(now)));
      expect(Math.max(...moves)).toBeCloseTo(largest, 6);
      expect(moves.reduce((sum, move) => sum + move, 0)).toBeCloseTo(.03, 6);
    }
  });

  it("draws a finger that rested and then moved as resting, not as a slow drift", () => {
    const { receiver } = setup({ source: "total", present: "playout", bufferMs: 0 });
    receiver.receive(frame(0, .01, 0), 1);
    receiver.take(2);
    // Half a second later the finger moves again; nothing arrived in between.
    receiver.receive(frame(0, .02, 500), 501);
    expect(yawOf(receiver.take(502))).toBeCloseTo(.01, 6);
  });

  it("predicts past the newest touch only as far as asked", () => {
    const { receiver } = setup({ source: "total", present: "playout", bufferMs: 0, predictMs: 8 });
    receiver.receive(frame(0, .01, 0), 1);
    receiver.take(1);
    receiver.receive(frame(0, .02, 16), 17);
    receiver.take(17);
    // 20 ms later the next touch is late: carry on at .01 per 16 ms for at most 8 ms.
    expect(yawOf(receiver.take(37))).toBeCloseTo(.005, 6);
    expect(receiver.take(60)).toBeNull();
  });

  it("switches to paced drawing mid-gesture without drawing anything twice", () => {
    const { settings, receiver } = setup({ source: "total" });
    receiver.receive(frame(0, .01, 0), 1);
    receiver.receive(frame(0, .02, 16), 17);
    expect(receiver.take(18)!.yaw).toBeCloseTo(.02);
    settings.present = "playout";
    settings.bufferMs = 12;
    expect(receiver.take(34)).toBeNull();
    receiver.receive(frame(0, .03, 32), 33);
    let total = 0;
    for (let now = 34; now < 120; now += 16) total += yawOf(receiver.take(now));
    expect(total).toBeCloseTo(.01, 6);
    expect(receiver.pending()).toBe(false);
  });

  it("falls back to drawing on arrival for a phone that sends no timestamps", () => {
    const { receiver } = setup({ source: "total", present: "playout", bufferMs: 24 });
    receiver.receive(frame(.02), 0);
    expect(receiver.take(1)!.yaw).toBeCloseTo(.02);
  });

  it("forgets everything on reset", () => {
    const { receiver } = setup({ source: "total" });
    receiver.receive(frame(0, .05, 0), 0);
    receiver.reset();
    expect(receiver.take(1)).toBeNull();
    expect(receiver.pending()).toBe(false);
    receiver.receive(frame(0, .01, 100), 100);
    expect(receiver.take(101)!.yaw).toBeCloseTo(.01);
  });
});
