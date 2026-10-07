import{At as e}from"./index-DvdjfSip.js";import{t}from"./shaderStore-CU9wbwKM.js";import"./bonesDeclaration-BwpD_FPG.js";import"./bakedVertexAnimation-Bx3ppqAF.js";import"./morphTargetsVertexGlobalDeclaration-Cc_TYy49.js";import"./morphTargetsVertexDeclaration-D4d2vmsw.js";import"./instancesDeclaration-CXrRcpvK.js";import"./morphTargetsVertexGlobal-CRTVpcxl.js";import"./morphTargetsVertex-R803ckF2.js";import"./instancesVertex-eTXSNWgw.js";import"./bonesVertex-DGSd3j-P.js";var n=e({pickingVertexShader:()=>a}),r=`pickingVertexShader`,i=`attribute vec3 position;
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