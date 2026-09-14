// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 the 0sfs authors.
//
// Pooled granular renderer for Tier 3.
//
// ASSET STATUS: no licensed FJ33 bank exists, so this renderer has no shipping
// source material. sound.md §4 excludes the Recordist SF50 library from
// embedding, redistribution and training. The pool is exercised only by
// ORIGINAL SYNTHETIC FIXTURES in tests; High stays unavailable at runtime until
// Release lands a cleared bank. Nothing here decodes or fetches anything.
#pragma once

#include "primitives.h"

namespace osfs_audio {

constexpr int kMaxGrains = 12;          // simultaneous voices, sound.md §1
constexpr int kMaxBandsPerView = 3;     // three operating bands per view
constexpr int kMaxBands = 2 * kMaxBandsPerView;

/** One decoded mono band. Storage is owned by the host, never by this class. */
struct Band {
  const float* samples = nullptr;
  int length = 0;
  /** Normalised fan speed this band was captured at, for band selection. */
  double n1 = 0.0;
  /** 0 = cockpit, 1 = exterior. */
  double exterior = 0.0;
};

/**
 * Fixed pool of `kMaxGrains` voices with a hard start-rate limit. A grain that
 * cannot be admitted is counted and dropped; the renderer never grows the pool
 * and never waits.
 */
class GranularVoice {
 public:
  void configure(double sampleRate, uint32_t seed) {
    sampleRate_ = sampleRate > 0.0 ? sampleRate : 48000.0;
    rng_.seed(seed);
    reset();
  }

  void reset() {
    for (int i = 0; i < kMaxGrains; ++i) grains_[i].active = false;
    sinceStart_ = 1.0;
    dropped_ = 0;
    active_ = 0;
  }

  void setBands(const Band* bands, int count) {
    bands_ = bands;
    bandCount_ = count < 0 ? 0 : (count > kMaxBands ? kMaxBands : count);
  }

  /** Shedding: 12 -> 8 -> 4 voices and 160 -> 100 -> 50 starts/s. */
  void setCaps(int maxGrains, double startsPerSecond) {
    maxGrains_ = maxGrains < 0 ? 0 : (maxGrains > kMaxGrains ? kMaxGrains : maxGrains);
    startsPerSecond_ = clamp(startsPerSecond, 0.0, 160.0);
  }

  /** Bands are loaded. Independent of whether the current tier admits grains. */
  bool hasBands() const { return bandCount_ > 0; }
  bool ready() const { return hasBands() && maxGrains_ > 0; }
  int activeGrains() const { return active_; }
  int droppedStarts() const { return dropped_; }

  double process(double n1, double exterior, double density, double dopplerRatio) {
    if (!ready()) return 0.0;
    const double interval = startsPerSecond_ > 0.0 ? 1.0 / startsPerSecond_ : 1e9;
    sinceStart_ += 1.0 / sampleRate_;
    if (sinceStart_ >= interval / std::fmax(clamp01(density), 1e-3)) {
      sinceStart_ = 0.0;
      if (!start(n1, exterior, dopplerRatio)) dropped_++;
    }

    double sum = 0.0;
    int live = 0;
    for (int i = 0; i < kMaxGrains; ++i) {
      Grain& g = grains_[i];
      if (!g.active) continue;
      const Band& band = bands_[g.band];
      const double position = g.position;
      if (position >= band.length - 2 || g.phase >= 1.0) {
        g.active = false;
        continue;
      }
      // Hann window: zero-valued endpoints mean a grain can never click in or
      // out, however abruptly the pool recycles it.
      const double window = 0.5 - 0.5 * std::cos(2.0 * kPi * g.phase);
      const int index = static_cast<int>(position);
      const double fraction = position - index;
      const double sample = band.samples[index] * (1.0 - fraction)
          + band.samples[index + 1] * fraction;
      sum += sample * window * g.gain;
      g.position += g.rate;
      g.phase += g.phaseStep;
      ++live;
    }
    active_ = live;
    return sanitize(sum * 0.42);
  }

 private:
  struct Grain {
    bool active = false;
    int band = 0;
    double position = 0.0;
    double rate = 1.0;
    double phase = 0.0;
    double phaseStep = 0.0;
    double gain = 0.0;
  };

  /** Picks the band whose capture speed and view are closest to the request. */
  int selectBand(double n1, double exterior) const {
    int best = -1;
    double bestCost = 1e18;
    for (int i = 0; i < bandCount_; ++i) {
      if (!bands_[i].samples || bands_[i].length < 4) continue;
      const double cost = std::fabs(bands_[i].n1 - n1)
          + 2.0 * std::fabs(bands_[i].exterior - exterior);
      if (cost < bestCost) { bestCost = cost; best = i; }
    }
    return best;
  }

  bool start(double n1, double exterior, double dopplerRatio) {
    int slot = -1;
    int live = 0;
    for (int i = 0; i < kMaxGrains; ++i) {
      if (grains_[i].active) { ++live; continue; }
      if (slot < 0) slot = i;
    }
    if (slot < 0 || live >= maxGrains_) return false;
    const int band = selectBand(n1, exterior);
    if (band < 0) return false;

    const Band& source = bands_[band];
    // 20-60 ms windows, sound.md §1.
    const double lengthSeconds = 0.020 + 0.040 * clamp01((rng_.uniform() + 1.0) * 0.5);
    const double rate = clamp(dopplerRatio * (1.0 + 0.02 * rng_.uniform()), 0.5, 2.0);
    const double span = lengthSeconds * sampleRate_ * rate;
    const double room = static_cast<double>(source.length) - span - 2.0;
    if (room <= 1.0) return false;

    Grain& g = grains_[slot];
    g.active = true;
    g.band = band;
    g.position = clamp01((rng_.uniform() + 1.0) * 0.5) * room;
    g.rate = rate;
    g.phase = 0.0;
    g.phaseStep = 1.0 / std::fmax(lengthSeconds * sampleRate_, 1.0);
    g.gain = 0.8 + 0.2 * rng_.uniform();
    return true;
  }

  double sampleRate_ = 48000.0;
  Rng rng_;
  Grain grains_[kMaxGrains];
  const Band* bands_ = nullptr;
  int bandCount_ = 0;
  int maxGrains_ = kMaxGrains;
  double startsPerSecond_ = 160.0;
  double sinceStart_ = 1.0;
  int dropped_ = 0;
  int active_ = 0;
};

}  // namespace osfs_audio
