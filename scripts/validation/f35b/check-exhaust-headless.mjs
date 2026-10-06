#!/usr/bin/env node
// Actual installed SDK, F-35B GLB, baked optical/smoke assets, shared shaders and native force glyphs.
// No server; both GPU backends compile and render on the installed Chrome.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { evaluate, openHeadlessChrome, waitForExpression } from "../../headless-chrome.mjs";
import { newOutputDirectory } from "../../outputDirectory.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: node scripts/validation/f35b/check-exhaust-headless.mjs [--out=build/new-directory] [--renderer=webgl2|webgpu|both] [--force-only]\nReal SDK/GLB/LUT, WebGL2 + WebGPU shader and pixel checks; screenshots and structural budgets. No server or timing benchmark.");
  process.exit(0);
}
if (args.some(arg => !arg.startsWith("--out=") && !arg.startsWith("--renderer=") && arg !== "--force-only")
  || args.filter(arg => arg.startsWith("--out=")).length > 1 || args.filter(arg => arg.startsWith("--renderer=")).length > 1) throw new Error("Use --help for arguments");
const forceOnly=args.includes("--force-only");
const selectedRenderer = args.find(arg => arg.startsWith("--renderer="))?.slice(11) ?? "both";
if (!["both", "webgl2", "webgpu"].includes(selectedRenderer)) throw new Error("Renderer must be webgl2, webgpu or both");
const renderers = selectedRenderer === "both" ? ["webgl2", "webgpu"] : [selectedRenderer];
const explicitOut = args.find(arg => arg.startsWith("--out="))?.slice(6);
const out = explicitOut ? path.resolve(explicitOut) : newOutputDirectory("validation", "f35b-exhaust");
if (!out.startsWith(path.join(root, "build") + path.sep)) throw new Error("Output must stay in this repository's build directory");
if (explicitOut) await mkdir(out); // A previous run must never be overwritten.
const fixtureRoot = path.join(out, "fixture"), bundleRoot = path.join(out, "bundle");
await mkdir(fixtureRoot);
const importPath = file => JSON.stringify(path.join(root, file));
const fixture = `
import {Engine,WebGPUEngine,Scene,FreeCamera,HemisphericLight,TransformNode,Vector3,Color4,Matrix} from '@babylonjs/core';
import {createJsbsimRuntime} from ${importPath("src/flight/jsbsim/createJsbsimRuntime.ts")};
import {getFdmProfile} from ${importPath("src/flight/jsbsim/fdmProfiles.ts")};
import {getAircraftDefinition} from ${importPath("src/flight/aircraft/aircraftCatalog.ts")};
import {getEngineExhaustOpticalProfile} from ${importPath("src/flight/aircraft/engineExhaustProfiles.ts")};
import {createAircraftModel} from ${importPath("src/flight/aircraft/createAircraftModel.ts")};
import {getEngineSmokeProfile} from ${importPath("src/flight/aircraft/engineSmokeProfiles.ts")};
import {createForcesDebugOverlay} from ${importPath("src/flight/diagnostics/createForcesDebugOverlay.ts")};
import {createAircraftEngineVisuals} from ${importPath("src/flight/aircraft/createAircraftEngineVisuals.ts")};
import {readControlSurfaceState,applyAircraftRig} from ${importPath("src/flight/aircraft/aircraftAnimation.ts")};
import {applyFlightControls} from ${importPath("src/flight/input/applyFlightControls.ts")};
import {flightParameterDefaults} from ${importPath("src/flight/settings/flightParameters.ts")};
const DT=1/120, mode=new URL(location.href).searchParams.get('renderer');
const status=window.__exhaust={ready:false,error:null,renderRequests:0,frames:0};
const definition=getAircraftDefinition('f-35b'),profile=getFdmProfile('f-35b'),parameters=flightParameterDefaults();
let settings={enabled:parameters.get('osfs.exhaust.enabled'),sampleCount:parameters.get('osfs.exhaust.sampleCount'),maxDistanceMeters:parameters.get('osfs.exhaust.maxDistanceMeters'),intensity:parameters.get('osfs.exhaust.intensity')};
let smokeSettings={enabled:false,maxParticles:parameters.get('osfs.exhaust.smoke.maxParticles'),emissionPerSecond:parameters.get('osfs.exhaust.smoke.emissionPerSecond'),lifetimeSeconds:parameters.get('osfs.exhaust.smoke.lifetimeSeconds'),maxDistanceMeters:parameters.get('osfs.exhaust.smoke.maxDistanceMeters'),opacity:parameters.get('osfs.exhaust.smoke.opacity')};
let forceSettings={enabled:false,newtonsPerMeter:parameters.get('osfs.forces.newtonsPerMeter'),maxArrowMeters:parameters.get('osfs.forces.maxArrowMeters'),labels:parameters.get('osfs.forces.labels'),labelRefreshHz:parameters.get('osfs.forces.labelRefreshHz')};
let engine,scene,camera,runtime,model,visual,overlay,parent,frontTarget;
const reference=Matrix.Identity(),worldFromEcef={m:new Float64Array([1,0,0,0,0,1,0,0,0,0,1,0,-6378137,0,0,1])};
const pixelReferences=new Map();
const read=p=>runtime.sdk.getPropertyValue(p);
const plumeMeshes=()=>scene.meshes.filter(mesh=>mesh.name==='engine-exhaust');
const smokeMeshes=()=>scene.meshes.filter(mesh=>mesh.name.startsWith('engine-smoke-'));
// Inspect the retained matrix array that Babylon uploads. Its public world-matrix helper caches a snapshot, and vertex buffers discard CPU data after upload.
const smokeState=()=>smokeMeshes().map(mesh=>({name:mesh.name,enabled:mesh.isEnabled(),count:mesh.thinInstanceCount,shaderReady:mesh.material?.getEffect()?.isReady(),matrices:Array.from({length:mesh.thinInstanceCount},(_,index)=>Array.from(mesh._thinInstanceDataStorage.matrixData.slice(index*16,index*16+16)))}));
const forceLabelState=()=>scene.meshes.filter(mesh=>mesh.metadata?.debugVector?.kind==='label'&&mesh.isEnabled()).map(mesh=>{const id=mesh.metadata.debugVector.id,force=overlay.getSnapshot().forces.find(force=>force.id===id);const v=[-force.bodyNewtons[1],-force.bodyNewtons[2],force.bodyNewtons[0]],magnitude=Math.hypot(...v),length=Math.min(magnitude/forceSettings.newtonsPerMeter,forceSettings.maxArrowMeters)+.35;const local=Vector3.FromArray(force.anchorMeters).addInPlace(Vector3.FromArray(v).scaleInPlace(length/magnitude));const expected=Vector3.TransformCoordinates(local,parent.getWorldMatrix()),actual=mesh.getWorldMatrix().getTranslation();return {id,label:force.label,expectedWorld:expected.asArray(),actualWorld:actual.asArray(),worldErrorMeters:Vector3.Distance(expected,actual)};});
const glowState=()=>scene.materials.filter(material=>material.name==='darkmet2-engine-thermal').map(material=>({name:material.name,emissive:material.emissiveColor.asArray()}));
const telemetry=()=>({augmentation:visual.afterburnerActive(),nozzlePositionNorm:visual.nozzlePositionNorm(),conversion:read(profile.stovl.positionProperty),n1Pct:read('propulsion/engine[0]/n1'),n2Pct:read('propulsion/engine[0]/n2'),thrustLbf:read('propulsion/engine[0]/thrust-lbs'),fuelFlowPps:read('propulsion/engine[0]/fuel-flow-rate-pps'),simulationTimeS:runtime.sdk.getSimTime()});
const update=()=>{visual.read();const rig=model.getRig();if(rig)applyAircraftRig(rig,{...readControlSurfaceState(runtime.sdk,'f-35b'),nozzlePositionNorm:visual.nozzlePositionNorm()},DT);visual.updateRig(rig??null,true);overlay?.update(true);};
const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>{engine.beginFrame();const before=engine._drawCalls?.current??0;scene.render();status.lastFrameDrawCalls=(engine._drawCalls?.current??0)-before;engine.endFrame();status.frames++;resolve();}));
const paint=async()=>{update();for(let count=0;count<3;count++)await frame();};
const settle=async()=>{for(let count=0;count<180;count++){await paint();const meshes=plumeMeshes();if((!settings.enabled||meshes.length===1&&meshes[0].isEnabled()&&meshes[0].isReady())&&(!smokeSettings.enabled||smokeMeshes().length===1&&smokeMeshes()[0].isReady()))return;}throw new Error('Exhaust did not become ready with texture and shader');};
status.phase=async(seconds,throttle,conversion)=>{
 const controls={elevator:0,aileron:0,rudder:0,throttle,pitchTrim:profile.initialProperties['fcs/pitch-trim-cmd-norm'],rollTrim:0,flaps:0,brake:0};
 let augmentationDuringConversion=0;
 for(let step=0;step<Math.round(seconds/DT);step++){
  applyFlightControls(runtime.sdk,controls,0,profile.rudderSign,{commandProperty:profile.stovl.commandProperty,commandNorm:conversion});
  if(!runtime.sdk.run())throw new Error('Native run failed');
  if(conversion>0&&read('propulsion/engine[0]/augmentation')===1)augmentationDuringConversion++;
  if(smokeSettings.enabled&&step%12===0)update();
 }
 await settle();return {...telemetry(),augmentationDuringConversion};
};
status.capture=async(name,view,compareTo)=>{
 const pose=(position,target)=>{Vector3.TransformCoordinatesToRef(position,reference,camera.position);camera.setTarget(Vector3.TransformCoordinates(target,reference));};
 if(view==='rear')pose(new Vector3(0,2.3,-18),new Vector3(0,2.3,-3));
 if(view==='side')pose(new Vector3(19,4,-5),new Vector3(0,2,-3));
 if(view==='forces')pose(new Vector3(28,5,-5),new Vector3(0,.5,-3));
 if(view==='front'){frontTarget??=scene.getTransformNodeByName('engine-exhaust-anchor')?.getAbsolutePosition().clone()??new Vector3(0,2.3,-4);pose(new Vector3(frontTarget.x,frontTarget.y,20),frontTarget);}
 await settle();const native=telemetry(),meshes=plumeMeshes();
 const pixels=await engine.readPixels(0,0,engine.getRenderWidth(),engine.getRenderHeight(),true,true);
 if(!pixels||pixels.length===0)throw new Error('GPU pixel readback unavailable');
 let pixelDifference=null;
 if(compareTo){const before=pixelReferences.get(compareTo);if(!before||before.length!==pixels.length)throw new Error('Missing matching pixel reference');let changedPixels=0,sumRgbDifference=0,maxChannelDifference=0;for(let offset=0;offset<pixels.length;offset+=4){let changed=false;for(let channel=0;channel<3;channel++){const delta=Math.abs(pixels[offset+channel]-before[offset+channel]);sumRgbDifference+=delta;maxChannelDifference=Math.max(maxChannelDifference,delta);changed ||= delta>2;}if(changed)changedPixels++;}pixelDifference={changedPixels,sumRgbDifference,maxChannelDifference};}
 pixelReferences.set(name,pixels.slice());
 return {name,view,native,settings:{...settings},smokeSettings:{...smokeSettings},plume:{count:meshes.length,visible:meshes.filter(mesh=>mesh.isEnabled()).length,triangles:meshes.reduce((sum,mesh)=>sum+mesh.getTotalIndices()/3,0),shaderReady:meshes.every(mesh=>mesh.material?.getEffect()?.isReady()),positions:meshes.map(mesh=>mesh.getAbsolutePosition().asArray())},smoke:smokeState(),glow:glowState(),forceMeshes:scene.meshes.filter(mesh=>mesh.metadata?.debugVector&&mesh.isEnabled()).length,forceLabels:forceLabelState(),drawCalls:status.lastFrameDrawCalls??null,renderRequests:status.renderRequests,frames:status.frames,pixelDifference};
};
status.setEnabled=async enabled=>{settings={...settings,enabled};visual.setSettings(settings);await paint();};
status.setSmokeEnabled=async enabled=>{smokeSettings={...smokeSettings,enabled};visual.setSmokeSettings(smokeSettings);await settle();};
status.setForcesEnabled=async enabled=>{forceSettings={...forceSettings,enabled};overlay.setSettings(forceSettings);await overlay.ready;await paint();};
status.pauseCheck=async()=>{const before=telemetry(),smokeBefore=smokeState(),requests=status.renderRequests;await paint();await paint();return {before,after:telemetry(),smokeBefore,smokeAfter:smokeState(),renderRequestsBefore:requests,renderRequestsAfter:status.renderRequests};};
status.frameProjectionCheck=async()=>{
 const before=smokeState(),angle=.23,c=Math.cos(angle),s=Math.sin(angle);
 reference.copyFrom(Matrix.RotationY(angle));reference.setTranslationFromFloats(2,1,-3);
 worldFromEcef.m.set([c,0,-s,0,0,1,0,0,s,0,c,0,2-c*6378137,1,-3+s*6378137,1]);
 parent.rotation.y=angle;parent.position.set(2,1,-3);parent.computeWorldMatrix(true);await paint();
 const after=smokeState();let maxError=0;
 if(before.length!==1||after.length!==1||before[0].count!==after[0].count||!before[0].count)throw new Error('Missing smoke for frame projection');
 for(let i=0;i<before[0].count;i++){const a=before[0].matrices[i],b=after[0].matrices[i],expected=[c*a[12]+s*a[14]+2,a[13]+1,-s*a[12]+c*a[14]-3];for(let j=0;j<3;j++)maxError=Math.max(maxError,Math.abs(expected[j]-b[12+j]));}
 return {native:telemetry(),rotationRadians:angle,translationMeters:[2,1,-3],maxProjectionErrorMeters:maxError,instances:after[0].count};
};
status.finish=()=>{overlay?.dispose();visual?.dispose();model?.dispose();runtime?.dispose();scene?.dispose();engine?.dispose();return true;};
(async()=>{try{
 const canvas=document.querySelector('canvas');
 if(mode==='webgpu'){
  if(!navigator.gpu)throw new Error('WebGPU unavailable');
  engine=new WebGPUEngine(canvas,{antialias:true,adaptToDeviceRatio:false});
  await engine.initAsync({jsPath:'/babylon-assets/glslang/glslang.js',wasmPath:'/babylon-assets/glslang/glslang.wasm'},{jsPath:'/babylon-assets/twgsl/twgsl.js',wasmPath:'/babylon-assets/twgsl/twgsl.wasm'});
  const info=engine._adapter?.info;status.gpu=info?{backend:'webgpu',vendor:info.vendor,architecture:info.architecture,device:info.device,description:info.description,fallback:Boolean(info.isFallbackAdapter)}:null;
  engine._device?.addEventListener('uncapturederror',event=>{status.error=event.error.message;});
 }else{
  engine=new Engine(canvas,true,{preserveDrawingBuffer:true});
  if(engine.webGLVersion!==2)throw new Error('WebGL2 required');
  status.gpu={backend:'webgl2',...engine.getGlInfo()};
 }
 scene=new Scene(engine);scene.useRightHandedSystem=true;scene.clearColor=new Color4(.035,.045,.065,1);
 camera=new FreeCamera('camera',new Vector3(0,2.3,-18),scene);camera.minZ=.05;camera.setTarget(new Vector3(0,2.3,-3));
 new HemisphericLight('light',new Vector3(.3,1,-.5),scene);
 parent=new TransformNode('fixed-aircraft-reference',scene);
 runtime=await createJsbsimRuntime({aircraftId:'f-35b',bootstrap:{latDeg:0,lonDeg:0,altFt:10000},onLog:()=>{}});
 await new Promise((resolve,reject)=>{model=createAircraftModel(scene,parent,{aircraftId:'f-35b',lodId:'auto',requestRender:()=>{},onStateChange:state=>{if(state.status==='ready')resolve();else if(state.status==='error')reject(new Error(state.error));}});});
 visual=createAircraftEngineVisuals(runtime.sdk,scene,definition,{settings,smokeSettings,getWorldFromEcef:()=>worldFromEcef,requestRender:()=>{status.renderRequests++;},onError:message=>{status.error=message;}});
 overlay=createForcesDebugOverlay(scene,parent,runtime.sdk,{settings:forceSettings,engineLabels:profile.forceEngineLabels,requestRender:()=>{status.renderRequests++;},onUnavailable:message=>{status.error=message;}});
 const optical=getEngineExhaustOpticalProfile(definition.exhaustSources[0].opticalProfileId);
 status.optical={...optical,decodedRgbaBytes:optical.width*optical.height*4};
 const smokeProfile=getEngineSmokeProfile(definition.exhaustSources[0].smokeProfileId);status.smokeProfile={...smokeProfile,decodedRgbaBytes:smokeProfile.width*smokeProfile.height*4};
 const smokeReceipt=await fetch(smokeProfile.provenanceUrl);if(!smokeReceipt.ok)throw new Error('Smoke provenance fetch failed');status.smokeProvenance=await smokeReceipt.json();
 if(optical.provenanceUrl){const response=await fetch(optical.provenanceUrl);if(!response.ok)throw new Error('Optical provenance fetch failed');status.opticalProvenance=await response.json();}
 await status.phase(3,.7,0);
 status.asset={triangles:scene.meshes.filter(mesh=>mesh.name!=='engine-exhaust').reduce((sum,mesh)=>sum+mesh.getTotalIndices()/3,0),meshReady:scene.meshes.every(mesh=>mesh.isReady()),rigBound:model.getRig()?.bound};
 status.sdkIdentity=runtime.identity;status.ready=true;
}catch(error){status.error=error.stack??String(error);status.ready=true;}})();
`;
await writeFile(path.join(fixtureRoot, "entry.ts"), fixture);
await writeFile(path.join(fixtureRoot, "index.html"), '<!doctype html><title>F-35B exhaust GPU acceptance</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}canvas{width:100%;height:100%;display:block}</style><canvas></canvas><script type="module" src="/entry.ts"></script>');
await build({ configFile: false, root: fixtureRoot, publicDir: false, base: "/", logLevel: "warn",
  assetsInclude: ["**/*.wasm"], resolve: { dedupe: ["@babylonjs/core", "@babylonjs/loaders"] },
  build: { outDir: bundleRoot, emptyOutDir: false, minify: false, assetsInlineLimit: 0 },
});

const failures=[], browserErrors=[], network=[], runs=[];
const mime={".html":"text/html",".js":"text/javascript",".mjs":"text/javascript",".wasm":"application/wasm",".json":"application/json",".glb":"model/gltf-binary",".xml":"text/xml",".png":"image/png"};
let chrome,detach,exit,systemGpu;
try {
  chrome=await openHeadlessChrome(path.join(out,"chrome-profile"),undefined,["--enable-unsafe-webgpu"]);
  systemGpu=(await chrome.send("SystemInfo.getInfo")).gpu;
  detach=chrome.onEvent(message=>{
    if(message.method==="Runtime.exceptionThrown")browserErrors.push(message.params.exceptionDetails.exception?.description??message.params.exceptionDetails.text);
    if(message.method!=="Fetch.requestPaused")return;
    void(async()=>{
      const {requestId,request}=message.params,url=new URL(request.url);
      if(url.origin!=="https://0sfs.test"){failures.push("Blocked external request: "+url.origin);await chrome.send("Fetch.failRequest",{requestId,errorReason:"BlockedByClient"},message.sessionId);return;}
      const pathname=decodeURIComponent(url.pathname);
      let base,relative;
      if(pathname.startsWith("/babylon-assets/")){base=path.join(root,"node_modules/@babylonjs/core/assets");relative=pathname.slice("/babylon-assets".length);}
      else{base=/^\/(aircraft|jsbsim-data)\//.test(pathname)?path.join(root,"public"):bundleRoot;relative=pathname==="/"?"/index.html":pathname;}
      const file=path.resolve(base,"."+relative);
      if(!file.startsWith(base+path.sep))throw new Error("Unsafe local fixture request");
      try{const bytes=await readFile(file);network.push({path:pathname,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")});await chrome.send("Fetch.fulfillRequest",{requestId,responseCode:200,responseHeaders:[{name:"Content-Type",value:mime[path.extname(file)]??"application/octet-stream"},{name:"Cache-Control",value:"no-store"}],body:bytes.toString("base64")},message.sessionId);}
      catch(error){if(pathname!=="/favicon.ico")failures.push("Local request failed: "+pathname+": "+error.message);await chrome.send("Fetch.fulfillRequest",{requestId,responseCode:404,body:""},message.sessionId);}
    })().catch(error=>failures.push(error.message));
  });
  for(const renderer of renderers){
    const run={renderer,captures:[],failures:[]};runs.push(run);
    const {targetId}=await chrome.send("Target.createTarget",{url:"about:blank"});
    const {sessionId}=await chrome.send("Target.attachToTarget",{targetId,flatten:true});
    try{
      await chrome.send("Runtime.enable",{},sessionId);await chrome.send("Page.enable",{},sessionId);await chrome.send("Fetch.enable",{patterns:[{urlPattern:"*"}]},sessionId);
      await chrome.send("Emulation.setDeviceMetricsOverride",{width:1000,height:700,deviceScaleFactor:1,mobile:false},sessionId);
      await chrome.send("Page.navigate",{url:"https://0sfs.test/?renderer="+renderer},sessionId);
      await waitForExpression(chrome,sessionId,"window.__exhaust?.ready===true",45000);
      run.initial=await evaluate(chrome,sessionId,"({error:window.__exhaust.error,gpu:window.__exhaust.gpu,asset:window.__exhaust.asset,sdkIdentity:window.__exhaust.sdkIdentity,optical:window.__exhaust.optical,opticalProvenance:window.__exhaust.opticalProvenance,smokeProfile:window.__exhaust.smokeProfile,smokeProvenance:window.__exhaust.smokeProvenance})");
      if(run.initial.error)throw new Error(run.initial.error);
      if(run.initial.asset.triangles!==12259||!run.initial.asset.meshReady)throw new Error("Actual GLB failed geometry/readiness check");
      if(!run.initial.gpu||run.initial.gpu.fallback||/swiftshader|llvmpipe|software/i.test(JSON.stringify(run.initial.gpu)))throw new Error("Hardware GPU not confirmed");
      const capture=async(name,view,compareTo)=>{
        const result=await evaluate(chrome,sessionId,"window.__exhaust.capture("+[name,view,compareTo].map(value=>JSON.stringify(value??null)).join(",")+")");
        const shot=await chrome.send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false},sessionId);
        await writeFile(path.join(out,renderer+"-"+name+".png"),Buffer.from(shot.data,"base64"));run.captures.push(result);return result;
      };
      if(!forceOnly){
      const dry=await capture("dry-rear","rear");
      if(!Number.isFinite(dry.native.nozzlePositionNorm)||dry.native.augmentation!==false||dry.plume.visible!==1||dry.plume.triangles!==12||!dry.plume.shaderReady)throw new Error("Dry exhaust native/render contract failed");
      await evaluate(chrome,sessionId,"window.__exhaust.setEnabled(false)");
      const dryDisabled=await capture("dry-disabled","rear","dry-rear");
      if(dryDisabled.plume.count!==0||dryDisabled.glow.length)throw new Error("Disabling exhaust did not release its volume/glow clones");
      if(!dry.glow.length||!dry.glow.some(material=>material.emissive.some(value=>value>0))||dryDisabled.pixelDifference.changedPixels<10)throw new Error("Dry native power did not produce visible hot hardware");
      await evaluate(chrome,sessionId,"window.__exhaust.setEnabled(true)");
      run.afterburner=await evaluate(chrome,sessionId,"window.__exhaust.phase(12,1,0)");
      if(run.afterburner.augmentation!==true)throw new Error("Actual native afterburner did not activate");
      const augmented=await capture("afterburner-rear","rear");
      await capture("afterburner-side","side");
      await capture("afterburner-front","front");
      run.pause=await evaluate(chrome,sessionId,"window.__exhaust.pauseCheck()");
      if(run.pause.before.simulationTimeS!==run.pause.after.simulationTimeS||run.pause.renderRequestsBefore!==run.pause.renderRequestsAfter)throw new Error("Paused native state caused new time or render work");
      await evaluate(chrome,sessionId,"window.__exhaust.setEnabled(false)");
      const frontOff=await capture("afterburner-front-disabled","front","afterburner-front");
      if(!frontOff.pixelDifference||frontOff.pixelDifference.changedPixels>5)throw new Error("Front airframe did not occlude the exhaust: "+JSON.stringify(frontOff.pixelDifference));
      const off=await capture("afterburner-disabled","rear","afterburner-rear");
      if(off.plume.count!==0||off.native.augmentation!==true||!off.pixelDifference||off.pixelDifference.changedPixels<10)throw new Error("Enabled afterburner produced no distinct pixels or disable altered native state");
      await evaluate(chrome,sessionId,"window.__exhaust.setEnabled(true)");
      run.converted=await evaluate(chrome,sessionId,"window.__exhaust.phase(4,1,1)");
      if(run.converted.augmentation!==false||run.converted.augmentationDuringConversion!==0||run.converted.conversion<.999)throw new Error("Converted native state entered augmentation");
      await capture("converted-dry-side","side");
      // Smoke uses real native time and the retained frame, independently of light.
      await evaluate(chrome,sessionId,"window.__exhaust.phase(4,.7,0)");
      await evaluate(chrome,sessionId,"window.__exhaust.setSmokeEnabled(true)");
      run.smokeNative=await evaluate(chrome,sessionId,"window.__exhaust.phase(1.5,.7,0)");
      const smoky=await capture("dry-smoke-side","side");
      if(smoky.smoke.length!==1||!smoky.smoke[0].enabled||smoky.smoke[0].count<1||!smoky.smoke[0].shaderReady)throw new Error("Actual instanced smoke shader did not draw");
      run.smokePause=await evaluate(chrome,sessionId,"window.__exhaust.pauseCheck()");
      if(run.smokePause.before.simulationTimeS!==run.smokePause.after.simulationTimeS||JSON.stringify(run.smokePause.smokeBefore)!==JSON.stringify(run.smokePause.smokeAfter)||run.smokePause.renderRequestsBefore!==run.smokePause.renderRequestsAfter)throw new Error("Paused smoke drifted or scheduled new work");
      run.smokeProjection=await evaluate(chrome,sessionId,"window.__exhaust.frameProjectionCheck()");
      if(run.smokeProjection.maxProjectionErrorMeters>1e-4)throw new Error("Retained smoke did not project through rotated/translated frame");
      const projected=await capture("dry-smoke-rebased","side");
      await evaluate(chrome,sessionId,"window.__exhaust.setSmokeEnabled(false)");
      const smokeOff=await capture("dry-smoke-disabled","side","dry-smoke-rebased");
      if(smokeOff.smoke.length||projected.drawCalls-smokeOff.drawCalls!==1||smokeOff.pixelDifference.changedPixels<5)throw new Error("Smoke disable/pixel/draw budget contract failed");
      const smokeTexture=network.find(entry=>entry.path===new URL(run.initial.smokeProfile.textureUrl).pathname);
      run.smokeBudget={draws:projected.drawCalls-smokeOff.drawCalls,quadTriangles:2,liveInstances:projected.smoke[0].count,maxParticles:projected.smokeSettings.maxParticles,settings:projected.smokeSettings,textureEncodedBytes:smokeTexture?.bytes,textureEncodedSha256:smokeTexture?.sha256,textureDecodedRgbaBytes:run.initial.smokeProfile.decodedRgbaBytes};
      const textureUrl=run.initial.optical.textureUrl;
      const inlineBytes=textureUrl.startsWith("data:")?Buffer.from(textureUrl.slice(textureUrl.indexOf(",")+1),"base64"):null;
      const lutFile=inlineBytes?{bytes:inlineBytes.length,sha256:createHash("sha256").update(inlineBytes).digest("hex"),inlined:true}:network.find(entry=>entry.path===new URL(textureUrl).pathname);
      if(augmented.drawCalls-off.drawCalls!==1)throw new Error("Exhaust did not add exactly one draw: "+JSON.stringify({enabled:augmented.drawCalls,disabled:off.drawCalls}));
      run.budget={volumeDraws:augmented.drawCalls-off.drawCalls,volumeTriangles:augmented.plume.triangles,lookupsPerCoveredPixel:augmented.settings.sampleCount,maxLookupsPerCoveredPixel:32,lutDecodedRgbaBytes:run.initial.optical.decodedRgbaBytes,lutEncodedBytes:lutFile?.bytes??null,lutEncodedSha256:lutFile?.sha256??null,lutInlined:Boolean(inlineBytes),timingMeasured:false};
      }
      const forceView=forceOnly?"forces":"side";
      await capture("force-base",forceView);
      await evaluate(chrome,sessionId,"window.__exhaust.setForcesEnabled(true)");
      const forces=await capture("native-forces-side",forceView,"force-base");
      if(!forces.forceLabels.length||forces.forceLabels.some(label=>label.worldErrorMeters>1e-4))throw new Error("Native force label does not follow its arrow tip: "+JSON.stringify(forces.forceLabels));
      if(!forces.forceMeshes||forces.pixelDifference.changedPixels<10)throw new Error("Native force overlay did not produce visible glyphs");
      await evaluate(chrome,sessionId,"window.__exhaust.setForcesEnabled(false)");
      const forcesOff=await capture("native-forces-disabled",forceView,"native-forces-side");
      if(forcesOff.forceMeshes||forcesOff.pixelDifference.changedPixels<10)throw new Error("Force overlay disable contract failed");
      run.forceBudget={enabledGlyphMeshes:forces.forceMeshes,addedDraws:forces.drawCalls-forcesOff.drawCalls,labels:true,maxLabelWorldErrorMeters:Math.max(...forces.forceLabels.map(label=>label.worldErrorMeters))};
      const error=await evaluate(chrome,sessionId,"window.__exhaust.error");if(error)throw new Error(error);
      run.passed=true;
    }catch(error){run.failures.push(error.stack??error.message);run.passed=false;}
    finally{try{await evaluate(chrome,sessionId,"window.__exhaust?.finish()");}catch{}await chrome.send("Target.closeTarget",{targetId});}
  }
}catch(error){failures.push(error.stack??error.message);}
finally{
  detach?.();
  if(chrome){
    // Match playable acceptance: request normal shutdown, observe it, and never
    // send a process signal after Browser.close (including timeout paths).
    try{await chrome.send("Browser.close");}catch{}
    try{exit=await chrome.waitForExit(10000);}catch(error){failures.push(error.message);}
    if(exit&&(exit.code!==0||exit.signal!==null))failures.push("Chrome did not exit normally: "+JSON.stringify(exit));
  }
}
const report={schemaVersion:2,generatedAt:new Date().toISOString(),scope:forceOnly?"Installed SDK native force observation, actual F35 GLB, shared labeled force glyph readiness, hardware shader/pixel and disable checks. Fixed aircraft CG reference; no globe, flight performance or timing qualification.":"Installed SDK native telemetry and rig, actual F35 GLB, baked optical LUT/smoke sprite, native force glyphs, dry hot hardware, shared exhaust/smoke shader compilation and rendered pixels on the requested GPU backends. Fixed aircraft reference for framing; no globe, flight performance, collision, physical spectrum or timing benchmark qualification.",serverStarted:false,visibleBrowserUsed:false,renderersRequested:renderers,checks:forceOnly?"forces-only":"exhaust-smoke-forces",systemGpu,chromeExit:exit,runs,network,browserErrors,failures,passed:runs.length===renderers.length&&runs.every(run=>run.passed)&&failures.length===0&&browserErrors.length===0};
await writeFile(path.join(out,"report.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({passed:report.passed,report:path.join(out,"report.json"),chromeExit:exit}));
if(!report.passed)process.exitCode=1;
