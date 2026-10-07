#!/usr/bin/env node
// 0sfs owns this aircraft-specific actual-GLB support/occlusion diagnostic.
// CPU/NullEngine only: no shaders, GPU pixels, scene exposure or radiance claim.
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';
import '@babylonjs/loaders/glTF/index.js';
import { LoadAssetContainerAsync,NullEngine,Scene,Vector3,FreeCamera,RawTexture,VertexBuffer } from '@babylonjs/core';
import { newOutputDirectory } from '../../outputDirectory.mjs';
import { sha256 } from '../../f135Engine/glb.mjs';
import { triangle,bvh,segmentTriangle } from '../../f135Engine/intersections.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const specified=process.argv.find(a=>a.startsWith('--out='))?.slice(6),out=specified?path.resolve(specified):newOutputDirectory('validation','plume-geometry');
if(specified)await mkdir(out);
const entry=path.join(out,'entry.ts');
await writeFile(entry,`export {createEngineExhaust} from ${JSON.stringify(path.join(root,'src/flight/aircraft/createEngineExhaust.ts'))};\nexport {bindEngineNozzleRig} from ${JSON.stringify(path.join(root,'src/flight/aircraft/engineNozzleRig.ts'))};\nexport {getEngineExhaustOpticalProfile} from ${JSON.stringify(path.join(root,'src/flight/aircraft/engineExhaustProfiles.ts'))};\nexport {F135_ENGINE_GEOMETRY} from ${JSON.stringify(path.join(root,'src/flight/aircraft/generated/f135EngineData.ts'))};\n`);
const bundle=await rolldown({input:entry,external:id=>!id.startsWith('.')&&!path.isAbsolute(id)&&!id.startsWith('@babylonjs/core/Shaders')&&id!=='foss-earth/runtime',plugins:[{name:'node-shader-side-effects',resolveId(id){if(id==='foss-earth/runtime')return '\0geometry-readiness-seam';if(id.startsWith('@babylonjs/core/Shaders'))return {id:id+'.js',external:true};},load(id){if(id==='\0geometry-readiness-seam')return "export function whenMeshesReady(){throw new Error('Geometry diagnostic requires its explicit CPU readiness seam');}";}}]});
try{await bundle.write({file:path.join(out,'entry.mjs'),format:'esm'});}finally{await bundle.close();}
const {createEngineExhaust,bindEngineNozzleRig,getEngineExhaustOpticalProfile,F135_ENGINE_GEOMETRY:g}=await import(pathToFileURL(path.join(out,'entry.mjs')));
const tracePath='validation/evidence/aircraft/f35b/plume-spatial-2026-10-06/native/trace.csv';
const [header,...csv]=(await readFile(path.join(root,tracePath),'utf8')).trim().split('\n').map(l=>l.split(','));
const samples=csv.map(row=>Object.fromEntries(header.map((key,i)=>[key,Number.isFinite(Number(row[i]))?Number(row[i]):row[i]])));
const observations=[samples.find(r=>r.phase==='powered-lift-full-command'&&Math.abs(r.timeS-117.525)<.01),samples.find(r=>r.scenario==='cold-cycle'&&Math.abs(r.timeS-212.75)<.01)];
if(observations.some(s=>!s))throw new Error('Required retained native samples missing');
const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
const camera=new FreeCamera('diagnostic',new Vector3(0,0,8),scene);scene.activeCamera=camera;
const errors=[],checks=[],depthCases=[];let container,handle;
const sourcePaths=['scripts/validation/f35b/check-plume-geometry.mjs','src/flight/aircraft/generated/f135-exhaust-lut.manifest.json','src/flight/aircraft/engineExhaustProfiles.ts','src/flight/aircraft/createEngineExhaust.ts','src/flight/aircraft/engineNozzleRig.ts','src/flight/aircraft/engineGasOptics.ts','public/aircraft/f-35b/engine/F135-PW-600-full.glb',tracePath];
const inputs=await Promise.all(sourcePaths.map(async (p,i)=>{const bytes=await readFile(path.join(root,p)),snapshot=p.endsWith('.glb')||p.endsWith('.csv')?undefined:`source-${i}-${path.basename(p)}.txt`;if(snapshot)await writeFile(path.join(out,snapshot),bytes);return{path:p,sha256:sha256(bytes),snapshot};}));
const assert=(condition,message)=>{if(!condition)errors.push(message);};
// Ray/box and ray/triangle code is independent of the renderer's shader strings.
function slab(origin,direction,min,max){let lo=0,hi=Infinity;for(let k=0;k<3;k++){if(Math.abs(direction[k])<1e-12){if(origin[k]<min[k]||origin[k]>max[k])return null;continue;}const a=(min[k]-origin[k])/direction[k],b=(max[k]-origin[k])/direction[k];lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));}return hi>lo?[lo,hi]:null;}
function nearestHardware(start,end,tree){const direction=end.map((v,i)=>v-start[i]);if(!slab(start,direction,tree.min,tree.max))return Infinity;if(tree.children)return Math.min(...tree.children.map(child=>nearestHardware(start,end,child)));let distance=Infinity;for(const t of tree.triangles){const hit=segmentTriangle(start,end,t);if(hit)distance=Math.min(distance,Math.hypot(...hit.map((v,i)=>v-start[i])));}return distance;}
try{
  container=await LoadAssetContainerAsync(new Uint8Array(await readFile(path.join(root,g.assets[0].path.startsWith('public/')?g.assets[0].path:`public/${g.assets[0].path}`))),scene,{pluginExtension:'.glb'});container.addAllToScene();
  const nodes=container.transformNodes.concat(container.meshes),exit=nodes.find(n=>n.name==='F135_Exhaust');
  const rig=bindEngineNozzleRig(nodes,{bearingNames:['F135_Bearing1','F135_Bearing2','F135_Bearing3'],bearingInclinationRad:g.bearingTiltDegrees*Math.PI/180,apertureMechanism:g.aperture});
  const profile=getEngineExhaustOpticalProfile('f135-visible-approximation-v1');
  const settings={enabled:true,sampleCount:32,maxDistanceMeters:2000,intensity:1,surfaceReferenceNits:1000,gasReferenceNits:1000,contributionView:'gas',lightEnabled:false};
  handle=createEngineExhaust(scene,{attachment:exit,exitPosition:[0,0,0],direction:[0,0,1],closedRadiusMeters:g.closedExitRadius,openRadiusMeters:g.openExitRadius,lengthMeters:6,opticalProfile:profile,settings,
    createTexture:()=>RawTexture.CreateRGBATexture(new Uint8Array([255,255,255,255]),1,1,scene,false,false),createSpatialTexture:()=>RawTexture.CreateRGBATexture(new Uint8Array([255,255,255,255]),1,1,scene,false,false),whenReady:async()=>{}});
  await handle.ready;
  for(const pitchDeg of [0,45,90,95])for(const yawDeg of [-10,0,10]){
    const native=observations[0],pitch=pitchDeg*Math.PI/180,yaw=yawDeg*Math.PI/180;rig.update(pitch,yaw,native.nozzleNorm);
    const state={running:Boolean(native.visualRunning ?? native.running),augmentation:Boolean(native.augmentation),powerNorm:native.n2Pct/100,nozzlePositionNorm:native.nozzleNorm,exitRadiusMeters:rig.apertureGeometry.exitRadius,gasTemperatureKelvin:native.gasK,ambientTemperatureKelvin:native.ambientK,fuelFlowKgPerSecond:native.fuelKgSec,afterburnerBurnedFuelFlowKgPerSecond:native.burnedAbKgSec,simulationTimeSeconds:native.timeS};
    camera.position.set(4,4,7);camera.computeWorldMatrix();handle.update(state,settings);
    const world=handle.mesh.computeWorldMatrix(true),inverse=world.clone().invert(),start=Vector3.TransformCoordinates(new Vector3(0,0,-.5),world),end=Vector3.TransformCoordinates(new Vector3(0,0,.5),world),axis=end.subtract(start).normalize(),expected=new Vector3(-Math.sin(pitch)*Math.sin(yaw),-Math.sin(pitch)*Math.cos(yaw),Math.cos(pitch));
    const radius=Vector3.TransformNormal(Vector3.Right(),world).length(),length=Vector3.Distance(start,end),error=Vector3.Distance(axis,expected),exitError=Vector3.Distance(start,Vector3.TransformCoordinates(Vector3.Zero(),exit.computeWorldMatrix(true)));
    assert(error<2e-6&&exitError<2e-6&&handle.mesh.isEnabled(),`Dry support disabled or misdirected ${pitchDeg}/${yawDeg}`);
    checks.push({pitchDeg,yawDeg,nativeAugmentation:state.augmentation,meshEnabled:handle.mesh.isEnabled(),start:start.asArray(),end:end.asArray(),outerBoxRadiusMeters:radius,exitRadiusMeters:rig.apertureGeometry.exitRadius,lengthMeters:length,axis:axis.asArray(),nativeAxisError:error,exitError});
    const hardware=[];
    for(const mesh of container.meshes){
      const positions=mesh.getVerticesData(VertexBuffer.PositionKind);if(!positions?.length)continue;
      const authoredIndices=mesh.getIndices(),indices=authoredIndices?.length?authoredIndices:Array.from({length:positions.length/3},(_,i)=>i);
      if(positions.length%3||indices.length%3)throw new Error(`Incomplete triangle geometry: ${mesh.name}`);
      const matrix=mesh.computeWorldMatrix(true);
      for(let i=0;i<indices.length;i+=3)hardware.push(triangle([0,1,2].map(j=>Vector3.TransformCoordinates(Vector3.FromArray(positions,indices[i+j]*3),matrix).asArray()),mesh.name));
    }
    if(!hardware.length||hardware.length!==g.assets[0].triangles)throw new Error(`Full-engine triangle inventory mismatch: ${hardware.length} vs ${g.assets[0].triangles}`);
    checks.at(-1).hardwareTriangles=hardware.length;
    const tree=bvh(hardware);
    const center=start.add(end).scale(.5),right=Vector3.TransformNormal(Vector3.Right(),world).normalize(),up=Vector3.Cross(axis,right).normalize();
    for(const [view,position]of [['rear',center.add(axis.scale(5))],['oblique',center.add(axis.scale(4)).add(right.scale(3)).add(up.scale(1.5))],['aircraft-side',new Vector3(6,4,5)]]){
      const forward=center.subtract(position).normalize(),screenRight=Vector3.Cross(forward,Vector3.Up()).normalize(),screenUp=Vector3.Cross(screenRight,forward).normalize();let supportRays=0,unoccludedSupportRays=0,partiallyOccludedSupportRays=0;const firstDepth={4:{missedThinSupport:0,hardwareFalseHidden:0,behindHardware:0},8:{missedThinSupport:0,hardwareFalseHidden:0,behindHardware:0},16:{missedThinSupport:0,hardwareFalseHidden:0,behindHardware:0},32:{missedThinSupport:0,hardwareFalseHidden:0,behindHardware:0}};
      for(let y=-8;y<=8;y++)for(let x=-8;x<=8;x++){
        const target=center.add(screenRight.scale(x*.1)).add(screenUp.scale(y*.1)),ray=target.subtract(position).normalize(),a=Vector3.TransformCoordinates(position,inverse);a.z+=.5;const localDirection=Vector3.TransformNormal(ray,inverse),interval=slab(a.asArray(),localDirection.asArray(),[-1,-1,0],[1,1,1]);if(!interval)continue;supportRays++;
        const [lo,hi]=interval,hardwareDistance=nearestHardware(position.asArray(),position.add(ray.scale(30)).asArray(),tree),points=[];
        // Positive tracer inside the declared expanding/contracting support assesses visibility independently of fuel,
        // source RGB, LUT values, exposure or a chosen luminous threshold.
        const support=t=>{const p=a.add(localDirection.scale(t)),supportRadius=profile.gasEmission.spatialField?(rig.apertureGeometry.exitRadius/radius+(1-rig.apertureGeometry.exitRadius/radius)*p.z):1-.6*p.z;return p.x*p.x+p.y*p.y<(.9*supportRadius)**2&&p.z>.01&&p.z<.99;};
        for(let i=0;i<1024;i++){const t=lo+(i+.5)*(hi-lo)/1024;if(support(t))points.push(t);}
        if(!points.length)continue;const before=points.filter(t=>t<hardwareDistance),after=points.filter(t=>t>hardwareDistance);if(before.length)unoccludedSupportRays++;if(before.length&&after.length)partiallyOccludedSupportRays++;
        for(const samples of [4,8,16,32]){const coarse=[],weight=profile.gasEmission.spatialField?Math.min(1,Math.abs(localDirection.z*(hi-lo))):0,sign=localDirection.z>=0?-1:1,boundary=u=>lo+(hi-lo)*(u+sign*weight*u*(1-u));for(let i=0;i<samples;i++){const t=(boundary(i/samples)+boundary((i+1)/samples))/2;if(support(t))coarse.push(t);}if(before.length&&!coarse.length)firstDepth[samples].missedThinSupport++;if(before.length&&coarse.length&&coarse[0]>hardwareDistance)firstDepth[samples].hardwareFalseHidden++;if(coarse.length&&coarse[0]<hardwareDistance&&coarse.some(t=>t>hardwareDistance))firstDepth[samples].behindHardware++;}
      }
      assert(unoccludedSupportRays>0,`Entire positive dry tracer hidden ${pitchDeg}/${yawDeg}/${view}`);depthCases.push({pitchDeg,yawDeg,view,cameraMeters:position.asArray(),supportRays,unoccludedSupportRays,partiallyOccludedSupportRays,firstDepth});
    }
    if(pitchDeg===90&&yawDeg===0){handle.update(state,{...settings,contributionView:'solid'});assert(!handle.mesh.isEnabled(),'Solid view did not hide plume');handle.update(state,settings);assert(handle.mesh.isEnabled(),'Gas view did not restore dry plume');}
  }
}finally{handle?.dispose();container?.dispose();scene.dispose();engine.dispose();}
const report={schema:'0sfs-plume-geometric-visibility/1',inputs,observations,checks,depthCases,errors,limits:['NullEngine does not compile or execute fragment shaders; positive tracer measures geometry support, not actual gas radiance or density field.','Actual full-engine triangles are included; ground, airframe and atmosphere are not. Aircraft-side names a camera position, not an airframe qualification.','First-depth diagnostic uses a positive tracer strictly inside the declared conical support and variable-length exit-clustered midpoint segments; actual optical fields can differ.','No GPU/day-night/exposure or screenshot reproduction is claimed.'],status:errors.length?'failed':'passed'};
await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({out:path.relative(root,out),poses:checks.length,views:depthCases.length,errors},null,2));if(errors.length)process.exitCode=1;
