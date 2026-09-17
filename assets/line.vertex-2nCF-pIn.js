import{L as e}from"./index-D9Qvglr-.js";import{t}from"./shaderStore-DSzASZqB.js";import"./clipPlaneVertex-BOA49oci.js";import"./clipPlaneVertexDeclaration-iv21mqTI.js";import"./sceneUboDeclaration-CldpS112.js";import"./logDepthDeclaration-pX0SKwcK.js";import"./instancesDeclaration-euysXSnV.js";import"./instancesVertex-BdFqGrFr.js";import"./logDepthVertex-BWJfC1Rj.js";import"./meshUboDeclaration-cBHPcoQ-.js";var n=`lineVertexDeclaration`,r=`uniform mat4 viewProjection;
#define ADDITIONAL_VERTEX_DECLARATION
`;t.IncludesShadersStore[n]||(t.IncludesShadersStore[n]=r);var i=`lineUboDeclaration`,a=`layout(std140,column_major) uniform;
#include<sceneUboDeclaration>
#include<meshUboDeclaration>
`;t.IncludesShadersStore[i]||(t.IncludesShadersStore[i]=a);var o=e({lineVertexShader:()=>l}),s=`lineVertexShader`,c=`#include<__decl__lineVertex>
#include<instancesDeclaration>
#include<clipPlaneVertexDeclaration>
attribute vec3 position;attribute vec4 normal;uniform float width;uniform float aspectRatio;
#include<logDepthDeclaration>
#define CUSTOM_VERTEX_DEFINITIONS
void main(void) {
#define CUSTOM_VERTEX_MAIN_BEGIN
#include<instancesVertex>
mat4 worldViewProjection=viewProjection*finalWorld;vec4 viewPosition=worldViewProjection*vec4(position,1.0);vec4 viewPositionNext=worldViewProjection*vec4(normal.xyz,1.0);vec2 currentScreen=viewPosition.xy/viewPosition.w;vec2 nextScreen=viewPositionNext.xy/viewPositionNext.w;currentScreen.x*=aspectRatio;nextScreen.x*=aspectRatio;vec2 dir=normalize(nextScreen-currentScreen);vec2 normalDir=vec2(-dir.y,dir.x);normalDir*=width/2.0;normalDir.x/=aspectRatio;vec4 offset=vec4(normalDir*normal.w,0.0,0.0);gl_Position=viewPosition+offset;
#if defined(CLIPPLANE) || defined(CLIPPLANE2) || defined(CLIPPLANE3) || defined(CLIPPLANE4) || defined(CLIPPLANE5) || defined(CLIPPLANE6)
vec4 worldPos=finalWorld*vec4(position,1.0);
#include<clipPlaneVertex>
#endif
#include<logDepthVertex>
#define CUSTOM_VERTEX_MAIN_END
}`;t.ShadersStore[s]||(t.ShadersStore[s]=c);var l={name:s,shader:c};export{o as t};