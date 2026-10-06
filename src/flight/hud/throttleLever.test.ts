// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createThrottleLever, SHUTDOWN_HOLD_MS, type ThrottleLeverEngine, type ThrottleLeverView } from "./throttleLever";

/** A 114 px lever with a 14 px handle: 100 px of travel, idle's centre at y = 107. */
function mount(view: Partial<ThrottleLeverView> = {}, engineControl = true) {
  const box = document.createElement("div");
  box.className = "flight-hud__slider-control flight-hud__slider-control--throttle";
  document.body.append(box);
  const onThrottleChange = vi.fn();
  const onStartHold = vi.fn();
  const onShutdown = vi.fn();
  const lever = createThrottleLever(box, engineControl
    ? { onThrottleChange, onStartHold, onShutdown }
    : { onThrottleChange });
  const slider = box.querySelector<HTMLElement>('[data-control="throttle"]')!;
  const handle = box.querySelector<HTMLElement>(".flight-throttle__handle")!;
  vi.spyOn(slider, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 14, 114));
  vi.spyOn(handle, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 14, 14));
  const output = box.querySelector("output")!;
  const show = (next: Partial<ThrottleLeverView>) => lever.update({ throttle: 0, engine: null, ...view, ...next });
  show({});
  return { box, slider, output, lever, show, onThrottleChange, onStartHold, onShutdown };
}

const at = (value: number) => 107 - value * 100;
function pointer(target: Element, type: string, clientY: number, pointerId = 1) {
  target.dispatchEvent(new PointerEvent(type, { pointerId, clientY, button: 0, pointerType: "mouse", bubbles: true, cancelable: true }));
}
function key(target: Element, type: "keydown" | "keyup", name: string, repeat = false) {
  target.dispatchEvent(new KeyboardEvent(type, { key: name, repeat, bubbles: true, cancelable: true }));
}

const RUNNING: ThrottleLeverEngine = { state: "running", startProgress: 1 };
const STOPPED: ThrottleLeverEngine = { state: "stopped", startProgress: 0 };

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("throttle lever", () => {
  it("is a plain accessible throttle for a host that cannot start or stop the engine", () => {
    const t = mount({ throttle: 0.5, engine: RUNNING }, false);
    expect(t.slider.getAttribute("role")).toBe("slider");
    expect(t.slider.getAttribute("aria-valuenow")).toBe("50");
    expect(t.output.value).toBe("50%");
    expect(t.box.dataset.engine).toBeUndefined();
    // A press off the handle jumps the lever there, then it follows the pointer.
    pointer(t.slider, "pointerdown", at(0.8));
    expect(t.onThrottleChange).toHaveBeenLastCalledWith(0.8);
    pointer(t.slider, "pointermove", at(0.9));
    expect(t.onThrottleChange.mock.lastCall![0]).toBeCloseTo(0.9, 9);
    pointer(t.slider, "pointerup", at(0.9));
    key(t.slider, "keydown", "PageDown");
    expect(t.onThrottleChange.mock.lastCall![0]).toBeCloseTo(0.8, 9);
    // Holding at idle does nothing without engine control.
    t.show({ throttle: 0 });
    pointer(t.slider, "pointerdown", at(0));
    vi.advanceTimersByTime(SHUTDOWN_HOLD_MS * 2);
    expect(t.box.dataset.hold).toBeUndefined();
  });

  it("rests at idle while the engine is off, and the arrow keys cannot move it", () => {
    const t = mount({ throttle: 0.6, engine: STOPPED });
    expect(t.slider.getAttribute("aria-valuenow")).toBe("0");
    expect(t.output.value).toBe("OFF");
    expect(t.box.dataset.engine).toBe("stopped");
    expect(t.slider.getAttribute("aria-valuetext")).toBe("Engine off. Press and hold to start.");
    key(t.slider, "keydown", "ArrowUp");
    key(t.slider, "keydown", "End");
    expect(t.onThrottleChange).not.toHaveBeenCalled();
  });

  it("holds the starter while pressed anywhere, drags up from idle, and drops back if let go before the engine runs", () => {
    const t = mount({ engine: STOPPED });
    pointer(t.slider, "pointerdown", at(0.7));
    expect(t.onStartHold).toHaveBeenLastCalledWith(true);
    expect(t.box.dataset.hold).toBe("start");
    // The press does not jump the lever: it stays at idle until dragged.
    expect(t.onThrottleChange).not.toHaveBeenCalled();
    expect(t.slider.getAttribute("aria-valuenow")).toBe("0");
    pointer(t.slider, "pointermove", at(0.7) - 30);
    expect(t.onThrottleChange.mock.lastCall![0]).toBeCloseTo(0.3, 9);
    t.show({ engine: { state: "starting", startProgress: 0.4 } });
    expect(t.box.dataset.engine).toBe("starting");
    expect(t.box.style.getPropertyValue("--throttle-ring")).toBe("0.4");
    expect(t.slider.getAttribute("aria-valuetext")).toBe("Starting, 40%. Keep holding.");
    pointer(t.slider, "pointerup", 0);
    expect(t.onStartHold).toHaveBeenLastCalledWith(false);
    t.show({ throttle: 0.3, engine: STOPPED });
    expect(t.slider.getAttribute("aria-valuenow")).toBe("0");
    expect(t.output.value).toBe("OFF");
  });

  it("becomes an ordinary throttle when the engine runs while still held", () => {
    const t = mount({ engine: STOPPED });
    pointer(t.slider, "pointerdown", at(0));
    pointer(t.slider, "pointermove", at(0) - 50);
    t.show({ throttle: 0.5, engine: RUNNING });
    expect(t.box.dataset.engine).toBe("running");
    // It ran: the ring goes, though the pointer is still down.
    expect(t.box.dataset.hold).toBeUndefined();
    pointer(t.slider, "pointermove", at(0) - 60);
    expect(t.onThrottleChange.mock.lastCall![0]).toBeCloseTo(0.6, 9);
    pointer(t.slider, "pointerup", 0);
    expect(t.onStartHold.mock.calls).toEqual([[true], [false]]);
  });

  it("shuts the engine down when the handle is held at idle until the ring closes", () => {
    const t = mount({ engine: RUNNING });
    expect(t.slider.getAttribute("aria-valuetext")).toBe("0%");
    expect(t.box.title).toContain("shut the engine down");
    pointer(t.slider, "pointerdown", at(0) + 3);
    expect(t.box.dataset.hold).toBe("shutdown");
    // A tremor inside the slop is still a hold.
    pointer(t.slider, "pointermove", at(0) + 3 - 5);
    vi.advanceTimersByTime(SHUTDOWN_HOLD_MS - 1);
    expect(t.onShutdown).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(t.onShutdown).toHaveBeenCalledOnce();
    expect(t.onThrottleChange).not.toHaveBeenCalled();
    t.show({ engine: STOPPED });
    // Still held after the ring closed: moving it does nothing until it is let go.
    pointer(t.slider, "pointermove", at(0) - 50);
    expect(t.onThrottleChange).not.toHaveBeenCalled();
    pointer(t.slider, "pointerup", at(0) - 50);
    expect(t.onStartHold).not.toHaveBeenCalled();
    expect(t.output.value).toBe("OFF");
  });

  it("cancels the ring when the handle moves away, or is let go, or the engine stops by itself", () => {
    const t = mount({ engine: RUNNING });
    pointer(t.slider, "pointerdown", at(0));
    pointer(t.slider, "pointermove", at(0) - 20);
    expect(t.box.dataset.hold).toBeUndefined();
    expect(t.onThrottleChange.mock.lastCall![0]).toBeCloseTo(0.2, 9);
    vi.advanceTimersByTime(SHUTDOWN_HOLD_MS * 2);
    pointer(t.slider, "pointerup", 0);
    t.show({ throttle: 0, engine: RUNNING });
    pointer(t.slider, "pointerdown", at(0));
    pointer(t.slider, "pointerup", at(0));
    pointer(t.slider, "pointerdown", at(0));
    t.show({ engine: STOPPED });
    vi.advanceTimersByTime(SHUTDOWN_HOLD_MS * 2);
    expect(t.onShutdown).not.toHaveBeenCalled();
  });

  it("only rings at idle: above it, the handle simply drags", () => {
    const t = mount({ throttle: 0.5, engine: RUNNING });
    pointer(t.slider, "pointerdown", at(0.5));
    expect(t.box.dataset.hold).toBeUndefined();
    pointer(t.slider, "pointermove", at(0.5) + 10);
    expect(t.onThrottleChange.mock.lastCall![0]).toBeCloseTo(0.4, 9);
    vi.advanceTimersByTime(SHUTDOWN_HOLD_MS * 2);
    expect(t.onShutdown).not.toHaveBeenCalled();
  });

  it("does with Space or Enter held what holding the pointer on the handle does", () => {
    const t = mount({ engine: STOPPED });
    key(t.slider, "keydown", " ");
    key(t.slider, "keydown", " ", true);
    expect(t.onStartHold.mock.calls).toEqual([[true]]);
    key(t.slider, "keydown", "ArrowUp");
    expect(t.onThrottleChange).toHaveBeenLastCalledWith(0.01);
    key(t.slider, "keyup", " ");
    expect(t.onStartHold).toHaveBeenLastCalledWith(false);

    t.show({ throttle: 0, engine: RUNNING });
    key(t.slider, "keydown", "Enter");
    vi.advanceTimersByTime(SHUTDOWN_HOLD_MS);
    expect(t.onShutdown).toHaveBeenCalledOnce();
  });

  it("adds up quick key presses before the aircraft shows them", () => {
    const t = mount({ throttle: 0.5, engine: RUNNING });
    key(t.slider, "keydown", "ArrowUp");
    key(t.slider, "keydown", "ArrowUp");
    expect(t.onThrottleChange.mock.lastCall![0]).toBeCloseTo(0.52, 9);
  });

  it("lets go of a start when focus leaves, and ignores the pointer while disabled", () => {
    const t = mount({ engine: STOPPED });
    pointer(t.slider, "pointerdown", at(0));
    t.slider.dispatchEvent(new FocusEvent("blur"));
    expect(t.onStartHold.mock.calls).toEqual([[true], [false]]);
    t.show({ disabled: true });
    expect(t.slider.getAttribute("aria-disabled")).toBe("true");
    pointer(t.slider, "pointerdown", at(0), 2);
    expect(t.onStartHold).toHaveBeenCalledTimes(2);
  });

  it("touches the page only when what it shows changes", () => {
    const t = mount({ throttle: 0.25, engine: RUNNING, afterburner: false });
    const observer = new MutationObserver(() => {});
    observer.observe(t.box, { attributes: true, childList: true, subtree: true, characterData: true });
    t.show({ throttle: 0.25, engine: { ...RUNNING }, afterburner: false });
    expect(observer.takeRecords()).toHaveLength(0);
    t.show({ throttle: 0.3, engine: RUNNING, afterburner: false });
    expect(observer.takeRecords().length).toBeGreaterThan(0);
    observer.disconnect();
  });

  it("marks afterburner the way the HUD always has", () => {
    const t = mount({ throttle: 1, engine: RUNNING, afterburner: true });
    expect(t.output.value).toBe("100🔥");
    expect(t.box.dataset.afterburner).toBe("active");
    expect(t.slider.getAttribute("aria-valuetext")).toBe("100%, afterburner active");
    t.lever.destroy();
    expect(t.box.childElementCount).toBe(0);
  });
});
