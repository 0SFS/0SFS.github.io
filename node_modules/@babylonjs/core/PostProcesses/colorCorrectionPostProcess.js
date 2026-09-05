import { __decorate } from "../tslib.es6.js";
import { PostProcess } from "./postProcess.js";
import { RegisterClass } from "../Misc/typeStore.js";
import { serialize } from "../Misc/decorators.js";
import { SerializationHelper } from "../Misc/decorators.serialization.js";
import { ThinColorCorrectionPostProcess } from "./thinColorCorrectionPostProcess.js";
/**
 *
 * This post-process allows the modification of rendered colors by using
 * a 'look-up table' (LUT). This effect is also called Color Grading.
 *
 * The object needs to be provided an url to a texture containing the color
 * look-up table: the texture must be 256 pixels wide and 16 pixels high.
 * Use an image editing software to tweak the LUT to match your needs.
 *
 * For an example of a color LUT, see here:
 * @see http://udn.epicgames.com/Three/rsrc/Three/ColorGrading/RGBTable16x1.png
 * For explanations on color grading, see here:
 * @see http://udn.epicgames.com/Three/ColorGrading.html
 *
 */
export class ColorCorrectionPostProcess extends PostProcess {
    /**
     * Gets the color table url used to create the LUT texture
     */
    get colorTableUrl() {
        return this._effectWrapper.colorTableUrl;
    }
    /**
     * Gets a string identifying the name of the class
     * @returns "ColorCorrectionPostProcess" string
     */
    getClassName() {
        return "ColorCorrectionPostProcess";
    }
    constructor(name, colorTableUrl, options, camera, samplingMode, engine, reusable) {
        const localOptions = {
            samplers: ThinColorCorrectionPostProcess.Samplers,
            size: typeof options === "number" ? options : undefined,
            camera,
            samplingMode,
            engine,
            reusable,
            ...options,
        };
        const scene = camera?.getScene() || null;
        super(name, ThinColorCorrectionPostProcess.FragmentUrl, {
            effectWrapper: typeof options === "number" || !options.effectWrapper ? new ThinColorCorrectionPostProcess(name, scene, colorTableUrl, localOptions) : undefined,
            ...localOptions,
        });
    }
    /**
     * @internal
     */
    static _Parse(parsedPostProcess, targetCamera, scene, rootUrl) {
        return SerializationHelper.Parse(() => {
            return new ColorCorrectionPostProcess(parsedPostProcess.name, parsedPostProcess.colorTableUrl, parsedPostProcess.options, targetCamera, parsedPostProcess.renderTargetSamplingMode, scene.getEngine(), parsedPostProcess.reusable);
        }, parsedPostProcess, scene, rootUrl);
    }
}
__decorate([
    serialize()
], ColorCorrectionPostProcess.prototype, "colorTableUrl", null);
RegisterClass("BABYLON.ColorCorrectionPostProcess", ColorCorrectionPostProcess);
//# sourceMappingURL=colorCorrectionPostProcess.js.map