// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGMeter } from "./gMeter";

describe("G indicator", () => {
  let root: HTMLElement;
  afterEach(() => { root?.remove(); });
  const mount = (onToggleTab = vi.fn()) => {
    root = document.createElement("div");
    root.innerHTML = `<div class="flight-hud"><div class="flight-hud__tapes"><div class="flight-hud__g"></div></div></div>`;
    document.body.appendChild(root);
    const slot = root.querySelector<HTMLElement>(".flight-hud__g")!;
    const meter = createGMeter(slot, { onToggleTab });
    const chip = slot.querySelector<HTMLButtonElement>(".flight-g-meter")!;
    return { meter, chip, value: chip.querySelector<HTMLElement>('[data-value="g"]')!, onToggleTab };
  };

  it("is a tape in the HUD's slot that reads 1 g until told otherwise", () => {
    const t = mount();
    expect(t.chip.classList.contains("flight-hud__tape")).toBe(true);
    expect(t.chip.querySelector(".flight-hud__label")?.textContent).toBe("G");
    expect(t.value.textContent).toBe(" 1.0");
  });

  it("shows the load to one decimal at a fixed width", () => {
    const t = mount();
    for (const [g, text] of [[7.449, " 7.4"], [9, " 9.0"], [-2.26, "-2.3"], [10.04, "10.0"], [0.02, " 0.0"], [-0.04, " 0.0"]] as const) {
      t.meter.update(g);
      expect(t.value.textContent, String(g)).toBe(text);
    }
  });

  it("writes only when the number shown changes", () => {
    const t = mount();
    t.meter.update(3.31);
    const node = t.value.firstChild;
    t.meter.update(3.34);
    expect(t.value.firstChild).toBe(node);
    t.meter.update(3.36);
    expect(t.value.textContent).toBe(" 3.4");
  });

  it("toggles the G-forces tab when clicked", () => {
    const t = mount();
    t.chip.click();
    expect(t.onToggleTab).toHaveBeenCalledTimes(1);
  });

  it("hides, and comes back with the load it last read", () => {
    const t = mount();
    t.meter.update(4.2);
    t.meter.setVisible(false);
    expect(t.chip.hidden).toBe(true);
    t.meter.setVisible(true);
    expect(t.chip.hidden).toBe(false);
    expect(t.value.textContent).toBe(" 4.2");
  });

  it("removes its chip and stops listening on destroy", () => {
    const t = mount();
    t.meter.destroy();
    expect(root.querySelector(".flight-g-meter")).toBeNull();
    t.chip.click();
    expect(t.onToggleTab).not.toHaveBeenCalled();
  });
});
