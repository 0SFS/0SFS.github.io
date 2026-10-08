// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createGVisionOverlay } from "./gVisionOverlay";

describe("G vision overlay", () => {
  let host: HTMLElement;
  afterEach(() => { host?.remove(); });
  const mount = () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const overlay = createGVisionOverlay(host);
    const layer = (kind: string) => host.querySelector<HTMLElement>(`.flight-g-vision__layer--${kind}`)!;
    return { overlay, blackout: layer("blackout"), redout: layer("redout") };
  };
  const closed = (layer: HTMLElement) => layer.style.getPropertyValue("--closed");

  it("draws nothing until a vignette closes, and is no part of the page's reading order", () => {
    const t = mount();
    expect(host.getAttribute("aria-hidden")).toBe("true");
    expect(t.blackout.hidden).toBe(true);
    expect(t.redout.hidden).toBe(true);
  });

  it("closes each vignette by its own amount", () => {
    const t = mount();
    t.overlay.show(0.5, 0);
    expect(t.blackout.hidden).toBe(false);
    expect(closed(t.blackout)).toBe("0.5");
    expect(t.redout.hidden).toBe(true);
    t.overlay.show(0, 0.25);
    expect(t.blackout.hidden).toBe(true);
    expect(t.redout.hidden).toBe(false);
    expect(closed(t.redout)).toBe("0.25");
  });

  it("keeps a vignette between clear and the whole view, whatever it is told", () => {
    const t = mount();
    t.overlay.show(3, -1);
    expect(closed(t.blackout)).toBe("1");
    expect(t.redout.hidden).toBe(true);
    t.overlay.show(Number.NaN, 0);
    expect(t.blackout.hidden).toBe(true);
  });

  it("leaves the style alone for a change too small to draw", () => {
    const t = mount();
    t.overlay.show(0.5, 0);
    let writes = 0;
    const setProperty = t.blackout.style.setProperty.bind(t.blackout.style);
    t.blackout.style.setProperty = (...args: Parameters<CSSStyleDeclaration["setProperty"]>) => { writes += 1; setProperty(...args); };
    t.overlay.show(0.5001, 0);
    expect(writes).toBe(0);
    t.overlay.show(0.502, 0);
    expect(writes).toBe(1);
    expect(closed(t.blackout)).toBe("0.502");
  });

  it("lies over the 3D view alone until told to cover everything, and back", () => {
    const t = mount();
    const over = () => host.classList.contains("flight-g-vision--over-everything");
    expect(over()).toBe(false);
    t.overlay.cover(true);
    expect(over()).toBe(true);
    t.overlay.cover(false);
    expect(over()).toBe(false);
  });

  it("removes its layers on destroy", () => {
    const t = mount();
    t.overlay.show(1, 1);
    t.overlay.cover(true);
    t.overlay.destroy();
    expect(host.children).toHaveLength(0);
    expect(host.classList.contains("flight-g-vision--over-everything")).toBe(false);
  });
});
