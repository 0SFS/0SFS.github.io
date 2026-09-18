import{R as e}from"./index-C-Y6kbze.js";import{t}from"./shaderStore-DSzASZqB.js";import"./clipPlaneFragment-qahx9zAh.js";import"./clipPlaneFragmentDeclaration-DRX97gD6.js";import"./logDepthDeclaration-pX0SKwcK.js";import"./logDepthFragment-CjeWn_xY.js";var n=e({outlinePixelShader:()=>a}),r=`outlinePixelShader`,i=`#ifdef LOGARITHMICDEPTH
#extension GL_EXT_frag_depth : enable
#endif
uniform vec4 color;
#ifdef ALPHATEST
varying vec2 vUV;uniform sampler2D diffuseSampler;
#endif
#include<clipPlaneFragmentDeclaration>
#include<logDepthDeclaration>
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
#include<clipPlaneFragment>
#ifdef ALPHATEST
if (texture2D(diffuseSampler,vUV).a<0.4)
discard;
#endif
#include<logDepthFragment>
gl_FragColor=color;
#define CUSTOM_FRAGMENT_MAIN_END
}`;t.ShadersStore[r]||(t.ShadersStore[r]=i);var a={name:r,shader:i};export{n as t};