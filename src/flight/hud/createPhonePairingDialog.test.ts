// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PhoneControlSession, PhoneSessionSnapshot } from "../remote/createPhoneControlSession";
import { createPhonePairingDialog } from "./createPhonePairingDialog";

const qr = vi.hoisted(() => ({ toCanvas: vi.fn() }));
vi.mock("qrcode", () => ({ default: qr }));

let state: PhoneSessionSnapshot;
let listener: () => void;
let dialog: HTMLDialogElement;
let handle: ReturnType<typeof createPhonePairingDialog> | null = null;
const unsubscribe = vi.fn();
const startPairing = vi.fn();
const disconnect = vi.fn();
const takeControl = vi.fn();
const drawImage = vi.fn();
const invitationUrl = "https://felipegalind0.io/flight-sim/?mode=remote#v=1&peer=desktop&join=secret";

function update(patch: Partial<PhoneSessionSnapshot>) {
  state = { ...state, ...patch };
  listener();
}

function button(selector: string) { return dialog.querySelector<HTMLButtonElement>(selector)!; }
function canvas() { return dialog.querySelector<HTMLCanvasElement>("[data-qr]")!; }
function feedback() { return dialog.querySelector<HTMLElement>("[data-feedback]")!; }
function mount() {
  const session = {
    getSnapshot: () => state,
    subscribe: (next: () => void) => { listener = next; return unsubscribe; },
    startPairing, disconnect, takeControl,
  } as unknown as PhoneControlSession;
  handle = createPhonePairingDialog(document.body, session);
  dialog = document.querySelector("dialog")!;
}

async function settle() { await Promise.resolve(); await Promise.resolve(); }

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  state = {
    phase: "off", owner: "local", message: "Phone controller", invitationUrl: null,
    expiresAt: null, signalingAvailable: true,
  };
  startPairing.mockImplementation(() => { update({ phase: "preparing", message: "Preparing connection…" }); return Promise.resolve(); });
  qr.toCanvas.mockImplementation(async (target: HTMLCanvasElement) => { target.width = 280; target.height = 280; });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open"); this.dispatchEvent(new Event("close"));
    },
  });
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) {
    this.removeAttribute("open"); this.dispatchEvent(new Event("close"));
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  handle?.destroy(); handle = null;
  vi.useRealTimers(); vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("phone pairing dialog", () => {
  it("starts pairing only on first open and displays a locally rendered invitation", async () => {
    mount();
    expect(startPairing).not.toHaveBeenCalled();
    expect(qr.toCanvas).not.toHaveBeenCalled();
    handle!.open();
    expect(dialog.open).toBe(true);
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
    expect(dialog.querySelector("[data-expiry]")!.textContent).toContain("120 seconds");
    vi.advanceTimersByTime(1000);
    expect(dialog.querySelector("[data-expiry]")!.textContent).toContain("119 seconds");
  });

  it("hides and reopens without canceling or regenerating a valid invitation", async () => {
    const trigger = document.createElement("button");
    document.body.append(trigger); trigger.focus();
    state = { ...state, phase: "invitation", invitationUrl, expiresAt: performance.now() + 120_000 };
    mount(); await settle();
    handle!.open();
    button("[data-close]").click();
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(disconnect).not.toHaveBeenCalled();
    handle!.open();
    expect(startPairing).not.toHaveBeenCalled();
    expect(qr.toCanvas).toHaveBeenCalledOnce();
    expect(canvas().hidden).toBe(false);
  });

  it("clears an expired invitation and discards its late QR render", async () => {
    let finish!: () => void;
    qr.toCanvas.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    state = { ...state, phase: "invitation", invitationUrl, expiresAt: performance.now() + 120_000 };
    mount(); handle!.open();
    expect(canvas().hidden).toBe(true);
    update({ phase: "expired", invitationUrl: null, expiresAt: null, message: "QR expired. Create a new QR." });
    finish(); await settle();
    expect(drawImage).not.toHaveBeenCalled();
    expect(canvas().hidden).toBe(true);
    expect(button("[data-copy]").hidden).toBe(true);
    expect(dialog.querySelector("[data-expiry]")!.textContent).toBe("");
    expect(dialog.querySelector("[data-status]")!.textContent).toContain("QR expired");
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
    mount(); handle!.open();
    button("[data-copy]").click();
    handle!.destroy(); handle = null;
    finishQr(); finishCopy(); await settle();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(drawImage).not.toHaveBeenCalled();
    expect(document.querySelector("dialog")).toBeNull();
    expect(feedback().textContent).toBe("");
  });
});
