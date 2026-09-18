import{R as e}from"./index-C-Y6kbze.js";import{t}from"./shaderStore-DSzASZqB.js";import"./bakedVertexAnimation-DjF5vj-h.js";import"./instancesDeclaration-DQbrxKFQ.js";import"./instancesVertex-C9u09dY-.js";import"./bonesDeclaration-C7SRFvsT.js";import"./bonesVertex-CRH-gMUm.js";import"./clipPlaneVertex-C9THEnps.js";import"./clipPlaneVertexDeclaration-CDbGaF0r.js";import"./fogVertexDeclaration-DodqqZJc.js";import"./fogVertex-DwTHL8Li.js";import"./vertexColorMixing-DtDasHaH.js";var n=e({colorVertexShaderWGSL:()=>a}),r=`colorVertexShader`,i=`attribute position: vec3f;
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