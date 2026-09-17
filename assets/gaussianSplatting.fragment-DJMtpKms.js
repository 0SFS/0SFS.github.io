import{L as e}from"./index-D9Qvglr-.js";import{t}from"./shaderStore-DSzASZqB.js";import"./clipPlaneFragment-CgyezzKa.js";import"./clipPlaneFragmentDeclaration-CnxT4Iwc.js";import"./fogFragmentDeclaration-CNvm-wW6.js";import"./logDepthDeclaration-pX0SKwcK.js";import"./logDepthFragment-CjeWn_xY.js";import"./fogFragment-BiROhISf.js";var n=`gaussianSplattingFragmentDeclaration`,r=`vec4 gaussianColor(vec4 inColor)
{float A=-dot(vPosition,vPosition);if (A<-4.0) discard;float B=exp(A)*inColor.a;
#include<logDepthFragment>
vec3 color=inColor.rgb;
#ifdef FOG
#include<fogFragment>
#endif
return vec4(color,B);}
`;t.IncludesShadersStore[n]||(t.IncludesShadersStore[n]=r);var i=e({gaussianSplattingPixelShader:()=>s}),a=`gaussianSplattingPixelShader`,o=`#include<clipPlaneFragmentDeclaration>
#include<logDepthDeclaration>
#include<fogFragmentDeclaration>
varying vec4 vColor;varying vec2 vPosition;
#define CUSTOM_FRAGMENT_DEFINITIONS
#include<gaussianSplattingFragmentDeclaration>
void main () {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
#include<clipPlaneFragment>
vec4 finalColor=gaussianColor(vColor);
#define CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR
gl_FragColor=finalColor;
#define CUSTOM_FRAGMENT_MAIN_END
}
`;t.ShadersStore[a]||(t.ShadersStore[a]=o);var s={name:a,shader:o};export{i as t};