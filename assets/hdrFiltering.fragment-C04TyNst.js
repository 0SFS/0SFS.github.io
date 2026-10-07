import{kt as e}from"./index-D-LiCatK.js";import{t}from"./shaderStore-CU9wbwKM.js";import"./helperFunctions-CYVz9Sk1.js";import"./pbrBRDFFunctions-CKPBPM2Y.js";import"./hdrFilteringFunctions-D8ViTZQh.js";var n=e({hdrFilteringPixelShader:()=>a}),r=`hdrFilteringPixelShader`,i=`#include<helperFunctions>
#include<importanceSampling>
#include<pbrBRDFFunctions>
#include<hdrFilteringFunctions>
uniform float alphaG;uniform samplerCube inputTexture;uniform vec2 vFilteringInfo;uniform float hdrScale;varying vec3 direction;void main() {vec3 color=radiance(alphaG,inputTexture,direction,vFilteringInfo);gl_FragColor=vec4(color*hdrScale,1.0);}`;t.ShadersStore[r]||(t.ShadersStore[r]=i);var a={name:r,shader:i};export{n as t};