// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 the 0sfs authors.
//
// ABI shared with ../audioSnapshot.ts. The field order below IS the wire
// format; audioSnapshot.test.ts parses this file and fails when the two drift.
#pragma once

namespace osfs_audio {

constexpr int kSnapshotVersion = 1;

// AUDIO_SNAPSHOT_FIELDS
enum SnapshotSlot {
  kVersion = 0,
  kSequence,
  kEpoch,
  kSimTimeS,
  kAvailability,

  kN1Pct,
  kN2Pct,
  kThrustLbf,
  kFuelFlowPps,
  kThrottleNorm,
  kCombustion,
  kRunning,
  kStarter,
  kCutoff,

  kKias,
  kGearNorm,
  kFlapNorm,

  kSourceX, kSourceY, kSourceZ,
  kSourceVelX, kSourceVelY, kSourceVelZ,
  kListenerVelX, kListenerVelY, kListenerVelZ,
  kSoundSpeedMps,
  kExterior,
  kGroundReflectionM,

  kSnapshotSize,
};
// END AUDIO_SNAPSHOT_FIELDS

// AVAILABILITY
enum Availability {
  kAvailN1 = 1 << 0,
  kAvailN2 = 1 << 1,
  kAvailThrust = 1 << 2,
  kAvailFuelFlow = 1 << 3,
  kAvailCombustion = 1 << 4,
  kAvailRunning = 1 << 5,
  kAvailCommands = 1 << 6,
  kAvailAirspeed = 1 << 7,
  kAvailConfig = 1 << 8,
  kAvailPose = 1 << 9,
};
// END AVAILABILITY

// AUDIO_EVENT
enum EventType {
  kEventEpoch = 0,
  kEventStarterOn = 1,
  kEventStarterOff = 2,
  kEventLightOff = 3,
  kEventFlameout = 4,
  kEventRunningOn = 5,
  kEventRunningOff = 6,
  kEventResync = 7,
};
// END AUDIO_EVENT

constexpr int kEventSize = 4;
constexpr int kEventCapacity = 32;
constexpr int kBatchSnapshots = 8;
constexpr int kBatchHeader = 2;
constexpr int kBatchLength =
    kBatchHeader + kBatchSnapshots * kSnapshotSize + kEventCapacity * kEventSize;

// Tiers. Off allocates no voices; the core still exists so that enabling does
// not have to fetch or compile anything.
enum Tier {
  kTierOff = 0,
  kTierLow = 1,
  kTierMed = 2,
  kTierHigh = 3,
};

}  // namespace osfs_audio
