import{kt as e}from"./index-DTHNn2K6.js";import{t}from"./shaderStore-CU9wbwKM.js";import"./clipPlaneFragmentDeclaration-Cq1YrhAg.js";import"./logDepthDeclaration-CLpBJ-Wr.js";import"./fogFragmentDeclaration-CxV6AyjG.js";import"./logDepthFragment-CQZiqzvb.js";import"./fogFragment-9jPwjgfw.js";import"./clipPlaneFragment-DebS5iGE.js";var n=`gaussianSplattingFragmentDeclaration`,r=`vec4 gaussianColor(vec4 inColor)
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