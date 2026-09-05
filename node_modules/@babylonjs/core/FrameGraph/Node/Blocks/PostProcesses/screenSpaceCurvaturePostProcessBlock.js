import { __decorate } from "../../../../tslib.es6.js";
import { RegisterClass } from "../../../../Misc/typeStore.js";
import { NodeRenderGraphBlockConnectionPointTypes } from "../../Types/nodeRenderGraphTypes.js";
import { editableInPropertyPage } from "../../../../Decorators/nodeDecorator.js";
import { FrameGraphScreenSpaceCurvatureTask } from "../../../Tasks/PostProcesses/screenSpaceCurvatureTask.js";
import { ThinScreenSpaceCurvaturePostProcess } from "../../../../PostProcesses/thinScreenSpaceCurvaturePostProcess.js";
import { NodeRenderGraphBaseWithPropertiesPostProcessBlock } from "./baseWithPropertiesPostProcessBlock.js";
/**
 * Block that implements the screen space curvature post process
 */
export class NodeRenderGraphScreenSpaceCurvaturePostProcessBlock extends NodeRenderGraphBaseWithPropertiesPostProcessBlock {
    /**
     * Gets the frame graph task associated with this block
     */
    get task() {
        return this._frameGraphTask;
    }
    /**
     * Create a new NodeRenderGraphScreenSpaceCurvaturePostProcessBlock
     * @param name defines the block name
     * @param frameGraph defines the hosting frame graph
     * @param scene defines the hosting scene
     */
    constructor(name, frameGraph, scene) {
        super(name, frameGraph, scene);
        this.registerInput("geomViewNormal", NodeRenderGraphBlockConnectionPointTypes.TextureViewNormal);
        this._finalizeInputOutputRegistering();
        this._frameGraphTask = new FrameGraphScreenSpaceCurvatureTask(this.name, frameGraph, new ThinScreenSpaceCurvaturePostProcess(name, scene.getEngine()));
    }
    /** Defines how much ridge the curvature effect displays. */
    get ridge() {
        return this._frameGraphTask.postProcess.ridge;
    }
    set ridge(value) {
        this._frameGraphTask.postProcess.ridge = value;
    }
    /** Defines how much valley the curvature effect displays. */
    get valley() {
        return this._frameGraphTask.postProcess.valley;
    }
    set valley(value) {
        this._frameGraphTask.postProcess.valley = value;
    }
    /**
     * Gets the current class name
     * @returns the class name
     */
    getClassName() {
        return "NodeRenderGraphScreenSpaceCurvaturePostProcessBlock";
    }
    /**
     * Gets the geometry view normal input component
     */
    get geomViewNormal() {
        return this._inputs[2];
    }
    _buildBlock(state) {
        super._buildBlock(state);
        this._frameGraphTask.normalTexture = this.geomViewNormal.connectedPoint?.value;
    }
    _dumpPropertiesCode() {
        const codes = [];
        codes.push(`${this._codeVariableName}.ridge = ${this.ridge};`);
        codes.push(`${this._codeVariableName}.valley = ${this.valley};`);
        return super._dumpPropertiesCode() + codes.join("\n");
    }
    serialize() {
        const serializationObject = super.serialize();
        serializationObject.ridge = this.ridge;
        serializationObject.valley = this.valley;
        return serializationObject;
    }
    _deserialize(serializationObject) {
        super._deserialize(serializationObject);
        this.ridge = serializationObject.ridge;
        this.valley = serializationObject.valley;
    }
}
__decorate([
    editableInPropertyPage("Ridge", 1 /* PropertyTypeForEdition.Float */, "PROPERTIES", { min: 0, max: 1 })
], NodeRenderGraphScreenSpaceCurvaturePostProcessBlock.prototype, "ridge", null);
__decorate([
    editableInPropertyPage("Valley", 1 /* PropertyTypeForEdition.Float */, "PROPERTIES", { min: 0, max: 1 })
], NodeRenderGraphScreenSpaceCurvaturePostProcessBlock.prototype, "valley", null);
RegisterClass("BABYLON.NodeRenderGraphScreenSpaceCurvaturePostProcessBlock", NodeRenderGraphScreenSpaceCurvaturePostProcessBlock);
//# sourceMappingURL=screenSpaceCurvaturePostProcessBlock.js.map