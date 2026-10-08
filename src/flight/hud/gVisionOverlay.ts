import "./gVisionOverlay.css";

/**
 * The vignettes a load on the pilot closes over the view: black for sight
 * lost to positive load, red for negative. They lie over everything on the
 * screen, or over the 3D view alone with the instruments and controls above
 * them, and they take no input. The stylesheet draws each from one number,
 * how far it has closed, so a change costs one custom property and a settled
 * vignette costs nothing.
 */

export interface GVisionOverlayHandle {
  /** How far each vignette has closed: 0 draws nothing, 1 covers the view. */
  show(blackout: number, redout: number): void;
  /** Over everything on the screen, or over the 3D view alone. */
  cover(everything: boolean): void;
  destroy(): void;
}

/** Steps of closing a vignette is drawn in: finer than a display can show. */
const STEPS = 1000;

function createLayer(host: HTMLElement, kind: "blackout" | "redout"): (closed: number) => void {
  const layer = document.createElement("div");
  layer.className = `flight-g-vision__layer flight-g-vision__layer--${kind}`;
  layer.hidden = true;
  host.appendChild(layer);
  let shown = 0;
  return (closed) => {
    const next = Math.round(Math.min(1, Math.max(0, Number.isFinite(closed) ? closed : 0)) * STEPS);
    if (next === shown) return;
    shown = next;
    layer.hidden = next === 0;
    layer.style.setProperty("--closed", String(next / STEPS));
  };
}

export function createGVisionOverlay(host: HTMLElement): GVisionOverlayHandle {
  host.classList.add("flight-g-vision");
  host.setAttribute("aria-hidden", "true");
  const blackout = createLayer(host, "blackout");
  const redout = createLayer(host, "redout");
  return {
    show(nextBlackout: number, nextRedout: number): void {
      blackout(nextBlackout);
      redout(nextRedout);
    },
    cover(everything: boolean): void {
      host.classList.toggle("flight-g-vision--over-everything", everything);
    },
    destroy(): void {
      host.classList.remove("flight-g-vision--over-everything");
      host.replaceChildren();
    },
  };
}
