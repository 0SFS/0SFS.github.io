import{St as e}from"./index-DY_Hvp1Y.js";import{t}from"./shaderStore-DSzASZqB.js";import"./helperFunctions-B12ODV4V.js";import"./hdrFilteringFunctions-BCUG9fK8.js";import"./pbrBRDFFunctions-D_R-1K_R.js";var n=e({hdrFilteringPixelShader:()=>a}),r=`hdrFilteringPixelShader`,i=`#include<helperFunctions>
#include<importanceSampling>
#include<pbrBRDFFunctions>
#include<hdrFilteringFunctions>
uniform float alphaG;uniform samplerCube inputTexture;uniform vec2 vFilteringInfo;uniform float hdrScale;varying vec3 direction;void main() {vec3 color=radiance(alphaG,inputTexture,direction,vFilteringInfo);gl_FragColor=vec4(color*hdrScale,1.0);}`;t.ShadersStore[r]||(t.ShadersStore[r]=i);var a={name:r,shader:i};export{n as t};