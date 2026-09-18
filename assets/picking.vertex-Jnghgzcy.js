import{R as e}from"./index-C-Y6kbze.js";import{t}from"./shaderStore-DSzASZqB.js";import"./bakedVertexAnimation-DjF5vj-h.js";import"./instancesDeclaration-DQbrxKFQ.js";import"./instancesVertex-C9u09dY-.js";import"./bonesDeclaration-C7SRFvsT.js";import"./bonesVertex-CRH-gMUm.js";import"./morphTargetsVertex-BkTdIR5D.js";import"./morphTargetsVertexDeclaration-BHHq8KBW.js";import"./morphTargetsVertexGlobal-DfT0GPr1.js";import"./morphTargetsVertexGlobalDeclaration-qBt3mE3Y.js";var n=e({pickingVertexShaderWGSL:()=>a}),r=`pickingVertexShader`,i=`attribute position: vec3f;
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