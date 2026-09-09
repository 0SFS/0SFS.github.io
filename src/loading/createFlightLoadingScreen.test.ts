// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFlightLoadingScreen, type FlightLoadingScreen } from "./createFlightLoadingScreen";

let screen: FlightLoadingScreen;

beforeEach(() => {
  document.body.innerHTML = '<main id="root"><button id="previous-focus">Controls</button></main><div id="app-loading"></div>';
  document.getElementById("previous-focus")!.focus();
});

afterEach(() => {
  screen?.destroy();
  document.body.replaceChildren();
});

describe("flight loading screen", () => {
  it("adopts the first-paint overlay outside the renderer root and restores interaction when hidden", () => {
    const overlay = document.getElementById("app-loading");
    const root = document.getElementById("root")!;
    const previousFocus = document.activeElement;
    screen = createFlightLoadingScreen();

    expect(document.getElementById("app-loading")).toBe(overlay);
    expect(root.contains(overlay)).toBe(false);
    expect(root.hasAttribute("inert")).toBe(true);
    expect(root.getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(overlay);

    screen.hide();

    expect(overlay!.hidden).toBe(true);
    expect(root.hasAttribute("inert")).toBe(false);
    expect(root.hasAttribute("aria-busy")).toBe(false);
    expect(document.activeElement).toBe(previousFocus);
  });

  it("reports measured progress and leaves unknown totals indeterminate", () => {
    screen = createFlightLoadingScreen();
    const bar = document.querySelector('[data-phase="terrain"] [role="progressbar"]')!;
    screen.setPhase("terrain", { state: "loading", detail: "Refining the ground" });
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);
    expect(bar.getAttribute("aria-valuetext")).toBe("Loading. Refining the ground");

    screen.setPhase("terrain", { state: "loading", progress: 0.42 });
    expect(bar.getAttribute("aria-valuenow")).toBe("42");

    screen.setPhase("terrain", { state: "loading", progress: Number.NaN });
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);

    screen.setPhase("terrain", { state: "ready" });
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
    expect(bar.getAttribute("aria-valuetext")).toBe("Ready");
  });

  it("can show again for a teleport and reset previous completed phases", () => {
    screen = createFlightLoadingScreen();
    screen.setPhase("terrain", { state: "ready", detail: "Previous location" });
    screen.hide();
    screen.show({ title: "Preparing your destination", detail: "Loading Minneapolis", reset: true });

    expect(document.getElementById("app-loading")!.hidden).toBe(false);
    expect(document.getElementById("app-loading-title")!.textContent).toBe("Preparing your destination");
    expect(document.getElementById("app-loading-detail")!.textContent).toBe("Loading Minneapolis");
    const terrain = document.querySelector('[data-phase="terrain"]')!;
    expect(terrain.querySelector('[role="progressbar"]')!.getAttribute("aria-valuenow")).toBe("0");
    expect(terrain.querySelector<HTMLElement>("[data-detail]")!.hidden).toBe(true);
    expect(document.getElementById("root")!.hasAttribute("inert")).toBe(true);
  });

  it("keeps errors visible, renders untrusted messages as text, and retries in place", () => {
    screen = createFlightLoadingScreen();
    const retry = vi.fn(() => screen.show({ title: "Trying again" }));
    screen.fail("Terrain failed <img src=x>", retry);

    expect(document.querySelector("#app-loading-error img")).toBeNull();
    expect(document.querySelector("[data-error-message]")!.textContent).toBe("Terrain failed <img src=x>");
    expect(document.getElementById("app-loading")!.hidden).toBe(false);
    const button = document.querySelector<HTMLButtonElement>("[data-retry]")!;
    expect(document.activeElement).toBe(button);
    button.click();
    expect(retry).toHaveBeenCalledOnce();
    expect(document.getElementById("app-loading-error")!.hidden).toBe(true);
    expect(document.getElementById("app-loading-title")!.textContent).toBe("Trying again");
  });

  it("preserves existing root state and disposes without a leftover input barrier", () => {
    const root = document.getElementById("root")!;
    root.setAttribute("inert", "");
    root.setAttribute("aria-busy", "false");
    screen = createFlightLoadingScreen();
    screen.destroy();

    expect(document.getElementById("app-loading")).toBeNull();
    expect(root.hasAttribute("inert")).toBe(true);
    expect(root.getAttribute("aria-busy")).toBe("false");
    screen.show();
    expect(document.getElementById("app-loading")).toBeNull();
  });
});
