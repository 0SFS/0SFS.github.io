import{kt as e}from"./index-D-LiCatK.js";import{t}from"./shaderStore-CU9wbwKM.js";import"./clipPlaneFragmentDeclaration-CVl6orhe.js";import"./fogFragmentDeclaration-yGIAp2fk.js";import"./fogFragment-9jPwjgfw.js";import"./clipPlaneFragment-BATznvML.js";var n=e({colorPixelShader:()=>a}),r=`colorPixelShader`,i=`#if defined(VERTEXCOLOR) || defined(INSTANCESCOLOR) && defined(INSTANCES)
#define VERTEXCOLOR
varying vec4 vColor;
#else
uniform vec4 color;
#endif
#include<clipPlaneFragmentDeclaration>
#include<fogFragmentDeclaration>
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
#include<clipPlaneFragment>
#if defined(VERTEXCOLOR) || defined(INSTANCESCOLOR) && defined(INSTANCES)
gl_FragColor=vColor;
#else
gl_FragColor=color;
#endif
#include<fogFragment>(color,gl_FragColor)
#define CUSTOM_FRAGMENT_MAIN_END
}`;t.ShadersStore[r]||(t.ShadersStore[r]=i);var a={name:r,shader:i};export{n as t};