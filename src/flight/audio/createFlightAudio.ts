import { AUDIO_EVENT } from "./audioSnapshot";
import { audioDspWasmUrl, audioWorkletUrl } from "./audioAssets";
import {
  AVAILABILITY_LABELS, TIER_INDEX, TIER_ORDER, createFallbackController,
  formatAudioStats, quantumMilliseconds, resolveRequestedTier, tierAvailability,
  type AudioCapabilities, type FallbackController, type TierAvailability, type TierId,
} from "./audioQuality";
import type { AudioQualityId, AudioSettingsStore, AudioSettingsV1 } from "./audioSettings";
import { createPortTransport, createSabTransport, isSharedMemoryAvailable, type AudioTransport } from "./audioTransport";
import { toSnapshot, type AudioAdapter, type AudioAdapterReading } from "./jsbsimAudioAdapter";
import { computeListenerPose, createListenerPose, type ListenerPose, type ListenerPoseInput } from "./audioPose";
import type { AudioBankInstallBand } from "./audioBank";

/**
 * The application's single sound owner.
 *
 * It owns enable/unlock, settings, snapshot publication, view updates, holds,
 * reset epochs, status and idempotent disposal for BOTH the engine and the tire
 * cue: one AudioContext, one worklet, one limiter. It deliberately owns no
 * synthesis: everything audible happens in the WASM core behind the worklet.
 *
 * Nothing here allocates an AudioContext, fetches or compiles at import. The
 * first byte moves only from a pilot gesture that asks for sound.
 */

export type AudioHoldReason = "pause" | "background" | "loading" | "fault" | "reset";

/** Nothing audible, the tire cue on its own, or engine sound (plus the tire cue when enabled). */
export type FlightAudioMode = "off" | "tire-only" | "sound";

export interface FlightAudioStatus {
  enabled: boolean;
  requested: AudioQualityId;
  effective: TierId;
  mode: FlightAudioMode;
  /** Set when the browser will not start audio without a fresh gesture. */
  gestureLocked: boolean;
  /** One short line for the Sound panel, or null when everything is nominal. */
  message: string | null;
  /** The tire cue's own line, for the ground-interaction and Debug controls. */
  tireMessage: string | null;
  availability: Record<TierId, TierAvailability>;
  /** The sound.md §6 stats line, refreshed at 1 Hz. */
  stats: string;
  transport: "port" | "sab" | null;
  sampleRateHz: number | null;
  held: boolean;
  settings: AudioSettingsV1;
  readOnlyReason: string | null;
  /** Session-only testing override for tiers without device evidence. */
  allowUnvalidated: boolean;
  /** Last engine telemetry sent to the core; null unless engine sound is running. */
  engine: { n1Pct: number; n2Pct: number; fuelFlowPps: number; combustion: boolean; running: boolean } | null;
  /** Core timeline counters from the worklet, refreshed at 1 Hz. */
  core: { epoch: number; resyncs: number; staleFades: number; snapshotsDropped: number; eventsDropped: number } | null;
  /** Adapter diagnostics: which combustion rule ran, which properties are absent. */
  telemetry: { combustionSource: string; missing: readonly string[] } | null;
}

/** What the render loop knows about the view; the facade supplies source geometry and velocity. */
export type FlightAudioView = Pick<ListenerPoseInput, "camera" | "aircraftRoot" | "exterior" | "heightAboveGroundM">;

export interface FlightAudioOptions {
  settings: AudioSettingsStore;
  /** Receives the next gesture when wanted audio is still autoplay-locked. */
  unlockTarget?: EventTarget | null;
  onStatusChange?: (status: FlightAudioStatus) => void;
  now?: () => number;
  /** Test seams. Production leaves all of these unset. */
  loadWasm?: () => Promise<BufferSource>;
  workletModuleUrl?: string;
  capabilityOverrides?: Partial<AudioCapabilities>;
  /** Reports whether the current call runs inside a user activation. */
  inGesture?: () => boolean;
  /** Delay before a held context is suspended; brief holds keep it running. */
  suspendDelayMs?: number;
}

const UNLOCK_EVENTS = ["pointerdown", "keydown", "touchend"] as const;
/** sound.md §2: publish snapshots at 60 Hz; decimate telemetry, never physics. */
const PUBLISH_INTERVAL_S = 1 / 60;
const ZERO_VELOCITY: readonly [number, number, number] = [0, 0, 0];

type AudioContextConstructor = new () => AudioContext;

function detectCapabilities(overrides?: Partial<AudioCapabilities>): AudioCapabilities {
  const scope = globalThis as typeof globalThis & { AudioWorkletNode?: unknown };
  return {
    audioWorklet: typeof scope.AudioWorkletNode === "function",
    webAssembly: typeof WebAssembly === "object" && typeof WebAssembly.compile === "function",
    // No licensed FJ33 bank exists (sound.md §4), so High is never admitted.
    bankReady: false,
    // No portable per-block CPU or underrun counter is implemented here, so the
    // controller has nothing to shed on. §1 calls that out as a known gap.
    loadObservable: false,
    ...overrides,
  };
}

/**
 * Chromium's WebAudio playback statistics, where implemented (sound.md §5.5).
 * Feature-detected. A counter's presence does not validate it as a dropout
 * detector; it only feeds the fallback controller, which acts on any count.
 */
function readUnderrunCounter(context: AudioContext | null): number | null {
  const stats = (context as (AudioContext & { playbackStats?: { underrunEvents?: unknown } }) | null)
    ?.playbackStats;
  const events = stats?.underrunEvents;
  return typeof events === "number" && Number.isFinite(events) ? events : null;
}

/**
 * Transient user activation where the browser reports it. Where it does not,
 * assume a gesture: the attempt then either runs or lands in the locked state,
 * which is exactly how the previous tire cue behaved.
 */
function defaultInGesture(): boolean {
  const activation = (globalThis.navigator as (Navigator & { userActivation?: { isActive: boolean } }) | undefined)
    ?.userActivation;
  return activation ? activation.isActive : true;
}

export interface FlightAudioHandle {
  /** Must be called synchronously from the enabling gesture. */
  setEnabled(enabled: boolean): void;
  setQuality(quality: AudioQualityId): void;
  patchSettings(patch: Partial<Pick<AudioSettingsV1,
    "masterVolume" | "engineVolume" | "airframeVolume" | "engineMuted" | "reducedDynamicRange">>): void;
  /** Session-only: let an explicit Med/High request run without device evidence, for testing. */
  setAllowUnvalidated(allow: boolean): void;
  /** Explicit re-test after a downgrade (sound.md §1, §6). */
  retest(): void;
  /**
   * The saved settings changed without this handle, as from Show all
   * parameters or an import: apply them. Enabling still needs a gesture.
   */
  followSettings(): void;
  /** Takes ownership; disposed before the SDK is torn down. */
  attachAdapter(adapter: AudioAdapter | null): void;
  /**
   * Call from the fixed-step loop after every ACCEPTED step, outside any
   * wheel-mode guard. Decimation happens here, on simulation time.
   */
  publishStep(): void;
  /** Once per rendered frame; cheap no-op unless engine sound is running. */
  updateView(view: FlightAudioView): void;
  /** Direct pose injection, for callers that compute their own. */
  setListenerPose(pose: ListenerPose): void;
  /** The tire cue's own switch and volume, independent of engine sound. */
  setTireCue(enabled: boolean, volume: number): void;
  setTireSlipWatts(watts: number): void;
  /** Silences the tire cue alone (paused, blocked terrain, contact fault); engine sound carries on. */
  setTireHeld(held: boolean): void;
  setHeld(held: boolean, reason: AudioHoldReason): void;
  /** Reset, seek or model replacement: new timeline, queues cleared, fade. */
  beginEpoch(): void;
  isEngineActive(): boolean;
  /**
   * Hands a verified, context-rate Tier 3 bank to the running core. High still
   * needs a qualified profile; a bank alone admits nothing. No bank ships today.
   */
  installBank(bands: readonly AudioBankInstallBand[]): Promise<boolean>;
  getStatus(): FlightAudioStatus;
  dispose(): void;
}

export function createFlightAudio(options: FlightAudioOptions): FlightAudioHandle {
  const now = options.now ?? (() => Date.now());
  const inGesture = options.inGesture ?? defaultInGesture;
  const suspendDelayMs = options.suspendDelayMs ?? 1500;
  const page = typeof document === "undefined" ? null : document;
  const unlockTarget = options.unlockTarget !== undefined
    ? options.unlockTarget : (typeof window === "undefined" ? null : window);
  const capabilities = detectCapabilities(options.capabilityOverrides);

  let settings = options.settings.settings;
  const tireCue = { enabled: false, volume: 1 };
  let context: AudioContext | null = null;
  let node: AudioWorkletNode | null = null;
  let transport: AudioTransport | null = null;
  let adapter: AudioAdapter | null = null;
  let lastReading: AudioAdapterReading | null = null;
  let fallback: FallbackController | null = null;
  /** Compiled once and kept, so a fatal node can be replaced without refetching. */
  let compiled: WebAssembly.Module | null = null;

  let disposed = false;
  let held = false;
  /** Every active hold, so releasing "background" cannot end a "pause". */
  const holds = new Set<AudioHoldReason>();
  let tireHeld = false;
  let allowUnvalidated = false;
  let suspendTimer: ReturnType<typeof setTimeout> | null = null;
  let lastStats: number[] | null = null;
  let gestureLocked = false;
  /** After a processor fault nothing restarts until the pilot switches sound again. */
  let faulted = false;
  let message: string | null = null;
  let unlockArmed = false;
  /** Bumped by every start/stop/dispose; late promises check it and stop. */
  let generation = 0;

  let epoch = 1;
  let sequence = 0;
  let lastPublishedSimTime: number | null = null;
  let lastSeenSimTime: number | null = null;
  let epochPending = true;
  const pose = createListenerPose();
  let statsLine = "";

  let previousCombustion: boolean | null = null;
  let previousRunning: boolean | null = null;
  let previousStarter: boolean | null = null;
  /** Worklet replies to "band" messages, by band index. */
  const bandWaiters = new Map<number, (accepted: boolean) => void>();

  /** Tier 0 ("Off") allocates no graph, so "enabled at Off" wants no engine. */
  const engineWanted = (): boolean => settings.enabled && settings.requested !== "off";
  const wantsGraph = (): boolean => !disposed && (engineWanted() || tireCue.enabled);
  const mode = (): FlightAudioMode => engineWanted() ? "sound" : tireCue.enabled ? "tire-only" : "off";

  const availability = (): Record<TierId, TierAvailability> => ({
    off: tierAvailability("off", capabilities),
    low: tierAvailability("low", capabilities),
    med: tierAvailability("med", capabilities),
    high: tierAvailability("high", capabilities),
  });

  const requestedTier = (): TierId => {
    if (engineWanted()) {
      return resolveRequestedTier(settings.requested, capabilities, undefined, { allowUnvalidated }).tier;
    }
    // The tire cue alone runs on the cheapest audible tier with the engine gain at zero.
    return tierAvailability("low", capabilities).state === "available" ? "low" : "off";
  };

  const effectiveTier = (): TierId => {
    // No graph means nothing is audible, whatever the preference says.
    if (!wantsGraph() || !node) return "off";
    const wanted = requestedTier();
    if (!fallback) return wanted;
    // A fallback may only ever lower the tier, never raise it above the ask.
    return TIER_INDEX[fallback.tier] < TIER_INDEX[wanted] ? fallback.tier : wanted;
  };

  const tireMessage = (): string | null => {
    if (!tireCue.enabled) return null;
    if (gestureLocked) return "Tire sound starts after your next click or key press.";
    if (!node && message) return message;
    return null;
  };

  const status = (): FlightAudioStatus => ({
    enabled: settings.enabled,
    requested: settings.requested,
    effective: effectiveTier(),
    mode: mode(),
    gestureLocked,
    message,
    tireMessage: tireMessage(),
    availability: availability(),
    stats: statsLine,
    transport: transport?.kind ?? null,
    sampleRateHz: context?.sampleRate ?? null,
    held,
    settings,
    readOnlyReason: options.settings.readOnlyReason,
    allowUnvalidated,
    engine: lastReading && node && engineWanted()
      ? {
        n1Pct: lastReading.n1Pct, n2Pct: lastReading.n2Pct, fuelFlowPps: lastReading.fuelFlowPps,
        combustion: lastReading.combustion, running: lastReading.running,
      }
      : null,
    core: lastStats
      ? {
        epoch: lastStats[19] ?? 0, resyncs: lastStats[4] ?? 0, staleFades: lastStats[5] ?? 0,
        snapshotsDropped: lastStats[1] ?? 0, eventsDropped: lastStats[3] ?? 0,
      }
      : null,
    telemetry: adapter
      ? { combustionSource: adapter.diagnostics.combustionSource, missing: adapter.diagnostics.missing }
      : null,
  });

  const notify = (): void => { if (!disposed) options.onStatusChange?.(status()); };

  const refreshStats = (): void => {
    statsLine = formatAudioStats({
      effective: effectiveTier(),
      requested: settings.requested,
      sampleRate: context?.sampleRate ?? 0,
      // No validated per-block timer or underrun counter exists on this path,
      // so these stay null and render as "n/a"/"unknown" rather than as zero.
      dspP95Ms: fallback?.lastP95Ms ?? null,
      dspMaxMs: fallback?.lastMaxMs ?? null,
      underruns: fallback?.observedUnderruns ?? null,
      residentMiB: null,
      transport: transport?.kind ?? "port",
      reason: (message ?? (held ? "held" : mode() === "tire-only" ? "tire cue only" : "nominal"))
        + (fallback?.observedUnderruns != null ? " · underrun counter not validated" : ""),
    });
  };

  /* ------------------------------------------------------------ unlocking */

  const onUnlockGesture = (): void => {
    disarmUnlock();
    if (!wantsGraph() || faulted) return;
    // A saved preference cannot satisfy autoplay, so the graph is built from the
    // pilot's first gesture instead of at load. start() creates and resumes the
    // context before its first await, so that still happens inside the gesture.
    if (context) {
      void resumeContext();
    } else {
      generation += 1;
      void start();
    }
  };
  const armUnlock = (): void => {
    if (unlockArmed || !unlockTarget || disposed) return;
    unlockArmed = true;
    for (const type of UNLOCK_EVENTS) {
      unlockTarget.addEventListener(type, onUnlockGesture, { capture: true });
    }
  };
  function disarmUnlock(): void {
    if (!unlockArmed || !unlockTarget) return;
    unlockArmed = false;
    for (const type of UNLOCK_EVENTS) {
      unlockTarget.removeEventListener(type, onUnlockGesture, { capture: true });
    }
  }

  /* -------------------------------------------------------------- runtime */

  const currentGains = () => {
    const sound = engineWanted();
    // Engine and tire gains stay independent, which is what keeps tire-only
    // playback possible. Master volume belongs to engine sound; the tire cue
    // alone keeps the level its own control sets, as it always has.
    return {
      master: sound ? settings.masterVolume : 1,
      engine: sound && !settings.engineMuted ? settings.engineVolume : 0,
      airframe: sound ? settings.airframeVolume : 0,
      tire: tireCue.enabled ? tireCue.volume : 0,
      reducedRange: settings.reducedDynamicRange ? 1 : 0,
    };
  };

  const sendGains = (): void => {
    node?.port.postMessage({ type: "gains", ...currentGains() });
  };

  const sendTier = (): void => {
    if (!node) return;
    const tier = held ? "off" : effectiveTier();
    node.port.postMessage({ type: "tier", tier: TIER_INDEX[tier] });
    node.port.postMessage({ type: "shed", level: fallback?.shed ?? 0 });
  };

  const teardownGraph = (): void => {
    disarmUnlock();
    transport?.dispose();
    transport = null;
    if (node) {
      try { node.port.onmessage = null; node.disconnect(); } catch { /* Already gone. */ }
      node = null;
    }
    const current = context;
    context = null;
    if (current && current.state !== "closed") {
      void current.close().catch(() => { /* Disposal stays final. */ });
    }
    fallback = null;
    lastStats = null;
    if (suspendTimer) { clearTimeout(suspendTimer); suspendTimer = null; }
    // Installed bands lived in the worklet's memory, which has just gone.
    capabilities.bankReady = false;
    for (const resolve of bandWaiters.values()) resolve(false);
    bandWaiters.clear();
    refreshStats();
  };

  /** Brings the graph in line with what is wanted. `gesture` only when inside a user activation. */
  const sync = (gesture: boolean): void => {
    if (disposed) return;
    if (!wantsGraph()) {
      generation += 1;
      gestureLocked = false;
      teardownGraph();
      return;
    }
    if (!context) {
      if (faulted) return;
      if (gesture) {
        generation += 1;
        void start();
      } else {
        // sound.md §6: Tier 0 and "Enable sound" until audio actually runs.
        gestureLocked = true;
        armUnlock();
      }
      return;
    }
    sendGains();
    sendTier();
    if (gesture) void resumeContext();
  };

  const onProcessorError = (): void => {
    // sound.md §1: a fatal processorerror cannot recover inside that node. Drop
    // to Off and keep the compiled module; switching sound again is the retry.
    faulted = true;
    message = "Sound stopped after an audio processor fault. Switch it off and on to retry.";
    teardownGraph();
    notify();
  };

  const onWorkletMessage = (event: MessageEvent): void => {
    if (transport?.handleMessage(event.data)) return;
    const data = event.data as {
      type?: string; values?: number[]; reason?: string; index?: number; accepted?: boolean;
    } | null;
    if (!data) return;
    if (data.type === "band" && typeof data.index === "number") {
      bandWaiters.get(data.index)?.(data.accepted === true);
      bandWaiters.delete(data.index);
      return;
    }
    if (data.type === "failed") {
      faulted = true;
      message = `Sound could not start: ${data.reason ?? "unknown reason"}`;
      teardownGraph();
      notify();
      return;
    }
    if (data.type === "stats" && Array.isArray(data.values)) {
      lastStats = data.values;
      // The core's counters are event tallies, not CPU timers, so they can
      // never become a DSP p95. They surface faults, and nothing more.
      const nonFinite = (data.values[12] ?? 0) > 0;
      // The tire cue alone already runs at the cheapest tier; there is nothing to drop to.
      const action = engineWanted()
        ? fallback?.observe({ timeMs: now(), dspMs: null, underruns: readUnderrunCounter(context), fault: false })
        : null;
      if (action?.kind === "drop") {
        // sound.md §6: a downgrade persists until an explicit re-test.
        options.settings.update({
          requested: action.tier, downgradedFrom: settings.downgradedFrom ?? settings.requested,
        });
        settings = options.settings.settings;
        message = `Sound dropped to ${action.tier}: ${action.reason}`;
        sync(false);
      } else if (action) {
        message = `Sound shed detail: ${action.reason}`;
        sendTier();
      }
      if (nonFinite && message === null) {
        message = "Some telemetry was rejected as non-finite; sound is holding its last valid state.";
      }
      refreshStats();
      notify();
    }
  };

  async function resumeContext(): Promise<void> {
    const current = context;
    if (!current) return;
    // Read through a widened alias throughout: the state can change across an
    // await, so narrowing it once would make every later check a lie.
    const stateOf = (value: AudioContext): AudioContextState => value.state;
    if (stateOf(current) === "running") {
      gestureLocked = false;
      disarmUnlock();
      notify();
      return;
    }
    try {
      await current.resume();
      if (disposed || context !== current) return;
      // Re-read the state: `resume()` resolving is not proof of running, and
      // on iOS a context can come back suspended or interrupted.
      if (stateOf(current) === "running") {
        gestureLocked = false;
        disarmUnlock();
      } else {
        gestureLocked = true;
        armUnlock();
      }
    } catch {
      if (disposed || context !== current) return;
      gestureLocked = true;
      armUnlock();
    }
    notify();
  }

  async function start(): Promise<void> {
    const mine = generation;
    const tier = requestedTier();
    if (tier === "off") {
      message = engineWanted()
        ? resolveRequestedTier(settings.requested, capabilities, undefined, { allowUnvalidated }).reason ?? `${AVAILABILITY_LABELS.unsupported}.`
        : "Tire sound is unavailable in this browser.";
      notify();
      return;
    }
    const browser = globalThis as typeof globalThis & { webkitAudioContext?: AudioContextConstructor };
    const Constructor = browser.AudioContext ?? browser.webkitAudioContext;
    if (!Constructor) {
      message = "This browser has no Web Audio support.";
      notify();
      return;
    }

    // Created and resumed synchronously from the gesture; everything after this
    // point is async and must re-check `generation` before touching state.
    let current: AudioContext;
    try {
      current = new Constructor();
    } catch {
      message = "Sound could not start in this browser.";
      notify();
      return;
    }
    context = current;
    void resumeContext();

    try {
      const [bytes] = await Promise.all([
        options.loadWasm
          ? options.loadWasm()
          : fetch(audioDspWasmUrl.toString()).then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.arrayBuffer();
          }),
        current.audioWorklet.addModule(options.workletModuleUrl ?? audioWorkletUrl.toString()),
      ]);
      compiled ??= await WebAssembly.compile(bytes);
      // A mute, a disable or a dispose while these promises were in flight wins:
      // a late completion must never restart audio.
      if (disposed || generation !== mine || context !== current) {
        if (context === current) teardownGraph();
        return;
      }

      const shared = isSharedMemoryAvailable() ? createSabTransport() : null;
      const worklet = new AudioWorkletNode(current, "osfs-dsp", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: {
          module: compiled,
          maxBlockFrames: 128,
          seed: 0x53463530,
          sab: shared?.sharedBuffer ?? null,
          initial: { tier: TIER_INDEX[held ? "off" : tier], gains: currentGains() },
        },
      });
      node = worklet;
      transport = shared ?? createPortTransport(worklet.port);
      worklet.port.onmessage = onWorkletMessage;
      worklet.onprocessorerror = onProcessorError;
      worklet.connect(current.destination);
      fallback = createFallbackController({ tier, sampleRate: current.sampleRate });
      epochPending = true;
      message = null;
      sendGains();
      sendTier();
      refreshStats();
      notify();
    } catch (error) {
      if (disposed || generation !== mine || context !== current) return;
      message = `Sound could not start: ${error instanceof Error ? error.message : String(error)}`;
      teardownGraph();
      notify();
    }
  }

  const onVisibilityChange = (): void => {
    if (!disposed) handle.setHeld(page?.visibilityState === "hidden", "background");
  };
  page?.addEventListener("visibilitychange", onVisibilityChange);

  const handle: FlightAudioHandle = {
    setEnabled(enabled) {
      if (disposed) return;
      if (enabled !== settings.enabled) {
        options.settings.update({ enabled });
        settings = options.settings.settings;
        if (enabled) {
          fallback?.retest(requestedTier(), now());
          handle.beginEpoch();
        }
      }
      faulted = false;
      message = null;
      // The click is the gesture, including for "enabled but still locked".
      sync(true);
      refreshStats();
      notify();
    },

    setQuality(quality) {
      if (disposed || quality === settings.requested) return;
      options.settings.update({ requested: quality, downgradedFrom: null });
      settings = options.settings.settings;
      // An explicit choice is the re-test sound.md §1 asks for: it clears the
      // shed level and the upgrade lockout together.
      fallback?.retest(requestedTier(), now());
      sync(inGesture());
      refreshStats();
      notify();
    },

    patchSettings(patch) {
      if (disposed) return;
      options.settings.update(patch);
      settings = options.settings.settings;
      sendGains();
      refreshStats();
      notify();
    },

    followSettings() {
      if (disposed) return;
      const next = options.settings.settings;
      if (next === settings) return;
      const tierChanged = next.requested !== settings.requested || next.enabled !== settings.enabled;
      settings = next;
      if (tierChanged) {
        fallback?.retest(requestedTier(), now());
        sync(inGesture());
      } else {
        sendGains();
      }
      refreshStats();
      notify();
    },

    retest() {
      if (disposed) return;
      if (settings.downgradedFrom) {
        options.settings.update({ requested: settings.downgradedFrom, downgradedFrom: null });
        settings = options.settings.settings;
      }
      fallback?.retest(requestedTier(), now());
      message = null;
      sync(inGesture());
      refreshStats();
      notify();
    },

    attachAdapter(next) {
      if (adapter && adapter !== next) adapter.dispose();
      adapter = next;
      lastReading = null;
      // A replaced model means a new property batch and a new timeline.
      handle.beginEpoch();
      notify();
    },

    publishStep() {
      if (disposed || held || !adapter || !transport || !node || !engineWanted()) return;
      const reading = adapter.read();
      lastReading = reading;
      const simTime = reading.simTimeS;
      if (!Number.isFinite(simTime)) return;

      // A reset or reposition can rewind simulation time without anyone calling
      // beginEpoch(). Snapshots stamped in the past are dropped as late, so a
      // rewind always opens a new epoch instead of going silent.
      if (lastSeenSimTime !== null && simTime < lastSeenSimTime - 1e-6) handle.beginEpoch();
      lastSeenSimTime = simTime;

      if (epochPending) {
        epochPending = false;
        lastPublishedSimTime = null;
        previousCombustion = previousRunning = previousStarter = null;
        node.port.postMessage({ type: "epoch", epoch, simTimeS: simTime, leadSeconds: 0 });
      }

      // Discrete transitions are published at their own step, before any
      // decimation, so an ignition between two 60 Hz samples cannot vanish.
      if (previousCombustion !== null && reading.combustion !== previousCombustion) {
        transport.publishEvent(
          reading.combustion ? AUDIO_EVENT.LIGHT_OFF : AUDIO_EVENT.FLAMEOUT, simTime, epoch);
      }
      if (previousRunning !== null && reading.running !== previousRunning) {
        transport.publishEvent(
          reading.running ? AUDIO_EVENT.RUNNING_ON : AUDIO_EVENT.RUNNING_OFF, simTime, epoch);
      }
      if (previousStarter !== null && reading.starter !== previousStarter) {
        transport.publishEvent(
          reading.starter ? AUDIO_EVENT.STARTER_ON : AUDIO_EVENT.STARTER_OFF, simTime, epoch);
      }
      previousCombustion = reading.combustion;
      previousRunning = reading.running;
      previousStarter = reading.starter;

      // Decimation runs on simulation time, not on a step counter, so batched
      // steps and a paused simulation both behave.
      if (lastPublishedSimTime !== null
        && simTime - lastPublishedSimTime < PUBLISH_INTERVAL_S - 1e-9) {
        transport.flush();
        return;
      }
      lastPublishedSimTime = simTime;
      sequence += 1;
      transport.publish(toSnapshot(reading, {
        sequence, epoch,
        source: pose.source,
        sourceVelocity: pose.sourceVelocity,
        listenerVelocity: pose.listenerVelocity,
        exterior: pose.exterior,
        groundReflectionM: pose.groundReflectionM,
        poseValid: pose.valid,
      }));
      transport.flush();
    },

    updateView(view) {
      if (disposed || !adapter || !node || !engineWanted()) return;
      computeListenerPose({
        ...view,
        sourceOffset: adapter.diagnostics.sourceOffset,
        velocityWorld: lastReading?.velocity ?? ZERO_VELOCITY,
      }, pose);
    },

    setListenerPose(next) {
      // View telemetry updates with camera motion; it never advances a physics
      // step and never publishes a snapshot of its own.
      pose.source[0] = next.source[0];
      pose.source[1] = next.source[1];
      pose.source[2] = next.source[2];
      pose.sourceVelocity[0] = next.sourceVelocity[0];
      pose.sourceVelocity[1] = next.sourceVelocity[1];
      pose.sourceVelocity[2] = next.sourceVelocity[2];
      pose.listenerVelocity[0] = next.listenerVelocity[0];
      pose.listenerVelocity[1] = next.listenerVelocity[1];
      pose.listenerVelocity[2] = next.listenerVelocity[2];
      pose.exterior = next.exterior;
      pose.groundReflectionM = next.groundReflectionM;
      pose.valid = next.valid;
    },

    setTireCue(enabled, volume) {
      if (disposed) return;
      const nextVolume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0;
      if (enabled === tireCue.enabled && nextVolume === tireCue.volume) return;
      const toggled = enabled !== tireCue.enabled;
      tireCue.enabled = enabled;
      tireCue.volume = nextVolume;
      if (!enabled) node?.port.postMessage({ type: "tire", watts: 0 });
      if (!toggled) {
        sendGains();
        return;
      }
      if (enabled) faulted = false;
      sync(inGesture());
      refreshStats();
      notify();
    },

    setTireSlipWatts(watts) {
      if (!tireCue.enabled || held || tireHeld) return;
      node?.port.postMessage({
        type: "tire", watts: Number.isFinite(watts) ? Math.max(0, watts) : 0,
      });
    },

    setTireHeld(nextHeld) {
      if (disposed || nextHeld === tireHeld) return;
      tireHeld = nextHeld;
      if (tireHeld) node?.port.postMessage({ type: "tire", watts: 0 });
    },

    setAllowUnvalidated(allow) {
      if (disposed || allow === allowUnvalidated) return;
      allowUnvalidated = allow;
      fallback?.retest(requestedTier(), now());
      sendTier();
      refreshStats();
      notify();
    },

    setHeld(nextHeld, reason) {
      if (disposed) return;
      if (nextHeld) holds.add(reason); else holds.delete(reason);
      if ((holds.size > 0) === held) return;
      held = holds.size > 0;
      sendTier();
      if (suspendTimer) { clearTimeout(suspendTimer); suspendTimer = null; }
      if (held) {
        node?.port.postMessage({ type: "tire", watts: 0 });
        // Silence is immediate; suspension waits. Suspending and resuming a
        // context is slow enough on some browsers that a brief hold would
        // otherwise leave an audible gap after it ends.
        suspendTimer = setTimeout(() => {
          suspendTimer = null;
          if (held && context?.state === "running") {
            void context.suspend().catch(() => { /* The tier is already Off. */ });
          }
        }, suspendDelayMs);
      } else if (wantsGraph()) {
        // Every hold is a discontinuity: the queued snapshots are from before
        // the gap and would otherwise replay as a stale backlog.
        handle.beginEpoch();
        void resumeContext();
      }
      refreshStats();
      notify();
    },

    beginEpoch() {
      epoch += 1;
      epochPending = true;
      lastPublishedSimTime = null;
      lastSeenSimTime = null;
      previousCombustion = previousRunning = previousStarter = null;
      node?.port.postMessage({ type: "reset" });
    },

    isEngineActive: () => !disposed && adapter !== null && node !== null && engineWanted(),

    async installBank(bands) {
      const target = node;
      if (disposed || !target || bands.length === 0) return false;
      capabilities.bankReady = false;
      target.port.postMessage({ type: "bandClear" });
      const replies = bands.map((band) => new Promise<boolean>((resolve) => {
        bandWaiters.set(band.index, resolve);
        // A private copy is transferred, so the caller's samples stay intact.
        const samples = band.samples.slice().buffer;
        target.port.postMessage({
          type: "band", index: band.index, frames: band.samples.length,
          n1: band.n1, exterior: band.exterior, samples,
        }, [samples]);
      }));
      const accepted = (await Promise.all(replies)).every(Boolean);
      if (disposed || node !== target) return false;
      if (!accepted) target.port.postMessage({ type: "bandClear" });
      capabilities.bankReady = accepted;
      refreshStats();
      notify();
      return accepted;
    },

    getStatus: status,

    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      page?.removeEventListener("visibilitychange", onVisibilityChange);
      // Readers go before the SDK is destroyed; a batch outliving its exec is a
      // use-after-free in wasm, not a leak.
      adapter?.dispose();
      adapter = null;
      teardownGraph();
    },
  };

  if (wantsGraph()) sync(false);
  refreshStats();
  return handle;
}

export { quantumMilliseconds, TIER_ORDER };
