import{St as e}from"./index-DY_Hvp1Y.js";import{t}from"./shaderStore-DSzASZqB.js";import"./helperFunctions-B12ODV4V.js";import"./imageProcessingDeclaration-DLgDJnwR.js";import"./imageProcessingFunctions-DiDizL3s.js";var n=e({imageProcessingPixelShader:()=>a}),r=`imageProcessingPixelShader`,i=`varying vec2 vUV;uniform sampler2D textureSampler;
#include<imageProcessingDeclaration>
#include<helperFunctions>
#include<imageProcessingFunctions>
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void)
{vec4 result=texture2D(textureSampler,vUV);result.rgb=max(result.rgb,vec3(0.));
#ifdef IMAGEPROCESSING
#ifndef FROMLINEARSPACE
result.rgb=toLinearSpace(result.rgb);
#endif
result=applyImageProcessing(result);
#else
#ifdef FROMLINEARSPACE
result=applyImageProcessing(result);
#endif
#endif
gl_FragColor=result;}`;t.ShadersStore[r]||(t.ShadersStore[r]=i);var a={name:r,shader:i};export{n as t};