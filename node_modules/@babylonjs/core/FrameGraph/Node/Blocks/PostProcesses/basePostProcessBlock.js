import { __decorate } from "../../../../tslib.es6.js";
import { NodeRenderGraphBlock } from "../../nodeRenderGraphBlock.js";
import { NodeRenderGraphBlockConnectionPointTypes } from "../../Types/nodeRenderGraphTypes.js";
import { editableInPropertyPage } from "../../../../Decorators/nodeDecorator.js";

/**
 * Base class for post process like blocks.
 */
export class NodeRenderGraphBasePostProcessBlock extends NodeRenderGraphBlock {
    /**
     * Create a new NodeRenderGraphBasePostProcessBlock
     * @param name defines the block name
     * @param frameGraph defines the hosting frame graph
     * @param scene defines the hosting scene
     */
    constructor(name, frameGraph, scene) {
        super(name, frameGraph, scene);
        this.registerInput("source", NodeRenderGraphBlockConnectionPointTypes.AutoDetect);
        this.registerInput("target", NodeRenderGraphBlockConnectionPointTypes.AutoDetect, true);
        this.source.addExcludedConnectionPointFromAllowedTypes(NodeRenderGraphBlockConnectionPointTypes.TextureAllButBackBuffer);
        this.target.addExcludedConnectionPointFromAllowedTypes(NodeRenderGraphBlockConnectionPointTypes.TextureAll);
    }
    _finalizeInputOutputRegistering() {
        this._addDependenciesInput();
        this.registerOutput("output", NodeRenderGraphBlockConnectionPointTypes.BasedOnInput);
        this.output._typeConnectionSource = () => {
            return this.target.isConnected ? this.target : this.source;
        };
    }
    /** Sampling mode used to sample from the source texture */
    get sourceSamplingMode() {
        return this._frameGraphTask.sourceSamplingMode;
    }
    set sourceSamplingMode(value) {
        this._frameGraphTask.sourceSamplingMode = value;
    }
    /** The alpha mode to use when applying the post process. */
    get alphaMode() {
        return this._frameGraphTask.alphaMode;
    }
    set alphaMode(value) {
        this._frameGraphTask.alphaMode = value;
    }
    /**
     * Gets the current class name
     * @returns the class name
     */
    getClassName() {
        return "NodeRenderGraphBasePostProcessBlock";
    }
    /**
     * Gets the source input component
     */
    get source() {
        return this._inputs[0];
    }
    /**
     * Gets the target input component
     */
    get target() {
        return this._inputs[1];
    }
    /**
     * Gets the output component
     */
    get output() {
        return this._outputs[0];
    }
    _buildBlock(state) {
        super._buildBlock(state);
        this.output.value = this._frameGraphTask.outputTexture;
        this._frameGraphTask.sourceTexture = this.source.connectedPoint?.value;
        this._frameGraphTask.targetTexture = this.target.connectedPoint?.value;
    }
    _dumpPropertiesCode() {
        const codes = [];
        codes.push(`${this._codeVariableName}.sourceSamplingMode = ${this.sourceSamplingMode};`);
        codes.push(`${this._codeVariableName}.alphaMode = ${this.alphaMode};`);
        return super._dumpPropertiesCode() + codes.join("\n");
    }
    serialize() {
        const serializationObject = super.serialize();
        serializationObject.sourceSamplingMode = this.sourceSamplingMode;
        serializationObject.alphaMode = this.alphaMode;
        return serializationObject;
    }
    _deserialize(serializationObject) {
        super._deserialize(serializationObject);
        this.sourceSamplingMode = serializationObject.sourceSamplingMode;
        this.alphaMode = serializationObject.alphaMode ?? 0;
    }
}
__decorate([
    editableInPropertyPage("Source sampling mode", 8 /* PropertyTypeForEdition.SamplingMode */, "BASE PROPERTIES")
], NodeRenderGraphBasePostProcessBlock.prototype, "sourceSamplingMode", null);
__decorate([
    editableInPropertyPage("Alpha Mode", 5 /* PropertyTypeForEdition.List */, "BASE PROPERTIES", {
        options: [
            { label: "Disabled", value: 0 },
            { label: "Combine", value: 2 },
            { label: "One One", value: 6 },
            { label: "Add", value: 1 },
            { label: "Subtract", value: 3 },
            { label: "Multiply", value: 4 },
            { label: "Maximized", value: 5 },
            { label: "Pre-multiplied", value: 7 },
            { label: "Pre-multiplied Porter Duff", value: 8 },
            { label: "Screen Mode", value: 10 },
            { label: "OneOne OneOne", value: 11 },
            { label: "Alpha to Color", value: 12 },
            { label: "Reverse One Minus", value: 13 },
            { label: "Source+Dest * (1 - SourceAlpha)", value: 14 },
            { label: "OneOne OneZero", value: 15 },
            { label: "Exclusion", value: 16 },
            { label: "Layer Accumulate", value: 17 },
        ],
    })
], NodeRenderGraphBasePostProcessBlock.prototype, "alphaMode", null);
//# sourceMappingURL=basePostProcessBlock.js.map