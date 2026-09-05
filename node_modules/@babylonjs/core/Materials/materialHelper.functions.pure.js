/** This file must only contain pure code and pure imports */
// All non-type imports must be pure

import { Logger } from "../Misc/logger.js";
// All code must be pure
/**
 * Binds the logarithmic depth information from the scene to the effect for the given defines.
 * @param defines The generated defines used in the effect
 * @param effect The effect we are binding the data to
 * @param scene The scene we are willing to render with logarithmic scale for
 */
export function BindLogDepth(defines, effect, scene) {
    if (!defines || defines["LOGARITHMICDEPTH"] || (defines.indexOf && defines.indexOf("LOGARITHMICDEPTH") >= 0)) {
        const camera = scene.activeCamera;
        if (camera.mode === 1) {
            Logger.Error("Logarithmic depth is not compatible with orthographic cameras!", 20);
        }
        effect.setFloat("logarithmicDepthConstant", 2.0 / (Math.log(camera.maxZ + 1.0) / Math.LN2));
    }
}
//# sourceMappingURL=materialHelper.functions.pure.js.map