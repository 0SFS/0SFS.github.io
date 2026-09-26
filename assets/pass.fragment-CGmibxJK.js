import{K as e}from"./index-D-4xi28n.js";import{t}from"./shaderStore-DSzASZqB.js";var n=e({passPixelShader:()=>a}),r=`passPixelShader`,i=`varying vec2 vUV;uniform sampler2D textureSampler;
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) 
{gl_FragColor=texture2D(textureSampler,vUV);}`;t.ShadersStore[r]||(t.ShadersStore[r]=i);var a={name:r,shader:i};export{n as t};