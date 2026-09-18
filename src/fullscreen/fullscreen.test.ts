// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGameLog, type GameLog } from "../log/createGameLog";
import { FULLSCREEN_BLOCKED_TITLE } from "../remote/fullscreenMessage";
import { offerFullscreen } from "./fullscreen";
// Loaded on demand by the iPhone offer; loading it here first keeps the waits short.
import "./createFullscreenNotice";

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

describe("fullscreen offer on an iPhone", () => {
  // A finger and no page fullscreen: jsdom has no Fullscreen API, which is what
  // iPhone Safari answers too.
  const notice = () => document.querySelector(".phone-popup-host");
  const popup = () => document.querySelector('.phone-popup-host [role="dialog"]');
  const button = (within: ParentNode, label: string) =>
    [...within.querySelectorAll("button")].find(candidate => candidate.textContent === label);

  beforeEach(() => stubMedia(query => query === "(pointer: coarse)"));

  it("shows the controller's own notice, and the log says what to do", async () => {
    const dispose = offerFullscreen(log);
    expect(log.element.textContent).toContain("Add to Home Screen");

    await vi.waitFor(() => expect(popup()).not.toBeNull());
    expect(popup()!.textContent).toContain(FULLSCREEN_BLOCKED_TITLE);
    dispose();
    await vi.waitFor(() => expect(notice()).toBeNull());
  });

  it("asks once, and the log line opens it again", async () => {
    const dispose = offerFullscreen(log);
    await vi.waitFor(() => expect(popup()).not.toBeNull());

    button(popup()!, "Got it")!.click();
    await vi.waitFor(() => expect(popup()).toBeNull());
    expect(window.localStorage.getItem("osfs.fullscreen-prompt-dismissed")).toBe("1");

    button(log.element, "Why?")!.click();
    await vi.waitFor(() => expect(popup()).not.toBeNull());
    dispose();
  });

  it("does not ask a device that already answered it, here or on the controller", async () => {
    window.localStorage.setItem("osfs.fullscreen-prompt-dismissed", "1");
    const dispose = offerFullscreen(log);

    await vi.waitFor(() => expect(notice()).not.toBeNull());
    expect(popup()).toBeNull();
    expect(button(log.element, "Why?")).toBeDefined();
    dispose();
  });

  it("stays quiet when launched from the Home Screen", () => {
    stubMedia(query => query === "(pointer: coarse)" || query.includes("display-mode"));
    offerFullscreen(log);

    expect(log.element.children).toHaveLength(0);
  });

  it("leaves a touch browser with page fullscreen on the log's own offer", () => {
    stubFullscreenApi();
    const dispose = offerFullscreen(log);

    expect(log.element.textContent).toContain("Hide the browser bars");
    expect(button(log.element, "Why?")).toBeUndefined();
    dispose();
  });
});
