import{At as e}from"./index-DvdjfSip.js";import{t}from"./shaderStore-CU9wbwKM.js";import"./clipPlaneFragmentDeclaration-CtVr4fYm.js";import"./logDepthDeclaration-eFNbOVvg.js";import"./fogFragmentDeclaration-CQ3Hunqz.js";import"./logDepthFragment-8hhk9mSs.js";import"./fogFragment-BUJyD0nt.js";import"./clipPlaneFragment-C6Cipxqr.js";var n=`gaussianSplattingFragmentDeclaration`,r=`fn gaussianColor(inColor: vec4f,inPosition: vec2f)->vec4f
{var A : f32=-dot(inPosition,inPosition);if (A>-4.0)
{var B: f32=exp(A)*inColor.a;
#include<logDepthFragment>
var color: vec3f=inColor.rgb;
#ifdef FOG
#include<fogFragment>
#endif
return vec4f(color,B);} else {return vec4f(0.0);}}
`;t.IncludesShadersStoreWGSL[n]||(t.IncludesShadersStoreWGSL[n]=r);var i=e({gaussianSplattingPixelShaderWGSL:()=>s}),a=`gaussianSplattingPixelShader`,o=`#include<clipPlaneFragmentDeclaration>
#include<logDepthDeclaration>
#include<fogFragmentDeclaration>
varying vColor: vec4f;varying vPosition: vec2f;
#define CUSTOM_FRAGMENT_DEFINITIONS
#include<gaussianSplattingFragmentDeclaration>
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
#include<clipPlaneFragment>
var finalColor: vec4f=gaussianColor(input.vColor,input.vPosition);
#define CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR
fragmentOutputs.color=finalColor;
#define CUSTOM_FRAGMENT_MAIN_END
}
`;t.ShadersStoreWGSL[a]||(t.ShadersStoreWGSL[a]=o);var s={name:a,shader:o};export{i as t};