// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const appMocks = vi.hoisted(() => ({
  createFlightSimApp: vi.fn(async () => ({ destroy: vi.fn() })),
  createGlobeApp: vi.fn(async () => ({ destroy: vi.fn() })),
  createPhoneControllerApp: vi.fn(async () => ({ destroy: vi.fn() })),
}));

vi.mock("./flight/createFlightSimApp", () => ({
  createFlightSimApp: appMocks.createFlightSimApp,
}));

vi.mock("./compat/createGlobeModeApp", () => ({
  createGlobeModeApp: appMocks.createGlobeApp,
}));

vi.mock("./remote/createPhoneControllerApp", () => ({
  createPhoneControllerApp: appMocks.createPhoneControllerApp,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  document.body.innerHTML = '<div id="root"></div>';
});

describe("application route", () => {
  it("loads only OSFS when mode=flight", async () => {
    window.history.replaceState(null, "", "/?mode=flight&mapSource=google&key=test-key");

    await import("./main");
    await vi.waitFor(() => expect(appMocks.createFlightSimApp).toHaveBeenCalledOnce());

    expect(appMocks.createGlobeApp).not.toHaveBeenCalled();
    expect(appMocks.createPhoneControllerApp).not.toHaveBeenCalled();
  });

  it("loads only FOSS Earth on the root route", async () => {
    window.history.replaceState(null, "", "/");

    await import("./main");
    await vi.waitFor(() => expect(appMocks.createGlobeApp).toHaveBeenCalledOnce());

    expect(appMocks.createFlightSimApp).not.toHaveBeenCalled();
    expect(appMocks.createPhoneControllerApp).not.toHaveBeenCalled();
  });

  it("loads the phone controller at the production base without booting either simulator", async () => {
    window.history.replaceState(null, "", "/?mode=remote#v=1&peer=desktop-id&join=invitation");

    await import("./main");
    await vi.waitFor(() => expect(appMocks.createPhoneControllerApp).toHaveBeenCalledOnce());

    expect(appMocks.createPhoneControllerApp).toHaveBeenCalledWith(document.getElementById("root"));
    expect(appMocks.createFlightSimApp).not.toHaveBeenCalled();
    expect(appMocks.createGlobeApp).not.toHaveBeenCalled();
  });
});
