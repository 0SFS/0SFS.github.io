// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const appMocks = vi.hoisted(() => ({
  createFlightSimApp: vi.fn(async () => ({ destroy: vi.fn() })),
  createGlobeApp: vi.fn(async () => ({ destroy: vi.fn() })),
}));

vi.mock("./flight/createFlightSimApp", () => ({
  createFlightSimApp: appMocks.createFlightSimApp,
}));

vi.mock("./compat/createGlobeModeApp", () => ({
  createGlobeModeApp: appMocks.createGlobeApp,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  document.body.innerHTML = '<div id="root"></div>';
});

describe("application route", () => {
  it("loads only Flight Sim when mode=flight", async () => {
    window.history.replaceState(null, "", "/?mode=flight&mapSource=google&key=test-key");

    await import("./main");
    await vi.waitFor(() => expect(appMocks.createFlightSimApp).toHaveBeenCalledOnce());

    expect(appMocks.createGlobeApp).not.toHaveBeenCalled();
  });

  it("loads only FOSS Earth on the root route", async () => {
    window.history.replaceState(null, "", "/");

    await import("./main");
    await vi.waitFor(() => expect(appMocks.createGlobeApp).toHaveBeenCalledOnce());

    expect(appMocks.createFlightSimApp).not.toHaveBeenCalled();
  });
});
