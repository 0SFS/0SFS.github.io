// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 the 0sfs authors.
//
// Original DSP primitives. Every one of these is written from the standard
// published forms (RBJ biquad cookbook, one-pole smoothers, overlap-add
// convolution); no third-party audio source is copied or linked.
#pragma once

#include <cmath>
#include <cstdint>

namespace osfs_audio {

constexpr double kPi = 3.14159265358979323846;

inline double clamp(double v, double lo, double hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}
inline double clamp01(double v) { return clamp(v, 0.0, 1.0); }

// Non-finite input anywhere in the chain would latch a NaN into filter state
// and silence the graph permanently, so every external value passes here.
inline double sanitize(double v, double fallback = 0.0) {
  return std::isfinite(v) ? v : fallback;
}

/** xorshift32. Deterministic across platforms for reproducible fixtures. */
class Rng {
 public:
  explicit Rng(uint32_t seed = 0x53463530u) : state_(seed ? seed : 1u) {}
  void seed(uint32_t s) { state_ = s ? s : 1u; }
  uint32_t next() {
    state_ ^= state_ << 13;
    state_ ^= state_ >> 17;
    state_ ^= state_ << 5;
    return state_;
  }
  /** Uniform in [-1, 1). */
  double uniform() { return static_cast<double>(next()) / 2147483648.0 - 1.0; }

 private:
  uint32_t state_;
};

/**
 * One-pole exponential smoother, `a = exp(-1/(Fs*tau))` from sound.md §2.
 * Used per sample for de-zippering gains and filter targets.
 */
class Smoother {
 public:
  void configure(double sampleRate, double tauSeconds) {
    coefficient_ = (tauSeconds <= 0.0 || sampleRate <= 0.0)
        ? 0.0
        : std::exp(-1.0 / (sampleRate * tauSeconds));
  }
  void reset(double value) { value_ = value; }
  double process(double target) {
    value_ = target + (value_ - target) * coefficient_;
    return value_;
  }
  double value() const { return value_; }

 private:
  double coefficient_ = 0.0;
  double value_ = 0.0;
};

/** Transposed direct form II biquad. */
class Biquad {
 public:
  void reset() { z1_ = z2_ = 0.0; }

  void lowpass(double sampleRate, double frequency, double q) {
    const double w0 = omega(sampleRate, frequency);
    const double alpha = std::sin(w0) / (2.0 * q);
    const double cosw = std::cos(w0);
    set((1.0 - cosw) / 2.0, 1.0 - cosw, (1.0 - cosw) / 2.0,
        1.0 + alpha, -2.0 * cosw, 1.0 - alpha);
  }
  void highpass(double sampleRate, double frequency, double q) {
    const double w0 = omega(sampleRate, frequency);
    const double alpha = std::sin(w0) / (2.0 * q);
    const double cosw = std::cos(w0);
    set((1.0 + cosw) / 2.0, -(1.0 + cosw), (1.0 + cosw) / 2.0,
        1.0 + alpha, -2.0 * cosw, 1.0 - alpha);
  }
  /** Constant skirt gain; peak gain = Q. */
  void bandpass(double sampleRate, double frequency, double q) {
    const double w0 = omega(sampleRate, frequency);
    const double alpha = std::sin(w0) / (2.0 * q);
    const double cosw = std::cos(w0);
    set(alpha, 0.0, -alpha, 1.0 + alpha, -2.0 * cosw, 1.0 - alpha);
  }

  double process(double x) {
    const double y = b0_ * x + z1_;
    z1_ = b1_ * x - a1_ * y + z2_;
    z2_ = b2_ * x - a2_ * y;
    return y;
  }

 private:
  // Nyquist-safe: an unclamped frequency makes tan() blow up and the filter
  // explode, which is exactly what a Doppler-shifted partial can ask for.
  static double omega(double sampleRate, double frequency) {
    const double limit = sampleRate * 0.49;
    return 2.0 * kPi * clamp(sanitize(frequency, 1000.0), 1.0, limit) / sampleRate;
  }
  void set(double b0, double b1, double b2, double a0, double a1, double a2) {
    const double inv = (a0 == 0.0 || !std::isfinite(a0)) ? 1.0 : 1.0 / a0;
    b0_ = b0 * inv; b1_ = b1 * inv; b2_ = b2 * inv;
    a1_ = a1 * inv; a2_ = a2 * inv;
  }

  double b0_ = 1.0, b1_ = 0.0, b2_ = 0.0, a1_ = 0.0, a2_ = 0.0;
  double z1_ = 0.0, z2_ = 0.0;
};

/**
 * Phase-continuous sine. Frequency changes never reset phase, so a spool sweep
 * or a Doppler shift glides instead of clicking.
 */
class Oscillator {
 public:
  void reset(double phase = 0.0) { phase_ = phase; }
  /**
   * `cullScale` is the shift a downstream stage (the Doppler delay line) will
   * still apply. Culling above 0.45*Fs (sound.md §3) has to use the frequency
   * that finally reaches the output, or a shifted partial folds back down the
   * spectrum as an audible descending tone.
   */
  double process(double sampleRate, double frequency, double cullScale = 1.0) {
    if (!(frequency > 0.0)) return 0.0;
    if (frequency * cullScale > sampleRate * 0.45) return 0.0;
    phase_ += frequency / sampleRate;
    if (phase_ >= 1.0) phase_ -= std::floor(phase_);
    return std::sin(2.0 * kPi * phase_);
  }

 private:
  double phase_ = 0.0;
};

/** Leaky DC blocker; cheaper than a biquad and enough to keep the limiter honest. */
class DcBlocker {
 public:
  void reset() { x1_ = y1_ = 0.0; }
  double process(double x) {
    const double y = x - x1_ + 0.9975 * y1_;
    x1_ = x;
    y1_ = y;
    return y;
  }

 private:
  double x1_ = 0.0, y1_ = 0.0;
};

/**
 * Fractional delay line with linear interpolation, used for Doppler and the
 * ground-reflection tap. Storage is fixed at construction; sound.md §2 caps a
 * mono path at 0.5 s and the caller fades before it reaches the cap.
 */
class DelayLine {
 public:
  void configure(float* storage, int capacity) {
    buffer_ = storage;
    capacity_ = capacity > 1 ? capacity : 1;
    reset();
  }
  void reset() {
    write_ = 0;
    if (buffer_) {
      for (int i = 0; i < capacity_; ++i) buffer_[i] = 0.0f;
    }
  }
  void write(double value) {
    if (!buffer_) return;
    buffer_[write_] = static_cast<float>(sanitize(value));
    if (++write_ >= capacity_) write_ = 0;
  }
  /** `delaySamples` is clamped into [1, capacity-2] so reads stay in bounds. */
  double read(double delaySamples) const {
    if (!buffer_) return 0.0;
    const double d = clamp(sanitize(delaySamples, 1.0), 1.0,
                           static_cast<double>(capacity_ - 2));
    const double position = static_cast<double>(write_) - d;
    const double wrapped = position < 0.0 ? position + capacity_ : position;
    const int index = static_cast<int>(wrapped);
    const double fraction = wrapped - static_cast<double>(index);
    const int next = (index + 1 >= capacity_) ? 0 : index + 1;
    return buffer_[index] * (1.0 - fraction) + buffer_[next] * fraction;
  }

 private:
  float* buffer_ = nullptr;
  int capacity_ = 0;
  int write_ = 0;
};

/**
 * Soft-knee compressor followed by a sample-peak limiter. sound.md §3 requires
 * both on every audible tier; the limiter ceiling is -1 dBFS. This is a
 * sample-peak bound, not a true-peak (inter-sample) guarantee.
 */
class Dynamics {
 public:
  void configure(double sampleRate) {
    sampleRate_ = sampleRate > 0.0 ? sampleRate : 48000.0;
    attack_ = std::exp(-1.0 / (sampleRate_ * 0.004));
    release_ = std::exp(-1.0 / (sampleRate_ * 0.120));
    reset();
  }
  void reset() {
    envelope_ = 0.0;
    gain_ = 1.0;
    blockL_.reset();
    blockR_.reset();
  }
  /** `range` 0 = full dynamics, 1 = reduced (accessibility). */
  void setReducedRange(double range) { reduced_ = clamp01(range); }

  void process(double& left, double& right) {
    left = blockL_.process(sanitize(left));
    right = blockR_.process(sanitize(right));

    const double peak = std::fmax(std::fabs(left), std::fabs(right));
    const double coefficient = peak > envelope_ ? attack_ : release_;
    envelope_ = peak + (envelope_ - peak) * coefficient;

    // Threshold and ratio tighten as the accessibility control moves toward
    // "reduced dynamic range"; the knee stays soft in both settings.
    const double threshold = 0.25 - 0.15 * reduced_;
    const double ratio = 3.0 + 5.0 * reduced_;
    double target = 1.0;
    if (envelope_ > threshold) {
      const double over = envelope_ / threshold;
      target = std::pow(over, 1.0 / ratio - 1.0);
    }
    gain_ = target + (gain_ - target) * (target < gain_ ? attack_ : release_);
    left *= gain_;
    right *= gain_;

    constexpr double kCeiling = 0.8912509381337456;  // -1 dBFS
    const double after = std::fmax(std::fabs(left), std::fabs(right));
    if (after > kCeiling) {
      const double trim = kCeiling / after;
      left *= trim;
      right *= trim;
    }
    left = clamp(left, -kCeiling, kCeiling);
    right = clamp(right, -kCeiling, kCeiling);
  }

 private:
  double sampleRate_ = 48000.0;
  double attack_ = 0.0, release_ = 0.0;
  double envelope_ = 0.0, gain_ = 1.0, reduced_ = 0.0;
  DcBlocker blockL_, blockR_;
};

}  // namespace osfs_audio
