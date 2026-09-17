import{L as e}from"./index-D9Qvglr-.js";import{t}from"./shaderStore-DSzASZqB.js";var n=e({clipPlaneVertex:()=>a}),r=`clipPlaneVertex`,i=`#ifdef CLIPPLANE
fClipDistance=dot(worldPos,vClipPlane);
#endif
#ifdef CLIPPLANE2
fClipDistance2=dot(worldPos,vClipPlane2);
#endif
#ifdef CLIPPLANE3
fClipDistance3=dot(worldPos,vClipPlane3);
#endif
#ifdef CLIPPLANE4
fClipDistance4=dot(worldPos,vClipPlane4);
#endif
#ifdef CLIPPLANE5
fClipDistance5=dot(worldPos,vClipPlane5);
#endif
#ifdef CLIPPLANE6
fClipDistance6=dot(worldPos,vClipPlane6);
#endif
`;t.IncludesShadersStore[r]||(t.IncludesShadersStore[r]=i);var a={name:r,shader:i};export{n as t};