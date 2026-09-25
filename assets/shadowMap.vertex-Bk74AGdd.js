import{K as e}from"./index-fa2H_vXh.js";import{t}from"./shaderStore-DSzASZqB.js";import"./bonesDeclaration-1s1B0abO.js";import"./bakedVertexAnimation-CIGvy_ye.js";import"./morphTargetsVertexGlobalDeclaration-D2ZZtFuj.js";import"./morphTargetsVertexDeclaration-Cn3D-TYn.js";import"./morphTargetsVertexGlobal-DoTsR6dO.js";import"./morphTargetsVertex-BxpcO2Od.js";import"./bonesVertex-C4YAmD_C.js";import"./clipPlaneVertex-bIFQ-zmi.js";import"./clipPlaneVertexDeclaration-C3F-vp4R.js";import"./helperFunctions-BEHB9gtA.js";import"./shadowMapVertexMetric-D1S-r-NC.js";import"./sceneUboDeclaration-CldpS112.js";import"./instancesVertex-BdFqGrFr.js";import"./meshUboDeclaration-cBHPcoQ-.js";import"./sceneVertexDeclaration-4RmMSD7L.js";import"./meshVertexDeclaration-BMTYtpTb.js";var n=`shadowMapVertexDeclaration`,r=`#include<sceneVertexDeclaration>
#include<meshVertexDeclaration>
`;t.IncludesShadersStore[n]||(t.IncludesShadersStore[n]=r);var i=`shadowMapUboDeclaration`,a=`layout(std140,column_major) uniform;
#include<sceneUboDeclaration>
#include<meshUboDeclaration>
`;t.IncludesShadersStore[i]||(t.IncludesShadersStore[i]=a);var o=`shadowMapVertexExtraDeclaration`,s=`#if SM_NORMALBIAS==1
uniform vec3 lightDataSM;
#endif
uniform vec3 biasAndScaleSM;uniform vec2 depthValuesSM;varying float vDepthMetricSM;
#if SM_USEDISTANCE==1
varying vec3 vPositionWSM;
#endif
#if defined(SM_DEPTHCLAMP) && SM_DEPTHCLAMP==1
varying float zSM;
#endif
`;t.IncludesShadersStore[o]||(t.IncludesShadersStore[o]=s);var c=`shadowMapVertexNormalBias`,l=`#if SM_NORMALBIAS==1
#if SM_DIRECTIONINLIGHTDATA==1
vec3 worldLightDirSM=normalize(-lightDataSM.xyz);
#else
vec3 directionToLightSM=lightDataSM.xyz-worldPos.xyz;vec3 worldLightDirSM=normalize(directionToLightSM);
#endif
float ndlSM=dot(vNormalW,worldLightDirSM);float sinNLSM=sqrt(1.0-ndlSM*ndlSM);float normalBiasSM=biasAndScaleSM.y*sinNLSM;worldPos.xyz-=vNormalW*normalBiasSM;
#endif
`;t.IncludesShadersStore[c]||(t.IncludesShadersStore[c]=l);var u=e({shadowMapVertexShader:()=>p}),d=`shadowMapVertexShader`,f=`attribute vec3 position;
#ifdef NORMAL
attribute vec3 normal;
#endif
#include<bonesDeclaration>
#include<bakedVertexAnimationDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
#ifdef INSTANCES
attribute vec4 world0;attribute vec4 world1;attribute vec4 world2;attribute vec4 world3;
#endif
#include<helperFunctions>
#include<__decl__shadowMapVertex>
#ifdef ALPHATEXTURE
varying vec2 vUV;uniform mat4 diffuseMatrix;
#ifdef UV1
attribute vec2 uv;
#endif
#ifdef UV2
attribute vec2 uv2;
#endif
#endif
#include<shadowMapVertexExtraDeclaration>
#include<clipPlaneVertexDeclaration>
#define CUSTOM_VERTEX_DEFINITIONS
void main(void)
{vec3 positionUpdated=position;
#ifdef UV1
vec2 uvUpdated=uv;
#endif
#ifdef UV2
vec2 uv2Updated=uv2;
#endif
#ifdef NORMAL
vec3 normalUpdated=normal;
#endif
#include<morphTargetsVertexGlobal>
#include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
#include<instancesVertex>
#include<bonesVertex>
#include<bakedVertexAnimation>
vec4 worldPos=finalWorld*vec4(positionUpdated,1.0);
#ifdef NORMAL
mat3 normWorldSM=mat3(finalWorld);
#if defined(INSTANCES) && defined(THIN_INSTANCES)
vec3 vNormalW=normalUpdated/vec3(dot(normWorldSM[0],normWorldSM[0]),dot(normWorldSM[1],normWorldSM[1]),dot(normWorldSM[2],normWorldSM[2]));vNormalW=normalize(normWorldSM*vNormalW);
#else
#ifdef NONUNIFORMSCALING
normWorldSM=transposeMat3(inverseMat3(normWorldSM));
#endif
vec3 vNormalW=normalize(normWorldSM*normalUpdated);
#endif
#endif
#include<shadowMapVertexNormalBias>
gl_Position=viewProjection*worldPos;
#include<shadowMapVertexMetric>
#ifdef ALPHATEXTURE
#ifdef UV1
vUV=vec2(diffuseMatrix*vec4(uvUpdated,1.0,0.0));
#endif
#ifdef UV2
vUV=vec2(diffuseMatrix*vec4(uv2Updated,1.0,0.0));
#endif
#endif
#include<clipPlaneVertex>
}`;t.ShadersStore[d]||(t.ShadersStore[d]=f);var p={name:d,shader:f};export{u as t};