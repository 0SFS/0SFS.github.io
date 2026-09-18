import{R as e}from"./index-C-Y6kbze.js";import{t}from"./shaderStore-DSzASZqB.js";import"./boundingBoxRendererUboDeclaration-B93qnGvh.js";var n=`boundingBoxRendererFragmentDeclaration`,r=`uniform vec4 color;
`;t.IncludesShadersStore[n]||(t.IncludesShadersStore[n]=r);var i=e({boundingBoxRendererPixelShader:()=>s}),a=`boundingBoxRendererPixelShader`,o=`#include<__decl__boundingBoxRendererFragment>
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
gl_FragColor=color;
#define CUSTOM_FRAGMENT_MAIN_END
}`;t.ShadersStore[a]||(t.ShadersStore[a]=o);var s={name:a,shader:o};export{i as t};