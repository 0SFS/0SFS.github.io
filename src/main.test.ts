// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => { vi.restoreAllMocks(); });

describe("application route", () => {
  it("loads only OSFS when mode=flight", async () => {
    window.history.replaceState(null, "", "/?mode=flight&mapSource=google&key=test-key");

    await import("./main");
    await vi.waitFor(() => expect(appMocks.createFlightSimApp).toHaveBeenCalledOnce());

    expect(appMocks.createGlobeApp).not.toHaveBeenCalled();
    expect(appMocks.createPhoneControllerApp).not.toHaveBeenCalled();
    expect(appMocks.createFlightSimApp).toHaveBeenCalledWith(document.getElementById("root"), {
      loadingScreen: expect.objectContaining({ show: expect.any(Function), setPhase: expect.any(Function) }),
      log: expect.objectContaining({ print: expect.any(Function) }),
    });
    expect(document.getElementById("app-log")!.textContent).toContain("Application ready");
  });

  it.each(["/", "/?mode=flight", "/?mode=unknown"])("loads the flight simulator by default (%s)", async (route) => {
    window.history.replaceState(null, "", route);

    await import("./main");
    await vi.waitFor(() => expect(appMocks.createFlightSimApp).toHaveBeenCalledOnce());

    expect(appMocks.createGlobeApp).not.toHaveBeenCalled();
    expect(appMocks.createPhoneControllerApp).not.toHaveBeenCalled();
  });

  it("loads only FOSS Earth with mode=globe", async () => {
    window.history.replaceState(null, "", "/?mode=globe");
    document.body.insertAdjacentHTML("beforeend", '<div id="app-log"></div>');

    await import("./main");
    await vi.waitFor(() => expect(appMocks.createGlobeApp).toHaveBeenCalledOnce());

    expect(appMocks.createFlightSimApp).not.toHaveBeenCalled();
    expect(appMocks.createPhoneControllerApp).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(document.getElementById("app-log")).toBeNull());
  });

  it("loads the phone controller at the production base without booting either simulator", async () => {
    window.history.replaceState(null, "", "/?mode=remote#v=1&peer=desktop-id&join=invitation");

    await import("./main");
    await vi.waitFor(() => expect(appMocks.createPhoneControllerApp).toHaveBeenCalledOnce());

    expect(appMocks.createPhoneControllerApp).toHaveBeenCalledWith(document.getElementById("root"));
    expect(appMocks.createFlightSimApp).not.toHaveBeenCalled();
    expect(appMocks.createGlobeApp).not.toHaveBeenCalled();
  });

  it("keeps a useful loading error visible when application initialization rejects", async () => {
    window.history.replaceState(null, "", "/?mode=flight");
    const failure = new Error("Offline");
    appMocks.createFlightSimApp.mockRejectedValueOnce(failure);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await import("./main");

    await vi.waitFor(() => expect(document.querySelector('#app-log [data-tone="error"]')).not.toBeNull());
    expect(document.getElementById("app-log")!.hidden).toBe(false);
    expect(document.querySelector('#app-log [data-tone="error"] button')!.textContent).toBe("Reload and try again");
  });

  it("keeps the original generic error behavior when a non-flight route fails", async () => {
    window.history.replaceState(null, "", "/?mode=globe");
    document.body.insertAdjacentHTML("beforeend", '<div id="app-log"></div>');
    appMocks.createGlobeApp.mockRejectedValueOnce(new Error("Offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await import("./main");

    await vi.waitFor(() => expect(document.querySelector(".boot-error")?.textContent).toBe("Failed to initialize the application."));
    expect(document.getElementById("app-log")).toBeNull();
  });
});
