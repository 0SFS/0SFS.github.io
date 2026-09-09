import QRCode from "qrcode";
import type { PhoneControlSession } from "../remote/createPhoneControlSession";
import "./phonePairing.css";

export function createPhonePairingDialog(container: HTMLElement, session: PhoneControlSession) {
  const dialog = document.createElement("dialog");
  dialog.className = "phone-pairing";
  dialog.setAttribute("aria-labelledby", "phone-pairing-title");
  dialog.innerHTML = `<header><h2 id="phone-pairing-title">Phone controller</h2><button type="button" data-close aria-label="Close phone controller">×</button></header>
    <p data-status role="status"></p><canvas data-qr aria-label="Scan this QR code with your phone camera" role="img" hidden></canvas>
    <p data-expiry></p><p>Open your phone camera and scan. Keep both devices on the same Wi-Fi for the best chance of a direct connection. Tap Fly on your phone to take control.</p>
    <p data-service hidden>Pairing service disconnected. An established flight connection can keep working.</p>
    <div class="phone-pairing__actions"><button type="button" data-new>Create new QR</button><button type="button" data-copy hidden>Copy link</button><button type="button" data-take hidden>Take control</button><button type="button" data-disconnect hidden>Disconnect</button></div>
    <p data-feedback role="status"></p>`;
  container.append(dialog);
  const element = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const canvas = element<HTMLCanvasElement>("[data-qr]");
  const status = element("[data-status]");
  const expiry = element("[data-expiry]");
  const feedback = element("[data-feedback]");
  const newButton = element<HTMLButtonElement>("[data-new]");
  const copyButton = element<HTMLButtonElement>("[data-copy]");
  let renderedUrl: string | null = null;
  let renderGeneration = 0;
  let disposed = false;
  let previousFocus: HTMLElement | null = null;
  const update = () => {
    const state = session.getSnapshot();
    status.textContent = state.message;
    element("[data-service]").hidden = state.signalingAvailable;
    newButton.disabled = state.phase === "preparing" || state.phase === "authenticating";
    newButton.textContent = state.phase === "paired" ? "Replace phone / New QR" : "Create new QR";
    copyButton.hidden = !state.invitationUrl;
    element("[data-take]").hidden = state.owner !== "phone";
    element("[data-disconnect]").hidden = state.phase === "off" || state.phase === "expired" || state.phase === "error";
    expiry.textContent = state.expiresAt === null ? "" : `QR expires in ${Math.max(0, Math.ceil((state.expiresAt - performance.now()) / 1000))} seconds`;
    if (renderedUrl === state.invitationUrl) return;
    renderedUrl = state.invitationUrl;
    const generation = ++renderGeneration;
    canvas.hidden = true;
    feedback.textContent = "";
    if (renderedUrl) {
      // Render offscreen so a late QR promise cannot repaint an expired invitation.
      const nextCanvas = document.createElement("canvas");
      void QRCode.toCanvas(nextCanvas, renderedUrl, { width: 280, margin: 3, errorCorrectionLevel: "M" }).then(() => {
        if (disposed || generation !== renderGeneration) return;
        canvas.width = nextCanvas.width; canvas.height = nextCanvas.height;
        canvas.getContext("2d")?.drawImage(nextCanvas, 0, 0);
        canvas.hidden = false;
      }).catch(() => { if (!disposed && generation === renderGeneration) feedback.textContent = "QR unavailable. Use Copy link."; });
    }
  };
  const close = () => { dialog.close(); previousFocus?.focus(); };
  element("[data-close]").onclick = close;
  dialog.addEventListener("close", () => previousFocus?.focus());
  newButton.onclick = () => { void session.startPairing(); };
  copyButton.onclick = () => {
    const url = session.getSnapshot().invitationUrl;
    if (!url) return;
    if (!navigator.clipboard) { feedback.textContent = "Clipboard unavailable in this browser. Scan the QR instead."; return; }
    void navigator.clipboard.writeText(url).then(() => {
      if (!disposed) feedback.textContent = "Link copied. Share only with the phone you want to control this aircraft.";
    }).catch(() => { if (!disposed) feedback.textContent = "Could not copy. Scan the QR instead."; });
  };
  element("[data-take]").onclick = () => session.takeControl();
  element("[data-disconnect]").onclick = () => session.disconnect();
  const unsubscribe = session.subscribe(update);
  const timer = setInterval(() => { if (dialog.open) update(); }, 1000);
  update();
  return {
    open() {
      if (disposed || dialog.open) return;
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      if (["off", "expired", "error"].includes(session.getSnapshot().phase)) void session.startPairing();
      update();
    },
    destroy() { disposed = true; renderGeneration++; clearInterval(timer); unsubscribe(); dialog.remove(); },
  };
}
export type PhonePairingDialog = ReturnType<typeof createPhonePairingDialog>;
