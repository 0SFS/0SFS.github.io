import type { FrameProfiler } from "foss-earth/perf";

/**
 * The running flight's frame profiler, for the Debug tab and DevTools.
 * `window.osfsFrameProfiler.summary()` is where each frame's time went.
 */

export interface ActiveFrameProfile {
  profiler: FrameProfiler;
  /** Starts or stops measuring; starting begins a fresh window. */
  setEnabled(enabled: boolean): void;
  /** Whether the globe's renderer can time its GPU work; if not, there are no GPU rows. */
  gpuTimed(): boolean;
}

let active: ActiveFrameProfile | null = null;

declare global {
  interface Window {
    osfsFrameProfiler?: FrameProfiler;
    /** The profiler with its switch and whether GPU time is available, for scripts. */
    osfsFrameProfile?: ActiveFrameProfile;
  }
}

export function setActiveFrameProfile(profile: ActiveFrameProfile | null): void {
  active = profile;
  if (profile) {
    window.osfsFrameProfiler = profile.profiler;
    window.osfsFrameProfile = profile;
  } else {
    delete window.osfsFrameProfiler;
    delete window.osfsFrameProfile;
  }
}

export function getActiveFrameProfile(): ActiveFrameProfile | null {
  return active;
}

export function setFrameProfilingEnabled(enabled: boolean): void {
  active?.setEnabled(enabled);
}
