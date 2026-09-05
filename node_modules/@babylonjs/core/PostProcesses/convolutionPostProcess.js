import { __decorate } from "../tslib.es6.js";
import { PostProcess } from "./postProcess.js";

import { RegisterClass } from "../Misc/typeStore.js";
import { serialize } from "../Misc/decorators.js";
import { SerializationHelper } from "../Misc/decorators.serialization.js";
import { ThinConvolutionPostProcess } from "./thinConvolutionPostProcess.js";
/**
 * The ConvolutionPostProcess applies a 3x3 kernel to every pixel of the
 * input texture to perform effects such as edge detection or sharpening
 * See http://en.wikipedia.org/wiki/Kernel_(image_processing)
 */
export class ConvolutionPostProcess extends PostProcess {
    /** Array of 9 values corresponding to the 3x3 kernel to be applied */
    get kernel() {
        return this._effectWrapper.kernel;
    }
    set kernel(value) {
        this._effectWrapper.kernel = value;
    }
    /**
     * Gets a string identifying the name of the class
     * @returns "ConvolutionPostProcess" string
     */
    getClassName() {
        return "ConvolutionPostProcess";
    }
    /**
     * Creates a new instance ConvolutionPostProcess
     * @param name The name of the effect.
     * @param kernel Array of 9 values corresponding to the 3x3 kernel to be applied
     * @param options The required width/height ratio to downsize to before computing the render pass.
     * @param camera The camera to apply the render pass to.
     * @param samplingMode The sampling mode to be used when computing the pass. (default: 0)
     * @param engine The engine which the post process will be applied. (default: current engine)
     * @param reusable If the post process can be reused on the same frame. (default: false)
     * @param textureType Type of textures used when performing the post process. (default: 0)
     */
    constructor(name, kernel, options, camera, samplingMode, engine, reusable, textureType = 0) {
        const localOptions = {
            uniforms: ThinConvolutionPostProcess.Uniforms,
            size: typeof options === "number" ? options : undefined,
            camera,
            samplingMode,
            engine,
            reusable,
            textureType,
            ...options,
        };
        super(name, ThinConvolutionPostProcess.FragmentUrl, {
            effectWrapper: typeof options === "number" || !options.effectWrapper ? new ThinConvolutionPostProcess(name, engine, kernel, localOptions) : undefined,
            ...localOptions,
        });
        this.onApply = (_effect) => {
            this._effectWrapper.textureWidth = this.width;
            this._effectWrapper.textureHeight = this.height;
        };
    }
    /**
     * @internal
     */
    static _Parse(parsedPostProcess, targetCamera, scene, rootUrl) {
        return SerializationHelper.Parse(() => {
            return new ConvolutionPostProcess(parsedPostProcess.name, parsedPostProcess.kernel, parsedPostProcess.options, targetCamera, parsedPostProcess.renderTargetSamplingMode, scene.getEngine(), parsedPostProcess.reusable, parsedPostProcess.textureType);
        }, parsedPostProcess, scene, rootUrl);
    }
}
// Statics
/**
 * Edge detection 0 see https://en.wikipedia.org/wiki/Kernel_(image_processing)
 */
ConvolutionPostProcess.EdgeDetect0Kernel = ThinConvolutionPostProcess.EdgeDetect0Kernel;
/**
 * Edge detection 1 see https://en.wikipedia.org/wiki/Kernel_(image_processing)
 */
ConvolutionPostProcess.EdgeDetect1Kernel = ThinConvolutionPostProcess.EdgeDetect1Kernel;
/**
 * Edge detection 2 see https://en.wikipedia.org/wiki/Kernel_(image_processing)
 */
ConvolutionPostProcess.EdgeDetect2Kernel = ThinConvolutionPostProcess.EdgeDetect2Kernel;
/**
 * Kernel to sharpen an image see https://en.wikipedia.org/wiki/Kernel_(image_processing)
 */
ConvolutionPostProcess.SharpenKernel = ThinConvolutionPostProcess.SharpenKernel;
/**
 * Kernel to emboss an image see https://en.wikipedia.org/wiki/Kernel_(image_processing)
 */
ConvolutionPostProcess.EmbossKernel = ThinConvolutionPostProcess.EmbossKernel;
/**
 * Kernel to blur an image see https://en.wikipedia.org/wiki/Kernel_(image_processing)
 */
ConvolutionPostProcess.GaussianKernel = ThinConvolutionPostProcess.GaussianKernel;
__decorate([
    serialize()
], ConvolutionPostProcess.prototype, "kernel", null);
RegisterClass("BABYLON.ConvolutionPostProcess", ConvolutionPostProcess);
//# sourceMappingURL=convolutionPostProcess.js.map