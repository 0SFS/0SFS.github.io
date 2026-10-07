import{kt as e}from"./index-DTHNn2K6.js";import{t}from"./shaderStore-CU9wbwKM.js";import"./clipPlaneFragmentDeclaration-C0GaOvDl.js";import"./logDepthDeclaration-eFNbOVvg.js";import"./fogFragmentDeclaration-DOkJoSac.js";import"./logDepthFragment-8hhk9mSs.js";import"./fogFragment-BUJyD0nt.js";import"./clipPlaneFragment-D_eF8E4_.js";var n=`gaussianSplattingFragmentDeclaration`,r=`fn gaussianColor(inColor: vec4f,inPosition: vec2f)->vec4f
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