import { createRoot } from "react-dom/client";
import { FlightFullscreenNotice } from "./FlightFullscreenNotice";
import "../remote/phonePopup.css";

export interface FullscreenNotice {
  /** Puts the notice back up after it was dismissed. */
  open(): void;
  destroy(): void;
}

/**
 * The controller's iPhone fullscreen notice, on the flight page. The words, the
 * card and the remembered dismissal are the controller's own — one component,
 * one hook, one file of words — so the two pages cannot say different things.
 * Only the host is new, because this page is not React.
 */
export function createFullscreenNotice(parent: HTMLElement): FullscreenNotice {
  const host = document.createElement("div");
  host.className = "phone-popup-host";
  parent.append(host);
  const root = createRoot(host);
  let reopen = (): void => {};
  const bind = (open: () => void): void => { reopen = open; };
  root.render(<FlightFullscreenNotice bind={bind} />);
  return {
    open: () => reopen(),
    destroy(): void {
      root.unmount();
      host.remove();
    },
  };
}
