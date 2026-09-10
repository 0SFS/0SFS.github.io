import { createRoot } from "react-dom/client";
import {
  FlightControlPanel,
  type FlightControlPanelHandle,
  type FlightControlPanelOptions,
  type FlightControlPanelSnapshot,
} from "./FlightControlPanel";

export function createFlightControlPanel(
  container: HTMLElement,
  initialSnapshot: FlightControlPanelSnapshot,
  options: FlightControlPanelOptions,
): FlightControlPanelHandle {
  const overlayHost = document.createElement("div");
  overlayHost.className = "flight-window-overlay-host";
  container.append(overlayHost);
  const root = createRoot(overlayHost);
  let snapshot = initialSnapshot;
  const overlayApiRef: { current: WindowOverlayHandle<FlightPanelTab> | null } = { current: null };

  const render = () => root.render(
    <FlightControlPanel {...options} snapshot={snapshot} overlayApiRef={overlayApiRef} />,
  );
  render();

  return {
    update(nextSnapshot): void {
      snapshot = nextSnapshot;
      render();
    },
    openOrSelectTab(tabId): void {
      overlayApiRef.current?.openOrSelectTab(tabId);
    },
    destroy(): void {
      root.unmount();
      overlayHost.remove();
    },
  };
}