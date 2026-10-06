import { describe,it,expect } from 'vitest';
import '@babylonjs/loaders/glTF';
import { LoadAssetContainerAsync, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { bindEngineNozzleRig } from '../src/flight/aircraft/engineNozzleRig.ts';
import { exportedFrames } from './f135Engine/mechanism.mjs';
import { readFileSync } from 'node:fs';
import { buildSource,profile,bearingFrames } from './f135Engine/source.mjs';
import { exportEngine,removeOriginalNozzle,decodeGlb,posedMeshes } from './f135Engine/glb.mjs';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url));
describe('original F135 engine source and generated asset boundary',()=>{
  it('reproduces installed/full assets and excludes stand-only geometry from flight',()=>{
    const source=buildSource(),full=exportEngine(source,'full'),installed=exportEngine(source,'installed');
    expect(full.bytes).toEqual(read('public/aircraft/f-35b/engine/F135-PW-600-full.glb'));
    expect(installed.bytes).toEqual(read('public/aircraft/f-35b/engine/F135-PW-600-installed.glb'));
    expect(installed.standOnlyMeshes).toEqual([]);expect(full.standOnlyMeshes.length).toBeGreaterThan(0);expect(installed.bytes.length).toBeLessThan(full.bytes.length);
    const fi=decodeGlb(full.bytes),ii=decodeGlb(installed.bytes);expect(ii.json.images??[]).toEqual([]);expect(ii.json.materials).toEqual(fi.json.materials);
    const fullMeshes=new Map(posedMeshes(fi).map(m=>[m.name,m]));
    for(const m of posedMeshes(ii))expect(fullMeshes.get(m.name)).toEqual(m);
  });
  it('removes only old engine nodes and its separately audited extras component',()=>{
    const original=read('public/aircraft/f-35b/F-35B_AF267.glb'),output=removeOriginalNozzle(original),glb=decodeGlb(output.bytes);
    expect(output.bytes).toEqual(read('public/aircraft/f-35b/F-35B_AF267-airframe.glb'));
    expect(output.removedNodes).toHaveLength(17);expect(output.removedExtrasEngineTriangles).toBe(124);
    expect(output.retainedViewsIdentical).toBe(434);
    expect(glb.json.nodes.some(n=>n.name==='vtol'||n.name.startsWith('feather.'))).toBe(false);
    for(const name of ['extras','fuselage','leftWheel','rightWheel','noseWheel','leftEngineDoor','rightEngineDoor'])expect(glb.json.nodes.some(n=>n.name===name)).toBe(true);
    expect(glb.json.images).toHaveLength(decodeGlb(original).json.images.length);
  });
  it('follows native pitch/yaw direction through all three rigid circular bearings',()=>{
    for(const pitch of [0,.01,.5,1,Math.PI/2,95*Math.PI/180])for(const yaw of [-.17,0,.17]){
      const f=bearingFrames(pitch,yaw),expected=[-Math.sin(pitch)*Math.sin(yaw),-Math.sin(pitch)*Math.cos(yaw),Math.cos(pitch)];
      expect(Math.hypot(...f.direction.map((v,i)=>v-expected[i]))).toBeLessThan(1e-8);
      const base=f.F135_Nozzle([0,0,0]),tip=f.F135_Nozzle([0,0,profile.geometry.nozzleLength]);
      expect(Math.hypot(...tip.map((v,i)=>v-base[i]))).toBeCloseTo(profile.geometry.nozzleLength,12);
    }
  });
  it('uses the same actual exported rigid poses as the production Babylon rig',async()=>{
    const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
    try{
      const bytes=read('public/aircraft/f-35b/engine/F135-PW-600-installed.glb'),gltf=decodeGlb(bytes),container=await LoadAssetContainerAsync(new Uint8Array(bytes),scene,{pluginExtension:'.glb'});
      container.addAllToScene();const nodes=container.transformNodes.concat(container.meshes),rig=bindEngineNozzleRig(nodes,{bearingNames:['F135_Bearing1','F135_Bearing2','F135_Bearing3'],bearingInclinationRad:profile.geometry.bearingTiltDegrees*Math.PI/180,apertureMechanism:profile.aperture});
      const parts=nodes.filter(n=>/^F135_(Convergent|Divergent|Fairing)/.test(n.name)&&!n.name.endsWith('_Metal')&&!n.name.endsWith('_Follower'));
      let maxError=0;
      for(const aperture of [0,.1,.25,.5,.75,.9,1])for(const pitchDeg of [0,10,25,45,65,85,90,95])for(const yawDeg of [-10,0,10]){
        const pitch=pitchDeg*Math.PI/180,yaw=yawDeg*Math.PI/180;rig.update(pitch,yaw,aperture);const frames=exportedFrames(gltf,profile,aperture,pitch,yaw);
        for(const part of parts)for(const p of [[0,0,0],[1,0,0],[0,1,0],[0,0,1]]){const actual=Vector3.TransformCoordinates(Vector3.FromArray(p),part.computeWorldMatrix(true)).asArray(),expected=frames[part.name](p).map((v,i)=>v+profile.attachment[i]);maxError=Math.max(maxError,Math.hypot(...actual.map((v,i)=>v-expected[i])));}
      }
      expect(parts).toHaveLength(112);expect(maxError).toBeLessThan(2e-6);container.dispose();
    }finally{scene.dispose();engine.dispose();}
  });

});
