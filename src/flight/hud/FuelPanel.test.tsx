// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FuelPanel, type FuelPanelState } from "./FuelPanel";

const roots: Root[] = [];
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => {
  await act(async () => { for (const root of roots.splice(0)) root.unmount(); });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const C172: FuelPanelState = {
  familyId: "cessna-172",
  tanks: [
    { index: 0, capacityLbs: 185, contentsLbs: 185, xIn: 56, yIn: -112, densityLbsPerGal: 6 },
    { index: 1, capacityLbs: 185, contentsLbs: 92.5, xIn: 56, yIn: 112, densityLbsPerGal: 6 },
  ],
};

const F35B: FuelPanelState = {
  familyId: "f-35b",
  tanks: [0, 1, 2, 3].map(index => ({
    index, capacityLbs: index < 2 ? 6550 : 2991, contentsLbs: index < 2 ? 2500 : 0,
    xIn: 368.52, yIn: [40, -40, 127.952756, -127.952756][index]!, densityLbsPerGal: 6.7,
    ...(index >= 2 ? { attached: true } : {}),
  })),
};

/** The panel as the app runs it: each change is written and drawn again. */
function Harness({ initial, onChange, onAttachmentChange }: {
  initial: FuelPanelState;
  onChange(contents: ReadonlyMap<number, number>): void;
  onAttachmentChange(index: number, attached: boolean): void;
}) {
  const [state, setState] = useState(initial);
  return <FuelPanel state={state} onChange={contents => {
    onChange(contents);
    setState(previous => ({
      ...previous,
      tanks: previous.tanks.map(tank => ({ ...tank, contentsLbs: contents.get(tank.index) ?? tank.contentsLbs })),
    }));
  }} onAttachmentChange={(index, attached) => {
    onAttachmentChange(index, attached);
    setState(previous => ({
      ...previous,
      tanks: previous.tanks.map(tank => tank.index === index ? { ...tank, attached, contentsLbs: 0 } : tank),
    }));
  }} />;
}

async function mount(state: FuelPanelState) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  const onChange = vi.fn();
  const onAttachmentChange = vi.fn();
  await act(async () => root.render(<Harness initial={state} onChange={onChange} onAttachmentChange={onAttachmentChange} />));
  return { host, onChange, onAttachmentChange };
}

async function slide(input: HTMLInputElement, value: number) {
  await act(async () => {
    // React tracks the value; set it through the native setter so the change is seen.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("Fuel panel", () => {
  it("shows the total and every tank over the aircraft's outline", async () => {
    const { host } = await mount(C172);
    const total = host.querySelector<HTMLInputElement>('input[aria-label="Total fuel"]')!;
    expect(total.max).toBe("370");
    expect(total.getAttribute("aria-valuetext")).toBe("278 lb of 370 lb, 75%");
    expect(host.querySelectorAll(".flight-fuel__outline polygon")).toHaveLength(1);
    const left = host.querySelector<HTMLElement>('.flight-fuel__tank:has(input[aria-label="Left wing tank"])')!;
    const right = host.querySelector<HTMLElement>('.flight-fuel__tank:has(input[aria-label="Right wing tank"])')!;
    // Nose up: the left wing is drawn on the left, both at the same station.
    expect(parseFloat(left.style.left)).toBeLessThan(parseFloat(right.style.left));
    expect(left.style.top).toBe(right.style.top);
    expect(left.classList.contains("is-vertical")).toBe(false);
    expect(host.querySelector(".flight-fuel__legend")!.textContent).toContain("Right wing93 lb of 185 lb, 50%");
  });

  it("sets one tank from its own slider", async () => {
    const { host, onChange } = await mount(C172);
    await slide(host.querySelector<HTMLInputElement>('input[aria-label="Right wing tank"]')!, 40);
    expect(onChange).toHaveBeenLastCalledWith(new Map([[1, 40]]));
  });

  it("moves every tank with the total and returns the pilot's split when it comes back", async () => {
    const { host, onChange } = await mount(C172);
    const total = host.querySelector<HTMLInputElement>('input[aria-label="Total fuel"]')!;
    await slide(total, 138.75);
    expect(onChange).toHaveBeenLastCalledWith(new Map([[0, 92.5], [1, 46.25]]));
    await slide(total, 370);
    expect(onChange).toHaveBeenLastCalledWith(new Map([[0, 185], [1, 185]]));
    await slide(total, 277.5);
    expect(onChange).toHaveBeenLastCalledWith(new Map([[0, 185], [1, 92.5]]));
    // Let go, and the next drag starts from the load as it now stands.
    await act(async () => total.dispatchEvent(new Event("pointerup", { bubbles: true })));
    await slide(host.querySelector<HTMLInputElement>('input[aria-label="Left wing tank"]')!, 0);
    await slide(total, 46.25);
    expect(onChange).toHaveBeenLastCalledWith(new Map([[0, 0], [1, 46.25]]));
  });

  it("shows and fills the F-35B's internal and attached external tanks", async () => {
    vi.stubEnv("BASE_URL", "/flight/");
    const { host, onChange } = await mount(F35B);
    const total = host.querySelector<HTMLInputElement>('input[aria-label="Total fuel"]')!;
    expect(total.max).toBe("19082");
    expect(total.getAttribute("aria-valuetext")).toBe("5,000 lb of 19,082 lb, 26%");
    expect(host.textContent).toContain("Capacity: internal 13,100 lb · attached external 5,982 lb.");
    expect(host.querySelectorAll(".flight-fuel__tank.is-vertical")).toHaveLength(4);
    expect([...host.querySelectorAll<HTMLInputElement>(".flight-fuel__tank input")]
      .map(input => input.getAttribute("aria-label"))).toEqual([
      "Left external tank", "Left internal tank", "Right internal tank", "Right external tank",
    ]);
    expect(host.textContent).toContain("Outline traced from AF267's F-35B model, CC BY 4.0.");
    expect(host.textContent).toContain("External tank and pylon by FlightGear F-35B contributors, GPLv3.");
    expect(host.querySelector<HTMLAnchorElement>('a')!.getAttribute("href"))
      .toBe("/flight/aircraft/f-35b/ExternalTank_FlightGear.NOTICE.md");
    await slide(total, 19082);
    expect(onChange).toHaveBeenLastCalledWith(new Map([[0, 6550], [1, 6550], [2, 2991], [3, 2991]]));
    expect(total.getAttribute("aria-valuetext")).toBe("19,082 lb of 19,082 lb, 100%");
  });

  it("jettisons either external tank with its fuel and respawns an empty tank", async () => {
    const { host, onChange, onAttachmentChange } = await mount({
      ...F35B,
      tanks: F35B.tanks.map(tank => ({ ...tank, contentsLbs: [2500, 2500, 1000, 2000][tank.index]! })),
    });
    const total = host.querySelector<HTMLInputElement>('input[aria-label="Total fuel"]')!;
    const left = host.querySelector<HTMLInputElement>('input[aria-label="Left external tank"]')!;
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Jettison left external tank"]')!.click());
    expect(onAttachmentChange).toHaveBeenLastCalledWith(3, false);
    expect(total.max).toBe("16091");
    expect(total.getAttribute("aria-valuetext")).toBe("6,000 lb of 16,091 lb, 37%");
    expect(left.disabled).toBe(true);
    expect(left.getAttribute("aria-valuetext")).toBe("Detached");
    expect(host.querySelector(".flight-fuel__legend")!.textContent).toContain("Left externalDetachedRespawn empty");

    await slide(total, 16091);
    expect(onChange).toHaveBeenLastCalledWith(new Map([[0, 6550], [1, 6550], [2, 2991]]));
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Jettison right external tank"]')!.click());
    expect(onAttachmentChange).toHaveBeenLastCalledWith(2, false);
    expect(total.max).toBe("13100");
    expect(total.getAttribute("aria-valuetext")).toBe("13,100 lb of 13,100 lb, 100%");
    expect(host.textContent).toContain("Capacity: internal 13,100 lb · attached external 0 lb.");

    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Respawn left external tank"]')!.click());
    expect(onAttachmentChange).toHaveBeenLastCalledWith(3, true);
    expect(total.max).toBe("16091");
    expect(total.getAttribute("aria-valuetext")).toBe("13,100 lb of 16,091 lb, 81%");
    expect(left.disabled).toBe(false);
    expect(left.value).toBe("0");
    // The previous drag filled a different set of tanks. The newly attached tank
    // gets this extra fuel; the missing right tank stays out of the distribution.
    await slide(total, 14100);
    expect(onChange).toHaveBeenLastCalledWith(new Map([[0, 6550], [1, 6550], [3, 1000]]));
  });

  it("rebases an unfinished total drag when attachment state changes elsewhere", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    const onChange = vi.fn();
    await act(async () => root.render(<FuelPanel state={F35B} onChange={onChange} />));
    const total = host.querySelector<HTMLInputElement>('input[aria-label="Total fuel"]')!;
    await slide(total, 19082);
    const state: FuelPanelState = {
      ...F35B,
      tanks: F35B.tanks.map(tank => ({
        ...tank,
        ...(tank.index >= 2 ? { attached: false } : {}),
        contentsLbs: tank.index === 0 ? 4000 : tank.index === 1 ? 2000 : 0,
      })),
    };
    await act(async () => root.render(<FuelPanel state={state} onChange={onChange} />));
    await slide(total, 3000);
    expect(onChange).toHaveBeenLastCalledWith(new Map([[0, 2000], [1, 1000]]));
  });

  it("says so when the flight model has no tanks", async () => {
    const { host } = await mount({ familyId: "cessna-172", tanks: [] });
    expect(host.querySelector("input")).toBeNull();
    expect(host.textContent).toContain("reports no fuel tanks");
  });
});
