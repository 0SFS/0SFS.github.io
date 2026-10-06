#!/usr/bin/env node
// Actual JSBSim WASM, aircraft loader, Babylon WebGL and control/rig fixture.
// No HTTP server, visible browser, globe/terrain, audio or ground qualification.
// Run only after F-35B runtime data and the GLB are ready:
//   node scripts/validation/f35b/check-playable-headless.mjs
// Each run retains its bundle, local asset hashes, screenshot and JSON report
// in a new dated build/validation/f35b-playable directory.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { evaluate, openHeadlessChrome, waitForExpression } from "../../headless-chrome.mjs";
import { newOutputDirectory } from "../../outputDirectory.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const outArg = process.argv.slice(2).find(arg => arg.startsWith("--out="))?.slice(6);
const out = outArg ? path.resolve(outArg) : newOutputDirectory("validation", "f35b-playable");
if (outArg) await mkdir(out); // Never overwrite a previous run.
const fixtureRoot = path.join(out, "fixture"), bundleRoot = path.join(out, "bundle");
await mkdir(fixtureRoot);
const exportReport = JSON.parse(await readFile(path.join(root, "validation/evidence/aircraft/f35b/export.json"), "utf8"));
const importPath = file => JSON.stringify(path.join(root, file));
const fixture = `
import {Engine,Scene,ArcRotateCamera,HemisphericLight,TransformNode,Vector3,Color4} from '@babylonjs/core';
import {createJsbsimRuntime} from ${importPath("src/flight/jsbsim/createJsbsimRuntime.ts")};
import {getFdmProfile} from ${importPath("src/flight/jsbsim/fdmProfiles.ts")};
import {createAircraftModel} from ${importPath("src/flight/aircraft/createAircraftModel.ts")};
import {readControlSurfaceState,applyAircraftRig} from ${importPath("src/flight/aircraft/aircraftAnimation.ts")};
import {applyFlightControls} from ${importPath("src/flight/input/applyFlightControls.ts")};
import {createFlightInputManager} from ${importPath("src/flight/input/flightInputManager.ts")};
import {readFlightState,flightAttitudeToQuaternion} from ${importPath("src/flight/bridge/ecefBridge.ts")};
const expectedNames=${JSON.stringify(exportReport.parts.map(part => part.name))};
const DT=1/120,profile=getFdmProfile('f-35b');
const status=window.__f35b={ready:false,error:null,phases:[],samples:[],scope:'Actual SDK/GLB/input/rig in standalone Babylon scene; no globe, terrain, collision or audio.'};
const engine=new Engine(document.querySelector('canvas'),true,{preserveDrawingBuffer:true});
const scene=new Scene(engine);scene.useRightHandedSystem=true;scene.clearColor=new Color4(.10,.15,.23,1);
const camera=new ArcRotateCamera('camera',-Math.PI/3,Math.PI/2.7,29,new Vector3(0,1.4,0),scene);camera.minZ=.05;
new HemisphericLight('light',new Vector3(.3,1,-.5),scene);
const parent=new TransformNode('flight-body',scene);let runtime,model,input,detachInput;
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>{scene.render();resolve();}));
const read=property=>runtime.sdk.getPropertyValue(property);
const parts=()=>Object.fromEntries(scene.transformNodes.concat(scene.meshes).filter(node=>expectedNames.includes(node.name)).map(node=>[node.name,{position:node.position.asArray(),rotation:(node.rotationQuaternion?.asArray()??node.rotation.asArray())}]));
const finiteFlight=state=>Object.values(state).every(Number.isFinite);
const auxiliaryThrust=()=>[1,2,3].map(index=>read('propulsion/engine['+index+']/thrust-lbs'));
const snapshot=()=>({state:readFlightState(runtime.sdk),surfaces:readControlSurfaceState(runtime.sdk,'f-35b'),commands:{elevator:read('fcs/elevator-cmd-norm'),aileron:read('fcs/aileron-cmd-norm'),rudder:read('fcs/rudder-cmd-norm'),throttle:read('fcs/throttle-cmd-norm'),gear:read('gear/gear-cmd-norm'),conversion:read(profile.stovl.commandProperty)},physical:{gear:read('gear/gear-pos-norm'),conversion:read(profile.stovl.positionProperty),thrustLbs:read('propulsion/engine[0]/thrust-lbs'),auxiliaryThrustLbs:auxiliaryThrust()},parts:parts()});
const pose=()=>{const state=readFlightState(runtime.sdk);parent.rotationQuaternion=flightAttitudeToQuaternion(state.rollRad,state.pitchRad,state.headingRad);const rig=model.getRig();if(rig)applyAircraftRig(rig,readControlSurfaceState(runtime.sdk,'f-35b'),DT);};
status.runPhase=async(name,seconds,values={},conversion=0)=>{
 const before=snapshot(),steps=Math.round(seconds/DT);input.setStick(values.aileron??0,values.elevator??0);input.setRudder(values.rudder??0);input.setThrottle(values.throttle??profile.initialThrottleNorm);
 if(values.gearDown!==undefined)input.setGearDown(values.gearDown);
 let minAltitude=Infinity,maxRoll=0,maxPitch=0,minSpeed=Infinity,maxSpeed=0;
 for(let step=0;step<steps;step++){
  const controls=input.poll(DT);applyFlightControls(runtime.sdk,controls,input.getGearDownNorm(),profile.rudderSign,{commandProperty:profile.stovl.commandProperty,commandNorm:conversion});
  if(!runtime.sdk.run())throw new Error('SDK run returned false at '+name+' step '+step);
  const state=readFlightState(runtime.sdk);if(!finiteFlight(state)||!auxiliaryThrust().every(Number.isFinite))throw new Error('Non-finite flight state or auxiliary force at '+name+' step '+step);
  minAltitude=Math.min(minAltitude,state.altMeters);maxRoll=Math.max(maxRoll,Math.abs(state.rollRad));maxPitch=Math.max(maxPitch,Math.abs(state.pitchRad));minSpeed=Math.min(minSpeed,state.airspeedKts);maxSpeed=Math.max(maxSpeed,state.airspeedKts);
  if(step%120===0)status.samples.push({phase:name,seconds:step*DT,...state,conversion:read(profile.stovl.positionProperty),gear:read('gear/gear-pos-norm'),auxiliaryThrustLbs:auxiliaryThrust()});
  if(step%60===59){pose();await nextFrame();}
 }
 pose();await nextFrame();const after=snapshot();const phase={name,seconds,steps,before,after,finite:true,minAltitudeMeters:minAltitude,maxRollDegrees:maxRoll*180/Math.PI,maxPitchDegrees:maxPitch*180/Math.PI,minSpeedKts:minSpeed,maxSpeedKts:maxSpeed};status.phases.push(phase);return phase;
};
status.snapshot=()=>snapshot();
status.finish=()=>{detachInput?.();input?.dispose();model?.dispose();runtime?.dispose();scene.dispose();engine.dispose();return true;};
(async()=>{try{
 runtime=await createJsbsimRuntime({aircraftId:'f-35b',bootstrap:{latDeg:0,lonDeg:0,altFt:5000},onLog:(stream,message)=>{(status.sdkLog??=[]).push({stream,message});}});
 input=createFlightInputManager({initialThrottle:profile.initialThrottleNorm,initialGearDown:profile.initialGearDown,rudderSign:profile.rudderSign});input.setPitchTrim(read('fcs/pitch-trim-cmd-norm'));input.setRollTrim(read('fcs/roll-trim-cmd-norm'));detachInput=input.attach(window);
 await new Promise((resolve,reject)=>{model=createAircraftModel(scene,parent,{aircraftId:'f-35b',lodId:'auto',requestRender:()=>{void nextFrame();},onStateChange:state=>{status.modelState=state;if(state.status==='ready')resolve();else if(state.status==='error')reject(new Error(state.error));}});});
 pose();await nextFrame();const logicalNames=scene.transformNodes.concat(scene.meshes).map(node=>node.name);const geometryMeshes=scene.meshes.filter(mesh=>mesh.getTotalVertices()>0);
 status.asset={expectedPartCount:expectedNames.length,foundPartCount:expectedNames.filter(name=>logicalNames.includes(name)).length,missingParts:expectedNames.filter(name=>!logicalNames.includes(name)),triangles:geometryMeshes.reduce((sum,mesh)=>sum+mesh.getTotalIndices()/3,0),textures:scene.textures.filter(texture=>texture.isReady()).length,bound:model.getRig()?.bound??[],meshReady:geometryMeshes.every(mesh=>mesh.isReady()),gpu:engine.getGlInfo()};
 status.sdkIdentity=runtime.identity;status.dt=runtime.sdk.getDeltaT();status.initial=snapshot();status.ready=true;
}catch(error){status.error=error.stack??String(error);status.ready=true;}})();
`;
await writeFile(path.join(fixtureRoot, "entry.ts"), fixture);
await writeFile(path.join(fixtureRoot, "index.html"), '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>F-35B playable acceptance fixture</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}canvas{display:block;width:100%;height:100%}</style><canvas></canvas><script type="module" src="/entry.ts"></script>');
await build({
  configFile: false, root: fixtureRoot, publicDir: false, base: "/", logLevel: "warn",
  assetsInclude: ["**/*.wasm"], resolve: { dedupe: ["@babylonjs/core", "@babylonjs/loaders"] },
  build: { outDir: bundleRoot, emptyOutDir: false, minify: false },
});

const failures = [], browserErrors = [], network = [], phases = [];
let result, exit, chrome, detach;
const mime = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".json": "application/json", ".glb": "model/gltf-binary", ".xml": "text/xml", ".png": "image/png" };
try {
  chrome = await openHeadlessChrome(path.join(out, "chrome-profile"));
  detach = chrome.onEvent(message => {
    if (message.method === "Runtime.exceptionThrown") browserErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    if (message.method !== "Fetch.requestPaused") return;
    void (async () => {
      const { requestId, request } = message.params, url = new URL(request.url);
      if (url.origin !== "https://0sfs.test") {
        failures.push("Blocked external request: " + url.origin);
        await chrome.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }, message.sessionId);return;
      }
      const pathname = decodeURIComponent(url.pathname);
      const base = /^\/(aircraft|jsbsim-data)\//.test(pathname) ? path.join(root, "public") : bundleRoot;
      const file = path.resolve(base, "." + (pathname === "/" ? "/index.html" : pathname));
      if (!file.startsWith(base + path.sep)) throw new Error("Unsafe local fixture request");
      try {
        const bytes = await readFile(file);
        network.push({ path: pathname, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
        await chrome.send("Fetch.fulfillRequest", { requestId, responseCode: 200,
          responseHeaders: [{ name: "Content-Type", value: mime[path.extname(file)] ?? "application/octet-stream" }, { name: "Cache-Control", value: "no-store" }], body: bytes.toString("base64") }, message.sessionId);
      } catch (error) {
        if (pathname !== "/favicon.ico") failures.push("Local fixture request failed: " + pathname + ": " + error.message);
        await chrome.send("Fetch.fulfillRequest", { requestId, responseCode: 404, body: "" }, message.sessionId);
      }
    })().catch(error => failures.push(error.message));
  });
  const { targetId } = await chrome.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await chrome.send("Target.attachToTarget", { targetId, flatten: true });
  await chrome.send("Runtime.enable", {}, sessionId);await chrome.send("Page.enable", {}, sessionId);
  await chrome.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] }, sessionId);
  await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false }, sessionId);
  await chrome.send("Page.navigate", { url: "https://0sfs.test/" }, sessionId);
  await waitForExpression(chrome, sessionId, "window.__f35b?.ready===true", 45000);
  const initial = await evaluate(chrome, sessionId, "({error:window.__f35b.error,asset:window.__f35b.asset,dt:window.__f35b.dt})");
  if (initial.error) throw new Error(initial.error);
  if (initial.asset.foundPartCount !== 102 || initial.asset.triangles !== 12259 || !initial.asset.meshReady) throw new Error("Actual GLB did not become ready with all expected geometry");
  if (Math.abs(initial.dt - 1 / 120) > 1e-9) throw new Error("Runtime did not use 120 Hz physics");
  phases.push(await evaluate(chrome, sessionId, "window.__f35b.runPhase('conventional-profile-start',30)"));
  if (phases[0].minAltitudeMeters < 300 || phases[0].maxRollDegrees > 45 || phases[0].maxPitchDegrees > 45 || phases[0].minSpeedKts < 50) failures.push("Conventional profile start did not remain in a usable airborne envelope for 30 seconds");
  const screenshot = await chrome.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
  await writeFile(path.join(out, "airborne.png"), Buffer.from(screenshot.data, "base64"));
  phases.push(await evaluate(chrome, sessionId, "window.__f35b.runPhase('axis-and-throttle-input',.5,{aileron:.12,elevator:.08,rudder:.1,throttle:.8})"));
  await chrome.send("Input.dispatchKeyEvent", { type: "keyDown", key: "g", code: "KeyG", windowsVirtualKeyCode: 71 }, sessionId);
  await chrome.send("Input.dispatchKeyEvent", { type: "keyUp", key: "g", code: "KeyG", windowsVirtualKeyCode: 71 }, sessionId);
  phases.push(await evaluate(chrome, sessionId, "window.__f35b.runPhase('keyboard-gear-and-conversion-actuators',8,{throttle:.8},1)"));
  const actuators = phases[2];
  if (actuators.after.commands.gear !== 1 || actuators.after.physical.gear < .95 || actuators.after.physical.conversion < .95) failures.push("Keyboard gear or physical conversion actuator did not reach its commanded position");
  const changed = (phase, name) => phase.before.parts[name] && phase.after.parts[name]
    && phase.before.parts[name].rotation.some((value, index) => Math.abs(value - phase.after.parts[name].rotation[index]) > 1e-5);
  for (const name of ["leftElevator", "rightElevator", "leftFlaperon", "rightFlaperon", "leftRudder", "rightRudder"]) if (!changed(phases[1], name)) failures.push("Axis input did not animate " + name);
  for (const name of ["noseGear", "leftGear", "rightGear", "topLiftDoor", "leftLiftDoor", "rightLiftDoor", "vtol"]) if (!changed(actuators, name)) failures.push("Physical actuator did not animate " + name);
  const actuatorScreenshot = await chrome.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
  await writeFile(path.join(out, "conversion-and-gear.png"), Buffer.from(actuatorScreenshot.data, "base64"));
  phases.push(await evaluate(chrome, sessionId, "window.__f35b.runPhase('conversion-retraction',6,{throttle:.48},0)"));
  if (phases[3].after.physical.conversion > 1e-6 || phases[3].after.physical.auxiliaryThrustLbs.some(value => Math.abs(value) > 1e-6)) failures.push("Retracted conversion retained auxiliary lift force");
  for (const name of ["topLiftDoor", "leftLiftDoor", "rightLiftDoor", "vtol"]) if (!changed(phases[3], name)) failures.push("Retraction did not animate " + name);
  result = await evaluate(chrome, sessionId, "({scope:window.__f35b.scope,asset:window.__f35b.asset,sdkIdentity:window.__f35b.sdkIdentity,dt:window.__f35b.dt,samples:window.__f35b.samples,sdkLog:window.__f35b.sdkLog})");
  const retractedScreenshot = await chrome.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
  await writeFile(path.join(out, "conversion-retracted.png"), Buffer.from(retractedScreenshot.data, "base64"));
  await evaluate(chrome, sessionId, "window.__f35b.finish()");
} catch (error) { failures.push(error.stack ?? error.message); }
finally {
  detach?.();
  if (chrome) {
    // Browser.close owns shutdown and Chrome's code-sign clone cleanup. Never
    // send a process signal after it, including when this bounded wait fails.
    try { await chrome.send("Browser.close"); } catch { /* pipe may close first */ }
    try { exit = await chrome.waitForExit(10000); }
    catch (error) { failures.push(error.message); }
    if (exit && (exit.code !== 0 || exit.signal !== null)) failures.push("Chrome did not exit normally: " + JSON.stringify(exit));
  }
}
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(),
  scope: "Actual shipped JSBSim SDK, F-35B runtime data, GLB, Babylon scene, input manager, physics control boundary and visual rig. Standalone fixture; no full globe app, terrain, collisions or audio qualification.",
  serverStarted: false, visibleBrowserUsed: false, chromeExit: exit, result, phases, network, browserErrors, failures,
  passed: Boolean(result) && phases.length === 4 && failures.length === 0 && browserErrors.length === 0 };
await writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
process.stdout.write(JSON.stringify({ passed: report.passed, report: path.join(out, "report.json"), chromeExit: exit }) + "\n");
if (!report.passed) process.exitCode = 1;
