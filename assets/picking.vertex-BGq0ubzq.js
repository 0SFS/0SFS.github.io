import{K as e}from"./index-D-4xi28n.js";import{t}from"./shaderStore-DSzASZqB.js";import"./bonesDeclaration-CExbg9Cj.js";import"./bakedVertexAnimation-CIGvy_ye.js";import"./morphTargetsVertexGlobalDeclaration-BZwYHu82.js";import"./morphTargetsVertexDeclaration-CMZ_B8yv.js";import"./morphTargetsVertexGlobal-hzcI4QXr.js";import"./morphTargetsVertex-DrqMolKO.js";import"./bonesVertex-Cb0hiHA5.js";import"./instancesDeclaration-euysXSnV.js";import"./instancesVertex-BdFqGrFr.js";var n=e({pickingVertexShader:()=>a}),r=`pickingVertexShader`,i=`attribute vec3 position;
#if defined(INSTANCES)
attribute float instanceMeshID;
#endif
#include<bonesDeclaration>
#include<bakedVertexAnimationDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
#include<instancesDeclaration>
uniform mat4 viewProjection;
#if defined(INSTANCES)
flat varying float vMeshID;
#endif
void main(void) {vec3 positionUpdated=position;
#include<morphTargetsVertexGlobal>
#include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
#include<instancesVertex>
#include<bonesVertex>
#include<bakedVertexAnimation>
vec4 worldPos=finalWorld*vec4(positionUpdated,1.0);gl_Position=viewProjection*worldPos;
#if defined(INSTANCES)
vMeshID=instanceMeshID;
#endif
}
`;t.ShadersStore[r]||(t.ShadersStore[r]=i);var a={name:r,shader:i};export{n as t};