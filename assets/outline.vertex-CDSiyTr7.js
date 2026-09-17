import{L as e}from"./index-D9Qvglr-.js";import{t}from"./shaderStore-DSzASZqB.js";import"./bonesDeclaration-7MRCeDC4.js";import"./bakedVertexAnimation-CIGvy_ye.js";import"./morphTargetsVertexGlobalDeclaration-C2H7XB-T.js";import"./morphTargetsVertexDeclaration-BWPjsZiw.js";import"./morphTargetsVertexGlobal-B4zqjpUT.js";import"./morphTargetsVertex-CFKsAoFL.js";import"./bonesVertex-DYI1YW8e.js";import"./clipPlaneVertex-BOA49oci.js";import"./clipPlaneVertexDeclaration-iv21mqTI.js";import"./logDepthDeclaration-pX0SKwcK.js";import"./instancesDeclaration-euysXSnV.js";import"./instancesVertex-BdFqGrFr.js";import"./logDepthVertex-BWJfC1Rj.js";var n=e({outlineVertexShader:()=>a}),r=`outlineVertexShader`,i=`attribute vec3 position;attribute vec3 normal;
#include<bonesDeclaration>
#include<bakedVertexAnimationDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
#include<clipPlaneVertexDeclaration>
uniform float offset;
#include<instancesDeclaration>
uniform mat4 viewProjection;
#ifdef ALPHATEST
varying vec2 vUV;uniform mat4 diffuseMatrix;
#ifdef UV1
attribute vec2 uv;
#endif
#ifdef UV2
attribute vec2 uv2;
#endif
#endif
#include<logDepthDeclaration>
#define CUSTOM_VERTEX_DEFINITIONS
void main(void)
{vec3 positionUpdated=position;vec3 normalUpdated=normal;
#ifdef UV1
vec2 uvUpdated=uv;
#endif
#ifdef UV2
vec2 uv2Updated=uv2;
#endif
#include<morphTargetsVertexGlobal>
#include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
vec3 offsetPosition=positionUpdated+(normalUpdated*offset);
#include<instancesVertex>
#include<bonesVertex>
#include<bakedVertexAnimation>
vec4 worldPos=finalWorld*vec4(offsetPosition,1.0);gl_Position=viewProjection*worldPos;
#ifdef ALPHATEST
#ifdef UV1
vUV=vec2(diffuseMatrix*vec4(uvUpdated,1.0,0.0));
#endif
#ifdef UV2
vUV=vec2(diffuseMatrix*vec4(uv2Updated,1.0,0.0));
#endif
#endif
#include<clipPlaneVertex>
#include<logDepthVertex>
}
`;t.ShadersStore[r]||(t.ShadersStore[r]=i);var a={name:r,shader:i};export{n as t};