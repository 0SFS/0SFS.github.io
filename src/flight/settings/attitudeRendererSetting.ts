import {
  isAttitudeRendererPreference,
  type AttitudeRendererPreference,
  type AttitudeRendererStatus,
} from "../hud/attitudeRenderer";

/**
 * Settings → Attitude indicator → Renderer: what the pilot asked for, kept
 * across sessions, and what the instrument actually draws with, which can
 * differ when WebGPU is missing.
 */

const STORAGE_KEY = "osfs.attitude-renderer";

export interface AttitudeRendererSettingState {
  preference: AttitudeRendererPreference;
  /** Null until the instrument reports. */
  status: AttitudeRendererStatus | null;
}

export interface AttitudeRendererSetting {
  /** A stable snapshot, replaced on every change. */
  getState(): AttitudeRendererSettingState;
  setPreference(preference: AttitudeRendererPreference): void;
  publishStatus(status: AttitudeRendererStatus): void;
  subscribe(listener: () => void): () => void;
}

export function createAttitudeRendererSetting(storage: Pick<Storage, "getItem" | "setItem"> | null): AttitudeRendererSetting {
  let stored: string | null = null;
  try {
    stored = storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    // Unreadable storage leaves the default.
  }
  let state: AttitudeRendererSettingState = {
    preference: isAttitudeRendererPreference(stored) ? stored : "auto",
    status: null,
  };
  const listeners = new Set<() => void>();
  const update = (next: AttitudeRendererSettingState): void => {
    state = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    getState: () => state,
    setPreference(preference) {
      if (preference === state.preference) return;
      try {
        storage?.setItem(STORAGE_KEY, preference);
      } catch {
        // Persistence is best-effort; private mode must not break the setting for this session.
      }
      update({ ...state, preference });
    },
    publishStatus(status) {
      update({ ...state, status: { ...status } });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const attitudeRendererSetting = createAttitudeRendererSetting((() => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
})());
