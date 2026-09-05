import { __decorate } from "../../../../tslib.es6.js";
import { RegisterClass } from "../../../../Misc/typeStore.js";
import { NodeRenderGraphBlockConnectionPointTypes } from "../../Types/nodeRenderGraphTypes.js";
import { editableInPropertyPage } from "../../../../Decorators/nodeDecorator.js";
import { FrameGraphTAATask } from "../../../Tasks/PostProcesses/taaTask.js";
import { NodeRenderGraphConnectionPointCustomObject } from "../../nodeRenderGraphConnectionPointCustomObject.js";
import { NodeRenderGraphBaseObjectRendererBlock } from "../Rendering/baseObjectRendererBlock.js";
import { NodeRenderGraphBaseWithPropertiesPostProcessBlock } from "./baseWithPropertiesPostProcessBlock.js";
/**
 * Block that implements the TAA post process
 */
export class NodeRenderGraphTAAPostProcessBlock extends NodeRenderGraphBaseWithPropertiesPostProcessBlock {
    /**
     * Gets the frame graph task associated with this block
     */
    get task() {
        return this._frameGraphTask;
    }
    /**
     * Create a new NodeRenderGraphTAAPostProcessBlock
     * @param name defines the block name
     * @param frameGraph defines the hosting frame graph
     * @param scene defines the hosting scene
     */
    constructor(name, frameGraph, scene) {
        super(name, frameGraph, scene);
        this.registerInput("objectRenderer", NodeRenderGraphBlockConnectionPointTypes.Object, false, new NodeRenderGraphConnectionPointCustomObject("objectRenderer", this, 0 /* NodeRenderGraphConnectionPointDirection.Input */, NodeRenderGraphBaseObjectRendererBlock, "NodeRenderGraphBaseObjectRendererBlock"));
        this.registerInput("geomVelocity", NodeRenderGraphBlockConnectionPointTypes.TextureLinearVelocity, true);
        this._finalizeInputOutputRegistering();
        this._frameGraphTask = new FrameGraphTAATask(this.name, frameGraph);
    }
    /** Number of accumulated samples */
    get samples() {
        return this._frameGraphTask.postProcess.samples;
    }
    set samples(value) {
        this._frameGraphTask.postProcess.samples = value;
    }
    /** The factor used to blend the history frame with current frame */
    get factor() {
        return this._frameGraphTask.postProcess.factor;
    }
    set factor(value) {
        this._frameGraphTask.postProcess.factor = value;
    }
    /** Enables reprojecting the history texture with a per-pixel velocity */
    get reprojectHistory() {
        return this._frameGraphTask.postProcess.reprojectHistory;
    }
    set reprojectHistory(value) {
        this._frameGraphTask.postProcess.reprojectHistory = value;
    }
    /** Clamps the history pixel to the min and max of the 3x3 pixels surrounding the target pixel */
    get clampHistory() {
        return this._frameGraphTask.postProcess.clampHistory;
    }
    set clampHistory(value) {
        this._frameGraphTask.postProcess.clampHistory = value;
    }
    /** Indicates if depth testing must be enabled or disabled */
    get disableOnCameraMove() {
        return this._frameGraphTask.postProcess.disableOnCameraMove;
    }
    set disableOnCameraMove(value) {
        this._frameGraphTask.postProcess.disableOnCameraMove = value;
    }
    /** Indicates if TAA must be enabled or disabled */
    get disableTAA() {
        return this._frameGraphTask.postProcess.disabled;
    }
    set disableTAA(value) {
        this._frameGraphTask.postProcess.disabled = value;
    }
    /**
     * Gets the current class name
     * @returns the class name
     */
    getClassName() {
        return "NodeRenderGraphTAAPostProcessBlock";
    }
    /**
     * Gets the object renderer input component
     */
    get objectRenderer() {
        return this._inputs[2];
    }
    /**
     * Gets the geometry velocity input component
     */
    get geomVelocity() {
        return this._inputs[3];
    }
    _buildBlock(state) {
        super._buildBlock(state);
        this._frameGraphTask.objectRendererTask = this.objectRenderer.connectedPoint?.value;
        this._frameGraphTask.velocityTexture = this.geomVelocity.connectedPoint?.value;
    }
    _dumpPropertiesCode() {
        const codes = [];
        codes.push(`${this._codeVariableName}.samples = ${this.samples};`);
        codes.push(`${this._codeVariableName}.factor = ${this.factor};`);
        codes.push(`${this._codeVariableName}.clampHistory = ${this.clampHistory};`);
        codes.push(`${this._codeVariableName}.reprojectHistory = ${this.reprojectHistory};`);
        codes.push(`${this._codeVariableName}.disableOnCameraMove = ${this.disableOnCameraMove};`);
        codes.push(`${this._codeVariableName}.disableTAA = ${this.disableTAA};`);
        return super._dumpPropertiesCode() + codes.join("\n");
    }
    serialize() {
        const serializationObject = super.serialize();
        serializationObject.samples = this.samples;
        serializationObject.factor = this.factor;
        serializationObject.clampHistory = this.clampHistory;
        serializationObject.reprojectHistory = this.reprojectHistory;
        serializationObject.disableOnCameraMove = this.disableOnCameraMove;
        serializationObject.disableTAA = this.disableTAA;
        return serializationObject;
    }
    _deserialize(serializationObject) {
        super._deserialize(serializationObject);
        this.samples = serializationObject.samples;
        this.factor = serializationObject.factor;
        this.clampHistory = serializationObject.clampHistory;
        this.reprojectHistory = serializationObject.reprojectHistory;
        this.disableOnCameraMove = serializationObject.disableOnCameraMove;
        this.disableTAA = serializationObject.disableTAA;
    }
}
__decorate([
    editableInPropertyPage("Samples", 2 /* PropertyTypeForEdition.Int */, "PROPERTIES")
], NodeRenderGraphTAAPostProcessBlock.prototype, "samples", null);
__decorate([
    editableInPropertyPage("Factor", 1 /* PropertyTypeForEdition.Float */, "PROPERTIES")
], NodeRenderGraphTAAPostProcessBlock.prototype, "factor", null);
__decorate([
    editableInPropertyPage("Reproject history", 0 /* PropertyTypeForEdition.Boolean */, "PROPERTIES")
], NodeRenderGraphTAAPostProcessBlock.prototype, "reprojectHistory", null);
__decorate([
    editableInPropertyPage("Clamp history", 0 /* PropertyTypeForEdition.Boolean */, "PROPERTIES")
], NodeRenderGraphTAAPostProcessBlock.prototype, "clampHistory", null);
__decorate([
    editableInPropertyPage("Disable on camera move", 0 /* PropertyTypeForEdition.Boolean */, "PROPERTIES")
], NodeRenderGraphTAAPostProcessBlock.prototype, "disableOnCameraMove", null);
__decorate([
    editableInPropertyPage("Disable TAA", 0 /* PropertyTypeForEdition.Boolean */, "PROPERTIES")
], NodeRenderGraphTAAPostProcessBlock.prototype, "disableTAA", null);
RegisterClass("BABYLON.NodeRenderGraphTAAPostProcessBlock", NodeRenderGraphTAAPostProcessBlock);
//# sourceMappingURL=taaPostProcessBlock.js.map