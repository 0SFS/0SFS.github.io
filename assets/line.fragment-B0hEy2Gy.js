import{K as e}from"./index-D-4xi28n.js";import{t}from"./shaderStore-DSzASZqB.js";import"./clipPlaneFragment-BdxklcFO.js";import"./clipPlaneFragmentDeclaration-Bix7HatJ.js";import"./logDepthDeclaration-CpoI9b8K.js";import"./logDepthFragment-Duvyqzvv.js";var n=e({linePixelShaderWGSL:()=>a}),r=`linePixelShader`,i=`#include<clipPlaneFragmentDeclaration>
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