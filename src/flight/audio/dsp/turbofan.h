// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 the 0sfs authors.
//
// Shared procedural engine voice; FJ33 reference setup is the exact default.
//
// EVIDENCE STATUS: every frequency and gain below is the *initial synthetic
// reference* from sound.md §3, not an FJ33 measurement. `2500 x n1` is not a
// blade-pass frequency: real BPF is bladeCount * ratedN1RPM * n1 / 60 and both
// constants are unknown (TBD, FDM). No buzz-saw sawtooth is generated, because
// its onset for this installation is unverified.
#pragma once

#include "primitives.h"
#include "acoustic_profile.h"

namespace osfs_audio {

/** Interpolated, already-smoothed inputs for one sample. */
struct EngineInput {
  double n1 = 0.0;          // 0..1
  double n2 = 0.0;          // 0..1
  double thrustNorm = 0.0;  // native thrust / profile dry thrust (up to 2 with AB)
  double fuelNorm = 0.0;    // clamp01(native lbm/s / profile fuel reference)
  double augmentation = 0.0; // smoothed native active/inactive observer, never throttle
  double afterburnerVolume = 1.0; // independent, already-smoothed pilot gain
  double combustion = 0.0;  // 0..1, crossfaded at light-off/flameout
  double kias = 0.0;
  double gear = 0.0;
  double flap = 0.0;
  /** Cosine between downstream exhaust axis and source-to-listener direction.
   * Already smoothed, and zero when orientation is unavailable or in cockpit. */
  double downstreamCosine = 0.0;
  double directionWeight = 0.0;
};

/** Per-tier source counts. These are the caps sound.md §1 budgets. */
struct EngineCaps {
  int partials = 0;      // engine oscillators, excluding the tire squeal
  int noiseBands = 0;    // engine/airframe noise sources, excluding the tire
  bool bypassBand = false;
  bool highFidelity = false;
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
    rngFineMix_.seed(seed ^ 0x6d2b79f5u);
    rngShock_.seed(seed ^ 0xa24baed5u);
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
    fineMix_.reset();
    shock_.reset();
    shockLow_.reset();
    jetFrequency_.configure(sampleRate_, 0.020);
    jetFrequency_.reset(profile_.at(kProfileJetBaseHz));
  }

  void setCaps(const EngineCaps& caps) { caps_ = caps; }
  bool setProfile(const double* values) {
    if (!profile_.set(values)) return false;
    reset();
    return true;
  }
  double thrustReference() const { return profile_.at(kProfileThrustReferenceLbf); }
  double fuelReference() const { return profile_.at(kProfileFuelReferencePps); }
  double thrustCeiling() const { return profile_.at(kProfileAfterburnerJetGain) > 0.0 ? 2.0 : 1.0; }
  double highCockpitGain() const { return profile_.at(kProfileHighCockpitGain); }
  double highCockpitHz() const { return profile_.at(kProfileHighCockpitHz); }

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
    // The idle fan bed must not switch on at the first nonzero shaft sample.
    // Below idle, machinery grows linearly with speed while wake turbulence
    // grows quadratically, leaving a clean rising spool tone during motoring.
    // These are continuous synthesis envelopes, not a combustion RPM gate or
    // calibrated aeroacoustic exponents. At/above idle the old gains are exact.
    const double idleN1 = profile_.at(kProfileIdleN1Pct) / 100.0;
    const double fanRotation = idleN1 > 0.0 ? clamp01(n1 / idleN1) : n1;
    const double u = clamp01((n1 * 100.0 - profile_.at(kProfileIdleN1Pct))
                             / profile_.at(kProfileIdleN1SpanPct));

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
      if (shaft <= 0.0) continue;
      // Initial synthetic references, NOT measured blade-pass frequencies.
      const double reference = (p.shaft == 0 ? profile_.at(kProfileN1ReferenceHz)
                                            : profile_.at(kProfileN2ReferenceHz)) * shaft;
      const double frequency = reference * p.order;
      const double shaftGain = p.shaft == 0 ? (0.15 + 0.85 * u * u) * fanRotation : (n2 * n2);
      const double value =
          oscillators_[i].process(sampleRate_, frequency, cullScale) * p.gain * shaftGain;
      if (p.shaft == 0) fanTones += value; else coreTones += value;
    }
    // Normalising by the fundamental pair keeps the tonal bed at a comparable
    // level across tiers, so shedding partials changes timbre, not loudness.
    fanTones *= profile_.at(kProfileFanToneGain);
    coreTones *= profile_.at(kProfileCoreToneGain);

    // A continuous directional surrogate, not fitted FJ33/F135 directivity.
    // Missing axis telemetry and cockpit both take the neutral source mix.
    const double direction = caps_.highFidelity ? in.directionWeight : 0.0;
    const double mu = clamp(in.downstreamCosine, -1.0, 1.0);
    const double rearStrength = profile_.at(kProfileHighRearMixDirectivity) * direction;
    const double fanDirection = 1.0 - rearStrength * mu * 0.5;
    const double coreDirection = 1.0 + rearStrength * mu * 0.2;
    if (caps_.highFidelity) {
      fanTones *= fanDirection;
      coreTones *= coreDirection;
    }

    // Physically separate sources get separate noise. One shared white stream
    // makes the bands coherent, so adding a band (the burner, say) could cancel
    // another band's energy instead of adding to it. Every stream advances
    // every sample admitted by the pilot's noise budget. Reducing that budget
    // removes actual RNG/filter work, not just a reported statistic. The order
    // keeps fan and exhaust first, then combustion, wind/configuration, bypass
    // and the two High detail bands. Defaults preserve Low/Med's existing mix.
    const bool fanOn = caps_.noiseBands > 0;
    const bool jetOn = caps_.noiseBands > 1;
    const bool combustorOn = caps_.noiseBands > 2;
    const bool windOn = caps_.noiseBands > 3;
    const bool turbulenceOn = caps_.noiseBands > 4;
    const bool bypassOn = caps_.noiseBands > 5 && caps_.bypassBand;
    const bool fineOn = caps_.noiseBands > 6 && caps_.highFidelity;
    const bool shockOn = caps_.noiseBands > 7 && caps_.highFidelity
        && profile_.at(kProfileHighShockGain) > 0.0;
    const double fanWhite = fanOn ? rngFan_.uniform() : 0.0;
    const double bypassWhite = bypassOn ? rngBypass_.uniform() : 0.0;
    const double jetWhite = jetOn ? rngJet_.uniform() : 0.0;
    const double combustorWhite = combustorOn ? rngCombustor_.uniform() : 0.0;
    const double windWhite = windOn ? rngWind_.uniform() : 0.0;
    const double turbulenceWhite = turbulenceOn ? rngTurbulence_.uniform() : 0.0;

    // Fan/bypass turbulence rises with fan speed; band follows the fundamental.
    double fanNoise = 0.0;
    if (fanOn) {
      fanWake_.bandpass(sampleRate_, clamp(profile_.at(kProfileN1ReferenceHz) * n1 * 0.8, 80.0, 16000.0), 0.7);
      fanNoise = fanWake_.process(fanWhite)
          * (profile_.at(kProfileFanNoiseBaseGain) + profile_.at(kProfileFanNoisePowerGain) * u)
          * fanRotation * fanRotation;
    }

    if (bypassOn) {
      bypass_.bandpass(sampleRate_, clamp(profile_.at(kProfileBypassCenterHz)
          + profile_.at(kProfileBypassPowerHz) * u, 120.0, 16000.0), 0.5);
      fanNoise += bypass_.process(bypassWhite) * profile_.at(kProfileBypassGain) * u;
    }

    // Jet mixing: amplitude t^1.5, low-pass 800 + 5200t. Thrust is a proxy.
    const double t = clamp01(in.thrustNorm);
    const double jetPower = std::pow(t, 1.5);
    double jetHz = profile_.at(kProfileJetBaseHz) + profile_.at(kProfileJetPowerHz) * t;
    double jetGain = profile_.at(kProfileJetGain) * jetPower;
    // Augmentation morphs the SAME exhaust noise/filter. No extra voice, noise
    // source or oscillator is created. The engine's native boolean permits
    // this contribution; native above-dry thrust then supplies its headroom.
    // Keep the legacy zero-augmentation arithmetic path exact.
    const bool augmenting = in.augmentation > 0.0 && profile_.at(kProfileAfterburnerJetGain) > 0.0;
    if (augmenting) {
      const double a = clamp01(in.augmentation);
      jetHz += (profile_.at(kProfileAfterburnerJetHz) - jetHz) * a;
      const double addedGain = profile_.at(kProfileAfterburnerJetGain) * a
          * (1.0 + std::fmax(0.0, in.thrustNorm - 1.0));
      jetGain += addedGain * in.afterburnerVolume;
    }
    double coreNoise = 0.0;
    if (jetOn) {
      if (caps_.highFidelity) {
        // Separated large-scale mixing bed. Nonlinear waveform steepening is
        // intentionally deferred: a prototype failed receiver derivative-
        // skewness validation. Filtered noise is not a jet-crackle model.
        const double mixingHz = jetFrequency_.process(jetHz * 0.55);
        jet_.lowpass(sampleRate_, mixingHz, 0.6);
        const double mixing = jet_.process(jetWhite);
        coreNoise = mixing * jetGain * clamp01(in.combustion)
            * (1.0 + rearStrength * mu);
      } else {
        jet_.lowpass(sampleRate_, jetFrequency_.process(jetHz), 0.6);
        const double jetSample = jet_.process(jetWhite);
        coreNoise = augmenting ? jetSample * jetGain
            : jetSample * profile_.at(kProfileJetGain) * jetPower;
      }
    }
    if (fineOn) {
      const double a = clamp01(in.augmentation);
      const double hz = profile_.at(kProfileHighFineMixHz) * (0.55 + 0.45 * t) * (1.0 + 0.25 * a);
      fineMix_.bandpass(sampleRate_, hz, 0.6);
      coreNoise += fineMix_.process(rngFineMix_.uniform()) * profile_.at(kProfileHighFineMixGain)
          * jetPower * clamp01(in.combustion) * (1.0 + 0.5 * a * in.afterburnerVolume)
          * (1.0 + rearStrength * mu * 0.25);
    }
    if (shockOn) {
      // F135 data enable this component independently of augmentation. Native
      // thrust is only a power proxy: there is no invented NPR/Mach threshold.
      // FJ33 declares gain zero; no speculative shock source is created there.
      const double strength = profile_.at(kProfileHighShockDirectivity) * direction;
      const double hz = profile_.at(kProfileHighShockHz) * (0.65 + 0.35 * t)
          / (1.0 - 0.25 * mu * direction);
      // The laboratory BBSAN spectral model discussed by Vaughn et al. has
      // asymptotic power slopes f^4 / f^-2 (not fitted F135 levels or widths).
      // HP2 + LP1 reproduces those trends, unlike a lone biquad band-pass's
      // f^2 / f^-2. Corners/Q remain uncalibrated and this is not a fitted PSD.
      shock_.highpass(sampleRate_, hz * 0.65, 0.707);
      const double shockSample = shockLow_.process(shock_.process(rngShock_.uniform()), sampleRate_, hz);
      coreNoise += shockSample * profile_.at(kProfileHighShockGain)
          * t * t * clamp01(in.combustion)
          * (1.0 + 0.5 * clamp01(in.augmentation) * in.afterburnerVolume)
          * (1.0 - strength * mu * mu);
    }

    // Combustor rumble, 40-400 Hz, only while fuel is actually burning.
    if (combustorOn && in.combustion > 1e-4 && in.fuelNorm > 1e-6) {
      combustor_.bandpass(sampleRate_, profile_.at(kProfileCombustorHz), 0.35);
      combustorShape_.lowpass(sampleRate_, profile_.at(kProfileCombustorHighHz), 0.7);
      const double rumble = combustorShape_.process(combustor_.process(combustorWhite));
      coreNoise += rumble * profile_.at(kProfileCombustorGain)
          * std::sqrt(clamp01(in.fuelNorm)) * clamp01(in.combustion);
    }

    // Airframe wind and configuration turbulence sit OUTSIDE the engine split:
    // they are not produced by either shaft, and they have their own gain.
    double airframe = 0.0;
    const double w = clamp01((in.kias / 250.0) * (in.kias / 250.0));
    if (windOn && w > 1e-5) {
      // A broadband roar whose top end opens with speed, not white hiss. The
      // first version (white noise above 250 Hz at 0.30) was reported by the
      // pilot as loud static in a 300 kt dive. These are still unverified values.
      wind_.highpass(sampleRate_, 120.0, 0.7);
      windShape_.lowpass(sampleRate_, 350.0 + 1650.0 * std::sqrt(w), 0.6);
      airframe += windShape_.process(wind_.process(windWhite)) * 0.12 * w;
      const double config = 0.3 * clamp01(in.gear) + 0.2 * clamp01(in.flap);
      if (turbulenceOn && config > 1e-5) {
        turbulence_.bandpass(sampleRate_, 190.0, 0.4);
        airframe += turbulence_.process(turbulenceWhite) * config * w * 0.5;
      }
    }
    if (airframeOut) *airframeOut = sanitize(airframe) * 0.9;
    if (caps_.highFidelity) fanNoise *= fanDirection;

    // Bypass ratio 3.3 -> 0.77 weight on the fan/bypass side. sound.md is
    // explicit that this split is artistic, not an acoustic energy ratio.
    const double kBypassWeight = profile_.at(kProfileFanMix);
    return sanitize(kBypassWeight * (fanTones + fanNoise)
                    + (1.0 - kBypassWeight) * (coreTones + coreNoise)) * profile_.at(kProfileOutputGain);
  }

 private:
  double sampleRate_ = 48000.0;
  EngineCaps caps_;
  AcousticProfile profile_;
  Rng rngFan_, rngBypass_, rngJet_, rngCombustor_, rngWind_, rngTurbulence_, rngFineMix_, rngShock_;
  Oscillator oscillators_[kMaxPartials];
  Biquad fanWake_, bypass_, jet_, combustor_, combustorShape_, wind_, windShape_, turbulence_;
  Biquad fineMix_, shock_;
  OnePoleLowpass shockLow_;
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
