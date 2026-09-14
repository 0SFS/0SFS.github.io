// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 the 0sfs authors.
//
// Uniform partitioned overlap-add convolver, 128-frame partitions, and the
// generated impulse responses it runs. sound.md §2 requires FFT overlap and
// filter state to survive between callbacks, which the frequency-delay line
// below does: nothing here is rebuilt per block.
#pragma once

#include "primitives.h"

namespace osfs_audio {

constexpr int kPartition = 128;
constexpr int kFftSize = 2 * kPartition;  // 256
constexpr int kMaxPartitions = 16;        // 2048 padded taps, the Tier 3 cap

/** In-place radix-2 complex FFT. `sign` is -1 forward, +1 inverse (unscaled). */
inline void fft(double* re, double* im, int sign) {
  for (int i = 1, j = 0; i < kFftSize; ++i) {
    int bit = kFftSize >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      double t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (int length = 2; length <= kFftSize; length <<= 1) {
    const double angle = sign * 2.0 * kPi / length;
    const double wr = std::cos(angle), wi = std::sin(angle);
    for (int i = 0; i < kFftSize; i += length) {
      double cr = 1.0, ci = 0.0;
      for (int k = 0; k < length / 2; ++k) {
        const int a = i + k, b = i + k + length / 2;
        const double xr = re[b] * cr - im[b] * ci;
        const double xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr;        im[a] += xi;
        const double nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/**
 * One mono partitioned convolver. All storage is supplied by the caller at
 * init, so `process()` never allocates and the resident cost is visible in the
 * tier budget rather than hidden in the heap.
 */
class Convolver {
 public:
  /** `spectra` needs kMaxPartitions * kFftSize * 2 doubles; `fdl` the same. */
  void configure(double* spectra, double* fdl, double* scratch) {
    spectra_ = spectra;
    fdl_ = fdl;
    scratch_ = scratch;
    partitions_ = 0;
    clear();
  }

  void clear() {
    head_ = 0;
    for (int i = 0; i < kPartition; ++i) tail_[i] = 0.0;
    for (int i = 0; i < kPartition; ++i) previous_[i] = 0.0;
    if (fdl_) {
      for (int i = 0; i < kMaxPartitions * kFftSize * 2; ++i) fdl_[i] = 0.0;
    }
  }

  /** Loads an IR of `taps` samples; extra partitions are zeroed, not stale. */
  void setImpulse(const double* impulse, int taps) {
    if (!spectra_) return;
    const int wanted = (taps + kPartition - 1) / kPartition;
    partitions_ = wanted < 1 ? 0 : (wanted > kMaxPartitions ? kMaxPartitions : wanted);
    for (int p = 0; p < partitions_; ++p) {
      double* re = spectra_ + (p * 2) * kFftSize;
      double* im = spectra_ + (p * 2 + 1) * kFftSize;
      for (int i = 0; i < kFftSize; ++i) {
        const int source = p * kPartition + i;
        re[i] = (i < kPartition && source < taps) ? sanitize(impulse[source]) : 0.0;
        im[i] = 0.0;
      }
      fft(re, im, -1);
    }
    clear();
  }

  bool active() const { return partitions_ > 0 && spectra_ && fdl_ && scratch_; }

  /** Consumes and produces exactly kPartition samples. */
  void process(const double* input, double* output) {
    if (!active()) {
      for (int i = 0; i < kPartition; ++i) output[i] = 0.0;
      return;
    }
    double* re = scratch_;
    double* im = scratch_ + kFftSize;
    for (int i = 0; i < kPartition; ++i) {
      re[i] = previous_[i];
      re[kPartition + i] = sanitize(input[i]);
      im[i] = 0.0;
      im[kPartition + i] = 0.0;
    }
    for (int i = 0; i < kPartition; ++i) previous_[i] = sanitize(input[i]);
    fft(re, im, -1);

    head_ = (head_ + 1) % partitions_;
    double* slotRe = fdl_ + (head_ * 2) * kFftSize;
    double* slotIm = fdl_ + (head_ * 2 + 1) * kFftSize;
    for (int i = 0; i < kFftSize; ++i) { slotRe[i] = re[i]; slotIm[i] = im[i]; }

    double* accRe = scratch_ + 2 * kFftSize;
    double* accIm = scratch_ + 3 * kFftSize;
    for (int i = 0; i < kFftSize; ++i) { accRe[i] = 0.0; accIm[i] = 0.0; }
    for (int p = 0; p < partitions_; ++p) {
      const int slot = ((head_ - p) % partitions_ + partitions_) % partitions_;
      const double* xr = fdl_ + (slot * 2) * kFftSize;
      const double* xi = fdl_ + (slot * 2 + 1) * kFftSize;
      const double* hr = spectra_ + (p * 2) * kFftSize;
      const double* hi = spectra_ + (p * 2 + 1) * kFftSize;
      for (int i = 0; i < kFftSize; ++i) {
        accRe[i] += xr[i] * hr[i] - xi[i] * hi[i];
        accIm[i] += xr[i] * hi[i] + xi[i] * hr[i];
      }
    }
    fft(accRe, accIm, 1);
    const double scale = 1.0 / kFftSize;
    // Second half of the overlap-add frame is the valid output block.
    for (int i = 0; i < kPartition; ++i) {
      output[i] = sanitize(accRe[kPartition + i] * scale + tail_[i]);
      tail_[i] = 0.0;
    }
  }

 private:
  double* spectra_ = nullptr;
  double* fdl_ = nullptr;
  double* scratch_ = nullptr;
  int partitions_ = 0;
  int head_ = 0;
  double previous_[kPartition] = {};
  double tail_[kPartition] = {};
};

/**
 * Generates a short synthetic cabin/airframe impulse response. This is an
 * exponentially decaying noise burst with an early reflection, NOT a measured
 * SF50 cabin: sound.md §1 lists Med/High IRs as "generated", with no recorded
 * assets, and §3 calls the colour unverified.
 */
inline int generateCabinImpulse(double* target, int capacity, double sampleRate,
                                double lengthSeconds, uint32_t seed) {
  const int taps = static_cast<int>(clamp(lengthSeconds * sampleRate, 1.0,
                                          static_cast<double>(capacity)));
  Rng rng(seed);
  Biquad colour;
  colour.lowpass(sampleRate, 3200.0, 0.7);
  double energy = 0.0;
  for (int i = 0; i < taps; ++i) {
    const double t = static_cast<double>(i) / sampleRate;
    const double decay = std::exp(-t / std::fmax(lengthSeconds * 0.28, 1e-4));
    double sample = colour.process(rng.uniform()) * decay;
    if (i == 0) sample += 1.0;                                   // direct path
    const int early = static_cast<int>(sampleRate * 0.0043);     // ~1.5 m panel
    if (i == early) sample += 0.45;
    target[i] = sample;
    energy += sample * sample;
  }
  // Unity-energy normalisation keeps switching the IR in or out from changing
  // perceived loudness, which would otherwise read as a tier "getting louder".
  const double norm = energy > 1e-12 ? 1.0 / std::sqrt(energy) : 1.0;
  for (int i = 0; i < taps; ++i) target[i] *= norm;
  return taps;
}

}  // namespace osfs_audio
