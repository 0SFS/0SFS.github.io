// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 the 0sfs authors.
#pragma once

#include <initializer_list>

#include "primitives.h"

namespace osfs_audio {

// ACOUSTIC_PROFILE_FIELDS
enum AcousticProfileSlot {
  kProfileIdleN1Pct = 0, kProfileIdleN1SpanPct, kProfileThrustReferenceLbf, kProfileFuelReferencePps,
  kProfileN1ReferenceHz, kProfileN2ReferenceHz, kProfileFanMix, kProfileFanToneGain, kProfileCoreToneGain,
  kProfileFanNoiseBaseGain, kProfileFanNoisePowerGain, kProfileBypassCenterHz, kProfileBypassPowerHz,
  kProfileBypassGain, kProfileJetBaseHz, kProfileJetPowerHz, kProfileJetGain,
  kProfileCombustorHz, kProfileCombustorHighHz, kProfileCombustorGain,
  kProfileOutputGain, kProfileAfterburnerJetGain, kProfileAfterburnerJetHz,
  kProfileSize,
};
// END ACOUSTIC_PROFILE_FIELDS

struct AcousticProfile {
  // Exact legacy FJ33 defaults, mirrored by FJ33_ACOUSTICS in TypeScript.
  double values[kProfileSize] = {
    24.3, 75.7, 1846.0, 0.25, 2500.0, 6000.0, 3.3 / (1.0 + 3.3),
    0.30, 0.30, 0.10, 0.55, 900.0, 1800.0, 0.28,
    800.0, 5200.0, 0.42, 90.0, 400.0, 0.55, 0.9, 0.0, 6000.0,
  };

  bool set(const double* input) {
    // Refuse the whole transaction; never apply a partially valid profile.
    for (int i = 0; i < kProfileSize; ++i) {
      if (!std::isfinite(input[i]) || input[i] < 0.0 || input[i] > 100000.0) return false;
    }
    if (input[kProfileIdleN1Pct] >= 100.0 || input[kProfileIdleN1SpanPct] <= 0.0
        || input[kProfileIdleN1SpanPct] > 100.0 || input[kProfileThrustReferenceLbf] < 1.0
        || input[kProfileFuelReferencePps] <= 0.0 || input[kProfileFanMix] > 1.0) return false;
    for (int i : {kProfileFanToneGain, kProfileCoreToneGain, kProfileFanNoiseBaseGain,
                  kProfileFanNoisePowerGain, kProfileBypassGain, kProfileJetGain,
                  kProfileCombustorGain, kProfileOutputGain, kProfileAfterburnerJetGain}) {
      if (input[i] > 16.0) return false;
    }
    for (int i = 0; i < kProfileSize; ++i) values[i] = input[i];
    return true;
  }

  double at(AcousticProfileSlot field) const { return values[field]; }
};

}  // namespace osfs_audio
