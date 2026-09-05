import type { GlobeViewState } from "../engine/types";

export interface StatusHudHandle {
  update(state: GlobeViewState): void;
  destroy(): void;
}

function formatZoom(distanceMeters: number): string {
  if (distanceMeters >= 1_000_000) return `${(distanceMeters / 1_000_000).toFixed(1)}Mm`;
  if (distanceMeters >= 1_000) return `${(distanceMeters / 1_000).toFixed(0)}km`;
  return `${distanceMeters.toFixed(0)}m`;
}

export function createStatusHud(element: HTMLElement): StatusHudHandle {
  function update(state: GlobeViewState): void {
    const { latDeg, lonDeg, headingDeg, pitchDeg, zoomMeters } = state;
    const latStr = `${Math.abs(latDeg).toFixed(4)}\u00B0${latDeg >= 0 ? "N" : "S"}`;
    const lonStr = `${Math.abs(lonDeg).toFixed(4)}\u00B0${lonDeg >= 0 ? "E" : "W"}`;
    const hdgStr = `h${String(Math.round(((headingDeg % 360) + 360) % 360)).padStart(3, "0")}\u00B0`;
    const pitchStr = `p${String(Math.round(pitchDeg)).padStart(2, "0")}\u00B0`;
    const zoomStr = `z${formatZoom(zoomMeters)}`;
    element.textContent = `${latStr} ${lonStr} ${hdgStr} ${pitchStr} ${zoomStr}`;
  }

  function destroy(): void {
    element.textContent = "";
  }

  return { update, destroy };
}
