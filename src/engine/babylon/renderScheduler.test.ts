import { describe, expect, it, vi } from "vitest";

import { createRenderScheduler } from "./renderScheduler";

interface FakeRaf {
  request: (cb: FrameRequestCallback) => number;
  cancel: (handle: number) => void;
  run: () => void;
  pending: () => number;
}

function createFakeRaf(): FakeRaf {
  let nextId = 1;
  const queue = new Map<number, FrameRequestCallback>();
  return {
    request(cb) {
      const id = nextId++;
      queue.set(id, cb);
      return id;
    },
    cancel(id) {
      queue.delete(id);
    },
    run() {
      const entries = Array.from(queue.entries());
      queue.clear();
      for (const [, cb] of entries) cb(performance.now());
    },
    pending() {
      return queue.size;
    },
  };
}

describe("createRenderScheduler", () => {
  it("does not render until requested", () => {
    const raf = createFakeRaf();
    const tick = vi.fn();
    createRenderScheduler({
      tick,
      requestFrame: raf.request,
      cancelFrame: raf.cancel,
    });
    expect(raf.pending()).toBe(0);
    expect(tick).not.toHaveBeenCalled();
  });

  it("renders one frame per requestRender() and then idles", () => {
    const raf = createFakeRaf();
    const tick = vi.fn();
    const scheduler = createRenderScheduler({
      tick,
      requestFrame: raf.request,
      cancelFrame: raf.cancel,
    });
    scheduler.requestRender();
    expect(raf.pending()).toBe(1);
    raf.run();
    expect(tick).toHaveBeenCalledTimes(1);
    expect(raf.pending()).toBe(0);
    raf.run();
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("coalesces multiple requestRender() calls into a single frame", () => {
    const raf = createFakeRaf();
    const tick = vi.fn();
    const scheduler = createRenderScheduler({
      tick,
      requestFrame: raf.request,
      cancelFrame: raf.cancel,
    });
    scheduler.requestRender();
    scheduler.requestRender();
    scheduler.requestRender();
    expect(raf.pending()).toBe(1);
    raf.run();
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("keeps rendering while continuous mode is held", () => {
    const raf = createFakeRaf();
    const tick = vi.fn();
    const scheduler = createRenderScheduler({
      tick,
      requestFrame: raf.request,
      cancelFrame: raf.cancel,
    });
    scheduler.beginContinuous();
    expect(raf.pending()).toBe(1);
    raf.run();
    expect(raf.pending()).toBe(1);
    raf.run();
    expect(tick).toHaveBeenCalledTimes(2);
    scheduler.endContinuous();
    raf.run();
    expect(raf.pending()).toBe(0);
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it("refcounts continuous mode", () => {
    const raf = createFakeRaf();
    const scheduler = createRenderScheduler({
      tick: () => undefined,
      requestFrame: raf.request,
      cancelFrame: raf.cancel,
    });
    scheduler.beginContinuous();
    scheduler.beginContinuous();
    expect(scheduler.isContinuous()).toBe(true);
    scheduler.endContinuous();
    expect(scheduler.isContinuous()).toBe(true);
    scheduler.endContinuous();
    expect(scheduler.isContinuous()).toBe(false);
  });

  it("keeps rendering while shouldKeepRendering() is true", () => {
    const raf = createFakeRaf();
    let active = true;
    const tick = vi.fn();
    const scheduler = createRenderScheduler({
      tick,
      shouldKeepRendering: () => active,
      requestFrame: raf.request,
      cancelFrame: raf.cancel,
    });
    scheduler.requestRender();
    raf.run();
    expect(tick).toHaveBeenCalledTimes(1);
    expect(raf.pending()).toBe(1); // still active
    raf.run();
    expect(tick).toHaveBeenCalledTimes(2);
    active = false;
    raf.run(); // shouldKeepRendering became false during this frame
    expect(tick).toHaveBeenCalledTimes(3);
    expect(raf.pending()).toBe(0);
  });

  it("pauses and resumes", () => {
    const raf = createFakeRaf();
    const tick = vi.fn();
    const scheduler = createRenderScheduler({
      tick,
      requestFrame: raf.request,
      cancelFrame: raf.cancel,
    });
    scheduler.beginContinuous();
    expect(raf.pending()).toBe(1);
    scheduler.setPaused(true);
    expect(raf.pending()).toBe(0);
    scheduler.requestRender();
    expect(raf.pending()).toBe(0);
    scheduler.setPaused(false);
    expect(raf.pending()).toBe(1);
    raf.run();
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("stop() cancels pending frame and prevents future ones", () => {
    const raf = createFakeRaf();
    const tick = vi.fn();
    const scheduler = createRenderScheduler({
      tick,
      requestFrame: raf.request,
      cancelFrame: raf.cancel,
    });
    scheduler.requestRender();
    scheduler.stop();
    expect(raf.pending()).toBe(0);
    scheduler.requestRender();
    expect(raf.pending()).toBe(0);
    expect(tick).not.toHaveBeenCalled();
  });
});
