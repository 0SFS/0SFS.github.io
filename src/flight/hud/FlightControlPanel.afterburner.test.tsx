// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WindowOverlayProps } from "foss-earth/shell";
import { createSettingsRegistry, FOSS_EARTH_PARAMETERS } from "foss-earth/settings";
import type { AircraftId } from "../aircraft/aircraftCatalog";
import { DEFAULT_AUDIO_SETTINGS } from "../audio/audioSettings";
import { tierAvailability, type AudioCapabilities } from "../audio/audioQuality";
import type { FlightAudioStatus } from "../audio/createFlightAudio";
import { registerFlightSettings } from "../settings/registerFlightSettings";
import { FlightControlPanel, type FlightControlPanelSnapshot, type FlightPanelTab } from "./FlightControlPanel";

// Exercise the flight's aircraft capability and actual registry controls. The
// shared window/workspace behavior is covered in FOSS Earth, without a GPU.
vi.mock("foss-earth/shell", async importOriginal => {
  const actual = await importOriginal<typeof import("foss-earth/shell")>();
  return {
    ...actual,
    WindowOverlay: ({ additionalTabs = [], renderAdditionalTab }: WindowOverlayProps<FlightPanelTab>) => <>
      <nav>{additionalTabs.map(tab => <button key={tab.id}>{tab.label}</button>)}</nav>
      {additionalTabs.filter(tab => tab.id === "afterburner" || tab.id === "sound").map(tab =>
        <section key={tab.id} data-flight-tab={tab.id}>{renderAdditionalTab?.(tab.id)}</section>)}
    </>,
  };
});

const roots: Root[] = [];
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => {
  await act(async () => { for (const root of roots.splice(0)) root.unmount(); });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const CAPABLE: AudioCapabilities = {
  audioWorklet: true, webAssembly: true, bankReady: false, loadObservable: false, highSynthesis: "procedural",
};

const sound: FlightAudioStatus = {
  enabled: false, requested: "auto", effective: "off", mode: "sound", gestureLocked: false,
  message: null, tireMessage: null, stats: "Audio off", transport: "port", sampleRateHz: 48_000,
  availability: {
    off: tierAvailability("off", CAPABLE), low: tierAvailability("low", CAPABLE),
    med: tierAvailability("med", CAPABLE), high: tierAvailability("high", CAPABLE),
  },
  held: false, settings: DEFAULT_AUDIO_SETTINGS, readOnlyReason: null,
  engine: null, core: null, running: null, telemetry: null,
};

async function mount(aircraftId: AircraftId) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  const settings = createSettingsRegistry({ storage: null });
  settings.register(FOSS_EARTH_PARAMETERS);
  const parameters = registerFlightSettings(settings);
  const onSoundAction = vi.fn();
  // The mocked workspace renders only these two tabs; unrelated callbacks and
  // telemetry are not consumed. Keep the aircraft selection fields real.
  const props = {
    settings, parameters, onSoundAction,
    snapshot: { aircraftId, lodId: "auto", sound } as FlightControlPanelSnapshot,
    overlayApiRef: { current: null },
  } as Parameters<typeof FlightControlPanel>[0];
  const render = async (nextAircraftId: AircraftId) => {
    await act(async () => root.render(<FlightControlPanel {...props}
      snapshot={{ ...props.snapshot, aircraftId: nextAircraftId }} />));
  };
  await render(aircraftId);
  return { host, settings, render };
}

describe("aircraft Afterburner tab", () => {
  it.each(["cessna-172", "cirrus-vision-jet-g2"] as const)("is absent on %s", async aircraftId => {
    const { host } = await mount(aircraftId);
    expect([...host.querySelectorAll("nav button")].some(button => button.textContent === "Afterburner")).toBe(false);
    expect(host.querySelector('[data-flight-tab="afterburner"]')).toBeNull();
    expect(host.querySelector('input[aria-label="Afterburner volume"]')).toBeNull();
  });

  it("provides the only dry appearance and afterburner volume controls, updating their registry values live", async () => {
    const { host, settings } = await mount("f-35b");
    expect([...host.querySelectorAll("nav button")].filter(button => button.textContent === "Afterburner")).toHaveLength(1);
    const tab = host.querySelector('[data-flight-tab="afterburner"]')!;
    expect([...tab.querySelectorAll<HTMLElement>("[data-settings-section]")].map(section => section.dataset.settingsSection))
      .toEqual(["afterburner/appearance", "afterburner/sound"]);
    const dry = tab.querySelector<HTMLInputElement>('[data-parameter="osfs.exhaust.dryIntensity"] input[type="range"]')!;
    const afterburner = tab.querySelector<HTMLInputElement>('[data-parameter="osfs.sound.afterburnerVolume"] input[type="range"]')!;
    expect([dry.min, dry.max, dry.value]).toEqual(["0.5", "3", "1"]);
    expect(afterburner.value).toBe("0.5");
    expect(host.querySelectorAll('input[type="range"][aria-label="Afterburner volume"]')).toHaveLength(1);
    expect(host.querySelector('[data-flight-tab="sound"] [data-parameter="osfs.sound.afterburnerVolume"]')).toBeNull();
    await act(async () => {
      dry.value = "1.75";
      dry.dispatchEvent(new Event("input", { bubbles: true }));
      afterburner.value = "0";
      afterburner.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(settings.get("osfs.exhaust.dryIntensity")).toBe(1.75);
    expect(settings.get("osfs.sound.afterburnerVolume")).toBe(0);
  });

  it("removes the tab and its controls when the active aircraft no longer has an afterburner", async () => {
    const { host, render } = await mount("f-35b");
    expect(host.querySelector('[data-flight-tab="afterburner"]')).not.toBeNull();
    await render("cirrus-vision-jet-g2");
    expect(host.querySelector('[data-flight-tab="afterburner"]')).toBeNull();
    expect(host.querySelector('input[aria-label="Afterburner volume"]')).toBeNull();
  });
});
