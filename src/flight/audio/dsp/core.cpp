// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 the 0sfs authors.
//
// The audio-thread core: telemetry interpolation, epoch clock, discrete events,
// spatialisation, tier caps and shedding. Everything reachable from
// osfs_audio_process() is allocation-free, lock-free and wait-free. Buffers are
// static, so the resident cost is a link-time fact rather than a heap guess.

#include <cstdlib>
#include <cstring>
#include <initializer_list>

#include "convolver.h"
#include "granular.h"
#include "primitives.h"
#include "snapshot.h"
#include "turbofan.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define OSFS_EXPORT extern "C" EMSCRIPTEN_KEEPALIVE
#else
#define OSFS_EXPORT extern "C"
#endif

namespace osfs_audio {
namespace {

constexpr int kMaxBlock = 1024;
constexpr int kQueueCapacity = 64;                 // ~1 s of 60 Hz telemetry
constexpr int kMaxSampleRate = 96000;
constexpr int kDelayCapacity = kMaxSampleRate / 2;  // sound.md §2: 0.5 s per mono path
constexpr int kMaxIrTaps = kMaxPartitions * kPartition;

/** sound.md §2: render two telemetry intervals behind the presentation clock. */
constexpr double kTelemetryLagSeconds = 2.0 / 60.0;
constexpr double kStaleSeconds = 0.25;
constexpr double kStaleFadeSeconds = 0.10;
constexpr double kTransitionFadeSeconds = 0.05;     // §1: 50 ms transitions
/** Sustained skew past this re-anchors the clock instead of growing a backlog. */
constexpr double kResyncSeconds = 0.50;
/**
 * Fresh snapshots stamped this far behind the render point mean the timeline
 * slipped: a main-thread stall the fixed-step loop did not replay, or clock
 * drift. Below the 250 ms stale threshold, so it re-anchors before fading.
 */
constexpr double kSlipSeconds = 0.15;
/** Smoothing time constant for gains and filter targets (§2, tau = 10 ms). */
constexpr double kSmoothTau = 0.010;
/** Equal-power pan normalisation: centre keeps unity through cos/sin. */
constexpr double kSqrt2 = 1.4142135623730951;

struct QueueEntry {
  double target = 0.0;   // audio frame this snapshot is aimed at
  double values[kSnapshotSize] = {};
};

struct PendingEvent {
  double target = 0.0;
  double simTimeS = 0.0;  // kept so a re-anchor can re-target the event
  int type = 0;
  double payload = 0.0;
};

// ---------------------------------------------------------------- state ----

double gSampleRate = 48000.0;
int gMaxBlock = kMaxBlock;
bool gReady = false;

int gTier = kTierOff;
/** 0 = full tier; each stage sheds detail in the documented order. */
int gShed = 0;

double gMasterGain = 1.0;
double gEngineGain = 1.0;
double gTireGain = 1.0;
double gAirframeGain = 1.0;

QueueEntry gQueue[kQueueCapacity];
int gQueueHead = 0;
int gQueueCount = 0;
int gBracket = 0;

PendingEvent gEvents[kEventCapacity];
int gEventCount = 0;

double gAnchorSim = 0.0;
double gAnchorFrame = 0.0;
int gEpoch = 0;
bool gAnchored = false;
bool gResyncRequested = false;
/** Set when a snapshot was accepted since the last rendered block. */
bool gFreshSnapshots = false;
/** Latched combustion state from a discrete event, until telemetry agrees. */
double gCombustionLatch = 0.0;
bool gHasCombustionLatch = false;

double gBatch[kBatchLength];

float gOutLeft[kMaxBlock];
float gOutRight[kMaxBlock];

float gDelayStorage[kDelayCapacity];
DelayLine gDelay;

double gIrSpectra[kMaxPartitions * kFftSize * 2];
double gIrFdl[kMaxPartitions * kFftSize * 2];
double gIrScratch[4 * kFftSize];
double gIrTaps[kMaxIrTaps];
Convolver gConvolver;
double gWetIn[kPartition];
double gWetOut[kPartition];
int gPartIndex = 0;
double gIrSeconds = -1.0;

TurbofanVoice gEngine;
TireVoice gTire;
GranularVoice gGrains;
Dynamics gDynamics;

Band gBands[kMaxBands];
float* gBandStorage[kMaxBands] = {};
int gBandCount = 0;

Biquad gColour;
Smoother gSpatial, gPan, gColourHz, gCombustion, gDelaySmoother;
Smoother gN1, gN2, gThrust, gFuel, gKias, gGear, gFlap, gExterior;

double gTireWatts = 0.0;
double gFade = 0.0;
double gFadeTarget = 1.0;
double gFadeStep = 1.0;

constexpr int kStatCount = 20;
double gStats[kStatCount];
enum Stat {
  kStatSnapshotsIn = 0, kStatSnapshotsDropped, kStatEventsIn, kStatEventsDropped,
  kStatResyncs, kStatStaleFades, kStatBlocks, kStatFrames, kStatPeak,
  kStatTelemetryAge, kStatActiveGrains, kStatGrainDrops, kStatNonFinite,
  kStatQueueDepth, kStatFade, kStatDoppler, kStatDistance, kStatTier,
  kStatShed, kStatEpoch,
};

// -------------------------------------------------------------- helpers ----

double targetFrameFor(double simTimeS) {
  // k = 1 (sound.md §2): initial shipping support is real time only. A future
  // speed change must open a NEW epoch rather than scale pitch by k.
  return gAnchorFrame + (simTimeS - gAnchorSim) * gSampleRate;
}

void clearQueue() {
  gQueueHead = 0;
  gQueueCount = 0;
  gBracket = 0;
  gEventCount = 0;
  gHasCombustionLatch = false;
}

void beginFade(double target, double seconds) {
  gFadeTarget = clamp01(target);
  gFadeStep = 1.0 / std::fmax(seconds * gSampleRate, 1.0);
}

/** Tier caps from sound.md §1, after `gShed` stages of degradation. */
void applyCaps() {
  EngineCaps caps;
  int grains = 0;
  double starts = 0.0;
  double irSeconds = 0.0;

  switch (gTier) {
    case kTierLow:
      caps.partials = 4;    // + 1 tire squeal = 5 oscillators
      caps.noiseBands = 4;  // + 1 tire noise  = 5 noise sources
      caps.bypassBand = false;
      break;
    case kTierMed:
      caps.partials = 12;   // + 1 tire squeal = 13 oscillators
      caps.noiseBands = 5;  // + 1 tire noise  = 6 noise sources
      caps.bypassBand = true;
      irSeconds = 0.020;
      break;
    case kTierHigh:
      caps.partials = 12;
      caps.noiseBands = 5;
      caps.bypassBand = true;
      irSeconds = 0.040;
      grains = kMaxGrains;
      starts = 160.0;
      break;
    default:
      break;
  }

  // Shedding order (sound.md §1): oscillator count, grain density, IR length,
  // then internal sample rate. Half-rate synthesis is deliberately NOT wired
  // up: it may only be enabled once its resampler-inclusive cost is measured
  // to be lower, and no such measurement exists.
  for (int stage = 0; stage < gShed; ++stage) {
    if (caps.partials > 8) { caps.partials = 8; continue; }
    if (grains > 8) { grains = 8; starts = 100.0; continue; }
    if (caps.partials > 4) { caps.partials = 4; continue; }
    if (grains > 4) { grains = 4; starts = 50.0; continue; }
    if (grains > 0) { grains = 0; starts = 0.0; continue; }
    if (irSeconds > 0.020) { irSeconds = 0.020; continue; }
    if (irSeconds > 0.010) { irSeconds = 0.010; continue; }
    if (irSeconds > 0.0) { irSeconds = 0.0; continue; }
    if (caps.partials > 2) { caps.partials = 2; continue; }
    break;
  }

  gEngine.setCaps(caps);
  gGrains.setCaps(grains, starts);

  if (irSeconds != gIrSeconds) {
    gIrSeconds = irSeconds;
    if (irSeconds <= 0.0) {
      gConvolver.setImpulse(nullptr, 0);
    } else {
      const int taps =
          generateCabinImpulse(gIrTaps, kMaxIrTaps, gSampleRate, irSeconds, 0x53463530u);
      gConvolver.setImpulse(gIrTaps, taps);
    }
  }
  gStats[kStatTier] = gTier;
  gStats[kStatShed] = gShed;
}

void resetVoices() {
  gEngine.reset();
  gTire.reset();
  gGrains.reset();
  gDynamics.reset();
  gDelay.reset();
  gConvolver.clear();
  gColour.reset();
  gPartIndex = 0;
  for (int i = 0; i < kPartition; ++i) { gWetIn[i] = 0.0; gWetOut[i] = 0.0; }
  Smoother* smoothers[] = {&gN1, &gN2, &gThrust, &gFuel, &gKias, &gGear,
                           &gFlap, &gExterior, &gCombustion, &gSpatial, &gPan};
  for (Smoother* s : smoothers) s->reset(0.0);
  gColourHz.reset(1200.0);
  gDelaySmoother.reset(0.0);
}

/** Ingests one snapshot, keeping the queue ordered by target frame. */
void ingestSnapshot(const double* values) {
  if (!gAnchored || static_cast<int>(values[kEpoch]) != gEpoch) {
    gStats[kStatSnapshotsDropped] += 1.0;
    return;
  }
  for (int i = 0; i < kSnapshotSize; ++i) {
    if (!std::isfinite(values[i])) {
      gStats[kStatNonFinite] += 1.0;
      gStats[kStatSnapshotsDropped] += 1.0;
      return;
    }
  }
  const double target = targetFrameFor(values[kSimTimeS]);
  if (gQueueCount > 0) {
    QueueEntry& newest = gQueue[(gQueueHead + gQueueCount - 1) % kQueueCapacity];
    // The queue stays ordered by construction. A late snapshot would rewind
    // the interpolator and make staleness lie, so it is dropped; a repeat of
    // the same instant replaces the newest entry (newest state wins).
    if (target < newest.target - 0.5) {
      gStats[kStatSnapshotsDropped] += 1.0;
      return;
    }
    if (target <= newest.target + 0.5) {
      std::memcpy(newest.values, values, sizeof(double) * kSnapshotSize);
      gStats[kStatSnapshotsIn] += 1.0;
      gFreshSnapshots = true;
      return;
    }
  }
  if (gQueueCount >= kQueueCapacity) {
    // A full queue means the consumer is behind; the newest state is the one
    // worth keeping, so the oldest goes.
    gQueueHead = (gQueueHead + 1) % kQueueCapacity;
    gQueueCount--;
    if (gBracket > 0) gBracket--;
    gStats[kStatSnapshotsDropped] += 1.0;
  }
  QueueEntry& entry = gQueue[(gQueueHead + gQueueCount) % kQueueCapacity];
  std::memcpy(entry.values, values, sizeof(double) * kSnapshotSize);
  entry.target = target;
  gQueueCount++;
  gStats[kStatSnapshotsIn] += 1.0;
  gFreshSnapshots = true;
}

void ingestEvent(int type, double simTimeS, int epoch, double payload) {
  if (type == kEventEpoch || type == kEventResync) {
    gResyncRequested = true;
    return;
  }
  // A light-off from before a reset must not latch the new epoch's burner.
  if (!gAnchored || epoch != gEpoch) { gStats[kStatEventsDropped] += 1.0; return; }
  if (gEventCount >= kEventCapacity) {
    gStats[kStatEventsDropped] += 1.0;
    // sound.md §2: overflow resynchronises and reports. It never silently
    // loses an ignition or a shutdown.
    gResyncRequested = true;
    return;
  }
  PendingEvent& event = gEvents[gEventCount++];
  event.target = targetFrameFor(simTimeS);
  event.simTimeS = simTimeS;
  event.type = type;
  event.payload = payload;
  gStats[kStatEventsIn] += 1.0;
}

/**
 * Discrete transitions land at their own timestamp, not at the next telemetry
 * interval. Light-off latches combustion on until interpolated telemetry agrees,
 * so a dropped snapshot cannot leave the burner silent through a start.
 */
void applyEvent(int type) {
  switch (type) {
    case kEventLightOff:
    case kEventRunningOn:
      gCombustionLatch = 1.0;
      gHasCombustionLatch = true;
      break;
    case kEventFlameout:
    case kEventRunningOff:
      gCombustionLatch = 0.0;
      gHasCombustionLatch = true;
      break;
    default:
      break;  // Starter transitions are already visible through N2 telemetry.
  }
}

void drainEventsUpTo(double frame) {
  int keep = 0;
  for (int i = 0; i < gEventCount; ++i) {
    if (gEvents[i].target <= frame) {
      applyEvent(gEvents[i].type);
    } else {
      gEvents[keep++] = gEvents[i];
    }
  }
  gEventCount = keep;
}

/** Advances the bracket cursor and writes the interpolated snapshot. */
bool interpolateAt(double frame, double* out) {
  if (gQueueCount == 0) return false;
  // Retire entries the cursor has passed, always keeping one to bracket from.
  while (gQueueCount > 1) {
    const QueueEntry& next = gQueue[(gQueueHead + 1) % kQueueCapacity];
    if (next.target > frame) break;
    gQueueHead = (gQueueHead + 1) % kQueueCapacity;
    gQueueCount--;
  }
  const QueueEntry& a = gQueue[gQueueHead];
  if (gQueueCount == 1 || frame <= a.target) {
    std::memcpy(out, a.values, sizeof(double) * kSnapshotSize);
    return true;
  }
  const QueueEntry& b = gQueue[(gQueueHead + 1) % kQueueCapacity];
  const double span = b.target - a.target;
  const double t = span > 1e-9 ? clamp01((frame - a.target) / span) : 1.0;
  for (int i = 0; i < kSnapshotSize; ++i) {
    out[i] = a.values[i] + (b.values[i] - a.values[i]) * t;
  }
  // Identity and discrete fields must never be blended into a half-state.
  out[kVersion] = b.values[kVersion];
  out[kSequence] = b.values[kSequence];
  out[kEpoch] = b.values[kEpoch];
  out[kAvailability] = a.values[kAvailability];
  out[kRunning] = a.values[kRunning];
  out[kStarter] = a.values[kStarter];
  out[kCutoff] = a.values[kCutoff];
  return true;
}

double newestTarget() {
  if (gQueueCount == 0) return 0.0;
  return gQueue[(gQueueHead + gQueueCount - 1) % kQueueCapacity].target;
}

}  // namespace
}  // namespace osfs_audio

// ----------------------------------------------------------------- API -----

using namespace osfs_audio;

OSFS_EXPORT int osfs_audio_init(double sampleRate, int maxBlockFrames, unsigned seed) {
  if (!(sampleRate > 8000.0) || sampleRate > kMaxSampleRate) return 0;
  gSampleRate = sampleRate;
  gMaxBlock = (maxBlockFrames > 0 && maxBlockFrames <= kMaxBlock) ? maxBlockFrames : kPartition;
  gEngine.configure(sampleRate, seed ? seed : 0x53463530u);
  gTire.configure(sampleRate, 0x74697265u);
  gGrains.configure(sampleRate, seed ^ 0x9e3779b9u);
  gDynamics.configure(sampleRate);
  gDelay.configure(gDelayStorage, static_cast<int>(clamp(sampleRate * 0.5, 2.0, kDelayCapacity)));
  gConvolver.configure(gIrSpectra, gIrFdl, gIrScratch);
  for (Smoother* s : {&gN1, &gN2, &gThrust, &gFuel, &gKias, &gGear, &gFlap,
                      &gExterior, &gCombustion, &gSpatial, &gPan, &gColourHz}) {
    s->configure(sampleRate, kSmoothTau);
  }
  // The propagation delay carries the Doppler shift, so it is smoothed far more
  // gently: a 10 ms constant on distance would sound like a pitch wobble.
  gDelaySmoother.configure(sampleRate, 0.060);
  gIrSeconds = -1.0;
  for (int i = 0; i < kStatCount; ++i) gStats[i] = 0.0;
  clearQueue();
  resetVoices();
  applyCaps();
  gFade = 0.0;
  beginFade(1.0, kTransitionFadeSeconds);
  gReady = true;
  return 1;
}

OSFS_EXPORT void osfs_audio_reset(void) {
  clearQueue();
  resetVoices();
  gAnchored = false;
  gResyncRequested = false;
  gFade = 0.0;
  beginFade(1.0, kTransitionFadeSeconds);
}

OSFS_EXPORT void osfs_audio_set_tier(int tier) {
  const int next = (tier < kTierOff) ? kTierOff : (tier > kTierHigh ? kTierHigh : tier);
  if (next == gTier) return;
  gTier = next;
  gShed = 0;
  applyCaps();
  // §1: fade down, switch, fade up. Never run two engines to cross a tier.
  gFade = 0.0;
  beginFade(1.0, kTransitionFadeSeconds);
}

OSFS_EXPORT int osfs_audio_get_tier(void) { return gTier; }

OSFS_EXPORT void osfs_audio_set_shed(int level) {
  const int next = level < 0 ? 0 : (level > 8 ? 8 : level);
  if (next == gShed) return;
  gShed = next;
  applyCaps();
}

OSFS_EXPORT int osfs_audio_get_shed(void) { return gShed; }

OSFS_EXPORT void osfs_audio_set_gains(double master, double engine, double tire,
                                      double airframe, double reducedRange) {
  gMasterGain = clamp01(sanitize(master));
  gEngineGain = clamp01(sanitize(engine));
  gTireGain = clamp01(sanitize(tire));
  gAirframeGain = clamp01(sanitize(airframe));
  gDynamics.setReducedRange(clamp01(sanitize(reducedRange)));
}

OSFS_EXPORT void osfs_audio_set_epoch(int epoch, double simTimeS, double audioFrame) {
  gEpoch = epoch;
  gAnchorSim = sanitize(simTimeS);
  gAnchorFrame = sanitize(audioFrame);
  gAnchored = true;
  gResyncRequested = false;
  clearQueue();
  gStats[kStatEpoch] = epoch;
  // A reset, a seek or a model replacement is a discontinuity: mute, rebase,
  // and come back up rather than gliding through unrelated state.
  gFade = 0.0;
  beginFade(1.0, kTransitionFadeSeconds);
}

OSFS_EXPORT double* osfs_audio_batch_ptr(void) { return gBatch; }
OSFS_EXPORT int osfs_audio_batch_length(void) { return kBatchLength; }
OSFS_EXPORT int osfs_audio_snapshot_size(void) { return kSnapshotSize; }

OSFS_EXPORT void osfs_audio_commit_batch(void) {
  const int snapshots = static_cast<int>(sanitize(gBatch[0]));
  const int events = static_cast<int>(sanitize(gBatch[1]));
  const int snapshotCount = snapshots < 0 ? 0 : (snapshots > kBatchSnapshots ? kBatchSnapshots : snapshots);
  const int eventCount = events < 0 ? 0 : (events > kEventCapacity ? kEventCapacity : events);
  for (int i = 0; i < snapshotCount; ++i) {
    ingestSnapshot(gBatch + kBatchHeader + i * kSnapshotSize);
  }
  const double* eventBase = gBatch + kBatchHeader + kBatchSnapshots * kSnapshotSize;
  for (int i = 0; i < eventCount; ++i) {
    const double* e = eventBase + i * kEventSize;
    ingestEvent(static_cast<int>(e[0]), e[1], static_cast<int>(e[2]), e[3]);
  }
}

OSFS_EXPORT void osfs_audio_set_tire(double slipPowerWatts) {
  gTireWatts = std::fmax(0.0, sanitize(slipPowerWatts));
}

OSFS_EXPORT float* osfs_audio_out(int channel) {
  return channel == 0 ? gOutLeft : gOutRight;
}

OSFS_EXPORT double* osfs_audio_stats(void) { return gStats; }
OSFS_EXPORT int osfs_audio_stats_count(void) { return kStatCount; }

/**
 * Tier 3 band storage. Called only from the setup path, never from process().
 * There is no shipping bank: sound.md §4 excludes the Recordist library, so the
 * only callers today are original synthetic test fixtures.
 */
OSFS_EXPORT float* osfs_audio_band_alloc(int index, int frames, double n1, double exterior) {
  if (index < 0 || index >= kMaxBands || frames <= 0 || frames > 60 * kMaxSampleRate) return nullptr;
  std::free(gBandStorage[index]);
  gBandStorage[index] = static_cast<float*>(std::calloc(static_cast<size_t>(frames), sizeof(float)));
  if (!gBandStorage[index]) {
    gBands[index] = Band{};
    return nullptr;
  }
  gBands[index].samples = gBandStorage[index];
  gBands[index].length = frames;
  gBands[index].n1 = clamp01(sanitize(n1));
  gBands[index].exterior = clamp01(sanitize(exterior));
  if (index >= gBandCount) gBandCount = index + 1;
  gGrains.setBands(gBands, gBandCount);
  return gBandStorage[index];
}

OSFS_EXPORT void osfs_audio_band_clear(void) {
  for (int i = 0; i < kMaxBands; ++i) {
    std::free(gBandStorage[i]);
    gBandStorage[i] = nullptr;
    gBands[i] = Band{};
  }
  gBandCount = 0;
  gGrains.setBands(nullptr, 0);
  gGrains.reset();
}

/** Reports whether a bank is loaded, not whether the current tier plays it. */
OSFS_EXPORT int osfs_audio_bands_ready(void) { return gGrains.hasBands() ? 1 : 0; }

/**
 * Renders `frames` samples starting at absolute audio frame `blockStartFrame`.
 * No allocation, no locking, no waiting, no logging.
 */
OSFS_EXPORT void osfs_audio_process(double blockStartFrame, int frames) {
  const int count = frames < 0 ? 0 : (frames > gMaxBlock ? gMaxBlock : frames);
  if (!gReady || gTier == kTierOff) {
    for (int i = 0; i < count; ++i) { gOutLeft[i] = 0.0f; gOutRight[i] = 0.0f; }
    return;
  }

  const double start = sanitize(blockStartFrame);
  const double lagFrames = kTelemetryLagSeconds * gSampleRate;

  if (gResyncRequested && gQueueCount > 0) {
    // Re-anchor so the newest snapshot lands at the evaluation point. A growing
    // backlog is never left to accumulate.
    // The newest state is kept, so the render has a target through the fade
    // instead of reading the rebase as missing telemetry.
    const int newest = (gQueueHead + gQueueCount - 1) % kQueueCapacity;
    if (newest != 0) gQueue[0] = gQueue[newest];
    gQueueHead = 0;
    gQueueCount = 1;
    gBracket = 0;
    gAnchorSim = gQueue[0].values[kSimTimeS];
    gAnchorFrame = start - lagFrames;
    gQueue[0].target = gAnchorFrame;
    // Pending transitions keep their own timestamps on the new timeline; any
    // now in the past land on the next sample rather than vanishing.
    for (int e = 0; e < gEventCount; ++e) gEvents[e].target = targetFrameFor(gEvents[e].simTimeS);
    gResyncRequested = false;
    gStats[kStatResyncs] += 1.0;
    // No fade: voices, phases and filters carry straight through a re-anchor,
    // and the 10 ms target smoothing absorbs the jump in state. Fading from
    // silence here turned every small timeline slip (a few blocked physics
    // frames) into an audible dropout.
  }

  // Sustained skew in either direction is a clock problem, not a data problem:
  // telemetry far ahead is a backlog, and FRESH telemetry stamped behind the
  // render point is a slipped timeline that would otherwise read as stale
  // forever and never come back.
  if (gQueueCount > 0 && gAnchored) {
    const double skew = (newestTarget() - (start - lagFrames)) / gSampleRate;
    if (skew > kResyncSeconds || (gFreshSnapshots && -skew > kSlipSeconds)) {
      gResyncRequested = true;
    }
  }
  gFreshSnapshots = false;

  double interpolated[kSnapshotSize] = {};
  const bool spatialTier = gTier >= kTierMed;
  const double ceilingDelay = gSampleRate * 0.42;   // fade out before the 0.5 s cap

  for (int i = 0; i < count; ++i) {
    const double frame = start + i;
    const double evalFrame = frame - lagFrames;
    drainEventsUpTo(evalFrame);

    const bool haveTelemetry = interpolateAt(evalFrame, interpolated);
    double staleSeconds = 0.0;
    if (haveTelemetry) {
      staleSeconds = std::fmax(0.0, (evalFrame - newestTarget()) / gSampleRate);
    }

    // Hold the last valid target through a missing bracket; fade to silence
    // once telemetry has been stale for 250 ms (sound.md §2).
    if (!haveTelemetry || staleSeconds > kStaleSeconds) {
      if (gFadeTarget != 0.0) {
        beginFade(0.0, kStaleFadeSeconds);
        gStats[kStatStaleFades] += 1.0;
      }
    } else if (gFadeTarget == 0.0 && !gResyncRequested) {
      beginFade(1.0, kTransitionFadeSeconds);
    }
    gFade += clamp(gFadeTarget - gFade, -gFadeStep, gFadeStep);

    const int availability = static_cast<int>(interpolated[kAvailability]);
    EngineInput in;
    // A clear availability bit means "not published". Smoothing toward zero is
    // the honest response: it fades that contribution out instead of asserting
    // a value the adapter never read.
    in.n1 = gN1.process((availability & kAvailN1) ? clamp01(interpolated[kN1Pct] / 100.0) : 0.0);
    in.n2 = gN2.process((availability & kAvailN2) ? clamp01(interpolated[kN2Pct] / 100.0) : 0.0);
    in.thrustNorm = gThrust.process(
        (availability & kAvailThrust) ? clamp01(interpolated[kThrustLbf] / 1846.0) : 0.0);
    in.fuelNorm = gFuel.process(
        (availability & kAvailFuelFlow) ? clamp01(interpolated[kFuelFlowPps] / 0.25) : 0.0);
    in.kias = gKias.process((availability & kAvailAirspeed) ? std::fmax(0.0, interpolated[kKias]) : 0.0);
    in.gear = gGear.process((availability & kAvailConfig) ? clamp01(interpolated[kGearNorm]) : 0.0);
    in.flap = gFlap.process((availability & kAvailConfig) ? clamp01(interpolated[kFlapNorm]) : 0.0);

    double combustionTarget = (availability & kAvailCombustion) ? clamp01(interpolated[kCombustion]) : 0.0;
    if (gHasCombustionLatch) {
      if (std::fabs(combustionTarget - gCombustionLatch) < 0.5) gHasCombustionLatch = false;
      else combustionTarget = gCombustionLatch;
    }
    in.combustion = gCombustion.process(combustionTarget);

    const double exterior = gExterior.process(
        (availability & kAvailPose) ? clamp01(interpolated[kExterior]) : 0.0);

    // ---- geometry -------------------------------------------------------
    const double sx = interpolated[kSourceX];
    const double sy = interpolated[kSourceY];
    const double sz = interpolated[kSourceZ];
    const double distance = std::sqrt(sx * sx + sy * sy + sz * sz);
    const double soundSpeed = std::fmax(50.0, interpolated[kSoundSpeedMps]);

    double doppler = 1.0;
    if (distance > 1e-3) {
      // n is the unit vector source -> listener (sound.md §3).
      const double nx = -sx / distance, ny = -sy / distance, nz = -sz / distance;
      const double vs = interpolated[kSourceVelX] * nx + interpolated[kSourceVelY] * ny
          + interpolated[kSourceVelZ] * nz;
      const double vl = interpolated[kListenerVelX] * nx + interpolated[kListenerVelY] * ny
          + interpolated[kListenerVelZ] * nz;
      const double denominator = soundSpeed - vs;
      doppler = std::fabs(denominator) > 1e-6 ? (soundSpeed - vl) / denominator : 1.0;
      doppler = clamp(sanitize(doppler, 1.0), 0.5, 2.0);
    }

    // ---- sources --------------------------------------------------------
    // Doppler is applied by the delay line below, so the voice generates at
    // base frequency and only uses the ratio to cull partials that would alias.
    double airframeNoise = 0.0;
    double mono = gEngine.process(in, spatialTier ? doppler : 1.0, &airframeNoise) * gEngineGain
        + airframeNoise * gAirframeGain;

    if (gTier == kTierHigh && gGrains.ready()) {
      const double density = 0.25 + 0.75 * clamp01(in.n1);
      mono += gGrains.process(in.n1, exterior, density, 1.0) * gEngineGain;
      gStats[kStatActiveGrains] = gGrains.activeGrains();
      gStats[kStatGrainDrops] = gGrains.droppedStarts();
    }

    // ---- propagation ----------------------------------------------------
    double direct = mono;
    double distanceFade = 1.0;
    if (spatialTier) {
      gDelay.write(mono);
      const double wanted = distance / soundSpeed * gSampleRate;
      const double delaySamples = gDelaySmoother.process(wanted);
      // Beyond the 0.5 s storage cap the path is faded out rather than
      // clamped into a false stationary distance. At that range the 1/d law
      // has already put the source near -45 dB.
      distanceFade = 1.0 - clamp01((delaySamples - ceilingDelay) / (gSampleRate * 0.06));
      direct = gDelay.read(delaySamples) * distanceFade;

      const double pathDifference = interpolated[kGroundReflectionM];
      if (pathDifference >= 0.0) {
        // One ground-image reflection, gain <= 0.25 (sound.md §3).
        const double reflected = gDelay.read(delaySamples + pathDifference / soundSpeed * gSampleRate);
        direct += reflected * 0.25 * distanceFade;
      }
    }

    // ---- installation colour and distance -------------------------------
    // Interior is not a free-field point source: the cockpit uses a fixed
    // -18 dB installation gain instead of the 1/d law, and the two land at a
    // comparable level near 10 m, so switching view is not a loudness jump.
    const double freeField = std::fmin(1.0, 1.0 / std::fmax(distance, 1e-3));
    constexpr double kCockpitGain = 0.12589254117941673;  // -18 dB
    const double absorption = clamp(18000.0 / (1.0 + distance / 200.0), 500.0, 18000.0);
    const double colourHz = gColourHz.process(1200.0 + (absorption - 1200.0) * exterior);
    // Without pose the source stays where it was last placed rather than
    // jumping to the listener, which would be a loud artefact.
    const double spatialGain =
        gSpatial.process(kCockpitGain + (freeField - kCockpitGain) * exterior);
    gColour.lowpass(gSampleRate, colourHz, 0.707);
    double coloured = gColour.process(direct) * spatialGain;

    // ---- cabin/airframe impulse response --------------------------------
    if (gConvolver.active()) {
      const double wet = gWetOut[gPartIndex];
      gWetIn[gPartIndex] = coloured;
      if (++gPartIndex >= kPartition) {
        gConvolver.process(gWetIn, gWetOut);
        gPartIndex = 0;
      }
      coloured = coloured * 0.65 + wet * 0.35;
    }

    // ---- pan and tire ---------------------------------------------------
    const double pan = gPan.process(distance > 1e-3 ? clamp(sx / std::fmax(distance, 0.5), -1.0, 1.0) : 0.0);
    const double angle = (pan + 1.0) * kPi * 0.25;
    // The telemetry fade gates the ENGINE path only. The tire cue comes straight
    // from contact slip on the main thread and has no snapshots of its own, so
    // an aircraft without an engine adapter, or tire-only playback, must not be
    // silenced by a stale-telemetry fade.
    const double engineEnvelope = clamp01(gFade);
    double left = coloured * std::cos(angle) * kSqrt2 * engineEnvelope;
    double right = coloured * std::sin(angle) * kSqrt2 * engineEnvelope;

    // The tire cue is non-positional, exactly as the graph it replaces was. In
    // exterior view it takes the same distance law so a 200 m chase camera does
    // not hear louder tires than engine.
    const double tire = gTire.process(gTireWatts) * gTireGain
        * (1.0 + (freeField - 1.0) * exterior);
    left += tire;
    right += tire;

    left *= gMasterGain;
    right *= gMasterGain;
    gDynamics.process(left, right);

    gOutLeft[i] = static_cast<float>(left);
    gOutRight[i] = static_cast<float>(right);
    const double peak = std::fmax(std::fabs(left), std::fabs(right));
    if (peak > gStats[kStatPeak]) gStats[kStatPeak] = peak;
    gStats[kStatTelemetryAge] = staleSeconds;
    gStats[kStatDoppler] = doppler;
    gStats[kStatDistance] = distance;
  }

  gStats[kStatBlocks] += 1.0;
  gStats[kStatFrames] += count;
  gStats[kStatQueueDepth] = gQueueCount;
  gStats[kStatFade] = gFade;
}
