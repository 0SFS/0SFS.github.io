import{L as e}from"./index-D9Qvglr-.js";import{t}from"./shaderStore-DSzASZqB.js";var n=e({boundingBoxRendererVertexShaderWGSL:()=>a}),r=`boundingBoxRendererVertexShader`,i=`attribute position: vec3f;uniform world: mat4x4f;uniform viewProjection: mat4x4f;
#ifdef INSTANCES
attribute world0 : vec4<f32>;attribute world1 : vec4<f32>;attribute world2 : vec4<f32>;attribute world3 : vec4<f32>;
#endif
#define CUSTOM_VERTEX_DEFINITIONS
@vertex
fn main(input : VertexInputs)->FragmentInputs {
#define CUSTOM_VERTEX_MAIN_BEGIN
#ifdef INSTANCES
var finalWorld=mat4x4<f32>(vertexInputs.world0,vertexInputs.world1,vertexInputs.world2,vertexInputs.world3);var worldPos: vec4f=finalWorld* vec4f(vertexInputs.position,1.0);
#else
var worldPos: vec4f=uniforms.world* vec4f(vertexInputs.position,1.0);
#endif
vertexOutputs.position=uniforms.viewProjection*worldPos;
#define CUSTOM_VERTEX_MAIN_END
}
`;t.ShadersStoreWGSL[r]||(t.ShadersStoreWGSL[r]=i);var a={name:r,shader:i};export{n as t};