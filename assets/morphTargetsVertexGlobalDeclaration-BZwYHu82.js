import{K as e}from"./index-D-4xi28n.js";import{t}from"./shaderStore-DSzASZqB.js";var n=e({morphTargetsVertexGlobalDeclaration:()=>a}),r=`morphTargetsVertexGlobalDeclaration`,i=`#ifdef MORPHTARGETS
uniform float morphTargetInfluences[NUM_MORPH_INFLUENCERS];
#ifdef MORPHTARGETS_TEXTURE 
uniform float morphTargetTextureIndices[NUM_MORPH_INFLUENCERS];uniform vec3 morphTargetTextureInfo;uniform highp sampler2DArray morphTargets;vec3 readVector3FromRawSampler(int targetIndex,float vertexIndex)
{ 
#if defined(WEBGL2) || defined(WEBGPU)
int textureWidth=int(morphTargetTextureInfo.y);int y=int(vertexIndex)/textureWidth;int x=int(vertexIndex) % textureWidth;return texelFetch(morphTargets,ivec3(x,y,int(morphTargetTextureIndices[targetIndex])),0).xyz;
#else
float y=floor(vertexIndex/morphTargetTextureInfo.y);float x=vertexIndex-y*morphTargetTextureInfo.y;vec3 textureUV=vec3((x+0.5)/morphTargetTextureInfo.y,(y+0.5)/morphTargetTextureInfo.z,morphTargetTextureIndices[targetIndex]);return texture(morphTargets,textureUV).xyz;
#endif
}
vec4 readVector4FromRawSampler(int targetIndex,float vertexIndex)
{ 
#if defined(WEBGL2) || defined(WEBGPU)
int textureWidth=int(morphTargetTextureInfo.y);int y=int(vertexIndex)/textureWidth;int x=int(vertexIndex) % textureWidth;return texelFetch(morphTargets,ivec3(x,y,int(morphTargetTextureIndices[targetIndex])),0);
#else
float y=floor(vertexIndex/morphTargetTextureInfo.y);float x=vertexIndex-y*morphTargetTextureInfo.y;vec3 textureUV=vec3((x+0.5)/morphTargetTextureInfo.y,(y+0.5)/morphTargetTextureInfo.z,morphTargetTextureIndices[targetIndex]);return texture(morphTargets,textureUV);
#endif
}
#endif
#endif
`;t.IncludesShadersStore[r]||(t.IncludesShadersStore[r]=i);var a={name:r,shader:i};export{n as t};