import{L as e}from"./index-D9Qvglr-.js";import{t}from"./shaderStore-DSzASZqB.js";var n=e({morphTargetsVertexGlobal:()=>a}),r=`morphTargetsVertexGlobal`,i=`#ifdef MORPHTARGETS
#ifdef MORPHTARGETS_TEXTURE
float vertexID;
#endif
#endif
`;t.IncludesShadersStore[r]||(t.IncludesShadersStore[r]=i);var a={name:r,shader:i};export{n as t};