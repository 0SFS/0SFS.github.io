// Original reduced linkage owned by 0sfs. Angles/lengths are hypotheses, not a
// recovered PW-600 actuator law. Every returned frame is rigid at unit scale.
export function apertureState(command, p) {
  const u=Number.isFinite(command)?Math.max(0,Math.min(1,command)):0;
  const convergent=p.closedConvergentRad+(p.openConvergentRad-p.closedConvergentRad)*u;
  const divergent=p.closedDivergentRad+(p.openDivergentRad-p.closedDivergentRad)*u;
  const throatRadius=p.inletRadius-p.convergentLength*Math.sin(convergent);
  const throatZ=p.convergentLength*Math.cos(convergent);
  const exitRadius=throatRadius+p.divergentLength*Math.sin(divergent);
  const exitZ=throatZ+p.divergentLength*Math.cos(divergent);
  // Seal spine is driven by a centred slot; it bisects the adjacent flap planes.
  // Its fixed-length tip slides relative to the neighbouring flap throat edge.
  const half=Math.PI/p.segmentCount;
  const sealConvergent=Math.atan(Math.tan(convergent)/Math.cos(half));
  const sealDivergent=Math.atan(Math.tan(divergent)/Math.cos(half));
  const sealBaseRadius=(p.inletRadius-p.sealHalfWidth*Math.sin(half))/Math.cos(half);
  const sealThroatRadius=(throatRadius-p.sealHalfWidth*Math.sin(half))/Math.cos(half);
  const sealThroatZ=throatZ;
  const sealHingeSlide=throatZ/Math.cos(sealConvergent);
  const fairingAngle=Math.atan2(exitRadius+p.fairingFollowerNormalOffset*Math.cos(divergent)-p.fairingBaseRadius,exitZ-p.fairingFollowerNormalOffset*Math.sin(divergent)-p.fairingBaseZ);
  const fairingSealAngle=Math.atan(Math.tan(fairingAngle)/Math.cos(half));
  const fairingSealBaseRadius=(p.fairingBaseRadius-p.fairingSealHalfWidth*Math.sin(half))/Math.cos(half);
  const fairingSlotDistance=Math.hypot(exitRadius+p.fairingFollowerNormalOffset*Math.cos(divergent)-p.fairingBaseRadius,exitZ-p.fairingFollowerNormalOffset*Math.sin(divergent)-p.fairingBaseZ);
  return {u,convergent,divergent,throatRadius,throatZ,exitRadius,exitZ,
    sealHingeSlide,sealConvergent,sealDivergent,sealBaseRadius,sealThroatRadius,sealThroatZ,fairingAngle,fairingSealAngle,fairingSealBaseRadius,fairingSlotDistance};
}
const rx=(a,p)=>[p[0],Math.cos(a)*p[1]-Math.sin(a)*p[2],Math.sin(a)*p[1]+Math.cos(a)*p[2]];
const rz=(a,p)=>[Math.cos(a)*p[0]-Math.sin(a)*p[1],Math.sin(a)*p[0]+Math.cos(a)*p[1],p[2]];
const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const partName=(role,index)=>`F135_${role}_${String(index+1).padStart(2,'0')}`;
export function apertureFrames(command,p){
  const s=apertureState(command,p),frames={};
  for(let i=0;i<p.segmentCount;i++){
    const theta=i*2*Math.PI/p.segmentCount,azimuth=theta-Math.PI/2;
    const radial=(r,z)=>[r*Math.cos(theta),r*Math.sin(theta),z];
    const conv=v=>add(radial(p.inletRadius,0),rz(azimuth,rx(s.convergent,v)));
    const div=v=>add(radial(s.throatRadius,s.throatZ),rz(azimuth,rx(-s.divergent,v)));
    const sealAzimuth=azimuth+Math.PI/p.segmentCount;
    const sealBase=rz(Math.PI/p.segmentCount,radial(s.sealBaseRadius,0));
    const sealThroat=rz(Math.PI/p.segmentCount,radial(s.sealThroatRadius,s.sealThroatZ));
    frames[partName('Convergent',i)]=conv;
    frames[partName('Divergent',i)]=div;
    frames[partName('ConvergentSeal',i)]=v=>add(sealBase,rz(sealAzimuth,rx(s.sealConvergent,v)));
    frames[partName('ConvergentSealShoe',i)]=v=>add(sealThroat,rz(sealAzimuth,rx(s.sealConvergent,v)));
    frames[partName('DivergentSeal',i)]=v=>add(sealThroat,rz(sealAzimuth,rx(-s.sealDivergent,v)));
    frames[partName('FairingSeal',i)]=v=>add(rz(Math.PI/p.segmentCount,radial(s.fairingSealBaseRadius,p.fairingBaseZ)),rz(sealAzimuth,rx(-s.fairingSealAngle,v)));
    frames[partName('Fairing',i)]=v=>add(radial(p.fairingBaseRadius,p.fairingBaseZ),rz(azimuth,rx(-s.fairingAngle,v)));
  }
  frames.F135_Exhaust=v=>add(v,[0,0,s.exitZ]);
  return frames;
}

// Quaternion Rz(azimuth) Rx(angle), glTF xyzw.
export function partPose(role,index,state,p) {
  let theta=index*2*Math.PI/p.segmentCount,r,z,angle;
  if(role==='Convergent'){r=p.inletRadius;z=0;angle=state.convergent;}
  else if(role==='Divergent'){r=state.throatRadius;z=state.throatZ;angle=-state.divergent;}
  else if(role==='ConvergentSeal'){theta+=Math.PI/p.segmentCount;r=state.sealBaseRadius;z=0;angle=state.sealConvergent;}
  else if(role==='DivergentSeal'){theta+=Math.PI/p.segmentCount;r=state.sealThroatRadius;z=state.sealThroatZ;angle=-state.sealDivergent;}
  else if(role==='ConvergentSealShoe'){theta+=Math.PI/p.segmentCount;r=state.sealThroatRadius;z=state.sealThroatZ;angle=state.sealConvergent;}
  else if(role==='Fairing'){r=p.fairingBaseRadius;z=p.fairingBaseZ;angle=-state.fairingAngle;}
  else if(role==='FairingSeal'){theta+=Math.PI/p.segmentCount;r=state.fairingSealBaseRadius;z=p.fairingBaseZ;angle=-state.fairingSealAngle;}
  else throw new Error(`Unknown mechanical role ${role}`);
  const az=(theta-Math.PI/2)/2,half=angle/2;
  return {translation:[r*Math.cos(theta),r*Math.sin(theta),z],rotation:[Math.cos(az)*Math.sin(half),Math.sin(az)*Math.sin(half),Math.sin(az)*Math.cos(half),Math.cos(az)*Math.cos(half)]};
}
// Evaluate the actual exported node hierarchy (including authored translations).
// Overrides are only the same declared actuator transforms used by the runtime.
export function exportedFrames(gltf,profile,command=0,pitch=0,yaw=0) {
  const p=profile.aperture,state=apertureState(command,p),beta=profile.geometry.bearingTiltDegrees*Math.PI/180;
  const b=2*Math.asin(Math.max(0,Math.min(1,Math.sin(pitch/4)/Math.sin(beta))));
  const a=-yaw-Math.atan2(Math.cos(beta)*Math.sin(b/2),Math.cos(b/2));
  const overrides=new Map();
  for(let i=0;i<p.segmentCount;i++)for(const role of ['Convergent','Divergent','ConvergentSeal','DivergentSeal','ConvergentSealShoe','Fairing','FairingSeal'])overrides.set(partName(role,i),partPose(role,i,state,p));
  overrides.set('F135_Exhaust',{translation:[0,0,state.exitZ]});
  const multiply=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
  const rotate=(q,v)=>{const n=multiply(multiply(q,[...v,0]),[-q[0],-q[1],-q[2],q[3]]);return n.slice(0,3);};
  const frames={},parents=new Map();gltf.json.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>parents.set(c,i)));
  function evaluate(i){const n=gltf.json.nodes[i];if(frames[n.name])return frames[n.name];const parent=parents.has(i)?evaluate(parents.get(i)):v=>v,override=overrides.get(n.name);let t=override?.translation??n.translation??[0,0,0],q=override?.rotation??n.rotation??[0,0,0,1];const scale=n.scale??[1,1,1];if(n.name==='F135_Engine')t=[0,0,0];const bearing=['F135_Bearing1','F135_Bearing2','F135_Bearing3'].indexOf(n.name);if(bearing>=0){const angle=[a,b,-b][bearing];q=multiply(q,[0,0,Math.sin(angle/2),Math.cos(angle/2)]);}const fn=v=>parent(add(t,rotate(q,v.map((x,j)=>x*scale[j]))));frames[n.name]=fn;return fn;}
  gltf.json.nodes.forEach((_,i)=>evaluate(i));return frames;
}
