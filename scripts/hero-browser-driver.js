/* Injected into the real development application's flight closure by capture-hero.mjs.
 * No production bundle or on-disk simulator source is changed. */
const hero = window.__osfsHero = {
  tick: landingCaptureTick,
  status() {
    const state = readFlightState(jsbsim.sdk);
    return {
      ready: !worldLoading && !gearPipelineWarmup && !!aircraftModel?.getRig(),
      paused: inputManager.isPaused(),
      sky: (() => {
        const environment = runtime.sky.getEnvironment();
        return { mode: parameters.get('sky.time.mode'), date: parameters.get('sky.time.date'),
          utcHours: parameters.get('sky.time.utcHours'),
          renderedUtcMs: environment?.illumination.utcMs ?? null,
          sunElevationDegrees: environment?.illumination.sunElevationDeg ?? null };
      })(),
      cameraYawDegrees: Math.atan2(aircraft.thirdPersonCamera.position.x, -aircraft.thirdPersonCamera.position.z) * 180 / Math.PI,
      camera: this.readCamera(),
      externalTanks: readExternalFuelTanks(jsbsim.sdk, aircraftId).map(tank => ({ index: tank.index, attached: tank.attached, contentsLbs: jsbsim.sdk.getPropertyValue(`propulsion/tank[${tank.index}]/contents-lbs`) })),
      aircraftId,
      mode: runtime.status.mode,
      basemap: runtime.status.rasterBaseMap?.id ?? null,
      streaming: runtime.isStreamingTiles(),
      tiles: runtime.getTileMetrics(),
      fault: physicsLoop.getFault(),
      time: jsbsim.sdk.getPropertyValue('simulation/sim-time-sec'),
      afterburner: jsbsim.sdk.getPropertyValue('propulsion/engine[0]/augmentation'),
      n1: jsbsim.sdk.getPropertyValue('propulsion/engine[0]/n1'),
      n2: jsbsim.sdk.getPropertyValue('propulsion/engine[0]/n2'),
      state,
    };
  },
  prepare(config) {
    this.baseControls = inputManager.getControls();
    this.scriptedControls = { ...this.baseControls };
    this.config = config;
    if (!config.tuning) flightCompass?.destroy();
    if (!config.tuning) flightCompass = null;
    inputManager.setPaused(!!config.tuning);
    inputManager.setThrottle(config.timeline.throttleAtSeconds === 0 ? config.timeline.throttleAfter : config.timeline.throttleBefore);
    inputManager.setGearDown(false);
    inputManager.setStick(0, 0);
    aircraft.setViewMode('third');
    aircraft.setFieldOfView(config.camera.fieldOfViewDegrees);
    aircraft.zoomChaseCamera(config.camera.distanceMeters / aircraft.getChaseDistanceMeters());
    applyOrbitDelta(config.camera.orbitDegrees * Math.PI / 180 - Math.atan2(aircraft.thirdPersonCamera.position.x, -aircraft.thirdPersonCamera.position.z), 0);
    orbitStateYaw = config.camera.orbitDegrees * Math.PI / 180;
    landingCaptureTick(0); // Consume the normal pause/resume boundary without losing a capture step.
    runtime.requestRender();
    // Capture owns the camera until the editor explicitly changes it. Never auto-recenter a take.
    setOrbitInputActive("hero", true);
    this.startTime = this.status().time;
    this.applyCamera(heroCamera.cameraAt(config.camera, 0, config.timeline.durationSeconds));
    if (config.tuning) this.initTuner();
    return this.status();
  },
  readCamera() {
    return { yawDegrees: orbitStateYaw * 180 / Math.PI, pitchDegrees: orbitStatePitch * 180 / Math.PI,
      distanceMeters: aircraft.getChaseDistanceMeters(), fieldOfViewDegrees: aircraft.thirdPersonCamera.fov * 180 / Math.PI };
  },
  applyCamera(camera) {
    aircraft.setViewMode('third');
    applyOrbitDelta(camera.yawDegrees * Math.PI / 180 - orbitStateYaw, camera.pitchDegrees * Math.PI / 180 - orbitStatePitch);
    aircraft.zoomChaseCamera(camera.distanceMeters / aircraft.getChaseDistanceMeters());
    aircraft.setFieldOfView(camera.fieldOfViewDegrees);
    runtime.requestRender();
  },
  skyTime() { return {date: parameters.get("sky.time.date"), hours: parameters.get("sky.time.utcHours")}; },
  setTime(iso) {
    const date = new Date(iso);
    parameters.set("sky.time.mode", "fixed");
    parameters.set("sky.time.date", date.toISOString().slice(0, 10));
    parameters.set("sky.time.utcHours", date.getUTCHours() + date.getUTCMinutes()/60 + date.getUTCSeconds()/3600);
    runtime.requestRender();
  },
  frame(index) {
    const config = this.config;
    const t = index / config.timeline.fps;
    const state = readFlightState(jsbsim.sdk);
    const radians = Math.PI / 180;
    const u = Math.min(1, t / config.timeline.pitchRampSeconds);
    const smooth = u * u * (3 - 2 * u);
    const target = (config.timeline.initialPitchDegrees + smooth * (config.timeline.climbPitchDegrees - config.timeline.initialPitchDegrees)) * radians;
    const clamp = (x, limit) => Math.max(-limit, Math.min(limit, x));
    const headingError = Math.atan2(Math.sin(config.scene.headingDegrees * radians - state.headingRad), Math.cos(config.scene.headingDegrees * radians - state.headingRad));
    const targetRoll = clamp(headingError * 1.5, 5 * radians);
    const roll = clamp((targetRoll - state.rollRad) * 1.2 - jsbsim.sdk.getPropertyValue('velocities/p-rad_sec') * .25, .25);
    const targetRate = u < 1 ? 6 * u * (1-u) * (config.timeline.climbPitchDegrees - config.timeline.initialPitchDegrees) * radians / config.timeline.pitchRampSeconds : 0;
    const pitch = clamp((state.pitchRad - target) * 6 + (jsbsim.sdk.getPropertyValue('velocities/q-rad_sec') - targetRate) * .8, .8);
    if (!this.recordingCamera) this.applyCamera(heroCamera.cameraAt(config.camera, t, config.timeline.durationSeconds));
    inputManager.setStick(roll, pitch);
    inputManager.setRudder(0);
    inputManager.setThrottle(t >= config.timeline.throttleAtSeconds ? config.timeline.throttleAfter : config.timeline.throttleBefore);
    inputManager.setGearDown(false);
    this.scriptedControls = { ...this.baseControls, aileron: roll, elevator: pitch, rudder: 0,
      throttle: t >= config.timeline.throttleAtSeconds ? config.timeline.throttleAfter : config.timeline.throttleBefore };
    this.stepping = true;
    skipResumeDelta = false;
    try { landingCaptureTick(index > 0 ? 1 / config.timeline.fps : 0); }
    finally { this.stepping = false; }
    runtime.requestRender();
    return { frame: index, timestamp: t, ...this.status() };
  },
};
// The editor flies only the camera. Keyboard, gamepad and HUD flight controls cannot change a take.
const heroPoll = inputManager.poll.bind(inputManager);
inputManager.poll = dt => hero.config ? { ...hero.scriptedControls } : heroPoll(dt);
const heroPaused = inputManager.isPaused.bind(inputManager);
inputManager.isPaused = () => hero.config?.tuning ? !hero.stepping : heroPaused();
// World streaming and sky workers keep rendering, but wall-clock frames cannot
// advance flight physics. Only frame(index) advances the real fixed-step loop.
runtime.setSimTick(() => {
  landingCaptureTick(0);
  // Terrain preparation may use an overhead camera to select tiles. Keep the
  // editor's visible view on the frozen aircraft while those tiles are prepared.
  if (hero.preparingStart) aircraft.setViewMode('third');
});
