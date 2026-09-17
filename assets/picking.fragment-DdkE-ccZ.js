import{L as e}from"./index-D9Qvglr-.js";import{t}from"./shaderStore-DSzASZqB.js";var n=e({pickingPixelShader:()=>a}),r=`pickingPixelShader`,i=`#if defined(INSTANCES)
flat varying float vMeshID;
#else
uniform float meshID;
#endif
void main(void) {float id;
#if defined(INSTANCES)
id=vMeshID;
#else
id=meshID;
#endif
#if defined(WEBGL2) || defined(WEBGPU) || defined(NATIVE)
int castedId=int(id);vec3 color=vec3(
float((castedId>>16) & 0xFF),
float((castedId>>8) & 0xFF),
float(castedId & 0xFF)
)/255.0;gl_FragColor=vec4(color,1.0);
#else
float castedId=floor(id+0.5);vec3 color=vec3(
floor(mod(castedId,16777216.0)/65536.0),
floor(mod(castedId,65536.0)/256.0),
mod(castedId,256.0)
)/255.0;gl_FragColor=vec4(color,1.0);
#endif
}
`;t.ShadersStore[r]||(t.ShadersStore[r]=i);var a={name:r,shader:i};export{n as t};