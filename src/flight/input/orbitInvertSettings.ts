export interface OrbitInvertSettings {
  invertYaw: boolean;
  invertPitch: boolean;
}

export const DEFAULT_ORBIT_INVERT_SETTINGS: OrbitInvertSettings = {
  invertYaw: false,
  invertPitch: false,
};

const PREFERENCE_KEY = "osfs.orbit-invert";

export function normalizeOrbitInvertSettings(
  partial: Partial<OrbitInvertSettings> | null | undefined,
): OrbitInvertSettings {
  return {
    invertYaw: Boolean(partial?.invertYaw),
    invertPitch: Boolean(partial?.invertPitch),
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
  try {
    window.localStorage.setItem(PREFERENCE_KEY, JSON.stringify(normalizeOrbitInvertSettings(settings)));
  } catch {
    // Preference persistence is best-effort.
  }
}
