import{At as e}from"./index-DvdjfSip.js";import{t}from"./shaderStore-CU9wbwKM.js";import"./clipPlaneVertexDeclaration-D3N3rAdg.js";import"./fogVertexDeclaration-CkBMAv8L.js";import"./clipPlaneVertex-DkhkDcZz.js";import"./fogVertex-duGWvy3p.js";import"./bonesDeclaration-DnQ5dxZ1.js";import"./bakedVertexAnimation-CgDxGu3d.js";import"./instancesDeclaration-DRhkIQZj.js";import"./instancesVertex-DQKZGJW9.js";import"./bonesVertex-DWn__hQU.js";import"./vertexColorMixing-Bu-TE6Rw.js";var n=e({colorVertexShaderWGSL:()=>a}),r=`colorVertexShader`,i=`attribute position: vec3f;
#ifdef VERTEXCOLOR
attribute color: vec4f;
#endif
#include<bonesDeclaration>
#include<bakedVertexAnimationDeclaration>
#include<clipPlaneVertexDeclaration>
#include<fogVertexDeclaration>
#ifdef FOG
uniform view: mat4x4f;
#endif
#include<instancesDeclaration>
uniform viewProjection: mat4x4f;
#if defined(VERTEXCOLOR) || defined(INSTANCESCOLOR) && defined(INSTANCES)
varying vColor: vec4f;
#endif
#define CUSTOM_VERTEX_DEFINITIONS
@vertex
fn main(input : VertexInputs)->FragmentInputs {
#define CUSTOM_VERTEX_MAIN_BEGIN
#ifdef VERTEXCOLOR
var colorUpdated: vec4f=vertexInputs.color;
#endif
#include<instancesVertex>
#include<bonesVertex>
#include<bakedVertexAnimation>
var worldPos: vec4f=finalWorld* vec4f(vertexInputs.position,1.0);vertexOutputs.position=uniforms.viewProjection*worldPos;
#include<clipPlaneVertex>
#include<fogVertex>
#include<vertexColorMixing>
#define CUSTOM_VERTEX_MAIN_END
}`;t.ShadersStoreWGSL[r]||(t.ShadersStoreWGSL[r]=i);var a={name:r,shader:i};export{n as t};