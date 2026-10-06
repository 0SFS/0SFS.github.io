// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tierAvailability, type AudioCapabilities } from "../audio/audioQuality";
import { DEFAULT_AUDIO_SETTINGS, type AudioQualityId } from "../audio/audioSettings";
import type { FlightAudioStatus } from "../audio/createFlightAudio";
import { SoundSettingsPanel, type SoundAction } from "./SoundSettingsPanel";

const roots: Root[] = [];
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => {
  await act(async () => { for (const root of roots.splice(0)) root.unmount(); });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const CAPABLE: AudioCapabilities = { audioWorklet: true, webAssembly: true, bankReady: false, loadObservable: false, highSynthesis: "procedural" };

function status(requested: AudioQualityId, overrides: Partial<FlightAudioStatus> = {}): FlightAudioStatus {
  return {
    enabled: true, requested, effective: "low", mode: "sound", gestureLocked: false, message: null, tireMessage: null,
    availability: {
      off: tierAvailability("off", CAPABLE), low: tierAvailability("low", CAPABLE),
      med: tierAvailability("med", CAPABLE), high: tierAvailability("high", CAPABLE),
    },
    stats: "Audio: low (requested auto)", transport: "port", sampleRateHz: 48_000, held: false,
    settings: { ...DEFAULT_AUDIO_SETTINGS, enabled: true, requested }, readOnlyReason: null,
    engine: null, core: null, running: null, telemetry: null,
    ...overrides,
  };
}

async function mount(state: FlightAudioStatus) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  const onAction = vi.fn<(action: SoundAction) => void>();
  await act(async () => root.render(<SoundSettingsPanel state={state} onAction={onAction} />));
  const button = (text: string) => [...host.querySelectorAll("button")].find((item) => item.textContent?.includes(text));
  return { host, onAction, button };
}

describe("sound settings panel", () => {
  it("names F135 approximation and keeps its calibration boundary visible", async () => {
    const panel = await mount(status("med", { telemetry: {
      combustionSource: "fuel-flow", missing: [], profileLabel: "Approximate F135 procedural sound",
      approximation: "One main-engine source with generic turbine tones. F135 acoustics are uncalibrated; separate lift-fan sound is not modeled.",
    } }));
    expect(panel.host.textContent).toContain("Approximate F135 procedural sound");
    expect(panel.host.textContent).toContain("One main-engine source");
    expect(panel.host.textContent).toContain("uncalibrated");
  });

  it.each(["med", "high"] as const)("sends %s the moment it is chosen, and asks for nothing more", async quality => {
    const panel = await mount(status("low"));
    const select = panel.host.querySelector<HTMLSelectElement>('select[aria-label="Sound quality"]')!;
    await act(async () => {
      // React tracks the value; set it through the native setter so the change is seen.
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, quality);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(panel.onAction).toHaveBeenCalledWith({ type: "quality", quality });
    expect(panel.onAction).toHaveBeenCalledOnce();
  });

  it("keeps acoustic calibration separate from High being selectable", async () => {
    const panel = await mount(status("high", { effective: "high" }));
    expect(panel.host.textContent).toContain("Acoustic calibration is pending");
    expect(panel.host.textContent).not.toContain("FJ33 sample bank");
  });

  it("shows Med running with no testing switch, and says it has no device evidence", async () => {
    const panel = await mount(status("med", { effective: "med" }));
    expect(panel.host.textContent).toMatch(/Requested Med · Effective Med/);
    expect(panel.host.textContent).toMatch(/no device qualification evidence yet, so Auto does not pick it/);
    expect(panel.button("anyway")).toBeUndefined();
    expect(panel.button("testing")).toBeUndefined();
  });

  it("keeps procedural Med and High selectable while identifying missing device evidence", async () => {
    const panel = await mount(status("low"));
    const options = [...panel.host.querySelectorAll<HTMLOptionElement>('select[aria-label="Sound quality"] option')];
    const med = options.find((option) => option.value === "med")!;
    const high = options.find((option) => option.value === "high")!;
    expect(med.disabled).toBe(false);
    expect(med.textContent).toBe("Med — Not yet validated");
    expect(high.disabled).toBe(false);
    expect(high.textContent).toBe("High — Not yet validated");
  });

  it("sends airframe wind volume on its own", async () => {
    const panel = await mount(status("low"));
    const slider = panel.host.querySelector<HTMLInputElement>('input[aria-label="Airframe wind volume"]')!;
    await act(async () => {
      // React tracks the value; set it through the native setter so the change is seen.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider, "0.25");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(panel.onAction).toHaveBeenCalledWith({ type: "settings", patch: { airframeVolume: 0.25 } });
  });

  it("shows one quieter afterburner slider and one continuous Camera–Cockpit slider, defaulting to Cockpit", async () => {
    const panel = await mount(status("med"));
    const afterburner = panel.host.querySelectorAll<HTMLInputElement>('input[aria-label="Afterburner volume"]');
    const position = panel.host.querySelectorAll<HTMLInputElement>('input[aria-label="Sound position"]');
    expect(afterburner).toHaveLength(1);
    expect(position).toHaveLength(1);
    expect(afterburner[0].value).toBe("0.5");
    expect(position[0].value).toBe("1");
    expect(position[0].type).toBe("range");
    expect(position[0].getAttribute("aria-valuetext")).toBe("Cockpit");
    expect(panel.host.textContent).toContain("Camera ↔ Cockpit");
    expect(panel.host.textContent).toContain("100% keeps its original level");
    expect(panel.host.textContent).toContain("Listen from Camera, Cockpit, or a position between them");
  });

  it("sends independent live afterburner and listener blend patches", async () => {
    const panel = await mount(status("med"));
    for (const [label, value] of [["Afterburner volume", "0.25"], ["Sound position", "0.4"]]) {
      const slider = panel.host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider, value);
        slider.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    expect(panel.onAction.mock.calls).toEqual([
      [{ type: "settings", patch: { afterburnerVolume: 0.25 } }],
      [{ type: "settings", patch: { listenerCockpitBlend: 0.4 } }],
    ]);
  });

  it.each([[0, "Camera"], [0.75, "75% Cockpit / 25% Camera"]] as const)(
    "labels a saved listener blend of %s as %s", async (value, expected) => {
      const panel = await mount(status("med", { settings: { ...DEFAULT_AUDIO_SETTINGS, listenerCockpitBlend: value } }));
      const slider = panel.host.querySelector<HTMLInputElement>('input[aria-label="Sound position"]')!;
      expect(slider.value).toBe(String(value));
      expect(slider.getAttribute("aria-valuetext")).toBe(expected);
    },
  );

  it.each([
    ["Master volume", "masterVolume", 2],
    ["Engine volume", "engineVolume", 4],
  ] as const)("offers %s up to 800% and sends its value independently", async (label, field, value) => {
    const panel = await mount(status("med", { settings: { ...DEFAULT_AUDIO_SETTINGS, [field]: value } }));
    const slider = panel.host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    expect(slider.max).toBe("8");
    expect(slider.value).toBe(String(value));
    expect(panel.host.textContent).toContain(`${label} · ${value * 100}%`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider, "8");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(panel.onAction.mock.calls).toEqual([[{ type: "settings", patch: { [field]: 8 } }]]);
    expect(panel.host.querySelector<HTMLInputElement>('input[aria-label="Afterburner volume"]')!.value).toBe("0.5");
  });
});
