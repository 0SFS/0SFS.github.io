import type { JSBSimSdk } from '@felipegalind0/jsbsim';
import type { SurfaceHit } from 'foss-earth/runtime';
import { createTerrainContact } from '../physics/terrainContact';
import { createFixedStepPhysicsLoop, FIXED_DT } from '../physics/fixedStepLoop';
import { getFdmProfile } from '../jsbsim/fdmProfiles';
import { createJsbsimAudioAdapter } from '../audio/jsbsimAudioAdapter';
import { deriveEnginePhase, discoverReadableProperties, readEngineSample } from '../hud/engineMonitorModel';
import { Sf50LandingPilot } from './sf50LandingPilot';
import { Sf50PitchController } from './sf50PilotController';
import { SF50_DEFAULT_PILOT_PROFILE } from './sf50PilotProfiles';

export type RolloutSurface = 'flat' | 'rough' | 'refinement';

/** Diagnostic controls and synthetic terrain; not an aircraft performance validation. */
export function runSf50Rollout(sdk: JSBSimSdk, surfaceMode: RolloutSurface) {
  const get = (path: string) => sdk.getPropertyValue(path);
  const set = (values: Record<string, number>) => {
    for (const [path, value] of Object.entries(values)) sdk.setPropertyValue(path, value);
  };
  sdk.setDt(FIXED_DT);
  set({ 'ic/lat-geod-deg': 34, 'ic/long-gc-deg': -118, 'ic/h-sl-ft': 50,
    'ic/terrain-elevation-ft': 0, 'ic/psi-true-deg': 0, 'ic/theta-deg': 3,
    'ic/vc-kts': 100, 'ic/gamma-deg': -3,
    'gear/gear-cmd-norm': 1, 'gear/gear-pos-norm': 1,
    'fcs/flap-cmd-norm': 1, 'fcs/flap-pos-norm': 1 });
  if (!sdk.runIc()) throw new Error('Short-final initialization failed');
  set({ 'propulsion/set-running': -1, 'fcs/throttle-cmd-norm': 0 });
  if (!sdk.runIc()) throw new Error('Running engine initialization failed');

  const available = new Set(discoverReadableProperties(sdk));
  const profile = getFdmProfile('cirrus-vision-jet-g2');
  const audio = createJsbsimAudioAdapter(sdk, { gearHeightMetres: profile.stance.staticMeters });
  let height = 0, revision = 0, step = 0, resetCount = 0, runIcCount = 0;
  let touchdownStep: number | null = null;
  let stoppedStep: number | null = null;
  const runIc = sdk.runIc.bind(sdk);
  sdk.runIc = () => { runIcCount++; return runIc(); };
  const surface = { raycast: () => null,
    sample: () => ({ heightMeters: height, revision, quality: 15 } as SurfaceHit) };
  const terrain = createTerrainContact(sdk, surface, profile.stance);
  const loop = createFixedStepPhysicsLoop(sdk);
  const pilot = new Sf50LandingPilot(SF50_DEFAULT_PILOT_PROFILE.landing);
  const pitch = new Sf50PitchController(SF50_DEFAULT_PILOT_PROFILE.landingPitch);
  const read = (stage: string) => {
    const engine = readEngineSample(sdk, available);
    return {
      step, elapsedSec: step * FIXED_DT, stage, simTimeSec: get('simulation/sim-time-sec'),
      dtSec: sdk.getDeltaT(), terrainHeightMeters: height,
      adoptedTerrainMeters: get('position/terrain-elevation-asl-ft') * 0.3048,
      revision, resetCount, runIcCount,
      n1: engine.n1Pct, n2: engine.n2Pct, fuelFlowPps: engine.fuelFlowPps,
      running: engine.running, cutoff: engine.cutoff, starter: engine.starter,
      // Starved and internal phase are not bound in fork.7. A missing read is not false.
      starved: null, stalled: engine.stalled, seized: engine.seized,
      monitorPhase: deriveEnginePhase(engine).phase, combustion: audio.read().combustion,
      thrustLbs: engine.thrustLbf, qbarPsf: engine.qbarPsf, kcas: engine.kcas,
      groundSpeedFps: get('velocities/vg-fps'), fuelLbs: get('propulsion/tank[0]/contents-lbs'),
      altitudeFt: get('position/h-sl-ft'), pitchDeg: get('attitude/theta-deg'),
      gear: [0, 1, 2].map(index => ({ index,
        compressionFt: get(`gear/unit[${index}]/compression-ft`),
        wow: get(`gear/unit[${index}]/WOW`) > 0.5 })),
    };
  };
  const frames = [read('initial')];
  try {
    for (step = 1; step <= 120 * 90; step++) {
      const bothMains = [1, 2].every(index => get(`gear/unit[${index}]/WOW`) > 0.5);
      if (bothMains) touchdownStep ??= step;
      const rolloutSteps = touchdownStep === null ? 0 : step - touchdownStep;
      if (rolloutSteps > 0) {
        if (surfaceMode === 'rough') {
          // A stationary runway profile: bumps stop moving when the aircraft
          // does, unlike a time-driven platform that can keep adding energy.
          const distanceNorthMeters = (get('position/lat-geod-deg') - 34) * 111_320;
          height = 0.006 * Math.sin(distanceNorthMeters * 2 * Math.PI / 6)
            + 0.002 * Math.sin(distanceNorthMeters * 2 * Math.PI / 1.5);
        }
        if (surfaceMode === 'refinement' && rolloutSteps % 240 === 0) {
          height += revision % 2 === 0 ? 0.1 : -0.1;
          revision++;
        }
      }
      const command = pilot.step({ simTimeSec: step * FIXED_DT,
        pitchDeg: get('attitude/theta-deg'), flightPathAngleDeg: get('flight-path/gamma-deg'),
        northVelocityFps: get('velocities/v-north-fps'), eastVelocityFps: get('velocities/v-east-fps'),
        groundSpeedFps: get('velocities/vg-fps'), downVelocityFps: get('velocities/v-down-fps'),
        calibratedAirspeedKts: get('velocities/vc-kts'), weightOnWheels: bothMains,
      }, Math.max(0, get('position/h-agl-ft') - profile.stance.staticMeters / 0.3048),
      bothMains, touchdownStep !== null, FIXED_DT);
      const elevator = pitch.step(command.targetPitchDeg, get('attitude/theta-deg'),
        get('velocities/q-rad_sec'), FIXED_DT).elevatorNorm;
      const updateTerrain = () => {
        const result = terrain.update();
        if (result === 'reset') { resetCount++; frames.push(read('terrain-reset')); }
        return result;
      };
      // The app samples once before rendering and again before each physics step.
      updateTerrain();
      loop.update(FIXED_DT, () => {
        const result = updateTerrain();
        set({ 'fcs/elevator-cmd-norm': elevator,
          'fcs/throttle-cmd-norm': 0, 'fcs/left-brake-cmd-norm': command.brakeNorm,
          'fcs/right-brake-cmd-norm': command.brakeNorm });
        return result;
      });
      frames.push(read('step'));
      if (loop.getFault()) break;
      if (touchdownStep !== null && get('velocities/vg-fps') < 1) stoppedStep ??= step;
      if (stoppedStep !== null && step >= stoppedStep + 120 * 5) break;
    }
    const outages = frames.filter(row => row.running !== true || row.combustion !== true ||
      row.fuelFlowPps === null || row.fuelFlowPps <= 1e-4);
    const simTimeRewinds = frames.slice(1).filter((row, index) =>
      row.simTimeSec < frames[index].simTimeSec - 1e-9).length;
    return { surfaceMode, frames, summary: {
      touchdownStep, stoppedStep, steps: step, resetCount, runIcCount, fault: loop.getFault(),
      initialFuelLbs: frames[0].fuelLbs, finalFuelLbs: frames.at(-1)!.fuelLbs,
      minimumGroundSpeedFps: Math.min(...frames.map(row => row.groundSpeedFps)),
      minimumQbarPsf: Math.min(...frames.map(row => row.qbarPsf ?? Infinity)),
      maximumQbarPsf: Math.max(...frames.map(row => row.qbarPsf ?? -Infinity)),
      maximumGearCompressionFt: Math.max(...frames.flatMap(row => row.gear.map(gear => gear.compressionFt))),
      outageFrames: outages.length, firstOutage: outages[0] ?? null, simTimeRewinds,
      starvedAvailable: false,
    } };
  } finally {
    sdk.runIc = runIc;
    audio.dispose();
  }
}
