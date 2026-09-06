// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadInputSensitivityPreference, type HudInputMode } from "foss-earth/input";
import { attachFlightCameraInput } from "./flightCameraInput";

const disposers: Array<() => void> = [];
afterEach(() => { disposers.splice(0).forEach((dispose) => dispose()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup(initial: HudInputMode = "mouse") {
  const canvas = document.createElement("canvas");
  let mode = initial;
  const orbit = vi.fn();
  const zoom = vi.fn();
  const dispose = attachFlightCameraInput(canvas, { getMode: () => mode, getSensitivity: loadInputSensitivityPreference, orbit, zoom });
  disposers.push(dispose);
  const pointer = (target: EventTarget, name: string, button: number, x = 0, y = 0, buttons = button === 2 ? 2 : 1) => {
    const event = new MouseEvent(name, { button, buttons, clientX: x, clientY: y, cancelable: true });
    Object.defineProperty(event, "pointerId", { value: 1 });
    target.dispatchEvent(event);
    return event;
  };
  const wheel = (init: WheelEventInit) => {
    const event = new WheelEvent("wheel", { ...init, cancelable: true });
    canvas.dispatchEvent(event);
    return event;
  };
  return { canvas, orbit, zoom, dispose, pointer, wheel, setMode: (next: HudInputMode) => { mode = next; } };
}
describe("flight camera gestures", () => {
  it("orbits on right drag, ends on release and leaves left click untouched", () => {
    const s = setup();
    expect(s.pointer(s.canvas, "pointerdown", 0).defaultPrevented).toBe(false);
    s.pointer(window, "pointermove", 0, 10, 10);
    expect(s.orbit).not.toHaveBeenCalled();
    s.pointer(s.canvas, "pointerdown", 2);
    s.pointer(window, "pointermove", 2, 10, 20);
    expect(s.orbit).toHaveBeenCalledWith(0.05, 0.1);
    s.pointer(window, "pointerup", 2);
    s.pointer(window, "pointermove", 2, 20, 40);
    expect(s.orbit).toHaveBeenCalledTimes(1);
    const menu = new MouseEvent("contextmenu", { cancelable: true });
    s.canvas.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
  });
  it("zooms mouse wheels, but trackpad swipes including shift-wheel only orbit", () => {
    const s = setup();
    expect(s.wheel({ deltaY: 100 }).defaultPrevented).toBe(true);
    expect(s.zoom.mock.calls[0][0]).toBeGreaterThan(1);
    s.zoom.mockClear();
    s.setMode("trackpad");
    s.wheel({ deltaX: 10, deltaY: 20 });
    s.wheel({ deltaY: 100, shiftKey: true });
    expect(s.orbit).toHaveBeenCalledWith(-0.05, -0.1);
    expect(s.zoom).not.toHaveBeenCalled();
    s.wheel({ deltaY: -10, ctrlKey: true });
    expect(s.zoom.mock.calls[0][0]).toBeLessThan(1);
  });
  it("uses incremental native pinch scales without swipe orbit during pinch", () => {
    const s = setup("trackpad");
    const gesture = (name: string, scale: number) => {
      const event = new Event(name, { cancelable: true });
      Object.assign(event, { scale });
      s.canvas.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    };
    gesture("gesturestart", 1);
    gesture("gesturechange", 2);
    s.wheel({ deltaY: 30 });
    gesture("gesturechange", 4);
    expect(s.zoom.mock.calls).toEqual([[0.5], [0.5]]);
    expect(s.orbit).not.toHaveBeenCalled();
    gesture("gestureend", 4);
    s.wheel({ deltaY: 30 });
    expect(s.orbit).toHaveBeenCalledTimes(1);
  });
  it("avoids duplicate Safari wheel pinch and supports two-touch swipe/pinch", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Macintosh Safari");
    vi.stubGlobal("GestureEvent", Event);
    const s = setup("trackpad");
    s.wheel({ ctrlKey: true, deltaY: -20 });
    expect(s.zoom).not.toHaveBeenCalled();
    const touches = (name: string, points: number[][]) => {
      const event = new Event(name, { cancelable: true });
      Object.assign(event, { touches: points.map(([clientX, clientY]) => ({ clientX, clientY })) });
      s.canvas.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    };
    touches("touchstart", [[0, 0]]);
    touches("touchmove", [[10, 10]]);
    expect(s.orbit).not.toHaveBeenCalled();
    touches("touchstart", [[0, 0], [10, 0]]);
    touches("touchmove", [[10, 10], [20, 10]]);
    expect(s.orbit).toHaveBeenCalledWith(-0.05, -0.05);
    touches("touchmove", [[5, 10], [25, 10]]);
    expect(s.zoom).toHaveBeenLastCalledWith(0.5);
    touches("touchcancel", []);
    s.orbit.mockClear();
    touches("touchmove", [[5, 10], [25, 10]]);
    expect(s.orbit).not.toHaveBeenCalled();
  });
  it("cancels dragging on blur or mode change and disposes canvas/window listeners", () => {
    const s = setup();
    s.pointer(s.canvas, "pointerdown", 2);
    window.dispatchEvent(new Event("blur"));
    s.pointer(window, "pointermove", 2, 10, 10);
    s.pointer(s.canvas, "pointerdown", 2);
    s.setMode("trackpad");
    s.pointer(window, "pointermove", 2, 10, 10);
    expect(s.orbit).not.toHaveBeenCalled();
    s.dispose();
    expect(s.wheel({ deltaY: 20 }).defaultPrevented).toBe(false);
    expect(s.zoom).not.toHaveBeenCalled();
    expect(s.canvas.style.touchAction).not.toBe("none");
  });
});
