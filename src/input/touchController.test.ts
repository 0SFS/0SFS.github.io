// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { attachTouchController } from "./touchController";

interface TouchLike {
  identifier: number;
  clientX: number;
  clientY: number;
}

function createCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "clientHeight", { value: 800, configurable: true });
  return canvas;
}

function dispatchTouch(
  canvas: HTMLCanvasElement,
  type: "touchstart" | "touchmove" | "touchend" | "touchcancel",
  touches: TouchLike[],
  changedTouches: TouchLike[],
  timestamp = 0,
): void {
  const event = new Event(type, { cancelable: true, bubbles: true });
  Object.defineProperty(event, "touches", { value: touches });
  Object.defineProperty(event, "targetTouches", { value: touches });
  Object.defineProperty(event, "changedTouches", { value: changedTouches });
  Object.defineProperty(event, "timeStamp", { value: timestamp });
  canvas.dispatchEvent(event);
}

function makeCamera(): {
  panBy: ReturnType<typeof vi.fn>;
  orbitBy: ReturnType<typeof vi.fn>;
  zoomBy: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
} {
  return {
    panBy: vi.fn(),
    orbitBy: vi.fn(),
    zoomBy: vi.fn(),
    cancel: vi.fn(),
  };
}

describe("attachTouchController (TouchEvent / continuous transform)", () => {
  it("uses inverted deltas for one-finger pan", () => {
    const canvas = createCanvas();
    const camera = makeCamera();
    const cleanup = attachTouchController(canvas, camera);

    const t0 = [{ identifier: 1, clientX: 20, clientY: 30 }];
    dispatchTouch(canvas, "touchstart", t0, t0, 0);
    const t1 = [{ identifier: 1, clientX: 32, clientY: 48 }];
    dispatchTouch(canvas, "touchmove", t1, t1, 16);

    expect(camera.panBy).toHaveBeenCalledTimes(1);
    expect(camera.panBy).toHaveBeenCalledWith(expect.closeTo(-1.2, 5), expect.closeTo(-1.8, 5), 800);

    cleanup();
  });

  it("cancels stale inertia when a new touch gesture starts", () => {
    const canvas = createCanvas();
    const camera = makeCamera();
    const cleanup = attachTouchController(canvas, camera);

    const t0 = [{ identifier: 1, clientX: 0, clientY: 0 }];
    dispatchTouch(canvas, "touchstart", t0, t0, 0);

    expect(camera.cancel).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("zooms but does not orbit during a pure pinch (centroid stationary)", () => {
    const canvas = createCanvas();
    const camera = makeCamera();
    const cleanup = attachTouchController(canvas, camera);

    // Fingers symmetric around (50, 50), 100px apart vertically.
    const start = [
      { identifier: 1, clientX: 50, clientY: 0 },
      { identifier: 2, clientX: 50, clientY: 100 },
    ];
    dispatchTouch(canvas, "touchstart", [start[0]], [start[0]], 0);
    dispatchTouch(canvas, "touchstart", start, [start[1]], 0);

    // Spread fingers symmetrically — centroid unchanged, distance grows by 30px (30%).
    const spread = [
      { identifier: 1, clientX: 50, clientY: -15 },
      { identifier: 2, clientX: 50, clientY: 115 },
    ];
    dispatchTouch(canvas, "touchmove", spread, spread, 16);

    expect(camera.zoomBy).toHaveBeenCalled();
    expect(camera.orbitBy).not.toHaveBeenCalled();

    cleanup();
  });

  it("orbits but does not zoom during a parallel two-finger swipe", () => {
    const canvas = createCanvas();
    const camera = makeCamera();
    const cleanup = attachTouchController(canvas, camera);

    const start = [
      { identifier: 1, clientX: 100, clientY: 200 },
      { identifier: 2, clientX: 100, clientY: 300 },
    ];
    dispatchTouch(canvas, "touchstart", [start[0]], [start[0]], 0);
    dispatchTouch(canvas, "touchstart", start, [start[1]], 0);

    // Both fingers slide right by 30px — distance unchanged, centroid moves 30px.
    const swiped = [
      { identifier: 1, clientX: 130, clientY: 200 },
      { identifier: 2, clientX: 130, clientY: 300 },
    ];
    dispatchTouch(canvas, "touchmove", swiped, swiped, 16);

    expect(camera.orbitBy).toHaveBeenCalled();
    expect(camera.zoomBy).not.toHaveBeenCalled();

    cleanup();
  });

  it("orbits and zooms simultaneously during a combined gesture", () => {
    const canvas = createCanvas();
    const camera = makeCamera();
    const cleanup = attachTouchController(canvas, camera);

    const start = [
      { identifier: 1, clientX: 100, clientY: 200 },
      { identifier: 2, clientX: 100, clientY: 300 },
    ];
    dispatchTouch(canvas, "touchstart", [start[0]], [start[0]], 0);
    dispatchTouch(canvas, "touchstart", start, [start[1]], 0);

    // Both fingers shift right AND spread apart.
    const combined = [
      { identifier: 1, clientX: 130, clientY: 180 },
      { identifier: 2, clientX: 130, clientY: 320 },
    ];
    dispatchTouch(canvas, "touchmove", combined, combined, 16);

    expect(camera.orbitBy).toHaveBeenCalled();
    expect(camera.zoomBy).toHaveBeenCalled();

    cleanup();
  });

  it("ignores micro-jitter below activation thresholds", () => {
    const canvas = createCanvas();
    const camera = makeCamera();
    const cleanup = attachTouchController(canvas, camera);

    const start = [
      { identifier: 1, clientX: 100, clientY: 200 },
      { identifier: 2, clientX: 100, clientY: 400 },
    ];
    dispatchTouch(canvas, "touchstart", [start[0]], [start[0]], 0);
    dispatchTouch(canvas, "touchstart", start, [start[1]], 0);

    // Sub-pixel-scale wobble: centroid moves < 1px, distance changes by < 1px (~0.5% of 200).
    const jitter = [
      { identifier: 1, clientX: 100, clientY: 200.5 },
      { identifier: 2, clientX: 100, clientY: 400.5 },
    ];
    dispatchTouch(canvas, "touchmove", jitter, jitter, 16);

    expect(camera.orbitBy).not.toHaveBeenCalled();
    expect(camera.zoomBy).not.toHaveBeenCalled();

    cleanup();
  });

  it("orbits on Android Firefox style frames where only one finger moves per event", () => {
    // On Android Firefox the touchmove TouchList still contains both fingers
    // each frame (even though only one finger's position has changed since
    // the previous frame).  A parallel swipe with a 'lagging' finger looks
    // like the centroid moving by half-finger-1-delta and the distance
    // changing by half-finger-1-delta.  Over enough frames this still adds
    // up to a swipe, and orbit should engage well before zoom does.
    const canvas = createCanvas();
    const camera = makeCamera();
    const cleanup = attachTouchController(canvas, camera);

    const f2 = { identifier: 2, clientX: 100, clientY: 400 };
    const startTouches = [{ identifier: 1, clientX: 100, clientY: 200 }, f2];
    dispatchTouch(canvas, "touchstart", [startTouches[0]], [startTouches[0]], 0);
    dispatchTouch(canvas, "touchstart", startTouches, [f2], 0);

    // Finger 1 slides right; finger 2's reported position never changes.
    for (let i = 1; i <= 6; i++) {
      const f1 = { identifier: 1, clientX: 100 + i * 8, clientY: 200 };
      dispatchTouch(canvas, "touchmove", [f1, f2], [f1], i * 16);
    }

    expect(camera.orbitBy).toHaveBeenCalled();

    cleanup();
  });

  it("resets baselines when a finger lifts so the remaining pan does not jump", () => {
    const canvas = createCanvas();
    const camera = makeCamera();
    const cleanup = attachTouchController(canvas, camera);

    const start = [
      { identifier: 1, clientX: 100, clientY: 200 },
      { identifier: 2, clientX: 100, clientY: 300 },
    ];
    dispatchTouch(canvas, "touchstart", [start[0]], [start[0]], 0);
    dispatchTouch(canvas, "touchstart", start, [start[1]], 0);

    // Two-finger swipe.
    const moved = [
      { identifier: 1, clientX: 130, clientY: 200 },
      { identifier: 2, clientX: 130, clientY: 300 },
    ];
    dispatchTouch(canvas, "touchmove", moved, moved, 16);

    camera.panBy.mockClear();
    camera.orbitBy.mockClear();

    // Finger 2 lifts.  Remaining finger is at (130,200) — must be re-baselined,
    // i.e. the next pan should be relative to (130,200), not the original (100,200).
    dispatchTouch(canvas, "touchend", [moved[0]], [moved[1]], 30);
    const after = [{ identifier: 1, clientX: 135, clientY: 205 }];
    dispatchTouch(canvas, "touchmove", after, after, 40);

    expect(camera.panBy).toHaveBeenCalledTimes(1);
    const [dx, dy] = camera.panBy.mock.calls[0];
    // Expected: -(135-130)*0.1*1 = -0.5,  -(205-200)*0.1*1 = -0.5
    expect(dx).toBeCloseTo(-0.5, 5);
    expect(dy).toBeCloseTo(-0.5, 5);

    cleanup();
  });
});
