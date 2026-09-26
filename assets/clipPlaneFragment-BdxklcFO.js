import{K as e}from"./index-D-4xi28n.js";import{t}from"./shaderStore-DSzASZqB.js";var n=e({clipPlaneFragmentWGSL:()=>a}),r=`clipPlaneFragment`,i=`#if defined(CLIPPLANE) || defined(CLIPPLANE2) || defined(CLIPPLANE3) || defined(CLIPPLANE4) || defined(CLIPPLANE5) || defined(CLIPPLANE6)
if (false) {}
#endif
#ifdef CLIPPLANE
else if (fragmentInputs.fClipDistance>0.0)
{discard;}
#endif
#ifdef CLIPPLANE2
else if (fragmentInputs.fClipDistance2>0.0)
{discard;}
#endif
#ifdef CLIPPLANE3
else if (fragmentInputs.fClipDistance3>0.0)
{discard;}
#endif
#ifdef CLIPPLANE4
else if (fragmentInputs.fClipDistance4>0.0)
{discard;}
#endif
#ifdef CLIPPLANE5
else if (fragmentInputs.fClipDistance5>0.0)
{discard;}
#endif
#ifdef CLIPPLANE6
else if (fragmentInputs.fClipDistance6>0.0)
{discard;}
#endif
`;t.IncludesShadersStoreWGSL[r]||(t.IncludesShadersStoreWGSL[r]=i);var a={name:r,shader:i};export{n as t};