import type { EngineGasSection } from "./engineGasSupport";

/** 0sfs aircraft duct lookup. Same ruled-ring coordinates as engineGasSupport.ts. */
export const ENGINE_GAS_SUPPORT_LIMIT = 8;
export const ENGINE_GAS_HOLE_KNOT_LIMIT = 16;

/** Pose-only coefficients and conservative bounds; independent of source radiance. */
export function engineGasSectionShaderData(section: EngineGasSection) {
  const d = section.endCenter.map((v, i) => v - section.startCenter[i]);
  const du = section.endU.map((v, i) => v - section.startU[i]);
  const cross = (a: readonly number[], b: readonly number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: readonly number[], b: readonly number[]) => a.reduce((sum, v, i) => sum + v * b[i], 0);
  const a = cross(du, section.radialV), b = cross(section.startU, section.radialV);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const radius = Math.max(section.startRadius, section.endRadius);
  for (const center of [section.startCenter, section.endCenter]) {
    for (let i = 0; i < 3; i++) {
      const extent = radius * Math.hypot(Math.max(Math.abs(section.startU[i]), Math.abs(section.endU[i])), section.radialV[i]);
      min[i] = Math.min(min[i], center[i] - extent); max[i] = Math.max(max[i], center[i] + extent);
    }
  }
  // Centers and ring directions interpolate linearly. Their component maxima
  // and maximum radius also bound sections where both change together.
  // Float arithmetic gets the same micrometre allowance as the inverse.
  return { inverseA: [...a, -dot(d, a)], inverseB: [...b, -dot(d, b)],
    minimum: [...min.map(v => v - 1e-6), 0], maximum: [...max.map(v => v + 1e-6), 0] };
}

export const ENGINE_GAS_SUPPORT_GLSL = /* glsl */ `
uniform vec4 flowSettings;
uniform vec3 boxMinimum;
uniform vec4 supportStart[8];
uniform vec4 supportDelta[8];
uniform vec4 supportU[8];
uniform vec4 supportDU[8];
uniform vec4 supportV[8];
uniform vec4 supportRadii[8];
uniform vec4 supportMeta[8];
uniform vec4 supportHoles[16];
uniform vec4 supportInverseA[8];
uniform vec4 supportInverseB[8];
uniform vec4 supportMinimum[8];
uniform vec4 supportMaximum[8];
vec2 gasRayRanges[8];
void prepareGasRay(vec3 origin, vec3 direction) {
  vec3 safe = vec3(direction.x < 0.0 ? -max(abs(direction.x),1e-20) : max(abs(direction.x),1e-20),
    direction.y < 0.0 ? -max(abs(direction.y),1e-20) : max(abs(direction.y),1e-20),
    direction.z < 0.0 ? -max(abs(direction.z),1e-20) : max(abs(direction.z),1e-20));
  for(int i=0;i<8;i++) {
    vec3 a=(supportMinimum[i].xyz-origin)/safe, b=(supportMaximum[i].xyz-origin)/safe;
    vec3 lo=min(a,b), hi=max(a,b);
    gasRayRanges[i]=vec2(max(max(lo.x,lo.y),lo.z),min(min(hi.x,hi.y),hi.z));
  }
}
vec3 gasCoordinates(vec3 point, float rayDistance) {
  // Most of the volume is exterior: try downstream sections first.
  for (int i=7; i>=0; i--) {
    if (float(i)>=flowSettings.x) continue;
    if(rayDistance<gasRayRanges[i].x || rayDistance>gasRayRanges[i].y) continue;
    vec3 p=point-supportStart[i].xyz, d=supportDelta[i].xyz;
    vec3 u0=supportU[i].xyz, du=supportDU[i].xyz, v=supportV[i].xyz;
    float a=supportInverseA[i].w;
    float b=dot(p,supportInverseA[i].xyz)+supportInverseB[i].w;
    float c=dot(p,supportInverseB[i].xyz);
    vec2 roots=vec2(-2.0);
    if(abs(a)<0.000001*max(1.0,abs(b))) { if(abs(b)>0.0000001) roots.x=-c/b; }
    else {
      float disc=b*b-4.0*a*c;
      if(disc>=0.0) {
        float q=-0.5*(b+(b>=0.0?1.0:-1.0)*sqrt(disc));
        roots=vec2(q/a,abs(q)>0.0000001?c/q:-b/(2.0*a));
      }
    }
    for(int root=0;root<2;root++) {
      float t=root==0?roots.x:roots.y;
      float tolerance=0.000001/max(0.000001,supportMeta[i].y-supportMeta[i].x);
      if(t < -tolerance || t > 1.0+tolerance) continue;
      t=clamp(t,0.0,1.0);
      vec3 u=u0+t*du, relative=p-t*d;
      float x=dot(relative,u)/dot(u,u), y=dot(relative,v);
      float radius=mix(supportRadii[i].x,supportRadii[i].y,t), r=length(vec2(x,y));
      if(r>radius) continue;
      float hole=0.0;
      if(supportMeta[i].w>0.0) for(int j=0;j<16;j++) {
        if(float(j)<supportMeta[i].z || float(j)>=supportMeta[i].z+supportMeta[i].w) continue;
        vec4 knot=supportHoles[j];
        if(t>=knot.x) {
          hole=knot.y;
          if(float(j+1)<supportMeta[i].z+supportMeta[i].w && j<15) {
            vec4 next=supportHoles[j+1];
            if(next.x>knot.x) hole=mix(knot.y,next.y,clamp((t-knot.x)/(next.x-knot.x),0.0,1.0));
          }
        }
      }
      if(r<hole) continue;
      if(supportRadii[i].z>0.5) {
        float halfAngle=3.141592653589793/flowSettings.z, stepAngle=2.0*halfAngle;
        float angle=atan(y,x)-halfAngle;
        float wrapped=angle-stepAngle*floor(angle/stepAngle+0.5);
        float seal=(radius-flowSettings.w*sin(halfAngle))/cos(halfAngle);
        if(r*cos(wrapped)>seal) continue;
      }
      float distance=mix(supportMeta[i].x,supportMeta[i].y,t);
      return vec3((distance-supportStart[i].w)/supportDelta[i].w,r/radius,1.0);
    }
  }
  return vec3(0.0);
}
`;

export const ENGINE_GAS_SUPPORT_WGSL = /* wgsl */ `
uniform flowSettings : vec4<f32>;
uniform boxMinimum : vec3<f32>;
uniform supportStart : array<vec4<f32>,8>;
uniform supportDelta : array<vec4<f32>,8>;
uniform supportU : array<vec4<f32>,8>;
uniform supportDU : array<vec4<f32>,8>;
uniform supportV : array<vec4<f32>,8>;
uniform supportRadii : array<vec4<f32>,8>;
uniform supportMeta : array<vec4<f32>,8>;
uniform supportHoles : array<vec4<f32>,16>;
uniform supportInverseA : array<vec4<f32>,8>;
uniform supportInverseB : array<vec4<f32>,8>;
uniform supportMinimum : array<vec4<f32>,8>;
uniform supportMaximum : array<vec4<f32>,8>;
var<private> gasRayRanges : array<vec2<f32>,8>;
fn prepareGasRay(origin:vec3<f32>,direction:vec3<f32>) {
  let safe=select(max(abs(direction),vec3<f32>(1e-20)),-max(abs(direction),vec3<f32>(1e-20)),direction<vec3<f32>(0.0));
  for(var i:i32=0;i<8;i=i+1) {
    let a=(uniforms.supportMinimum[i].xyz-origin)/safe; let b=(uniforms.supportMaximum[i].xyz-origin)/safe;
    let lo=min(a,b); let hi=max(a,b);
    gasRayRanges[i]=vec2<f32>(max(max(lo.x,lo.y),lo.z),min(min(hi.x,hi.y),hi.z));
  }
}
fn gasCoordinates(point:vec3<f32>,rayDistance:f32)->vec3<f32> {
  for(var i:i32=7;i>=0;i=i-1) {
    if(f32(i)>=uniforms.flowSettings.x) { continue; }
    if(rayDistance<gasRayRanges[i].x || rayDistance>gasRayRanges[i].y) { continue; }
    let p=point-uniforms.supportStart[i].xyz; let d=uniforms.supportDelta[i].xyz;
    let u0=uniforms.supportU[i].xyz; let du=uniforms.supportDU[i].xyz; let v=uniforms.supportV[i].xyz;
    let a=uniforms.supportInverseA[i].w;
    let b=dot(p,uniforms.supportInverseA[i].xyz)+uniforms.supportInverseB[i].w; let c=dot(p,uniforms.supportInverseB[i].xyz);
    var roots=vec2<f32>(-2.0);
    if(abs(a)<0.000001*max(1.0,abs(b))) { if(abs(b)>0.0000001) { roots.x=-c/b; } }
    else {
      let disc=b*b-4.0*a*c;
      if(disc>=0.0) {
        let q=-0.5*(b+select(-1.0,1.0,b>=0.0)*sqrt(disc));
        roots.x=q/a;
        if(abs(q)>0.0000001) { roots.y=c/q; } else { roots.y=-b/(2.0*a); }
      }
    }
    for(var root:i32=0;root<2;root=root+1) {
      var t=select(roots.y,roots.x,root==0);
      let tolerance=0.000001/max(0.000001,uniforms.supportMeta[i].y-uniforms.supportMeta[i].x);
      if(t < -tolerance || t > 1.0+tolerance) { continue; }
      t=clamp(t,0.0,1.0);
      let u=u0+t*du; let relative=p-t*d;
      let x=dot(relative,u)/dot(u,u); let y=dot(relative,v);
      let radius=mix(uniforms.supportRadii[i].x,uniforms.supportRadii[i].y,t); let r=length(vec2<f32>(x,y));
      if(r>radius) { continue; }
      var hole:f32=0.0;
      if(uniforms.supportMeta[i].w>0.0) { for(var j:i32=0;j<16;j=j+1) {
        if(f32(j)<uniforms.supportMeta[i].z || f32(j)>=uniforms.supportMeta[i].z+uniforms.supportMeta[i].w) { continue; }
        let knot=uniforms.supportHoles[j];
        if(t>=knot.x) {
          hole=knot.y;
          if(f32(j+1)<uniforms.supportMeta[i].z+uniforms.supportMeta[i].w && j<15) {
            let next=uniforms.supportHoles[j+1];
            if(next.x>knot.x) { hole=mix(knot.y,next.y,clamp((t-knot.x)/(next.x-knot.x),0.0,1.0)); }
          }
        }
      }
      }
      if(r<hole) { continue; }
      if(uniforms.supportRadii[i].z>0.5) {
        let halfAngle=3.141592653589793/uniforms.flowSettings.z; let stepAngle=2.0*halfAngle;
        let angle=atan2(y,x)-halfAngle; let wrapped=angle-stepAngle*floor(angle/stepAngle+0.5);
        let seal=(radius-uniforms.flowSettings.w*sin(halfAngle))/cos(halfAngle);
        if(r*cos(wrapped)>seal) { continue; }
      }
      let distance=mix(uniforms.supportMeta[i].x,uniforms.supportMeta[i].y,t);
      return vec3<f32>((distance-uniforms.supportStart[i].w)/uniforms.supportDelta[i].w,r/radius,1.0);
    }
  }
  return vec3<f32>(0.0);
}
`;
