import{kt as e}from"./index-D-LiCatK.js";import{t}from"./shaderStore-CU9wbwKM.js";import"./helperFunctions-CYVz9Sk1.js";var n=e({grainPixelShader:()=>a}),r=`grainPixelShader`,i=`#include<helperFunctions>
uniform sampler2D textureSampler; 
uniform float intensity;uniform float animatedSeed;varying vec2 vUV;
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void)
{gl_FragColor=texture2D(textureSampler,vUV);vec2 seed=vUV*(animatedSeed);float grain=dither(seed,intensity);float lum=getLuminance(gl_FragColor.rgb);float grainAmount=(cos(-PI+(lum*PI*2.))+1.)/2.;gl_FragColor.rgb+=grain*grainAmount;gl_FragColor.rgb=max(gl_FragColor.rgb,0.0);}`;t.ShadersStore[r]||(t.ShadersStore[r]=i);var a={name:r,shader:i};export{n as t};