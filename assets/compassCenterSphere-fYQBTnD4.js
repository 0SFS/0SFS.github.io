import{i as e}from"./math.vector-cmnMnUM-.js";import{n as t}from"./math.color-B_LYgpDI.js";import{o as n,t as r}from"./mesh-DFxJSXU-.js";import{n as i,u as a}from"./createFlightSimApp-N5U8i8vN.js";var o=.22,s=[253/255,230/255,138/255],c=`
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 view;
uniform mat4 projection;
uniform vec2 radiusClip;
varying vec2 vUV;
void main(void) {
  vec3 centre = (view * vec4(world[3].xyz, 1.0)).xyz;
  float depth = length(centre);
  float radius = radiusClip.y * depth / projection[1][1];
  vec4 clip = projection * vec4(centre * max(0.0, 1.0 - radius / depth), 1.0);
  clip.xy += position.xy * radiusClip * clip.w;
  vUV = position.xy;
  gl_Position = clip;
}
`,l=`
precision highp float;
varying vec2 vUV;
uniform vec4 color;
uniform float edge;
void main(void) {
  float d2 = dot(vUV, vUV);
  float d = sqrt(d2);
  float cover = clamp((1.0 - d) / edge, 0.0, 1.0);
  vec3 n = vec3(vUV, sqrt(max(0.0, 1.0 - d2)));
  float diffuse = max(dot(n, vec3(-0.4472, 0.5466, 0.7079)), 0.0);
  float shine = pow(max(dot(n, vec3(-0.2425, 0.2964, 0.9238)), 0.0), 24.0);
  vec3 rgb = color.rgb * (0.75 + 0.25 * diffuse) + vec3(0.8 * shine);
  gl_FragColor = vec4(rgb, min(1.0, color.a * cover * (0.8 + 0.6 * smoothstep(0.85, 1.0, d) + shine)));
}
`,u=`
attribute position : vec3<f32>;
uniform world : mat4x4<f32>;
uniform view : mat4x4<f32>;
uniform projection : mat4x4<f32>;
uniform radiusClip : vec2<f32>;
varying vUV : vec2<f32>;

@vertex
fn main(input : VertexInputs) -> FragmentInputs {
  let centre = (uniforms.view * vec4<f32>(uniforms.world[3].xyz, 1.0)).xyz;
  let depth = length(centre);
  let radius = uniforms.radiusClip.y * depth / uniforms.projection[1][1];
  var clip = uniforms.projection * vec4<f32>(centre * max(0.0, 1.0 - radius / depth), 1.0);
  clip = vec4<f32>(clip.xy + vertexInputs.position.xy * uniforms.radiusClip * clip.w, clip.zw);
  vertexOutputs.vUV = vertexInputs.position.xy;
  vertexOutputs.position = clip;
}
`,d=`
varying vUV : vec2<f32>;
uniform color : vec4<f32>;
uniform edge : f32;

@fragment
fn main(input : FragmentInputs) -> FragmentOutputs {
  let d2 = dot(input.vUV, input.vUV);
  let d = sqrt(d2);
  let cover = clamp((1.0 - d) / uniforms.edge, 0.0, 1.0);
  let n = vec3<f32>(input.vUV, sqrt(max(0.0, 1.0 - d2)));
  let diffuse = max(dot(n, vec3<f32>(-0.4472, 0.5466, 0.7079)), 0.0);
  let shine = pow(max(dot(n, vec3<f32>(-0.2425, 0.2964, 0.9238)), 0.0), 24.0);
  let rgb = uniforms.color.rgb * (0.75 + 0.25 * diffuse) + vec3<f32>(0.8 * shine);
  fragmentOutputs.color = vec4<f32>(rgb, min(1.0, uniforms.color.a * cover * (0.8 + 0.6 * smoothstep(0.85, 1.0, d) + shine)));
}
`;function f(f,p){let m=f.getEngine().isWebGPU,h=new a(`compass-center-sphere`,f,m?{vertexSource:u,fragmentSource:d}:{vertexSource:c,fragmentSource:l},{attributes:[`position`],uniforms:[`world`,`view`,`projection`,`radiusClip`,`color`,`edge`],needAlphaBlending:!0,shaderLanguage:m?i.WGSL:i.GLSL});h.backFaceCulling=!1,h.disableDepthWrite=!0;let g=new r(`compass-center-sphere`,f),_=new n;_.positions=[-1,-1,0,1,-1,0,1,1,0,-1,1,0],_.indices=[0,1,2,0,2,3],_.applyToMesh(g),g.material=h,g.isPickable=!1,g.alwaysSelectAsActiveMesh=!0,g.doNotSyncBoundingInfo=!0,g.setEnabled(!1),h.forceCompilationAsync(g).catch(()=>{});let v=new e,y=new t(s[0],s[1],s[2],0),b=!1;function x(){g.isEnabled()&&g.setEnabled(!1)}return{show(e,t){if(b)return;let n=f.activeCamera,r=o*Math.max(0,Math.min(1,t)),i=p.clientWidth*(n?.viewport.width??1),a=p.clientHeight*(n?.viewport.height??1);!e||!n||!(r>0)||!(i>0)||!(a>0)||![e.x,e.y,e.z].every(Number.isFinite)?x():(g.position.equals(e)||g.position.copyFrom(e),v.set(52/i,52/a),h.setVector2(`radiusClip`,v),h.setFloat(`edge`,1/(26*(f.getEngine().getRenderHeight()/p.clientHeight||1))),y.a=r,h.setColor4(`color`,y),g.isEnabled()||g.setEnabled(!0))},dispose(){b||(b=!0,g.dispose(),h.dispose())}}}export{f as createCompassCenterSphere};