// Do not edit.
import { ShaderStore } from "../../Engines/shaderStore.js";
const name = "openpbrDielectricReflectance";
const shader = `struct ReflectanceParams
{float F0;float F90;vec3 coloredF0;vec3 coloredF90;};
#define pbr_inline
ReflectanceParams dielectricReflectance(
in float insideIOR,in float outsideIOR,in vec3 specularColor,in float specularWeight
)
{ReflectanceParams outParams;float dielectricF0=pow((insideIOR-outsideIOR)/(insideIOR+outsideIOR),2.0);float dielectricF0_NoSpec=pow((1.0-outsideIOR)/(1.0+outsideIOR),2.0);float f90Scale=clamp(2.0*abs(insideIOR-outsideIOR),0.0,1.0);float f90Scale_NoSpec=clamp(2.0*abs(1.0-outsideIOR),0.0,1.0);
#if (DIELECTRIC_SPECULAR_MODEL==DIELECTRIC_SPECULAR_MODEL_OPENPBR)
vec3 dielectricColorF90=specularColor.rgb*vec3(f90Scale);vec3 dielectricColorF90_NoSpec=specularColor.rgb*vec3(f90Scale_NoSpec);
#else
vec3 dielectricColorF90=vec3(f90Scale);vec3 dielectricColorF90_NoSpec=vec3(f90Scale_NoSpec);
#endif
#if DIELECTRIC_SPECULAR_MODEL==DIELECTRIC_SPECULAR_MODEL_GLTF
float maxF0=max(specularColor.r,max(specularColor.g,specularColor.b));outParams.F0=mix(dielectricF0_NoSpec,dielectricF0,specularWeight)*maxF0;
#else
outParams.F0=mix(dielectricF0_NoSpec,dielectricF0,specularWeight);
#endif
outParams.F90=mix(f90Scale_NoSpec,f90Scale,specularWeight);outParams.coloredF0=mix(vec3(dielectricF0_NoSpec),vec3(dielectricF0),specularWeight)*specularColor.rgb;outParams.coloredF90=mix(dielectricColorF90_NoSpec,dielectricColorF90,specularWeight);return outParams;}
`;
// Sideeffect
if (!ShaderStore.IncludesShadersStore[name]) {
    ShaderStore.IncludesShadersStore[name] = shader;
}
/** @internal */
export const openpbrDielectricReflectance = { name, shader };
//# sourceMappingURL=openpbrDielectricReflectance.js.map