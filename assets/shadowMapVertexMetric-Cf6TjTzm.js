import{K as e}from"./index-D-4xi28n.js";import{t}from"./shaderStore-DSzASZqB.js";var n=e({shadowMapVertexMetricWGSL:()=>a}),r=`shadowMapVertexMetric`,i=`#if SM_USEDISTANCE==1
vertexOutputs.vPositionWSM=worldPos.xyz;
#endif
#if SM_DEPTHTEXTURE==1
#ifdef IS_NDC_HALF_ZRANGE
#define BIASFACTOR 0.5
#else
#define BIASFACTOR 1.0
#endif
#ifdef USE_REVERSE_DEPTHBUFFER
vertexOutputs.position.z-=uniforms.biasAndScaleSM.x*vertexOutputs.position.w*BIASFACTOR;
#else
vertexOutputs.position.z+=uniforms.biasAndScaleSM.x*vertexOutputs.position.w*BIASFACTOR;
#endif
#endif
#if defined(SM_DEPTHCLAMP) && SM_DEPTHCLAMP==1
vertexOutputs.zSM=vertexOutputs.position.z;vertexOutputs.position.z=0.0;
#elif SM_USEDISTANCE==0
#ifdef USE_REVERSE_DEPTHBUFFER
vertexOutputs.vDepthMetricSM=(-vertexOutputs.position.z+uniforms.depthValuesSM.x)/uniforms.depthValuesSM.y+uniforms.biasAndScaleSM.x;
#else
vertexOutputs.vDepthMetricSM=(vertexOutputs.position.z+uniforms.depthValuesSM.x)/uniforms.depthValuesSM.y+uniforms.biasAndScaleSM.x;
#endif
#endif
`;t.IncludesShadersStoreWGSL[r]||(t.IncludesShadersStoreWGSL[r]=i);var a={name:r,shader:i};export{n as t};