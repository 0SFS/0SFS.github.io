import { createRoot } from "react-dom/client";
import {
  FlightStatusOverlay,
  type FlightStatusOverlayOptions,
  type FlightStatusOverlayState,
} from "./FlightStatusOverlay";

export interface FlightStatusOverlayHandle {
  update(state: FlightStatusOverlayState): void;
  destroy(): void;
}

export function createFlightStatusOverlay(
  container: HTMLElement,
  options: FlightStatusOverlayOptions,
): FlightStatusOverlayHandle {
  const root = createRoot(container);
  let current: FlightStatusOverlayState = null;
  let rendered = "";

  const render = (): void => root.render(<FlightStatusOverlay {...options} state={current} />);
  render();

  return {
    update(state): void {
      // Rendered every tick; only touch React when the message actually changes.
      const key = state
        ? `${state.kind}|${state.message}|${state.kind === "fault" ? state.failed.join("|") : Math.floor(state.heldSeconds)}`
        : "";
      if (key === rendered) return;
      rendered = key;
      current = state;
      render();
    },
    destroy(): void {
      root.unmount();
    },
  };
}
