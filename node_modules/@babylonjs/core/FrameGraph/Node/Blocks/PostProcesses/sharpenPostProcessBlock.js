import { __decorate } from "../../../../tslib.es6.js";
import { RegisterClass } from "../../../../Misc/typeStore.js";
import { editableInPropertyPage } from "../../../../Decorators/nodeDecorator.js";
import { FrameGraphSharpenTask } from "../../../Tasks/PostProcesses/sharpenTask.js";
import { ThinSharpenPostProcess } from "../../../../PostProcesses/thinSharpenPostProcess.js";
import { NodeRenderGraphBaseWithPropertiesPostProcessBlock } from "./baseWithPropertiesPostProcessBlock.js";
/**
 * Block that implements the sharpen post process
 */
export class NodeRenderGraphSharpenPostProcessBlock extends NodeRenderGraphBaseWithPropertiesPostProcessBlock {
    /**
     * Gets the frame graph task associated with this block
     */
    get task() {
        return this._frameGraphTask;
    }
    /**
     * Create a new sharpen post process block
     * @param name defines the block name
     * @param frameGraph defines the hosting frame graph
     * @param scene defines the hosting scene
     */
    constructor(name, frameGraph, scene) {
        super(name, frameGraph, scene);
        this._finalizeInputOutputRegistering();
        this._frameGraphTask = new FrameGraphSharpenTask(this.name, frameGraph, new ThinSharpenPostProcess(name, scene.getEngine()));
    }
    /** How much of the original color should be applied. Setting this to 0 will display edge detection. */
    get colorAmount() {
        return this._frameGraphTask.postProcess.colorAmount;
    }
    set colorAmount(value) {
        this._frameGraphTask.postProcess.colorAmount = value;
    }
    /** How much sharpness should be applied. */
    get edgeAmount() {
        return this._frameGraphTask.postProcess.edgeAmount;
    }
    set edgeAmount(value) {
        this._frameGraphTask.postProcess.edgeAmount = value;
    }
    /**
     * Gets the current class name
     * @returns the class name
     */
    getClassName() {
        return "NodeRenderGraphSharpenPostProcessBlock";
    }
    _dumpPropertiesCode() {
        const codes = [];
        codes.push(`${this._codeVariableName}.colorAmount = ${this.colorAmount};`);
        codes.push(`${this._codeVariableName}.edgeAmount = ${this.edgeAmount};`);
        return super._dumpPropertiesCode() + codes.join("\n");
    }
    serialize() {
        const serializationObject = super.serialize();
        serializationObject.colorAmount = this.colorAmount;
        serializationObject.edgeAmount = this.edgeAmount;
        return serializationObject;
    }
    _deserialize(serializationObject) {
        super._deserialize(serializationObject);
        this.colorAmount = serializationObject.colorAmount;
        this.edgeAmount = serializationObject.edgeAmount;
    }
}
__decorate([
    editableInPropertyPage("Color Amount", 1 /* PropertyTypeForEdition.Float */, "PROPERTIES", { min: 0, max: 3 })
], NodeRenderGraphSharpenPostProcessBlock.prototype, "colorAmount", null);
__decorate([
    editableInPropertyPage("Edge Amount", 1 /* PropertyTypeForEdition.Float */, "PROPERTIES", { min: 0, max: 5 })
], NodeRenderGraphSharpenPostProcessBlock.prototype, "edgeAmount", null);
RegisterClass("BABYLON.NodeRenderGraphSharpenPostProcessBlock", NodeRenderGraphSharpenPostProcessBlock);
//# sourceMappingURL=sharpenPostProcessBlock.js.map