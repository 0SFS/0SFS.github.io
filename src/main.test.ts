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
    });
    expect(document.querySelector('[data-phase="app"] [role="progressbar"]')!.getAttribute("aria-valuenow")).toBe("100");
  });

  it("loads only FOSS Earth on the root route", async () => {
    window.history.replaceState(null, "", "/");
    document.body.insertAdjacentHTML("beforeend", '<div id="app-loading"></div>');

    await import("./main");
    await vi.waitFor(() => expect(appMocks.createGlobeApp).toHaveBeenCalledOnce());

    expect(appMocks.createFlightSimApp).not.toHaveBeenCalled();
    expect(appMocks.createPhoneControllerApp).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(document.getElementById("app-loading")).toBeNull());
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

    await vi.waitFor(() => expect(document.getElementById("app-loading-error")?.hidden).toBe(false));
    expect(document.getElementById("app-loading")!.hidden).toBe(false);
    expect(document.querySelector("[data-retry]")!.textContent).toBe("Reload and try again");
  });

  it("keeps the original generic error behavior when a non-flight route fails", async () => {
    window.history.replaceState(null, "", "/");
    document.body.insertAdjacentHTML("beforeend", '<div id="app-loading"></div>');
    appMocks.createGlobeApp.mockRejectedValueOnce(new Error("Offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await import("./main");

    await vi.waitFor(() => expect(document.querySelector(".boot-error")?.textContent).toBe("Failed to initialize the application."));
    expect(document.getElementById("app-loading")).toBeNull();
  });
});
