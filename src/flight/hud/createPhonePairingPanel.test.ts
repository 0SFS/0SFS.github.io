// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PhoneControlSession, PhoneSessionSnapshot } from "../remote/createPhoneControlSession";
import { createConnectionLog, type ConnectionLog } from "../../remote/connectionDiagnostics";
import { createPhonePairingPanel } from "./createPhonePairingPanel";

const qr = vi.hoisted(() => ({ toCanvas: vi.fn() }));
vi.mock("qrcode", () => ({ default: qr }));

let state: PhoneSessionSnapshot;
let listener: () => void;
let host: HTMLElement;
let panel: HTMLElement;
let log: ConnectionLog;
let handle: ReturnType<typeof createPhonePairingPanel> | null = null;
const unsubscribe = vi.fn();
const startPairing = vi.fn();
const disconnect = vi.fn();
const takeControl = vi.fn();
const drawImage = vi.fn();
const invitationUrl = "https://0sfs.github.io/rc/#v=1&peer=desktop&join=secret";

function update(patch: Partial<PhoneSessionSnapshot>) {
  state = { ...state, ...patch };
  listener();
}

function button(selector: string) { return panel.querySelector<HTMLButtonElement>(selector)!; }
function canvas() { return panel.querySelector<HTMLCanvasElement>("[data-qr]")!; }
function feedback() { return panel.querySelector<HTMLElement>("[data-feedback]")!; }
function text(selector: string) { return panel.querySelector(selector)!.textContent; }
/** Opens the Remote Control tab: on a computer unless a phone is asked for. */
function mount({ pairOnOpen = true } = {}) {
  const session = {
    getSnapshot: () => state,
    subscribe: (next: () => void) => { listener = next; return unsubscribe; },
    log,
    startPairing, disconnect, takeControl,
  } as unknown as PhoneControlSession;
  handle = createPhonePairingPanel(host, session, { pairOnOpen });
  panel = host.querySelector(".phone-pairing")!;
}
/** Switching to another tab unmounts the panel; the session stays. */
function unmount() { handle!.destroy(); handle = null; }

async function settle() { await Promise.resolve(); await Promise.resolve(); }

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  log = createConnectionLog("desktop", () => 0);
  state = {
    phase: "off", owner: "local", message: "No phone paired.", invitationUrl: null,
    expiresAt: null, signalingAvailable: true,
  };
  startPairing.mockImplementation(() => { update({ phase: "preparing", message: "Preparing connection…" }); return Promise.resolve(); });
  qr.toCanvas.mockImplementation(async (target: HTMLCanvasElement) => { target.width = 280; target.height = 280; });
  host = document.createElement("div");
  document.body.append(host);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  handle?.destroy(); handle = null;
  vi.useRealTimers(); vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("phone pairing panel", () => {
  it("starts pairing as a computer opens it and displays a locally rendered invitation", async () => {
    expect(qr.toCanvas).not.toHaveBeenCalled();
    mount();
    expect(startPairing).toHaveBeenCalledOnce();
    expect(button("[data-new]").disabled).toBe(true);
    update({ phase: "invitation", invitationUrl, expiresAt: performance.now() + 120_000 });
    await settle();
    expect(qr.toCanvas).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), invitationUrl,
      { width: 280, margin: 3, errorCorrectionLevel: "M" });
    expect(qr.toCanvas.mock.calls[0][0]).not.toBe(canvas());
    expect(drawImage).toHaveBeenCalledOnce();
    expect(canvas().hidden).toBe(false);
    expect(button("[data-copy]").hidden).toBe(false);
    expect(text("[data-expiry]")).toContain("120 seconds");
    vi.advanceTimersByTime(1000);
    expect(text("[data-expiry]")).toContain("119 seconds");
  });

  it("makes no QR on a phone until asked, which opens the tab to become the remote", () => {
    mount({ pairOnOpen: false });
    expect(startPairing).not.toHaveBeenCalled();
    expect(text("[data-status]")).toBe("No phone paired.");
    expect(canvas().hidden).toBe(true);

    button("[data-new]").click();
    expect(startPairing).toHaveBeenCalledOnce();
  });

  it("leaves a valid invitation alone when the tab is switched away and back", async () => {
    state = { ...state, phase: "invitation", invitationUrl, expiresAt: performance.now() + 120_000 };
    mount(); await settle();
    unmount();
    expect(host.children).toHaveLength(0);
    expect(disconnect).not.toHaveBeenCalled();

    mount(); await settle();
    expect(startPairing).not.toHaveBeenCalled();
    expect(canvas().hidden).toBe(false);
    expect(qr.toCanvas).toHaveBeenLastCalledWith(expect.any(HTMLCanvasElement), invitationUrl, expect.anything());
  });

  it("offers a new QR when the tab comes back after the old one expired", () => {
    mount();
    unmount();
    state = { ...state, phase: "expired", message: "QR expired. Create a new QR." };
    mount();
    expect(startPairing).toHaveBeenCalledTimes(2);
  });

  it("clears an expired invitation and discards its late QR render", async () => {
    let finish!: () => void;
    qr.toCanvas.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    state = { ...state, phase: "invitation", invitationUrl, expiresAt: performance.now() + 120_000 };
    mount();
    expect(canvas().hidden).toBe(true);
    update({ phase: "expired", invitationUrl: null, expiresAt: null, message: "QR expired. Create a new QR." });
    finish(); await settle();
    expect(drawImage).not.toHaveBeenCalled();
    expect(canvas().hidden).toBe(true);
    expect(button("[data-copy]").hidden).toBe(true);
    expect(text("[data-expiry]")).toBe("");
    expect(text("[data-status]")).toContain("QR expired");
    button("[data-new]").click();
    expect(startPairing).toHaveBeenCalledOnce();
  });

  it("shows only the new QR when two offscreen renders finish out of order", async () => {
    const finishes: (() => void)[] = [];
    qr.toCanvas.mockImplementation(() => new Promise<void>(resolve => { finishes.push(resolve); }));
    state = { ...state, phase: "invitation", invitationUrl, expiresAt: performance.now() + 120_000 };
    mount();
    update({ invitationUrl: `${invitationUrl}-new` });
    finishes[1](); await settle();
    expect(drawImage).toHaveBeenLastCalledWith(qr.toCanvas.mock.calls[1][0], 0, 0);
    finishes[0](); await settle();
    expect(drawImage).toHaveBeenCalledOnce();
  });

  it("copies the current invitation and reports clipboard failures", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    state = { ...state, phase: "invitation", invitationUrl };
    mount(); await settle();
    button("[data-copy]").click(); await settle();
    expect(writeText).toHaveBeenCalledWith(invitationUrl);
    expect(feedback().textContent).toBe("Could not copy. Scan the QR instead.");
    writeText.mockResolvedValue(undefined);
    button("[data-copy]").click(); await settle();
    expect(feedback().textContent).toContain("Link copied");
    update({ invitationUrl: null, phase: "expired" });
    button("[data-copy]").click();
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it("explains unavailable clipboard and QR rendering without breaking local actions", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    qr.toCanvas.mockRejectedValue(new Error("no canvas"));
    state = { ...state, phase: "invitation", invitationUrl };
    mount(); await settle();
    expect(feedback().textContent).toBe("QR unavailable. Use Copy link.");
    expect(canvas().hidden).toBe(true);
    button("[data-copy]").click();
    expect(feedback().textContent).toContain("Clipboard unavailable");
    update({ phase: "paired", owner: "phone", invitationUrl: null });
    expect(button("[data-take]").hidden).toBe(false);
    button("[data-take]").click();
    button("[data-disconnect]").click();
    expect(takeControl).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("removes listeners and timers and ignores pending QR/clipboard results after destroy", async () => {
    let finishQr!: () => void;
    let finishCopy!: () => void;
    qr.toCanvas.mockReturnValue(new Promise<void>(resolve => { finishQr = resolve; }));
    Object.defineProperty(navigator, "clipboard", { configurable: true,
      value: { writeText: () => new Promise<void>(resolve => { finishCopy = resolve; }) } });
    state = { ...state, phase: "invitation", invitationUrl };
    mount();
    button("[data-copy]").click();
    unmount();
    finishQr(); finishCopy(); await settle();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(drawImage).not.toHaveBeenCalled();
    expect(host.querySelector(".phone-pairing")).toBeNull();
    expect(feedback().textContent).toBe("");
  });
});
