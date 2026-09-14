export interface GamepadResponseSettings {
  mode: "smooth" | "direct";
  responseTimeSec: number;
  deadzoneMode: "cutoff" | "scaled";
}

export const DEFAULT_GAMEPAD_RESPONSE_SETTINGS: Readonly<GamepadResponseSettings> = Object.freeze({
  mode: "smooth",
  // The original update uses min(1, 8 * dt): a nominal 95% response in 3 / 8 seconds.
  responseTimeSec: 0.375,
  deadzoneMode: "cutoff",
});

export interface GamepadResponseController {
  getSettings(): Readonly<GamepadResponseSettings>;
  setSettings(settings: Partial<GamepadResponseSettings>): void;
  subscribe(listener: () => void): () => void;
}

const STORAGE_KEY = "osfs.gamepad-response";

function normalizeSettings(value: unknown): GamepadResponseSettings {
  const partial = value !== null && typeof value === "object"
    ? value as Partial<GamepadResponseSettings> : {};
  return {
    mode: partial.mode === "direct" ? "direct" : "smooth",
    responseTimeSec: typeof partial.responseTimeSec === "number" && Number.isFinite(partial.responseTimeSec)
      ? Math.max(0.05, Math.min(2, partial.responseTimeSec))
      : DEFAULT_GAMEPAD_RESPONSE_SETTINGS.responseTimeSec,
    deadzoneMode: partial.deadzoneMode === "scaled" ? "scaled" : "cutoff",
  };
}

function loadSettings(): GamepadResponseSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_GAMEPAD_RESPONSE_SETTINGS };
  }
}

export function createGamepadResponseController(): GamepadResponseController {
  let settings: Readonly<GamepadResponseSettings> = Object.freeze(loadSettings());
  const listeners = new Set<() => void>();
  return {
    getSettings: () => settings,
    setSettings(partial): void {
      const next = normalizeSettings({ ...settings, ...partial });
      if (next.mode === settings.mode && next.responseTimeSec === settings.responseTimeSec
        && next.deadzoneMode === settings.deadzoneMode) return;
      settings = Object.freeze(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch {
        // Keep the selected response for this session if storage is unavailable.
      }
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
