import{ss as e}from"./shell-DzMoCJtM.js";var t=`volumetricLightingRenderVolumeVertexShader`,n=`#include<__decl__sceneVertex>
#include<__decl__meshVertex>
attribute vec3 position;varying vec4 vWorldPos;void main(void) {vec4 worldPos=world*vec4(position,1.0);vWorldPos=worldPos;gl_Position=viewProjection*worldPos;}
`;e.ShadersStore[t]||(e.ShadersStore[t]=n);var r={name:t,shader:n};export{r as volumetricLightingRenderVolumeVertexShader};