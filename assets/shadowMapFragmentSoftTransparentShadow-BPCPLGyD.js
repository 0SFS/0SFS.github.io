import{K as e}from"./index-D-4xi28n.js";import{t}from"./shaderStore-DSzASZqB.js";var n=e({shadowMapFragmentSoftTransparentShadowWGSL:()=>a}),r=`shadowMapFragmentSoftTransparentShadow`,i=`#if SM_SOFTTRANSPARENTSHADOW==1
if ((bayerDither8(floor(((fragmentInputs.position.xy)%(8.0)))))/64.0>=uniforms.softTransparentShadowSM.x*alpha) {discard;}
#endif
`;t.IncludesShadersStoreWGSL[r]||(t.IncludesShadersStoreWGSL[r]=i);var a={name:r,shader:i};export{n as t};