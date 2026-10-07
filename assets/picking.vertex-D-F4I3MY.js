import{At as e}from"./index-DvdjfSip.js";import{t}from"./shaderStore-CU9wbwKM.js";import"./bonesDeclaration-DnQ5dxZ1.js";import"./bakedVertexAnimation-CgDxGu3d.js";import"./morphTargetsVertexGlobalDeclaration-CrMotgiE.js";import"./morphTargetsVertexDeclaration-B-2HEIqt.js";import"./instancesDeclaration-DRhkIQZj.js";import"./morphTargetsVertexGlobal-CA9VCZRk.js";import"./morphTargetsVertex-AnFoQqTq.js";import"./instancesVertex-DQKZGJW9.js";import"./bonesVertex-DWn__hQU.js";var n=e({pickingVertexShaderWGSL:()=>a}),r=`pickingVertexShader`,i=`attribute position: vec3f;
#if defined(INSTANCES)
attribute instanceMeshID: f32;
#endif
#include<bonesDeclaration>
#include<bakedVertexAnimationDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
#include<instancesDeclaration>
uniform viewProjection: mat4x4f;
#if defined(INSTANCES)
flat varying vMeshID: f32;
#endif
@vertex
fn main(input : VertexInputs)->FragmentInputs {var positionUpdated: vec3f=vertexInputs.position;
#include<morphTargetsVertexGlobal>
#include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
#include<instancesVertex>
#include<bonesVertex>
#include<bakedVertexAnimation>
var worldPos: vec4f=finalWorld*vec4f(positionUpdated,1.0);vertexOutputs.position=uniforms.viewProjection*worldPos;
#if defined(INSTANCES)
vertexOutputs.vMeshID=vertexInputs.instanceMeshID;
#endif
}
`;t.ShadersStoreWGSL[r]||(t.ShadersStoreWGSL[r]=i);var a={name:r,shader:i};export{n as t};