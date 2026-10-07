import{kt as e}from"./index-BWX7GpvN.js";import{t}from"./shaderStore-DSzASZqB.js";import"./helperFunctions-DX9V9ldO.js";var n=e({rgbdDecodePixelShaderWGSL:()=>a}),r=`rgbdDecodePixelShader`,i=`varying vUV: vec2f;var textureSamplerSampler: sampler;var textureSampler: texture_2d<f32>;
#include<helperFunctions>
#define CUSTOM_FRAGMENT_DEFINITIONS
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {fragmentOutputs.color=vec4f(fromRGBD(textureSample(textureSampler,textureSamplerSampler,input.vUV)),1.0);}`;t.ShadersStoreWGSL[r]||(t.ShadersStoreWGSL[r]=i);var a={name:r,shader:i};export{n as t};