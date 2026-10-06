// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStartupPause, type StartupPause } from "./startupPause";

let pause: StartupPause | null = null;
afterEach(() => { pause?.dispose(); pause = null; });

const press = (code: string, init: KeyboardEventInit = {}): void => {
  window.dispatchEvent(new KeyboardEvent("keydown", { code, ...init }));
  window.dispatchEvent(new KeyboardEvent("keyup", { code }));
};

describe("startup pause", () => {
  it("toggles with the pause key before the flight's input exists", () => {
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
    const onChange = vi.fn();
    pause = createStartupPause({ paused: false, onChange, shouldPoll: () => false });
    press("KeyP");
    expect(pause.isPaused()).toBe(true);
    press("KeyP");
    expect(pause.isPaused()).toBe(false);
    expect(onChange.mock.calls).toEqual([[true], [false]]);
    press("KeyW");
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("starts from a saved flight's pause and stops listening once disposed", () => {
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
    const onChange = vi.fn();
    pause = createStartupPause({ paused: true, onChange, shouldPoll: () => false });
    expect(pause.isPaused()).toBe(true);
    pause.dispose();
    press("KeyP");
    expect(onChange).not.toHaveBeenCalled();
    expect(pause.isPaused()).toBe(true);
  });

  it("ignores the key while typing in a field", () => {
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => [] });
    const onChange = vi.fn();
    pause = createStartupPause({ paused: false, onChange, shouldPoll: () => false });
    const field = document.createElement("input");
    document.body.append(field);
    field.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyP", bubbles: true }));
    expect(onChange).not.toHaveBeenCalled();
    field.remove();
  });
});
