// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouteFrom } from "./appRoute";
import { createPairingUrl } from "./remote/pairing";

const appMocks = vi.hoisted(() => ({
  createFlightSimApp: vi.fn(async () => ({ destroy: vi.fn() })),
  createPhoneControllerApp: vi.fn(async () => ({ destroy: vi.fn() })),
  createInfoPage: vi.fn(),
}));

vi.mock("./flight/createFlightSimApp", () => ({
  createFlightSimApp: appMocks.createFlightSimApp,
}));

vi.mock("./remote/createPhoneControllerApp", () => ({
  createPhoneControllerApp: appMocks.createPhoneControllerApp,
}));

vi.mock("./info/createInfoPage", () => ({
  createInfoPage: appMocks.createInfoPage,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  document.body.innerHTML = '<div id="root"></div>';
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("application route", () => {
  it("loads only OSFS when mode=flight", async () => {
    window.history.replaceState(null, "", "/?mode=flight&mapSource=google&key=test-key");

    await import("./main");
    await vi.waitFor(() => expect(appMocks.createFlightSimApp).toHaveBeenCalledOnce());

    expect(appMocks.createPhoneControllerApp).not.toHaveBeenCalled();
    expect(appMocks.createInfoPage).not.toHaveBeenCalled();
    expect(appMocks.createFlightSimApp).toHaveBeenCalledWith(document.getElementById("root"), {
      loadingScreen: expect.objectContaining({ show: expect.any(Function), setPhase: expect.any(Function) }),
      log: expect.objectContaining({ print: expect.any(Function) }),
    });
    expect(document.getElementById("app-log")!.textContent).toContain("Application ready");
    expect(`${window.location.pathname}${window.location.search}`).toBe("/fly/?mapSource=google&key=test-key");
  });

  it.each(["/fly", "/fly/", "/?mode=flight"])("loads the flight simulator at %s", async (route) => {
    window.history.replaceState(null, "", route);

    await import("./main");
    await vi.waitFor(() => expect(appMocks.createFlightSimApp).toHaveBeenCalledOnce());

    expect(appMocks.createPhoneControllerApp).not.toHaveBeenCalled();
    expect(appMocks.createInfoPage).not.toHaveBeenCalled();
  });

  it.each(["/", "/?mode=unknown"])("loads the information page at %s", async (route) => {
    window.history.replaceState(null, "", route);

    await import("./main");
    await vi.waitFor(() => expect(appMocks.createInfoPage).toHaveBeenCalledOnce());

    expect(appMocks.createInfoPage).toHaveBeenCalledWith(document.getElementById("root"));
    expect(appMocks.createFlightSimApp).not.toHaveBeenCalled();
    expect(appMocks.createPhoneControllerApp).not.toHaveBeenCalled();
  });

  it("sends ?mode=globe to the FOSS Earth site", async () => {
    const replace = vi.fn();
    vi.stubGlobal("location", {
      ...window.location,
      href: "https://0sfs.github.io/?mode=globe",
      search: "?mode=globe",
      pathname: "/",
      hash: "",
      replace,
    });

    await import("./main");

    expect(replace).toHaveBeenCalledWith("https://foss-earth.github.io/");
    expect(appMocks.createFlightSimApp).not.toHaveBeenCalled();
    expect(appMocks.createPhoneControllerApp).not.toHaveBeenCalled();
    expect(appMocks.createInfoPage).not.toHaveBeenCalled();
  });

  it("loads the phone controller at /rc/ without booting either simulator", async () => {
    window.history.replaceState(null, "", "/rc/#v=1&peer=desktop-id&join=invitation");

    await import("./main");
    await vi.waitFor(() => expect(appMocks.createPhoneControllerApp).toHaveBeenCalledOnce());

    expect(appMocks.createPhoneControllerApp).toHaveBeenCalledWith(document.getElementById("root"));
    expect(appMocks.createFlightSimApp).not.toHaveBeenCalled();
    expect(appMocks.createInfoPage).not.toHaveBeenCalled();
  });

  it("loads the phone controller from a generated pairing URL", async () => {
    // An explicit base: this test is about routing a generated URL, not about
    // which origin the QR defaults to (jsdom runs on loopback, which a phone
    // could not reach and which `createPairingUrl` refuses without a LAN one).
    const pairing = new URL(createPairingUrl("desktop-id", "a".repeat(43), "https://fly.example.test/"));
    expect(pairing.pathname).toBe("/rc/");
    expect(appRouteFrom(pairing)).toBe("remote");
    window.history.replaceState(null, "", `${pairing.pathname}${pairing.search}${pairing.hash}`);

    await import("./main");
    await vi.waitFor(() => expect(appMocks.createPhoneControllerApp).toHaveBeenCalledOnce());

    expect(appMocks.createFlightSimApp).not.toHaveBeenCalled();
    expect(appMocks.createInfoPage).not.toHaveBeenCalled();
  });

  it("loads the phone controller from a legacy ?mode=remote pairing URL", async () => {
    window.history.replaceState(null, "", "/?mode=remote#v=1&peer=desktop-id&join=invitation");

    await import("./main");
    await vi.waitFor(() => expect(appMocks.createPhoneControllerApp).toHaveBeenCalledOnce());

    expect(window.location.pathname).toMatch(/^\/rc\/?$/);
    expect(window.location.search).toBe("");
    expect(appMocks.createFlightSimApp).not.toHaveBeenCalled();
    expect(appMocks.createInfoPage).not.toHaveBeenCalled();
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
    window.history.replaceState(null, "", "/rc/");
    document.body.insertAdjacentHTML("beforeend", '<div id="app-log"></div>');
    appMocks.createPhoneControllerApp.mockRejectedValueOnce(new Error("Offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await import("./main");

    await vi.waitFor(() => expect(document.querySelector(".boot-error")?.textContent).toBe("Failed to initialize the application."));
    expect(document.getElementById("app-log")).toBeNull();
  });
});
