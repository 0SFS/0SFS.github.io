import{At as e}from"./index-DvdjfSip.js";import{t}from"./shaderStore-CU9wbwKM.js";import"./helperFunctions-Czg98Fjb.js";var n=e({rgbdDecodePixelShader:()=>a}),r=`rgbdDecodePixelShader`,i=`varying vec2 vUV;uniform sampler2D textureSampler;
#include<helperFunctions>
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) 
{gl_FragColor=vec4(fromRGBD(texture2D(textureSampler,vUV)),1.0);}`;t.ShadersStore[r]||(t.ShadersStore[r]=i);var a={name:r,shader:i};export{n as t};