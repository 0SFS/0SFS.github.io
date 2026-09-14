export interface OrbitInvertSettings {
  invertYaw: boolean;
  invertPitch: boolean;
  recenterMode: "hold" | "recenter";
}

export const DEFAULT_ORBIT_INVERT_SETTINGS: OrbitInvertSettings = {
  invertYaw: false,
  invertPitch: false,
  recenterMode: "hold",
};

const PREFERENCE_KEY = "osfs.orbit-invert";
let currentSettings: OrbitInvertSettings | null = null;

/** Shared with gamepad orbit without reading storage on every input frame. */
export function getOrbitInvertSettings(): Readonly<OrbitInvertSettings> {
  currentSettings ??= loadOrbitInvertSettings();
  return currentSettings;
}

export function normalizeOrbitInvertSettings(
  partial: Partial<OrbitInvertSettings> | null | undefined,
): OrbitInvertSettings {
  return {
    invertYaw: Boolean(partial?.invertYaw),
    invertPitch: Boolean(partial?.invertPitch),
    recenterMode: partial?.recenterMode === "recenter" ? "recenter" : "hold",
  };
}

export function loadOrbitInvertSettings(): OrbitInvertSettings {
  try {
    const raw = window.localStorage.getItem(PREFERENCE_KEY);
    if (!raw) return { ...DEFAULT_ORBIT_INVERT_SETTINGS };
    return normalizeOrbitInvertSettings(JSON.parse(raw) as Partial<OrbitInvertSettings>);
  } catch {
    return { ...DEFAULT_ORBIT_INVERT_SETTINGS };
  }
}

export function saveOrbitInvertSettings(settings: OrbitInvertSettings): void {
  currentSettings = normalizeOrbitInvertSettings(settings);
  try {
    window.localStorage.setItem(PREFERENCE_KEY, JSON.stringify(currentSettings));
  } catch {
    // Preference persistence is best-effort.
  }
}
