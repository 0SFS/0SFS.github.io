import { __decorate } from "../tslib.es6.js";
import { PostProcess } from "./postProcess.js";
import { RegisterClass } from "../Misc/typeStore.js";
import { serializeAsMatrix } from "../Misc/decorators.js";
import { SerializationHelper } from "../Misc/decorators.serialization.js";
import { ThinFilterPostProcess } from "./thinFilterPostProcess.js";
/**
 * Applies a kernel filter to the image
 */
export class FilterPostProcess extends PostProcess {
    /** The matrix to be applied to the image */
    get kernelMatrix() {
        return this._effectWrapper.kernelMatrix;
    }
    set kernelMatrix(value) {
        this._effectWrapper.kernelMatrix = value;
    }
    /**
     * Gets a string identifying the name of the class
     * @returns "FilterPostProcess" string
     */
    getClassName() {
        return "FilterPostProcess";
    }
    /**
     *
     * @param name The name of the effect.
     * @param kernelMatrix The matrix to be applied to the image
     * @param options The required width/height ratio to downsize to before computing the render pass.
     * @param camera The camera to apply the render pass to.
     * @param samplingMode The sampling mode to be used when computing the pass. (default: 0)
     * @param engine The engine which the post process will be applied. (default: current engine)
     * @param reusable If the post process can be reused on the same frame. (default: false)
     */
    constructor(name, kernelMatrix, options, camera, samplingMode, engine, reusable) {
        const localOptions = {
            uniforms: ThinFilterPostProcess.Uniforms,
            size: typeof options === "number" ? options : undefined,
            camera,
            samplingMode,
            engine,
            reusable,
            ...options,
        };
        super(name, ThinFilterPostProcess.FragmentUrl, {
            effectWrapper: typeof options === "number" || !options.effectWrapper ? new ThinFilterPostProcess(name, engine, localOptions) : undefined,
            ...localOptions,
        });
        this.kernelMatrix = kernelMatrix;
    }
    /**
     * @internal
     */
    static _Parse(parsedPostProcess, targetCamera, scene, rootUrl) {
        return SerializationHelper.Parse(() => {
            return new FilterPostProcess(parsedPostProcess.name, parsedPostProcess.kernelMatrix, parsedPostProcess.options, targetCamera, parsedPostProcess.renderTargetSamplingMode, scene.getEngine(), parsedPostProcess.reusable);
        }, parsedPostProcess, scene, rootUrl);
    }
}
__decorate([
    serializeAsMatrix()
], FilterPostProcess.prototype, "kernelMatrix", null);
RegisterClass("BABYLON.FilterPostProcess", FilterPostProcess);
//# sourceMappingURL=filterPostProcess.js.map