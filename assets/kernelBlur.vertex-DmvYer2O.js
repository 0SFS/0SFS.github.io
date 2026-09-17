import{L as e}from"./index-D9Qvglr-.js";import{t}from"./shaderStore-DSzASZqB.js";import"./kernelBlurVaryingDeclaration-CygPh2Uz.js";var n=`kernelBlurVertex`,r=`sampleCoord{X}=sampleCenter+delta*KERNEL_OFFSET{X};`;t.IncludesShadersStore[n]||(t.IncludesShadersStore[n]=r);var i=e({kernelBlurVertexShader:()=>s}),a=`kernelBlurVertexShader`,o=`attribute vec2 position;uniform vec2 delta;varying vec2 sampleCenter;
#include<kernelBlurVaryingDeclaration>[0..varyingCount]
const vec2 madd=vec2(0.5,0.5);
#define CUSTOM_VERTEX_DEFINITIONS
void main(void) {
#define CUSTOM_VERTEX_MAIN_BEGIN
sampleCenter=(position*madd+madd);
#include<kernelBlurVertex>[0..varyingCount]
gl_Position=vec4(position,0.0,1.0);
#define CUSTOM_VERTEX_MAIN_END
}`;t.ShadersStore[a]||(t.ShadersStore[a]=o);var s={name:a,shader:o};export{i as t};