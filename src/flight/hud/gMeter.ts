import "./gMeter.css";

/**
 * The G indicator: the load at the pilot's seat, as a chip in the left tape
 * row after AoA. It is the G-forces tab's button, as the engine gauge is the
 * Engine tab's.
 */

export interface GMeterOptions {
  /** Shows the G-forces tab, or closes it when it is already showing. */
  onToggleTab(): void;
}

export interface GMeterHandle {
  /** `g` is the load at the pilot's seat: 1 in level flight. */
  update(g: number): void;
  setVisible(visible: boolean): void;
  destroy(): void;
}

/** One decimal at a fixed width, and never "-0.0". */
function formatG(g: number): string {
  const tenths = Math.round(g * 10) / 10;
  return (tenths === 0 ? 0 : tenths).toFixed(1).padStart(4, " ");
}

export function createGMeter(root: HTMLElement, options: GMeterOptions): GMeterHandle {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "flight-hud__tape flight-g-meter";
  chip.title = "Load at the pilot's seat, in g: 1 in level flight. Click to show or hide the G-forces tab.";
  chip.setAttribute("aria-label", "Load in g. Show or hide G-forces");
  chip.innerHTML = `
    <span class="flight-hud__tape-header"><span class="flight-hud__label">G</span></span>
    <span class="flight-hud__value" data-value="g"> 1.0</span>
  `;
  const slot = root.closest(".flight-hud")?.querySelector(".flight-hud__g") ?? root;
  slot.appendChild(chip);
  const value = chip.querySelector<HTMLElement>('[data-value="g"]');
  if (!value) throw new Error("G indicator markup failed to initialize.");

  const onClick = (): void => options.onToggleTab();
  chip.addEventListener("click", onClick);

  let shown = " 1.0";
  return {
    update(g: number): void {
      const next = formatG(g);
      if (next === shown) return;
      shown = next;
      value.textContent = next;
    },
    setVisible(visible: boolean): void {
      chip.hidden = !visible;
    },
    destroy(): void {
      chip.removeEventListener("click", onClick);
      chip.remove();
    },
  };
}
