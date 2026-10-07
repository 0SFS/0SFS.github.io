import{kt as e}from"./index-DTHNn2K6.js";import{t}from"./shaderStore-CU9wbwKM.js";import"./clipPlaneFragmentDeclaration-C0GaOvDl.js";import"./fogFragmentDeclaration-DOkJoSac.js";import"./fogFragment-BUJyD0nt.js";import"./clipPlaneFragment-D_eF8E4_.js";var n=e({colorPixelShaderWGSL:()=>a}),r=`colorPixelShader`,i=`#if defined(VERTEXCOLOR) || defined(INSTANCESCOLOR) && defined(INSTANCES)
#define VERTEXCOLOR
varying vColor: vec4f;
#else
uniform color: vec4f;
#endif
#include<clipPlaneFragmentDeclaration>
#include<fogFragmentDeclaration>
#define CUSTOM_FRAGMENT_DEFINITIONS
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
#include<clipPlaneFragment>
#if defined(VERTEXCOLOR) || defined(INSTANCESCOLOR) && defined(INSTANCES)
fragmentOutputs.color=input.vColor;
#else
fragmentOutputs.color=uniforms.color;
#endif
#include<fogFragment>(color,fragmentOutputs.color)
#define CUSTOM_FRAGMENT_MAIN_END
}`;t.ShadersStoreWGSL[r]||(t.ShadersStoreWGSL[r]=i);var a={name:r,shader:i};export{n as t};