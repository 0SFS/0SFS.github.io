import{kt as e}from"./index-DlBB8lu9.js";import{t}from"./shaderStore-DSzASZqB.js";var n=e({shadowMapFragmentSoftTransparentShadow:()=>a}),r=`shadowMapFragmentSoftTransparentShadow`,i=`#if SM_SOFTTRANSPARENTSHADOW==1
if ((bayerDither8(floor(mod(gl_FragCoord.xy,8.0))))/64.0>=softTransparentShadowSM.x*alpha) discard;
#endif
`;t.IncludesShadersStore[r]||(t.IncludesShadersStore[r]=i);var a={name:r,shader:i};export{n as t};