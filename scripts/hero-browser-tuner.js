/* Injected beside the driver, inside the real flight closure. UI exists only in --tune. */
Object.assign(hero, {
  async waitForPreview() {
    // Wait for actual scene frames; hidden/stowed meshes need not have compiled materials.
    for (let frame = 0; frame < 3; frame++) await new Promise((resolve, reject) => {
      const observer = runtime.scene.onAfterRenderObservable.addOnce(() => { clearTimeout(timer); resolve(); });
      const timer = setTimeout(() => { runtime.scene.onAfterRenderObservable.remove(observer); reject(new Error('Preview did not draw. Bring the editor window to the foreground and retry.')); }, 5000);
      runtime.requestRender();
    });
  },
  inspectPreview() {
    const camera = runtime.scene.activeCamera;
    return { worldLoading, disposed, view: runtime.getViewState(), camera: { name: camera?.name, position: camera?.position?.asArray(),
      global: camera?.globalPosition?.asArray(), fov: camera?.fov, minZ: camera?.minZ, maxZ: camera?.maxZ, parent: camera?.parent?.name,
      enabled: camera?.isEnabled(), layerMask: camera?.layerMask, viewport: camera?.viewport },
      rootEnabled: floatingOrigin?.aircraftRoot.isEnabled(), meshEnabled: aircraftModel?.getRig()?.root?.isEnabled?.(),
      canvas: { width: canvas.width, height: canvas.height, visibility: getComputedStyle(canvas).visibility, display: getComputedStyle(canvas).display },
      engineDisposed: runtime.scene.isDisposed, activeMeshes: runtime.scene.getActiveMeshes().length, sceneReady: runtime.scene.isReady() };
  },
  initTuner() {
    this.frameIndex = 0;
    this.playing = false;
    this.recordingCamera = false;
    this.busy = false;
    this.startFlight = captureSavedFlight(jsbsim.sdk, aircraftId, true);
    this.startClock = this.status().time;
    this.startSpools = { n1: this.status().n1, n2: this.status().n2 };
    if (!this.startFlight) throw new Error('Cannot capture the starting flight state.');
    this.startGround = { groundHeightMeters: this.startFlight.simulation.initial['ic/terrain-elevation-ft'] * .3048,
      altitudeMeters: this.startFlight.altMeters };
    this.startTemplate = structuredClone(this.startFlight);
    this.preparedStartKey = heroStart.startGroundKey(this.config.scene);
    this.preparedStartGround = this.startGround;
    this.startRevision = 0;
    stopWatching.push(() => this.cancelStart?.());
    this.tabElement = document.createElement('div');
    this.tabElement.className = 'hero-tuner';
    this.mountTab = host => { if (host) host.append(this.tabElement); };
    this.buildTab();
    this.frame(0);
    this.updateTab();
    controlPanel.openOrSelectTab('hero-video');
    this.openTestFeedback = () => controlPanel.openOrSelectTab('test-feedback');
    const animate = now => {
      if (disposed) return;
      if (this.playing && !document.hidden && !this.busy) {
        if (!this.lastPlayAt) this.lastPlayAt = now;
        // Slow rendering slows the preview, never skips flight/camera samples.
        if (now - this.lastPlayAt >= 1000 / this.config.timeline.fps) {
          this.lastPlayAt = now;
          const last = Math.round(this.config.timeline.durationSeconds * this.config.timeline.fps) - 1;
          if (this.frameIndex < last) {
            this.frame(++this.frameIndex);
            if (this.recordingCamera) this.storeCameraPoint();
          } else this.pausePreview();
          this.updateTab();
        }
      } else this.lastPlayAt = 0;
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
    // Reuse the app's mouse/trackpad/touch gestures; changes while paused create a keyframe.
    const cameraChanged = () => {
      if (this.config.camera.mode !== 'manual' || this.busy) return;
      if (!this.playing || this.recordingCamera) this.storeCameraPoint();
      this.updateTab();
    };
    for (const event of ['pointermove', 'pointerup', 'wheel', 'touchmove', 'touchend', 'gesturechange', 'gestureend']) {
      const target = window;
      target.addEventListener(event, cameraChanged);
      stopWatching.push(() => target.removeEventListener(event, cameraChanged));
    }
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pausePreview(); });
  },
  pausePreview() {
    this.playing = false;
    this.recordingCamera = false;
    this.lastPlayAt = 0;
    this.updateTab();
  },
  resetPreview() {
    // Restore the same dry engine, fuel, velocities, attitude and clock, then replay scripted inputs.
    restoreSavedFlight(jsbsim.sdk, this.startFlight, aircraftId, this.startGround);
    // The stock turbine exposes writable spools separately from the shared saved-flight record.
    for (const [name, value] of Object.entries(this.startSpools)) jsbsim.sdk.setPropertyValue(`propulsion/engine[0]/${name}`, value);
    jsbsim.sdk.setSimTime(this.startClock);
    inputManager.adoptControls(this.baseControls);
    inputManager.setGearDown(false);
    physicsLoop.reset();
    terrainContact.reset();
    visibleMeshCollision.reset();
    resetWheelSpin('reset');
    engineVisuals.resetSmoke();
    skipResumeDelta = false;
    this.frameIndex = 0;
    this.frame(0);
  },
  async seekPreview(index) {
    if ((this.busy && !this.seeking) || this.preparingStart || this.startError || this.invalidStart) return;
    this.pendingSeek = Math.min(Math.round(this.config.timeline.durationSeconds * this.config.timeline.fps) - 1, Math.max(0, Math.round(index)));
    this.pausePreview();
    if (this.seeking) return;
    this.seeking = true;
    this.busy = true;
    runtime.beginContinuous();
    this.updateTab();
    try {
      do {
        while (this.pendingSeek !== null) {
          const end = this.pendingSeek;
          this.pendingSeek = null;
          if (end < this.frameIndex) this.resetPreview();
          while (this.frameIndex < end && this.pendingSeek === null) {
            this.frame(++this.frameIndex);
            if (this.status().fault) throw new Error(this.status().fault);
            // Coalesce slider drags to the latest requested frame without blocking input.
            if (this.frameIndex % 15 === 0) await new Promise(resolve => setTimeout(resolve, 0));
          }
          if (this.pendingSeek === null) this.applyCamera(heroCamera.cameraAt(this.config.camera, end / this.config.timeline.fps, this.config.timeline.durationSeconds));
        }
        await this.waitForPreview();
      } while (this.pendingSeek !== null);
    } finally { runtime.endContinuous(); this.seeking = false; this.busy = false; this.updateTab(); }
  },
  storeCameraPoint() {
    this.config.camera.keyframes = heroCamera.putCameraPoint(this.config.camera.keyframes ?? [], {
      timeSeconds: this.frameIndex / this.config.timeline.fps, ...this.readCamera(),
    });
  },
  async recordCamera() {
    if (this.busy || this.preparingStart || this.startError || this.invalidStart) return;
    const camera = this.readCamera();
    await this.seekPreview(0);
    this.config.camera.mode = 'manual';
    this.config.camera.keyframes = [];
    this.applyCamera(camera);
    this.storeCameraPoint();
    this.recordingCamera = true;
    this.playing = true;
    this.updateTab();
  },
  exportScenario() {
    const result = structuredClone(this.config);
    delete result.tuning;
    const sky = this.skyTime();
    const dateTime = new Date(Date.parse(sky.date + 'T00:00:00Z') + sky.hours * 3600000).toISOString();
    if (dateTime !== result.scene.dateTime) delete result.scene.solarTime;
    result.scene.dateTime = dateTime;
    return result;
  },
  showStart(scene, ground) {
    const camera = this.frameIndex === 0 ? this.readCamera() : null;
    Object.assign(this.config.scene, scene);
    delete this.config.scene.solarTime;
    this.startGround = ground;
    this.startFlight = heroStart.flightAtStart(this.startTemplate, this.config.scene, ground);
    this.resetPreview();
    if (camera) this.applyCamera(camera);
  },
  applyStart(scene) {
    this.cancelStart?.();
    this.cancelStart = null;
    const revision = ++this.startRevision;
    const key = heroStart.startGroundKey(scene);
    this.preparingStart = key !== this.preparedStartKey;
    this.startError = null;
    this.pausePreview();
    // Editing a start always wins over an in-flight scrub request.
    this.pendingSeek = this.seeking ? 0 : null;
    this.invalidStart = false;
    const sample = runtime.surface.sample(scene.latitude, scene.longitude);
    const groundHeightMeters = key === this.preparedStartKey ? this.preparedStartGround.groundHeightMeters
      : sample?.heightMeters ?? this.startGround.groundHeightMeters;
    const ground = key === this.preparedStartKey ? this.preparedStartGround
      : { groundHeightMeters, altitudeMeters: groundHeightMeters + scene.heightAboveGroundMeters };
    // This is synchronous: each valid input visibly moves the aircraft at t=0.
    this.showStart(scene, ground);
    this.message.textContent = this.preparingStart ? 'Start at 0.00 s · Preparing terrain…' : 'Start at 0.00 s';
    this.updateTab();
    if (!this.preparingStart) return this.startReady = Promise.resolve(true);
    const abort = new AbortController();
    return this.startReady = new Promise(resolve => {
      // Only terrain work is debounced. Pose editing and camera movement remain live.
      const timer = setTimeout(async () => {
        runtime.beginContinuous();
        try {
          const prepared = await prepareFlightTerrain(runtime, {
            latDeg: scene.latitude, lonDeg: scene.longitude,
            altitudeAboveGroundMeters: scene.heightAboveGroundMeters,
            clearanceMeters: scene.heightAboveGroundMeters, radiusMeters: 1000, signal: abort.signal,
          }, parameters.get('osfs.flight.allowCoarserThisSession'));
          if (abort.signal.aborted || revision !== this.startRevision || disposed) return;
          this.showStart(scene, prepared);
          this.preparedStartKey = key;
          this.preparedStartGround = prepared;
          await this.waitForPreview();
          if (abort.signal.aborted || revision !== this.startRevision || disposed) return;
          this.preparingStart = false;
          aircraft.setViewMode('third');
          this.message.textContent = 'Start at 0.00 s';
          this.updateTab();
          resolve(true);
        } catch (error) {
          if (!abort.signal.aborted && revision === this.startRevision && !disposed) {
            this.preparingStart = false;
            this.startError = error.message;
            this.message.textContent = error.message;
            this.updateTab();
          }
          resolve(false);
        } finally { runtime.endContinuous(); }
      }, 160);
      this.cancelStart = () => { clearTimeout(timer); abort.abort(); resolve(false); };
    });
  },
  buildTab() {
    if (!document.querySelector('#hero-tuner-style')) {
      const style = document.createElement('style'); style.id = 'hero-tuner-style';
      style.textContent = `.hero-tuner{padding:6px;font-size:13px}.hero-tuner fieldset{display:flex;flex-wrap:wrap;align-items:center;gap:6px;border:1px solid #ffffff26;border-radius:9px;padding:8px;margin:0 0 6px;min-width:0}.hero-tuner legend{padding:0 4px}.hero-tuner label{display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap}.hero-tuner input[type=number]{width:8.5ch;min-width:0}.hero-tuner input[data-start=latitude],.hero-tuner input[data-start=longitude]{width:11ch}.hero-tuner input,.hero-tuner button{font:inherit;color:inherit;accent-color:#efb45d}.hero-tuner input[type=number]{background:#ffffff0b;border:1px solid #ffffff35;border-radius:5px;padding:5px}.hero-tuner button{border:1px solid #ffffff35;border-radius:7px;background:#ffffff0c;padding:6px 9px;cursor:pointer}.hero-tuner button:disabled{opacity:.5;cursor:wait}.hero-tuner .hero-slider{width:100%}.hero-tuner .hero-slider input{flex:1;min-width:60px}.hero-tuner output{font-variant-numeric:tabular-nums}.hero-tuner .hero-message{margin:6px 0;overflow-wrap:anywhere}.hero-tuner :focus-visible{outline:2px solid #efb45d;outline-offset:2px}`;
      document.head.append(style);
    }
    this.tabElement.innerHTML = `<fieldset><legend>Preview</legend><button type="button" data-play aria-label="Play preview">▶</button><button type="button" data-restart aria-label="Restart preview">↤</button><output data-clock></output><label class="hero-slider">Position <input data-position type="range" min="0" step="1" value="0" aria-label="Preview position" /></label><label class="hero-slider">Duration <input data-duration type="range" min="${Math.max(3 * this.config.timeline.fps + 1, Math.ceil(this.config.timeline.pitchRampSeconds * this.config.timeline.fps))}" max="${15 * this.config.timeline.fps}" step="1" aria-label="Scene duration" /><output data-duration-label></output></label></fieldset><fieldset><legend>Camera</legend><span data-mode-host></span><button type="button" data-record>● Record camera</button><output data-take></output></fieldset><fieldset><legend>Start</legend><label>Latitude <input type="number" data-start="latitude" min="-85" max="85" step="0.000001" required /></label><label>Longitude <input type="number" data-start="longitude" min="-180" max="180" step="0.000001" required /></label><label>Height <input type="number" data-start="heightAboveGroundMeters" min="100" max="10000" step="0.1" required />m AGL</label><label>Heading <input type="number" data-start="headingDegrees" min="0" max="360" step="0.1" required />°</label></fieldset><fieldset><legend>Scenario</legend><button type="button" data-save>Save scenario</button><button type="button" data-time>Lighting…</button><span data-help></span></fieldset><p class="hero-message" role="status" aria-live="polite"></p>`;
    const query = selector => this.tabElement.querySelector(selector);
    this.message = query('.hero-message');
    this.message.textContent = 'Paused. Aircraft inputs stay scripted.';
    const guarded = action => async event => {
      try { await action(event); } catch (error) { this.message.textContent = error.message; }
    };
    query('[data-play]').onclick = guarded(async () => {
      if (this.playing) this.pausePreview();
      else {
        if (this.frameIndex >= Math.round(this.config.timeline.durationSeconds * this.config.timeline.fps) - 1) await this.seekPreview(0);
        this.playing = true; this.updateTab();
      }
    });
    query('[data-restart]').onclick = guarded(() => this.seekPreview(0));
    query('[data-position]').oninput = guarded(event => this.seekPreview(Number(event.target.value)));
    query('[data-duration]').oninput = guarded(async event => {
      const frames = Number(event.target.value);
      this.pausePreview();
      this.config.timeline.durationSeconds = frames / this.config.timeline.fps;
      this.config.camera.keyframes = this.config.camera.keyframes?.filter(point => point.timeSeconds <= this.config.timeline.durationSeconds);
      await this.seekPreview(Math.min(this.frameIndex, frames - 1));
      this.updateTab();
    });
    const choices = ui.publicUi.createChoiceGroup('hero-camera-mode', 'Camera movement', [
      { id: 'scripted', label: 'Scripted' }, { id: 'manual', label: 'Manual' },
    ], document, { hideHeading: true });
    query('[data-mode-host]').replaceWith(choices);
    for (const input of choices.querySelectorAll('input')) {
      input.dataset.mode = input.value;
      input.onchange = () => {
        this.pausePreview(); this.config.camera.mode = input.value;
        if (input.value === 'manual' && !this.config.camera.keyframes?.length) this.storeCameraPoint();
        this.applyCamera(heroCamera.cameraAt(this.config.camera, this.frameIndex / this.config.timeline.fps, this.config.timeline.durationSeconds));
        this.updateTab();
      };
    }
    query('[data-record]').onclick = guarded(() => this.recordCamera());
    const editStart = () => {
      const scene = {};
      for (const input of this.tabElement.querySelectorAll('[data-start]')) {
        if (!input.checkValidity()) {
          this.pausePreview();
          this.cancelStart?.();
          this.preparingStart = false;
          this.invalidStart = true;
          this.pendingSeek = this.seeking ? 0 : null;
          if (this.frameIndex !== 0) this.resetPreview();
          this.message.textContent = 'Enter valid starting coordinates, height and heading.';
          this.updateTab();
          return;
        }
        scene[input.dataset.start] = input.valueAsNumber;
      }
      this.applyStart(scene);
    };
    for (const input of this.tabElement.querySelectorAll('[data-start]')) input.oninput = guarded(editStart);
    query('[data-save]').onclick = () => {
      this.pausePreview(); this.message.textContent = 'Saving…';
      window.osfsHeroSave(JSON.stringify(this.exportScenario()));
    };
    query('[data-time]').onclick = () => controlPanel.openOrSelectTab('time');
    const content = document.createElement('p');
    content.textContent = 'Right-drag in Mouse mode to orbit; scroll to zoom. In Trackpad mode, two-finger scroll orbits and pinch zooms. Touch: drag and pinch. Manual lets you frame the paused scene; Record camera restarts the scripted flight and records your gestures. Play replays the saved path. Scrub to adjust a camera keyframe. Save scenario writes the source JSON for the next capture. Duration changes trim the camera path. Start fields move the aircraft live and pause at 0 s. Terrain refreshes in the background; Play waits until it is ready. Height is above prepared terrain. Lighting opens the existing date/time tab.';
    const help = ui.publicUi.createHelpTooltip({ label: 'Video editor help', content });
    query('[data-help]').append(help.element);
    stopWatching.push(() => help.destroy());
    for (const input of this.tabElement.querySelectorAll('[data-start]')) input.value = this.config.scene[input.dataset.start];
  },
  updateTab() {
    if (!this.tabElement) return;
    const query = selector => this.tabElement.querySelector(selector);
    const frames = Math.round(this.config.timeline.durationSeconds * this.config.timeline.fps);
    const seconds = this.frameIndex / this.config.timeline.fps;
    query('[data-position]').max = frames - 1;
    query('[data-position]').value = this.frameIndex;
    query('[data-position]').setAttribute('aria-valuetext', `${seconds.toFixed(2)} seconds`);
    query('[data-duration]').value = frames;
    query('[data-duration-label]').textContent = this.config.timeline.durationSeconds.toFixed(2) + ' s';
    query('[data-clock]').textContent = `${seconds.toFixed(2)} / ${this.config.timeline.durationSeconds.toFixed(2)} s`;
    query('[data-play]').textContent = this.playing ? 'Ⅱ' : '▶';
    query('[data-play]').setAttribute('aria-label', this.playing ? 'Pause preview' : 'Play preview');
    query('[data-take]').textContent = this.recordingCamera ? 'Recording' : `${this.config.camera.keyframes?.length ?? 0} camera points`;
    ui.publicUi.checkChoice(this.tabElement, 'hero-camera-mode', this.config.camera.mode ?? 'scripted');
    const blocked = this.preparingStart || this.startError || this.invalidStart;
    for (const control of this.tabElement.querySelectorAll('input, button')) control.disabled = this.busy;
    for (const input of this.tabElement.querySelectorAll('[data-start]')) input.disabled = false;
    for (const control of this.tabElement.querySelectorAll('[data-play], [data-restart], [data-position], [data-duration]')) control.disabled = (this.busy && !this.seeking) || !!blocked;
    query('[data-save]').disabled = this.busy || this.invalidStart;
    query('[data-record]').disabled = this.busy || !!blocked || this.config.camera.mode !== 'manual';
  },
});
