// @vitest-environment jsdom
import { act } from "react";
import { expect, it, vi } from "vitest";
import { createGlobeModeApp } from "./createGlobeModeApp";

const globe = vi.hoisted(() => ({
  getViewState: () => ({ latDeg: 45, lonDeg: -93 }),
  setViewState: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock("foss-earth", () => ({ createGlobeApp: async (root: HTMLElement) => {
  root.innerHTML = '<div class="globe-shell"></div>';
  return globe;
} }));

it("mounts the shared Location launcher on the globe route and disposes it", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  let app!: Awaited<ReturnType<typeof createGlobeModeApp>>;
  await act(async () => { app = await createGlobeModeApp(host); });
  try {
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Open right panel"]')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click());
    expect(host.querySelector(".foss-earth-location-panel")).not.toBeNull();
    const form = host.querySelectorAll("form")[1];
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(globe.setViewState).toHaveBeenLastCalledWith({ latDeg: 45, lonDeg: -93 });
  } finally {
    await act(async () => app.destroy());
    vi.unstubAllGlobals();
    host.remove();
  }
  expect(host.querySelector(".foss-earth-window-overlay")).toBeNull();
  expect(globe.destroy).toHaveBeenCalledOnce();
});
