// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGameLog, type GameLog } from "../log/createGameLog";
import { offerFullscreen } from "./fullscreen";

let log: GameLog;
let fullscreenElement: Element | null;
const requestFullscreen = vi.fn(async () => {
  fullscreenElement = document.documentElement;
  document.dispatchEvent(new Event("fullscreenchange"));
});

function stubMedia(matches: (query: string) => boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: matches(query) }));
}

function stubFullscreenApi(): void {
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreenElement });
  document.documentElement.requestFullscreen = requestFullscreen;
}

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  });
  fullscreenElement = null;
  requestFullscreen.mockClear();
  document.body.innerHTML = '<div id="app-log"></div>';
  log = createGameLog();
});

afterEach(() => {
  log.destroy();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "fullscreenEnabled");
  Reflect.deleteProperty(document, "fullscreenElement");
  Reflect.deleteProperty(document.documentElement, "requestFullscreen");
  document.body.replaceChildren();
});

describe("fullscreen offer", () => {
  it("points touch browsers without page fullscreen to the Home Screen", () => {
    stubMedia(query => query === "(pointer: coarse)");
    offerFullscreen(log);

    expect(log.element.textContent).toContain("Add to Home Screen");
  });

  it("says nothing when already launched without browser bars", () => {
    stubMedia(query => query.includes("display-mode"));
    stubFullscreenApi();
    offerFullscreen(log);

    expect(log.element.children).toHaveLength(0);
  });

  it("enters fullscreen only from the pilot's button and remembers Every visit", async () => {
    stubMedia(() => false);
    stubFullscreenApi();
    offerFullscreen(log);
    expect(requestFullscreen).not.toHaveBeenCalled();
    const everyVisit = log.element.querySelectorAll("button")[1];
    expect(everyVisit.getAttribute("aria-pressed")).toBe("false");

    everyVisit.click();
    expect(window.localStorage.getItem("osfs.fullscreen-every-visit")).toBe("1");
    log.element.querySelector("button")!.click();

    expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI: "hide" });
    await vi.waitFor(() => expect(log.element.textContent).toContain("Fullscreen. Use ⛶"));
  });

  it("with Every visit on, enters on the first tap outside the log and ignores Escape", () => {
    stubMedia(() => false);
    stubFullscreenApi();
    window.localStorage.setItem("osfs.fullscreen-every-visit", "1");
    const dispose = offerFullscreen(log);
    expect(log.element.textContent).toContain("first tap");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    log.element.querySelector("button")!.dispatchEvent(new Event("pointerup", { bubbles: true }));
    expect(requestFullscreen).not.toHaveBeenCalled();

    document.body.dispatchEvent(new Event("pointerup", { bubbles: true }));
    expect(requestFullscreen).toHaveBeenCalledOnce();
    document.body.dispatchEvent(new Event("pointerup", { bubbles: true }));
    expect(requestFullscreen).toHaveBeenCalledOnce();
    dispose();
  });
});
