export interface RenderSchedulerOptions {
  /** Per-frame work. Called inside requestAnimationFrame. */
  tick(): void;
  /**
   * Optional predicate. When it returns true at the end of a tick the
   * scheduler keeps rendering on the next frame (e.g. inertial decay).
   */
  shouldKeepRendering?: () => boolean;
  /** rAF/cAF injection for tests. */
  requestFrame?: (cb: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
}

export interface RenderScheduler {
  /** Schedule a single frame on the next rAF. No-op if one is already pending. */
  requestRender(): void;
  /** Keep rendering every frame until the matching endContinuous() call. */
  beginContinuous(): void;
  /** Release one continuous-render reference. */
  endContinuous(): void;
  /** True while continuous mode is held by at least one caller. */
  isContinuous(): boolean;
  /** Pause/unpause the scheduler (e.g. on document.visibilitychange). */
  setPaused(paused: boolean): void;
  /** Cancel any pending frame and stop the scheduler permanently. */
  stop(): void;
  /** True when a frame is pending or continuous mode is held. */
  isActive(): boolean;
  /**
   * Subscribe to idle-state transitions. Fires synchronously whenever the
   * scheduler flips between idle (no pending frame, no continuous holders)
   * and active. Returns an unsubscribe function.
   */
  onActiveChange(listener: (active: boolean) => void): () => void;
}

export function createRenderScheduler(options: RenderSchedulerOptions): RenderScheduler {
  const requestFrame =
    options.requestFrame ?? ((cb) => window.requestAnimationFrame(cb));
  const cancelFrame =
    options.cancelFrame ?? ((handle) => window.cancelAnimationFrame(handle));

  let handle = 0;
  let continuousRefs = 0;
  let paused = false;
  let stopped = false;
  let renderRequested = false;
  let active = false;
  const activeListeners = new Set<(active: boolean) => void>();

  function setActive(next: boolean): void {
    if (active === next) return;
    active = next;
    for (const listener of activeListeners) listener(active);
  }

  function schedule(): void {
    if (stopped || paused || handle !== 0) return;
    handle = requestFrame(tick);
    setActive(true);
  }

  function tick(): void {
    handle = 0;
    if (stopped || paused) return;
    renderRequested = false;
    options.tick();
    const keep =
      continuousRefs > 0 ||
      (options.shouldKeepRendering ? options.shouldKeepRendering() : false) ||
      renderRequested;
    if (keep) schedule();
    else setActive(false);
  }

  return {
    requestRender(): void {
      renderRequested = true;
      schedule();
    },
    beginContinuous(): void {
      continuousRefs += 1;
      schedule();
    },
    endContinuous(): void {
      if (continuousRefs > 0) continuousRefs -= 1;
    },
    isContinuous(): boolean {
      return continuousRefs > 0;
    },
    setPaused(next: boolean): void {
      if (next === paused) return;
      paused = next;
      if (paused) {
        if (handle !== 0) {
          cancelFrame(handle);
          handle = 0;
        }
        if (continuousRefs === 0) setActive(false);
      } else {
        schedule();
      }
    },
    stop(): void {
      stopped = true;
      if (handle !== 0) {
        cancelFrame(handle);
        handle = 0;
      }
      setActive(false);
      activeListeners.clear();
    },
    isActive(): boolean {
      return active;
    },
    onActiveChange(listener): () => void {
      activeListeners.add(listener);
      return () => {
        activeListeners.delete(listener);
      };
    },
  };
}
