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
  const root = createRoot(container);
  let snapshot = initialSnapshot;

  const render = () => root.render(<FlightControlPanel {...options} snapshot={snapshot} />);
  render();

  return {
    update(nextSnapshot): void {
      snapshot = nextSnapshot;
      render();
    },
    destroy(): void {
      root.unmount();
    },
  };
}