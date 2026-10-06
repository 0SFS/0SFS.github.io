import { describe, expect, it, vi } from "vitest";
import { createEngineSpoolAnimation, type EngineSpoolAnimationSample } from "./engineSpoolAnimation";
import type { EngineSpoolFrame } from "./engineSpoolMotion";

const RUNNING: EngineSpoolAnimationSample = {
  simTimeS: 0, speeds: { outer: 1, inner: 0.5 }, turnsPerSecond: 2, enabled: true, held: false,
};

function harness() {
  let now = 0;
  let id = 0;
  let drawable = true;
  const callbacks = new Map<number, FrameRequestCallback>();
  const visibility = Object.assign(new EventTarget(), { hidden: false });
  const frames: EngineSpoolFrame[] = [];
  const draw = vi.fn((frame: EngineSpoolFrame) => frames.push({ ...frame }));
  const animation = createEngineSpoolAnimation({
    now: () => now, draw, document: visibility, canDraw: () => drawable,
    requestFrame: callback => { callbacks.set(++id, callback); return id; },
    cancelFrame: key => { callbacks.delete(key); },
  });
  const update = (at: number, sample: Partial<EngineSpoolAnimationSample> = {}): void => {
    now = at;
    animation.update({ ...RUNNING, ...sample });
  };
  const tick = (at: number): void => {
    now = at;
    const pending = [...callbacks.values()];
    callbacks.clear();
    for (const callback of pending) callback(at);
  };
  const hidden = (value: boolean): void => {
    visibility.hidden = value;
    visibility.dispatchEvent(new Event("visibilitychange"));
  };
  return { animation, callbacks, frames, draw, update, tick, hidden,
    setDrawable(value: boolean) { drawable = value; } };
}

describe("independent shaft animation", () => {
  it("draws at display cadence between slower source samples and stops at the known target", () => {
    const h = harness();
    h.update(0);
    const sourceInterval = 1000 / 30;
    h.update(sourceInterval, { simTimeS: 1 / 30 });
    expect(h.callbacks.size).toBe(1);
    for (let step = 1; step <= 4; step++) {
      h.tick(sourceInterval + sourceInterval * step / 4);
      expect(h.frames.at(-1)?.outerAngle).toBeCloseTo(2 * Math.PI * 2 / 30 * step / 4);
      expect(h.frames.at(-1)?.innerAngle).toBeCloseTo(Math.PI * 2 / 30 * step / 4);
    }
    expect(h.draw).toHaveBeenCalledTimes(5);
    expect(h.callbacks.size).toBe(0);
    h.tick(2000);
    expect(h.draw).toHaveBeenCalledTimes(5);
    h.animation.destroy();
  });

  it("keeps interpolation alive across repeated fixed-step timestamps", () => {
    const h = harness();
    h.update(0);
    h.update(100, { simTimeS: 0.1 });
    h.update(110, { simTimeS: 0.1 });
    expect(h.callbacks.size).toBe(1);
    h.tick(150);
    expect(h.frames.at(-1)?.outerAngle).toBeCloseTo(0.2 * Math.PI);
    h.update(175, { simTimeS: 0.1 });
    h.tick(200);
    expect(h.frames.at(-1)?.outerAngle).toBeCloseTo(0.4 * Math.PI);
    expect(h.callbacks.size).toBe(0);
    h.animation.destroy();
  });

  it("stops immediately on hold, disabled rendering or stopped shafts without catching up", () => {
    for (const inactive of [{ held: true }, { enabled: false }, { speeds: { outer: 0, inner: 0 } }]) {
      const h = harness();
      h.update(0);
      h.update(100, { simTimeS: 0.1 });
      h.tick(125);
      const stopped = h.frames.at(-1);
      h.update(130, { simTimeS: 0.1, ...inactive });
      expect(h.callbacks.size).toBe(0);
      h.tick(1000);
      expect(h.frames.at(-1)).toEqual(stopped);
      h.animation.destroy();
    }
  });

  it("rebases rewinds, missing time and settings changes without an angular jump", () => {
    for (const changed of [{ simTimeS: -1 }, { simTimeS: null }, { turnsPerSecond: 4 }]) {
      const h = harness();
      h.update(0);
      h.update(100, { simTimeS: 0.1 });
      h.tick(125);
      const stopped = h.frames.at(-1);
      h.update(130, { simTimeS: 0.1, ...changed });
      expect(h.callbacks.size).toBe(0);
      expect(h.frames.at(-1)).toEqual(stopped);
      h.animation.destroy();
    }
  });

  it("sleeps while hidden and resumes only after fresh advancing samples", () => {
    const h = harness();
    h.update(0);
    h.update(100, { simTimeS: 0.1 });
    h.tick(125);
    const visible = h.frames.at(-1);
    h.hidden(true);
    expect(h.callbacks.size).toBe(0);
    h.update(200, { simTimeS: 0.2 });
    h.hidden(false);
    h.update(210, { simTimeS: 0.2 });
    expect(h.callbacks.size).toBe(0);
    expect(h.frames.at(-1)).toEqual(visible);
    h.update(300, { simTimeS: 0.3 });
    expect(h.callbacks.size).toBe(0);
    h.update(400, { simTimeS: 0.4 });
    expect(h.callbacks.size).toBe(1);
    h.tick(450);
    expect(h.frames.at(-1)?.outerAngle).toBeGreaterThan(visible!.outerAngle);
    h.animation.destroy();
  });

  it("honors phone playback duration, changes ring topology and releases its pending frame", () => {
    const h = harness();
    h.update(0);
    h.update(200, { simTimeS: 0.1, interpolationMs: 50 });
    h.tick(225);
    expect(h.frames.at(-1)?.outerAngle).toBeCloseTo(0.2 * Math.PI);
    h.update(230, { simTimeS: 0.1, speeds: { outer: 1, inner: null } });
    expect(h.frames.at(-1)?.innerAngle).toBeNull();
    expect(h.callbacks.size).toBe(0);
    h.update(300, { simTimeS: 0.2, speeds: { outer: 1, inner: null } });
    expect(h.callbacks.size).toBe(1);
    h.animation.destroy();
    expect(h.callbacks.size).toBe(0);
    h.update(400, { simTimeS: 0.3 });
    expect(h.callbacks.size).toBe(0);
  });

  it("uses renderer visibility to stop offscreen work without creating another observer", () => {
    const h = harness();
    h.update(0);
    h.update(100, { simTimeS: 0.1 });
    h.tick(125);
    const last = h.frames.at(-1);
    h.setDrawable(false);
    h.tick(150);
    expect(h.callbacks.size).toBe(0);
    expect(h.frames.at(-1)).toEqual(last);
    h.setDrawable(true);
    h.update(200, { simTimeS: 0.2 });
    expect(h.callbacks.size).toBe(0);
    h.update(300, { simTimeS: 0.3 });
    expect(h.callbacks.size).toBe(1);
    h.animation.destroy();
  });
});
