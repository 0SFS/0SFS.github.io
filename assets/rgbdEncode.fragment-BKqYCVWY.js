import{kt as e}from"./index-D-LiCatK.js";import{t}from"./shaderStore-CU9wbwKM.js";import"./helperFunctions-CYkeu7_q.js";var n=e({rgbdEncodePixelShaderWGSL:()=>a}),r=`rgbdEncodePixelShader`,i=`varying vUV: vec2f;var textureSamplerSampler: sampler;var textureSampler: texture_2d<f32>;
#include<helperFunctions>
#define CUSTOM_FRAGMENT_DEFINITIONS
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {fragmentOutputs.color=toRGBD(textureSample(textureSampler,textureSamplerSampler,input.vUV).rgb);}`;t.ShadersStoreWGSL[r]||(t.ShadersStoreWGSL[r]=i);var a={name:r,shader:i};export{n as t};