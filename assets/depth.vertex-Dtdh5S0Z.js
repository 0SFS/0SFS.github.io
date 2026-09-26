import{K as e}from"./index-D-4xi28n.js";import{t}from"./shaderStore-DSzASZqB.js";import"./bonesDeclaration-CExbg9Cj.js";import"./bakedVertexAnimation-CIGvy_ye.js";import"./morphTargetsVertexGlobalDeclaration-BZwYHu82.js";import"./morphTargetsVertexDeclaration-CMZ_B8yv.js";import"./morphTargetsVertexGlobal-hzcI4QXr.js";import"./morphTargetsVertex-DrqMolKO.js";import"./bonesVertex-Cb0hiHA5.js";import"./clipPlaneVertex-C34Bhkmi.js";import"./clipPlaneVertexDeclaration-_KcvLud2.js";import"./instancesDeclaration-euysXSnV.js";import"./instancesVertex-BdFqGrFr.js";import"./pointCloudVertex-Lj8njxOA.js";var n=`pointCloudVertexDeclaration`,r=`#ifdef POINTSIZE
uniform float pointSize;
#endif
`;t.IncludesShadersStore[n]||(t.IncludesShadersStore[n]=r);var i=e({depthVertexShader:()=>s}),a=`depthVertexShader`,o=`attribute vec3 position;
#include<bonesDeclaration>
#include<bakedVertexAnimationDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
#include<clipPlaneVertexDeclaration>
#include<instancesDeclaration>
uniform mat4 viewProjection;uniform vec2 depthValues;
#if defined(ALPHATEST) || defined(NEED_UV)
varying vec2 vUV;uniform mat4 diffuseMatrix;
#ifdef UV1
attribute vec2 uv;
#endif
#ifdef UV2
attribute vec2 uv2;
#endif
#endif
#ifdef STORE_CAMERASPACE_Z
uniform mat4 view;varying vec4 vViewPos;
#endif
#include<pointCloudVertexDeclaration>
varying float vDepthMetric;
#define CUSTOM_VERTEX_DEFINITIONS
void main(void)
{vec3 positionUpdated=position;
#ifdef UV1
vec2 uvUpdated=uv;
#endif
#ifdef UV2
vec2 uv2Updated=uv2;
#endif
#include<morphTargetsVertexGlobal>
#include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
#include<instancesVertex>
#include<bonesVertex>
#include<bakedVertexAnimation>
vec4 worldPos=finalWorld*vec4(positionUpdated,1.0);
#include<clipPlaneVertex>
gl_Position=viewProjection*worldPos;
#ifdef STORE_CAMERASPACE_Z
vViewPos=view*worldPos;
#else
#ifdef USE_REVERSE_DEPTHBUFFER
vDepthMetric=((-gl_Position.z+depthValues.x)/(depthValues.y));
#else
vDepthMetric=((gl_Position.z+depthValues.x)/(depthValues.y));
#endif
#endif
#if defined(ALPHATEST) || defined(BASIC_RENDER)
#ifdef UV1
vUV=vec2(diffuseMatrix*vec4(uvUpdated,1.0,0.0));
#endif
#ifdef UV2
vUV=vec2(diffuseMatrix*vec4(uv2Updated,1.0,0.0));
#endif
#endif
#include<pointCloudVertex>
}
`;t.ShadersStore[a]||(t.ShadersStore[a]=o);var s={name:a,shader:o};export{i as t};