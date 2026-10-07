import{kt as e}from"./index-D-LiCatK.js";import{t}from"./shaderStore-CU9wbwKM.js";import"./clipPlaneFragmentDeclaration-xYPLM5fG.js";import"./logDepthDeclaration-eFNbOVvg.js";import"./logDepthFragment-8hhk9mSs.js";import"./clipPlaneFragment-DAmjXMWZ.js";var n=e({linePixelShaderWGSL:()=>a}),r=`linePixelShader`,i=`#include<clipPlaneFragmentDeclaration>
uniform color: vec4f;
#include<logDepthDeclaration>
#define CUSTOM_FRAGMENT_DEFINITIONS
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
#include<logDepthFragment>
#include<clipPlaneFragment>
fragmentOutputs.color=uniforms.color;
#define CUSTOM_FRAGMENT_MAIN_END
}`;t.ShadersStoreWGSL[r]||(t.ShadersStoreWGSL[r]=i);var a={name:r,shader:i};export{n as t};