import{t as e}from"./shaderStore-DSzASZqB.js";var t=`sceneFragmentDeclaration`,n=`uniform mat4 viewProjection;
#ifdef MULTIVIEW
uniform mat4 viewProjectionR;
#endif
uniform mat4 view;uniform mat4 projection;uniform vec4 vEyePosition;
`;e.IncludesShadersStore[t]||(e.IncludesShadersStore[t]=n);