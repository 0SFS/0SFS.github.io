import{K as e}from"./index-D-4xi28n.js";import{t}from"./shaderStore-DSzASZqB.js";import"./bakedVertexAnimation-DjF5vj-h.js";import"./instancesDeclaration-DQbrxKFQ.js";import"./instancesVertex-C9u09dY-.js";import"./bonesDeclaration-CYR4zE3V.js";import"./bonesVertex-BPdd63Wq.js";import"./morphTargetsVertex-CC51N4dc.js";import"./morphTargetsVertexDeclaration-D7wb7T1D.js";import"./morphTargetsVertexGlobal-CP-PZ8A1.js";import"./morphTargetsVertexGlobalDeclaration-BoBJqqTC.js";var n=e({pickingVertexShaderWGSL:()=>a}),r=`pickingVertexShader`,i=`attribute position: vec3f;
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