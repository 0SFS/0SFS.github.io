import "foss-earth/windowing.css";
import { createRoot } from "react-dom/client";
import { createGlobeApp } from "foss-earth";
import { WindowOverlay } from "foss-earth/shell";

/** Compose the public globe runtime with FOSS Earth's optional window UI. */
export async function createGlobeModeApp(root: HTMLElement) {
  const globe = await createGlobeApp(root);
  const host = document.createElement("div");
  host.className = "foss-earth-overlay-root";
  (root.querySelector(".globe-shell") ?? root).append(host);
  const overlay = createRoot(host);
  overlay.render(<WindowOverlay
    getViewState={globe.getViewState}
    setViewState={({ latDeg, lonDeg }) => globe.setViewState({ latDeg, lonDeg })}
  />);
  return {
    ...globe,
    destroy() {
      overlay.unmount();
      host.remove();
      globe.destroy();
    },
  };
}
