// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGameLog } from "../log/createGameLog";
import { createFlightLoadingScreen, type FlightLoadingScreen } from "./createFlightLoadingScreen";

let screen: FlightLoadingScreen;
const lines = () => [...document.querySelectorAll<HTMLElement>("#app-log .game-log__line")];
const newestLine = () => lines()[0];

beforeEach(() => {
  document.body.innerHTML = '<main id="root"><button id="previous-focus">Controls</button></main><div id="app-log"></div>';
});

afterEach(() => {
  screen?.destroy();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("flight loading log", () => {
  it("prints beside the renderer root without covering it and holds flight input until hidden", () => {
    const root = document.getElementById("root")!;
    screen = createFlightLoadingScreen();
    const log = document.getElementById("app-log")!;

    expect(root.contains(log)).toBe(false);
    expect(newestLine().textContent).toContain("Preparing your flight");
    expect(root.hasAttribute("inert")).toBe(true);
    expect(root.getAttribute("aria-busy")).toBe("true");

    screen.hide();

    expect(root.hasAttribute("inert")).toBe(false);
    expect(root.hasAttribute("aria-busy")).toBe(false);
    expect(log.hidden).toBe(false);
  });

  it("reports measured progress in place and finishes with the elapsed time", () => {
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    screen = createFlightLoadingScreen();
    screen.setPhase("terrain", { state: "loading", detail: "Refining the ground" });
    const terrain = newestLine();
    const bar = terrain.querySelector('[role="progressbar"]')!;
    expect(terrain.textContent).toContain("Safe terrain: Refining the ground");
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);

    screen.setPhase("terrain", { state: "loading", progress: 0.42 });
    expect(newestLine()).toBe(terrain);
    expect(bar.getAttribute("aria-valuenow")).toBe("42");

    screen.setPhase("terrain", { state: "loading", progress: Number.NaN });
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);

    now = 4200;
    screen.setPhase("terrain", { state: "ready" });
    expect(terrain.dataset.tone).toBe("success");
    expect(terrain.textContent).toContain("Safe terrain ready · 3.2 s");
  });

  it("stays quiet about phases a teleport never loads and starts fresh lines", () => {
    screen = createFlightLoadingScreen();
    screen.setPhase("terrain", { state: "loading" });
    screen.setPhase("terrain", { state: "ready" });
    screen.hide();
    const before = lines().length;

    screen.show({ title: "Preparing your destination", detail: "Minneapolis", reset: true });
    for (const phase of ["app", "world", "flight", "assets"] as const) screen.setPhase(phase, { state: "ready" });
    expect(lines()).toHaveLength(before + 1);
    expect(newestLine().textContent).toContain("Preparing your destination: Minneapolis");

    screen.setPhase("terrain", { state: "loading", progress: 0 });
    expect(lines()).toHaveLength(before + 2);
    expect(document.getElementById("root")!.hasAttribute("inert")).toBe(true);
  });

  it("keeps errors visible, renders untrusted messages as text, and retries in place", () => {
    screen = createFlightLoadingScreen();
    const retry = vi.fn(() => screen.show({ title: "Trying again" }));
    screen.fail("Terrain failed <img src=x>", retry);
    const error = newestLine();

    expect(error.dataset.tone).toBe("error");
    expect(document.querySelector("#app-log img")).toBeNull();
    expect(error.textContent).toContain("Terrain failed <img src=x>");
    const button = error.querySelector("button")!;
    expect(button.textContent).toBe("Try again");
    expect(document.activeElement).toBe(button);

    button.click();
    expect(retry).toHaveBeenCalledOnce();
    expect(error.querySelector("button")).toBeNull();
    expect(newestLine().textContent).toContain("Trying again");
  });

  it("preserves existing root state and leaves a shared log to its owner", () => {
    const root = document.getElementById("root")!;
    root.setAttribute("inert", "");
    root.setAttribute("aria-busy", "false");
    const log = createGameLog();
    screen = createFlightLoadingScreen(log);
    screen.destroy();

    expect(root.hasAttribute("inert")).toBe(true);
    expect(root.getAttribute("aria-busy")).toBe("false");
    expect(document.getElementById("app-log")).toBe(log.element);
    const count = lines().length;
    screen.show();
    expect(lines()).toHaveLength(count);
    log.destroy();
  });

  it("removes a log it created when destroyed", () => {
    screen = createFlightLoadingScreen();
    screen.destroy();

    expect(document.getElementById("app-log")).toBeNull();
  });
});
