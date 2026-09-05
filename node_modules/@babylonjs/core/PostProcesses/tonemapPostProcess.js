import { __decorate } from "../tslib.es6.js";
import { Camera } from "../Cameras/camera.js";
import { PostProcess } from "./postProcess.js";

import { RegisterClass } from "../Misc/typeStore.js";
import { serialize } from "../Misc/decorators.js";
import { SerializationHelper } from "../Misc/decorators.serialization.js";
import { ThinTonemapPostProcess } from "./thinTonemapPostProcess.js";
/**
 * Defines a post process to apply tone mapping
 */
export class TonemapPostProcess extends PostProcess {
    /**
     * Defines the required exposure adjustment
     */
    get exposureAdjustment() {
        return this._effectWrapper.exposureAdjustment;
    }
    set exposureAdjustment(value) {
        this._effectWrapper.exposureAdjustment = value;
    }
    /**
     * Gets the operator used for tonemapping
     */
    get operator() {
        return this._effectWrapper.operator;
    }
    /**
     * Gets a string identifying the name of the class
     * @returns "TonemapPostProcess" string
     */
    getClassName() {
        return "TonemapPostProcess";
    }
    /**
     * Creates a new TonemapPostProcess
     * @param name defines the name of the postprocess
     * @param operator defines the operator to use
     * @param exposureAdjustment defines the required exposure adjustment
     * @param camera defines the camera to use (can be null)
     * @param samplingMode defines the required sampling mode (BABYLON.Texture.BILINEAR_SAMPLINGMODE by default)
     * @param engine defines the hosting engine (can be ignore if camera is set)
     * @param textureType defines the texture format to use (BABYLON.Engine.TEXTURETYPE_UNSIGNED_BYTE by default)
     * @param reusable If the post process can be reused on the same frame. (default: false)
     */
    constructor(name, operator, exposureAdjustment, camera, samplingMode = 2, engine, textureType = 0, reusable) {
        const cameraIsCamera = camera === null || camera instanceof Camera;
        const localOptions = {
            operator,
            exposureAdjustment,
            uniforms: ThinTonemapPostProcess.Uniforms,
            camera: cameraIsCamera ? camera : undefined,
            samplingMode,
            engine,
            reusable,
            textureType,
        };
        if (!cameraIsCamera) {
            Object.assign(localOptions, camera);
        }
        super(name, ThinTonemapPostProcess.FragmentUrl, {
            effectWrapper: cameraIsCamera || !camera.effectWrapper ? new ThinTonemapPostProcess(name, engine, localOptions) : undefined,
            ...localOptions,
        });
    }
    /**
     * @internal
     */
    static _Parse(parsedPostProcess, targetCamera, scene, rootUrl) {
        return SerializationHelper.Parse(() => {
            return new TonemapPostProcess(parsedPostProcess.name, parsedPostProcess.operator, parsedPostProcess.exposureAdjustment, targetCamera, parsedPostProcess.renderTargetSamplingMode, scene.getEngine(), parsedPostProcess.textureType, parsedPostProcess.reusable);
        }, parsedPostProcess, scene, rootUrl);
    }
}
__decorate([
    serialize()
], TonemapPostProcess.prototype, "exposureAdjustment", null);
__decorate([
    serialize()
], TonemapPostProcess.prototype, "operator", null);
RegisterClass("BABYLON.TonemapPostProcess", TonemapPostProcess);
//# sourceMappingURL=tonemapPostProcess.js.map