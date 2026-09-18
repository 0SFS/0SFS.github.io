// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteControlTab, type MountPhonePairing } from "./RemoteControlTab";

let root: Root;
let host: HTMLElement;
const panel = { destroy: vi.fn() };
const mountPairing = vi.fn<MountPhonePairing>(() => panel);
const onUseAsRemote = vi.fn();

function pointer(coarse: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: coarse && query === "(pointer: coarse)" }));
}

async function render(loadPhonePairing: () => Promise<MountPhonePairing> = async () => mountPairing) {
  await act(async () => root.render(<RemoteControlTab loadPhonePairing={loadPhonePairing} onUseAsRemote={onUseAsRemote} />));
}

const legends = () => [...host.querySelectorAll("legend")].map(legend => legend.textContent);
const button = (label: string) => [...host.querySelectorAll("button")].find(candidate => candidate.textContent?.trim() === label);

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("Remote Control tab", () => {
  it("leads with pairing on a computer, and makes the QR as it opens", async () => {
    pointer(false);
    await render();

    expect(legends()).toEqual(["Pair a phone", "Use this device as the remote"]);
    expect(mountPairing).toHaveBeenCalledOnce();
    const [pairingHost, options] = mountPairing.mock.calls[0];
    expect(options).toEqual({ pairOnOpen: true });
    expect(host.querySelector("fieldset")!.contains(pairingHost)).toBe(true);
  });

  it("leads with becoming the remote on a phone, and makes no QR until asked", async () => {
    pointer(true);
    await render();

    expect(legends()).toEqual(["Use this device as the remote", "Pair a phone"]);
    expect(mountPairing).toHaveBeenCalledWith(expect.any(HTMLElement), { pairOnOpen: false });
  });

  it("switches this device to RC mode", async () => {
    pointer(true);
    await render();

    button("Switch to RC mode")!.click();
    expect(onUseAsRemote).toHaveBeenCalledOnce();
  });

  it("offers the switch even while pairing cannot load, and tries pairing again on request", async () => {
    pointer(false);
    const load = vi.fn<() => Promise<MountPhonePairing>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(mountPairing);
    await render(load);

    expect(host.textContent).toContain("Pairing could not load");
    expect(button("Switch to RC mode")).toBeDefined();
    expect(mountPairing).not.toHaveBeenCalled();

    await act(async () => button("Try again")!.click());
    expect(load).toHaveBeenCalledTimes(2);
    expect(mountPairing).toHaveBeenCalledOnce();
    expect(host.textContent).not.toContain("Pairing could not load");
  });

  it("takes its pairing panel down with the tab", async () => {
    pointer(false);
    await render();

    await act(async () => root.unmount());
    expect(panel.destroy).toHaveBeenCalledOnce();
    root = createRoot(host);
  });
});
