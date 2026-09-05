import { __decorate } from "../../../../tslib.es6.js";
import { RegisterClass } from "../../../../Misc/typeStore.js";
import { editableInPropertyPage } from "../../../../Decorators/nodeDecorator.js";
import { FrameGraphTonemapTask } from "../../../Tasks/PostProcesses/tonemapTask.js";
import { ThinTonemapPostProcess } from "../../../../PostProcesses/thinTonemapPostProcess.js";
import { NodeRenderGraphBaseWithPropertiesPostProcessBlock } from "./baseWithPropertiesPostProcessBlock.js";
/**
 * Block that implements the tonemap post process
 */
export class NodeRenderGraphTonemapPostProcessBlock extends NodeRenderGraphBaseWithPropertiesPostProcessBlock {
    /**
     * Gets the frame graph task associated with this block
     */
    get task() {
        return this._frameGraphTask;
    }
    /**
     * Create a new NodeRenderGraphTonemapPostProcessBlock
     * @param name defines the block name
     * @param frameGraph defines the hosting frame graph
     * @param scene defines the hosting scene
     * @param operator defines the operator to use (default: Reinhard)
     */
    constructor(name, frameGraph, scene, operator = 1 /* TonemappingOperator.Reinhard */) {
        super(name, frameGraph, scene);
        this._additionalConstructionParameters = [operator];
        this._finalizeInputOutputRegistering();
        this._frameGraphTask = new FrameGraphTonemapTask(this.name, frameGraph, new ThinTonemapPostProcess(name, frameGraph.engine, { operator }));
    }
    _createTask(operator) {
        const sourceSamplingMode = this._frameGraphTask.sourceSamplingMode;
        const exposureAdjustment = this._frameGraphTask.postProcess.exposureAdjustment;
        this._frameGraphTask.dispose();
        this._frameGraphTask = new FrameGraphTonemapTask(this.name, this._frameGraph, new ThinTonemapPostProcess(this.name, this._frameGraph.engine, { operator }));
        this._frameGraphTask.sourceSamplingMode = sourceSamplingMode;
        this._frameGraphTask.postProcess.exposureAdjustment = exposureAdjustment;
        this._additionalConstructionParameters = [operator];
    }
    get operator() {
        return this._frameGraphTask.postProcess.operator;
    }
    set operator(value) {
        this._createTask(value);
    }
    /** Defines the required exposure adjustment */
    get exposureAdjustment() {
        return this._frameGraphTask.postProcess.exposureAdjustment;
    }
    set exposureAdjustment(value) {
        this._frameGraphTask.postProcess.exposureAdjustment = value;
    }
    /**
     * Gets the current class name
     * @returns the class name
     */
    getClassName() {
        return "NodeRenderGraphTonemapPostProcessBlock";
    }
    _dumpPropertiesCode() {
        const codes = [];
        codes.push(`${this._codeVariableName}.exposureAdjustment = ${this.exposureAdjustment};`);
        return super._dumpPropertiesCode() + codes.join("\n");
    }
    serialize() {
        const serializationObject = super.serialize();
        serializationObject.exposureAdjustment = this.exposureAdjustment;
        return serializationObject;
    }
    _deserialize(serializationObject) {
        super._deserialize(serializationObject);
        this.exposureAdjustment = serializationObject.exposureAdjustment;
    }
}
__decorate([
    editableInPropertyPage("Operator", 5 /* PropertyTypeForEdition.List */, "PROPERTIES", {
        options: [
            { label: "Hable", value: 0 /* TonemappingOperator.Hable */ },
            { label: "Reinhard", value: 1 /* TonemappingOperator.Reinhard */ },
            { label: "HejiDawson", value: 2 /* TonemappingOperator.HejiDawson */ },
            { label: "Photographic", value: 3 /* TonemappingOperator.Photographic */ },
        ],
    })
], NodeRenderGraphTonemapPostProcessBlock.prototype, "operator", null);
__decorate([
    editableInPropertyPage("Exposure adjustment", 1 /* PropertyTypeForEdition.Float */, "PROPERTIES")
], NodeRenderGraphTonemapPostProcessBlock.prototype, "exposureAdjustment", null);
RegisterClass("BABYLON.NodeRenderGraphTonemapPostProcessBlock", NodeRenderGraphTonemapPostProcessBlock);
//# sourceMappingURL=tonemapPostProcessBlock.js.map