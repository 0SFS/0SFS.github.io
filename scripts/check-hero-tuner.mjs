#!/usr/bin/env node
/** One short real-simulator check of the editor; all mutations use an ignored scenario copy. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function checkTuner({ run, chrome, sessionId, output, scenarioPath, errors }) {
  const report = {};
  const state = () => run('window.__osfsHero.status()');
  const seek = index => run(`window.__osfsHero.seekPreview(${index})`);
  const click = selector => run(`document.querySelector(${JSON.stringify('.hero-tuner ' + selector)}).click()`);
  const until = async expression => {
    const deadline = Date.now() + 10000;
    while (!await run(expression)) {
      if (Date.now() > deadline) throw new Error('Editor condition timed out: ' + expression + ' ' + JSON.stringify(await run('({busy:window.__osfsHero.busy, duration:window.__osfsHero.config.timeline.durationSeconds, frame:window.__osfsHero.frameIndex, message:window.__osfsHero.message.textContent, errors:window.__osfsCaptureError})')));
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  await until('document.querySelector(".hero-tuner")?.isConnected');
  const start = await state();
  assert.equal(start.paused, true);
  assert.equal(start.afterburner, 0);
  assert.ok(Math.abs(start.state.throttleNorm - .9) < 1e-6);
  await seek(90);
  const first = await state();
  assert.ok(first.afterburner > 0);
  assert.ok(Math.abs(first.state.pitchRad * 180 / Math.PI - 45) < 3);
  await seek(0);
  const rewound = await state();
  assert.equal(rewound.afterburner, 0);
  assert.ok(Math.abs(rewound.time - start.time) < 1e-6);
  assert.ok(Math.abs(rewound.n2 - start.n2) < .01, `Engine did not rewind: ${start.n2} → ${rewound.n2}`);
  await seek(90);
  const repeated = await state();
  report.rewind = { first, repeated, start, rewound };
  assert.ok(Math.abs(repeated.state.pitchRad - first.state.pitchRad) < .002, 'Replayed pitch drifted.');
  assert.ok(Math.abs(repeated.n2 - first.n2) < .05, 'Replayed engine spool drifted.');
  await click('[data-mode="manual"]');
  await seek(0);
  // The trusted right-drag is the real app gesture, outside the Video tab.
  await run('window.__osfsHero.recordCamera()');
  const bounds = await run('(() => { const r=document.querySelector("canvas.flight-app__canvas").getBoundingClientRect(); return {x:r.x+r.width*.6,y:r.y+r.height*.7}; })()');
  await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bounds.x, y: bounds.y, button: 'right', buttons: 2, clickCount: 1 }, sessionId);
  for (let i = 1; i <= 8; i++) {
    await chrome.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bounds.x + i * 8, y: bounds.y - i * 2, buttons: 2, button: 'right' }, sessionId);
    await new Promise(resolve => setTimeout(resolve, 35));
  }
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bounds.x + 64, y: bounds.y - 16, button: 'right', buttons: 0, clickCount: 1 }, sessionId);
  await until('window.__osfsHero.frameIndex > 12');
  await click('[data-play]');
  const take = await run('window.__osfsHero.exportScenario().camera');
  assert.ok(take.keyframes.length > 8);
  assert.ok(Math.abs(take.keyframes.at(-1).yawDegrees - take.keyframes[0].yawDegrees) > 2, 'Camera drag was not recorded.');
  const beforePause = await state();
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal((await state()).time, beforePause.time);
  await seek(0);
  await click('[data-play]');
  await until('window.__osfsHero.frameIndex > 12');
  await click('[data-play]');
  report.cameraTake = take;
  // Duration is a frame-aligned range; changing it stops playback and trims the path.
  await run('(() => { const input=document.querySelector(".hero-tuner [data-duration]"); input.value=120; input.dispatchEvent(new Event("input",{bubbles:true})); })()');
  await until('!window.__osfsHero.busy && window.__osfsHero.config.timeline.durationSeconds === 4');
  assert.equal(await run('document.querySelector("[data-position]").max'), '119');
  // Every input event must move the real FDM immediately, while editing stays at t=0.
  await click('[data-play]');
  await until('window.__osfsHero.frameIndex > 2');
  report.liveEdits = [];
  for (const [field, value] of [['latitude', 44.9747], ['longitude', -93.2377], ['headingDegrees', 250], ['heightAboveGroundMeters', 200]]) {
    const edit = await run(`(() => {
      const hero=window.__osfsHero;
      const input=document.querySelector('[data-start="${field}"]');
      input.focus();input.value=${value};input.dispatchEvent(new Event('input',{bubbles:true}));
      return {frame:hero.frameIndex,playing:hero.playing,status:hero.status(),focused:document.activeElement===input,
        fieldsEnabled:[...document.querySelectorAll('[data-start]')].every(field=>!field.disabled),inert:!!input.closest('[inert]')};
    })()`);
    assert.equal(edit.frame, 0);
    assert.equal(edit.playing, false);
    assert.equal(edit.status.time, start.time);
    assert.equal(edit.focused, true);
    assert.equal(edit.fieldsEnabled, true);
    assert.equal(edit.inert, false);
    const actual = field === 'latitude' ? edit.status.state.latDeg : field === 'longitude' ? edit.status.state.lonDeg
      : field === 'headingDegrees' ? edit.status.state.headingRad * 180 / Math.PI
        : await run('window.__osfsHero.startFlight.aboveGroundMeters');
    assert.ok(Math.abs(actual - value) < 1e-5, `${field} did not update synchronously: ${actual}`);
    report.liveEdits.push({ field, value, actual, frame: edit.frame, time: edit.status.time });
  }
  assert.equal(await run('document.querySelector("[data-apply]")'), null);
  await run(`(() => { const input=document.querySelector('[data-start="headingDegrees"]');input.focus();input.value='';input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  assert.equal(await run('window.__osfsHero.invalidStart'), true);
  assert.equal((await state()).time, start.time);
  await run(`(() => { const input=document.querySelector('[data-start="headingDegrees"]');input.value=250;input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  assert.equal(await run('window.__osfsHero.invalidStart'), false);
  // Real native number-input stepping must also be live, with no blur or Apply action.
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 }, sessionId);
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 }, sessionId);
  assert.ok(Math.abs((await state()).state.headingRad * 180 / Math.PI - 250.1) < .001);
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 }, sessionId);
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 }, sessionId);
  assert.equal(await run('window.__osfsHero.frameIndex'), 0);
  await run('window.__osfsHero.startReady');
  await until('!window.__osfsHero.preparingStart && !window.__osfsHero.startError');
  const relocated = await state();
  assert.ok(Math.abs(relocated.state.latDeg - 44.9747) < 1e-5);
  assert.ok(Math.abs(relocated.state.lonDeg + 93.2377) < 1e-5);
  assert.ok(Math.abs(relocated.state.headingRad * 180 / Math.PI - 250) < .01);
  assert.equal(relocated.afterburner, 0);
  assert.ok(Math.abs(await run('window.__osfsHero.startFlight.aboveGroundMeters') - 200) < .1, 'Starting height was not applied above terrain.');
  report.relocated = relocated;
  await click('[data-save]');
  await until('window.__osfsHero.message.textContent.startsWith("Scenario saved")');
  const saved = JSON.parse(await readFile(scenarioPath, 'utf8'));
  assert.equal(saved.camera.mode, 'manual');
  assert.equal(saved.scene.headingDegrees, 250);
  assert.equal(saved.timeline.durationSeconds, 4);
  assert.equal(saved.timeline.throttleBefore, .9);
  assert.equal(saved.timeline.throttleAtSeconds, .2);
  assert.equal(saved.tuning, undefined);
  report.saved = saved;
  // Save actual tab markup and computed stylesheet rules for the shared screenshot runner.
  const fixture = await run(`(() => {
    const clone = document.querySelector('.hero-tuner').cloneNode(true);
    const inputs = [...document.querySelectorAll('.hero-tuner input')];
    clone.querySelectorAll('input').forEach((input,index)=>{input.setAttribute('value',inputs[index].value);input.toggleAttribute('checked',inputs[index].checked)});
    const css = [...document.styleSheets].flatMap(sheet=>{try{return [...sheet.cssRules].map(rule=>rule.cssText)}catch{return []}}).join('\\n');
    return '<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Video tab review</title><style>'+css+'\\nhtml,body{margin:0;background:#111827;color:#e5e7eb;font-family:system-ui}.hero-review{width:340px;max-width:100%;background:#17202f}</style><body><main class="hero-review">'+clone.outerHTML+'</main></body></html>';
  })()`);
  await writeFile(path.join(output, 'tab-review.html'), fixture);
  await run('window.__osfsHero.applyCamera(window.__osfsHero.readCamera())');
  await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const screenshot = await chrome.send('Page.captureScreenshot', { format: 'png' }, sessionId);
  const previewVariance = await run(`(async()=>{
    const image=await createImageBitmap(new Blob([Uint8Array.from(atob(${JSON.stringify(screenshot.data)}),char=>char.charCodeAt(0))],{type:'image/png'}));
    const canvas=document.createElement('canvas');canvas.width=300;canvas.height=200;
    const context=canvas.getContext('2d');context.drawImage(image,400,160,400,300,0,0,300,200);image.close();
    const data=context.getImageData(0,0,300,200).data;let sum=0,square=0,count=0;
    for(let index=0;index<data.length;index+=16){sum+=data[index];square+=data[index]*data[index];count++}
    return square/count-(sum/count)**2;
  })()`);
  if (previewVariance <= 20) {
    await writeFile(path.join(output, 'blank-preview.png'), Buffer.from(screenshot.data, 'base64'));
    const details = await run('window.__osfsHero.inspectPreview()');
    await writeFile(path.join(output, 'blank-preview.json'), JSON.stringify({ details, status: await state(), errors }, null, 2));
    console.log(JSON.stringify(details));
  }
  assert.ok(previewVariance > 20, `Relocated preview is blank (${previewVariance}).`);
  report.previewVariance = previewVariance;
  await writeFile(path.join(output, 'editor-live.png'), Buffer.from(screenshot.data, 'base64'));
  await run('window.__osfsHero.openTestFeedback()');
  await until('document.querySelector(".foss-earth-test-feedback")?.isConnected');
  assert.equal(await run('document.querySelectorAll(".foss-earth-test-feedback__step").length'), 4);
  await run('[...document.querySelectorAll(".foss-earth-test-feedback button")].find(button=>button.textContent==="Start").click()');
  await run('[...document.querySelectorAll(".foss-earth-test-feedback button")].find(button=>button.textContent==="Finish").click()');
  await until('document.querySelector(".foss-earth-test-feedback a[download]")?.href?.startsWith("blob:")');
  const feedback = await run('JSON.parse(document.querySelector(\'[aria-label="Review feedback JSON"]\').value)');
  assert.equal(feedback.schema, 'foss-earth-test-feedback');
  assert.equal(feedback.version, 1);
  await writeFile(path.join(output, 'feedback-check.json'), JSON.stringify(feedback, null, 2) + '\n');
  const feedbackShot = await chrome.send('Page.captureScreenshot', { format: 'png' }, sessionId);
  await writeFile(path.join(output, 'feedback-live.png'), Buffer.from(feedbackShot.data, 'base64'));
  assert.deepEqual(errors, []);
  report.passed = true;
  await writeFile(path.join(output, 'editor-check.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('Video editor checks passed: rewind, scripted inputs, camera recording, playback, seek, duration, start and save.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const output = path.join(root, 'build/hero/editor-check');
  await mkdir(output, { recursive: true });
  const source = process.argv.find(value => value.startsWith('--scenario='))?.slice('--scenario='.length);
  const config = JSON.parse(await readFile(source ? path.resolve(source) : new URL('./hero-scenario-usgs.json', import.meta.url), 'utf8'));
  config.camera.mode = 'manual';
  const scenarioPath = path.join(output, 'scenario.json');
  await writeFile(scenarioPath, JSON.stringify(config, null, 2) + '\n');
  const plan = {
    version: 1, id: 'hero-camera-editor-20261026', title: 'Tune the video camera',
    instructions: 'Use the isolated window opened by tune:hero. The Video tab controls the preview; the aircraft inputs stay scripted. Return to this Test tab to record your feedback.',
    steps: [
      { id: 'timeline', text: 'Play, pause, restart and scrub backwards/forwards. Does the plane resume the scripted climb, starting dry at 90% throttle?' },
      { id: 'camera', text: 'Choose Manual, frame the plane, then Record camera and orbit/zoom. Pause, scrub and Play: does the path replay as you intended?' },
      { id: 'start', text: 'Edit starting latitude, longitude, height and heading without leaving the field. Does the plane move immediately and remain paused at 0 s, with the fields editable while terrain loads?' },
      { id: 'save', text: 'Change duration, save the scenario and reopen it. Does the composition persist? Finish here and download your feedback.' },
    ], sources: ['diagnostics', 'flight'],
  };
  const planPath = path.join(output, 'test-plan.json');
  await writeFile(planPath, JSON.stringify(plan, null, 2) + '\n');
  const { createTestLink } = await import(new URL('../../../foss-earth/ui/dist/diagnostics/testFeedback.js', import.meta.url));
  await writeFile(path.join(output, 'test-link.txt'), createTestLink('https://127.0.0.1:7470/fly/', plan) + '\n');
  const child = spawn(process.execPath, [fileURLToPath(new URL('./capture-hero.mjs', import.meta.url)), '--check-tuner', `--scenario=${scenarioPath}`, `--out=${output}`, `--test-plan=${planPath}`], { stdio: 'inherit' });
  process.exitCode = await new Promise(resolve => child.once('exit', code => resolve(code ?? 1)));
}
