// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 the 0sfs authors.
//
// Original turbofan-lite source model for the Williams FJ33-5A installation.
//
// EVIDENCE STATUS: every frequency and gain below is the *initial synthetic
// reference* from sound.md §3, not an FJ33 measurement. `2500 x n1` is not a
// blade-pass frequency: real BPF is bladeCount * ratedN1RPM * n1 / 60 and both
// constants are unknown (TBD, FDM). No buzz-saw sawtooth is generated, because
// its onset for this installation is unverified.
#pragma once

#include "primitives.h"

namespace osfs_audio {

/** Interpolated, already-smoothed inputs for one sample. */
struct EngineInput {
  double n1 = 0.0;          // 0..1
  double n2 = 0.0;          // 0..1
  double thrustNorm = 0.0;  // thrust / 1846 lbf, 0..1
  double fuelNorm = 0.0;    // clamp01(lbm/s / 0.25)
  double combustion = 0.0;  // 0..1, crossfaded at light-off/flameout
  double kias = 0.0;
  double gear = 0.0;
  double flap = 0.0;
};

/** Per-tier source counts. These are the caps sound.md §1 budgets. */
struct EngineCaps {
  int partials = 0;      // engine oscillators, excluding the tire squeal
  int noiseBands = 0;    // engine/airframe noise sources, excluding the tire
  bool bypassBand = false;
};

/**
 * Twelve partials, ordered so that truncating the active count keeps the N1 and
 * N2 fundamentals first: shedding 12 -> 8 -> 4 -> 2 never removes them.
 * `shaft` selects N1 (0) or N2 (1); `order` multiplies that shaft's reference.
 */
struct Partial {
  int shaft;
  double order;
  double gain;
};

constexpr int kMaxPartials = 12;
inline const Partial* partialTable() {
  static const Partial table[kMaxPartials] = {
      {0, 1.0, 1.00}, {1, 1.0, 1.00},
      {0, 2.0, 0.42}, {1, 2.0, 0.38},
      {0, 3.0, 0.22}, {1, 3.0, 0.18},
      {0, 4.0, 0.13}, {1, 4.0, 0.10},
      {0, 0.5, 0.30}, {1, 0.5, 0.24},
      {0, 6.0, 0.07}, {1, 6.0, 0.05},
  };
  return table;
}

/**
 * Mono engine + airframe source. Spatialisation, cabin colour and dynamics all
 * happen downstream, so this stays one signal however many channels play it:
 * a second view must never double the oscillator count.
 */
class TurbofanVoice {
 public:
  void configure(double sampleRate, uint32_t seed) {
    sampleRate_ = sampleRate > 0.0 ? sampleRate : 48000.0;
    rngFan_.seed(seed);
    rngBypass_.seed(seed ^ 0x9e3779b9u);
    rngJet_.seed(seed ^ 0x85ebca6bu);
    rngCombustor_.seed(seed ^ 0xc2b2ae35u);
    rngWind_.seed(seed ^ 0x27d4eb2fu);
    rngTurbulence_.seed(seed ^ 0x165667b1u);
    reset();
  }

  void reset() {
    for (int i = 0; i < kMaxPartials; ++i) oscillators_[i].reset(i * 0.0817);
    fanWake_.reset();
    bypass_.reset();
    jet_.reset();
    combustor_.reset();
    combustorShape_.reset();
    wind_.reset();
    windShape_.reset();
    turbulence_.reset();
    jetFrequency_.configure(sampleRate_, 0.020);
    jetFrequency_.reset(800.0);
  }

  void setCaps(const EngineCaps& caps) { caps_ = caps; }

  /**
   * Generates at unshifted frequencies. Doppler is applied downstream by the
   * variable delay line, which is what sound.md §3 means by "apply Doppler to
   * the whole source ... using variable resampling/delay": one mechanism shifts
   * tones, noise and grains together instead of three that can disagree.
   * `cullScale` is that pending shift, so partials that would alias after it
   * are dropped here rather than folding back down the spectrum.
   */
  double process(const EngineInput& in, double cullScale, double* airframeOut) {
    const double n1 = clamp01(in.n1);
    const double n2 = clamp01(in.n2);
    // u from sound.md: 0 at model idle N1 24.3%, 1 at 100%.
    const double u = clamp01((n1 * 100.0 - 24.3) / 75.7);

    // The bypass weight balances FAN/BYPASS content against CORE content, which
    // is what a bypass ratio describes. Weighting tones against noise instead
    // would bury N2 entirely: its partials sit above the cockpit low-pass, so
    // anything that attenuates them further makes the core shaft inaudible.
    double fanTones = 0.0;
    double coreTones = 0.0;
    const Partial* table = partialTable();
    const int active = caps_.partials < kMaxPartials ? caps_.partials : kMaxPartials;
    for (int i = 0; i < active; ++i) {
      const Partial& p = table[i];
      const double shaft = p.shaft == 0 ? n1 : n2;
      if (shaft <= 1e-4) continue;
      // Initial synthetic references, NOT measured blade-pass frequencies.
      const double reference = p.shaft == 0 ? 2500.0 * shaft : 6000.0 * shaft;
      const double frequency = reference * p.order;
      const double shaftGain = p.shaft == 0 ? (0.15 + 0.85 * u * u) : (n2 * n2);
      const double value =
          oscillators_[i].process(sampleRate_, frequency, cullScale) * p.gain * shaftGain;
      if (p.shaft == 0) fanTones += value; else coreTones += value;
    }
    // Normalising by the fundamental pair keeps the tonal bed at a comparable
    // level across tiers, so shedding partials changes timbre, not loudness.
    fanTones *= 0.30;
    coreTones *= 0.30;

    // Physically separate sources get separate noise. One shared white stream
    // makes the bands coherent, so adding a band (the burner, say) could cancel
    // another band's energy instead of adding to it. Every stream advances
    // every sample whether or not its band is active, so a band that switches on
    // hears the same noise it would have heard all along.
    const double fanWhite = rngFan_.uniform();
    const double bypassWhite = rngBypass_.uniform();
    const double jetWhite = rngJet_.uniform();
    const double combustorWhite = rngCombustor_.uniform();
    const double windWhite = rngWind_.uniform();
    const double turbulenceWhite = rngTurbulence_.uniform();

    // Fan/bypass turbulence rises with fan speed; band follows the fundamental.
    fanWake_.bandpass(sampleRate_, clamp(2500.0 * n1 * 0.8, 80.0, 16000.0), 0.7);
    double fanNoise = fanWake_.process(fanWhite) * (0.10 + 0.55 * u) * (n1 > 1e-4 ? 1.0 : 0.0);

    if (caps_.bypassBand) {
      bypass_.bandpass(sampleRate_, clamp(900.0 + 1800.0 * u, 120.0, 16000.0), 0.5);
      fanNoise += bypass_.process(bypassWhite) * 0.28 * u;
    }

    // Jet mixing: amplitude t^1.5, low-pass 800 + 5200t. Thrust is a proxy.
    const double t = clamp01(in.thrustNorm);
    jet_.lowpass(sampleRate_, jetFrequency_.process(800.0 + 5200.0 * t), 0.6);
    double coreNoise = jet_.process(jetWhite) * 0.42 * std::pow(t, 1.5);

    // Combustor rumble, 40-400 Hz, only while fuel is actually burning.
    if (in.combustion > 1e-4 && in.fuelNorm > 1e-6) {
      combustor_.bandpass(sampleRate_, 90.0, 0.35);
      combustorShape_.lowpass(sampleRate_, 400.0, 0.7);
      const double rumble = combustorShape_.process(combustor_.process(combustorWhite));
      coreNoise += rumble * 0.55 * std::sqrt(clamp01(in.fuelNorm)) * clamp01(in.combustion);
    }

    // Airframe wind and configuration turbulence sit OUTSIDE the engine split:
    // they are not produced by either shaft, and they have their own gain.
    double airframe = 0.0;
    const double w = clamp01((in.kias / 250.0) * (in.kias / 250.0));
    if (w > 1e-5) {
      // A broadband roar whose top end opens with speed, not white hiss. The
      // first version (white noise above 250 Hz at 0.30) was reported by the
      // pilot as loud static in a 300 kt dive. These are still unverified values.
      wind_.highpass(sampleRate_, 120.0, 0.7);
      windShape_.lowpass(sampleRate_, 350.0 + 1650.0 * std::sqrt(w), 0.6);
      airframe += windShape_.process(wind_.process(windWhite)) * 0.12 * w;
      const double config = 0.3 * clamp01(in.gear) + 0.2 * clamp01(in.flap);
      if (config > 1e-5) {
        turbulence_.bandpass(sampleRate_, 190.0, 0.4);
        airframe += turbulence_.process(turbulenceWhite) * config * w * 0.5;
      }
    }
    if (airframeOut) *airframeOut = sanitize(airframe) * 0.9;

    // Bypass ratio 3.3 -> 0.77 weight on the fan/bypass side. sound.md is
    // explicit that this split is artistic, not an acoustic energy ratio.
    constexpr double kBypassWeight = 3.3 / (1.0 + 3.3);
    return sanitize(kBypassWeight * (fanTones + fanNoise)
                    + (1.0 - kBypassWeight) * (coreTones + coreNoise)) * 0.9;
  }

 private:
  double sampleRate_ = 48000.0;
  EngineCaps caps_;
  Rng rngFan_, rngBypass_, rngJet_, rngCombustor_, rngWind_, rngTurbulence_;
  Oscillator oscillators_[kMaxPartials];
  Biquad fanWake_, bypass_, jet_, combustor_, combustorShape_, wind_, windShape_, turbulence_;
  Smoother jetFrequency_;
};

/**
 * The existing slip-work tire cue, moved into the shared core. The parameter
 * curve is the one from createTireAudio.ts so the migration is audibly a move,
 * not a redesign: intensity = sqrt(W/15000) above a 2 W numerical floor.
 */
class TireVoice {
 public:
  void configure(double sampleRate, uint32_t seed) {
    sampleRate_ = sampleRate > 0.0 ? sampleRate : 48000.0;
    rng_.seed(seed);
    noiseGain_.configure(sampleRate_, 0.010);
    squealGain_.configure(sampleRate_, 0.010);
    filterHz_.configure(sampleRate_, 0.015);
    squealHz_.configure(sampleRate_, 0.015);
    reset();
  }
  void reset() {
    band_.reset();
    squeal_.reset(0.0);
    noiseGain_.reset(0.0);
    squealGain_.reset(0.0);
    filterHz_.reset(1100.0);
    squealHz_.reset(1450.0);
  }

  double process(double slipPowerWatts) {
    const double power = std::fmax(0.0, sanitize(slipPowerWatts));
    const double intensity = power <= 2.0 ? 0.0 : std::fmin(1.0, std::sqrt(power / 15000.0));
    const double gain = noiseGain_.process(0.075 * intensity);
    const double squealLevel = squealGain_.process(0.012 * intensity * intensity);
    band_.bandpass(sampleRate_, filterHz_.process(1100.0 + 900.0 * intensity), 0.8);
    const double noise = band_.process(rng_.uniform()) * gain;
    const double tone = squeal_.process(sampleRate_, squealHz_.process(1450.0 + 550.0 * intensity))
        * squealLevel;
    return sanitize(noise + tone);
  }

 private:
  double sampleRate_ = 48000.0;
  Rng rng_;
  Biquad band_;
  Oscillator squeal_;
  Smoother noiseGain_, squealGain_, filterHz_, squealHz_;
};

}  // namespace osfs_audio
