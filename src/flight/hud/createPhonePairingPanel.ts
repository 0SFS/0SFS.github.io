import QRCode from "qrcode";
import type { PhoneControlSession } from "../remote/createPhoneControlSession";
import "./phonePairing.css";

export interface PhonePairingPanelOptions {
  /**
   * Create a QR as the panel opens, as the pairing dialog did when it had a
   * button of its own. Off on a phone, which opens the tab to become the remote
   * far more often than to pair another one.
   */
  pairOnOpen: boolean;
}

/**
 * The computer's half of pairing, inside the Remote Control tab. The session
 * outlives it: switching tabs unmounts the panel and keeps the phone, the
 * invitation and the connection timeline.
 */
export function createPhonePairingPanel(host: HTMLElement, session: PhoneControlSession, options: PhonePairingPanelOptions) {
  const panel = document.createElement("div");
  panel.className = "phone-pairing";
  panel.innerHTML = `<p data-status role="status"></p><canvas data-qr aria-label="Scan this QR code with your phone" role="img" hidden></canvas>
    <p data-expiry></p><p class="flight-panel__hint">Scan the QR with the phone's camera — or, in a controller opened from the Home Screen, with its <strong>Scan QR code</strong> button. Keep both devices on the same Wi-Fi for the best chance of a direct connection, then tap <strong>Take control</strong> on the phone.</p>
    <p data-service hidden>Pairing service disconnected. An established flight connection can keep working.</p>
    <div class="phone-pairing__actions"><button type="button" class="flight-panel__command" data-new>Create new QR</button><button type="button" class="flight-panel__command" data-copy hidden>Copy link</button><button type="button" class="flight-panel__command" data-take hidden>Take control</button><button type="button" class="flight-panel__command" data-disconnect hidden>Disconnect</button></div>
    <p data-feedback role="status"></p>
    <details class="phone-pairing__diagnostics"><summary>Connection details</summary>
      <p data-cause hidden></p>
      <div class="phone-pairing__actions"><button type="button" class="flight-panel__command" data-copy-report>Copy diagnostics</button></div>
      <pre data-report tabindex="0" aria-label="Connection timeline"></pre>
    </details>`;
  host.append(panel);
  const element = <T extends HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;
  const canvas = element<HTMLCanvasElement>("[data-qr]");
  const status = element("[data-status]");
  const expiry = element("[data-expiry]");
  const feedback = element("[data-feedback]");
  const newButton = element<HTMLButtonElement>("[data-new]");
  const copyButton = element<HTMLButtonElement>("[data-copy]");
  const diagnostics = element<HTMLDetailsElement>(".phone-pairing__diagnostics");
  const cause = element("[data-cause]");
  const report = element<HTMLPreElement>("[data-report]");
  let renderedUrl: string | null = null;
  let renderGeneration = 0;
  let openedForFailure = false;
  let disposed = false;
  const renderDiagnostics = () => {
    if (disposed) return;
    const failure = session.log.facts().failure;
    cause.hidden = failure === null;
    cause.textContent = failure ? `${failure.code} — ${failure.detail}` : "";
    // A failure is the moment the timeline is worth reading; open it once.
    if (failure && !diagnostics.open && !openedForFailure) { diagnostics.open = true; openedForFailure = true; }
    if (!failure) openedForFailure = false;
    if (diagnostics.open) report.textContent = session.log.report();
  };
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
    renderDiagnostics();
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
  diagnostics.addEventListener("toggle", renderDiagnostics);
  element("[data-copy-report]").onclick = () => {
    const text = session.log.report();
    if (!navigator.clipboard) { feedback.textContent = "Clipboard unavailable. Select the diagnostics text instead."; return; }
    void navigator.clipboard.writeText(text).then(() => {
      if (!disposed) feedback.textContent = "Diagnostics copied. Addresses are masked to their subnet.";
    }).catch(() => { if (!disposed) feedback.textContent = "Could not copy. Select the diagnostics text instead."; });
  };
  const unsubscribeLog = session.log.subscribe(renderDiagnostics);
  const unsubscribe = session.subscribe(update);
  const timer = setInterval(update, 1000);
  if (options.pairOnOpen && ["off", "expired", "error"].includes(session.getSnapshot().phase)) void session.startPairing();
  update();
  return {
    destroy() { disposed = true; renderGeneration++; clearInterval(timer); unsubscribeLog(); unsubscribe(); panel.remove(); },
  };
}
export type PhonePairingPanel = ReturnType<typeof createPhonePairingPanel>;
