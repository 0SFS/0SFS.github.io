import { __decorate } from "../../../../tslib.es6.js";
import { NodeRenderGraphBlock } from "../../nodeRenderGraphBlock.js";
import { NodeRenderGraphBlockConnectionPointTypes } from "../../Types/nodeRenderGraphTypes.js";
import { editableInPropertyPage } from "../../../../Decorators/nodeDecorator.js";
import { NodeRenderGraphConnectionPoint } from "../../nodeRenderGraphBlockConnectionPoint.js";
import { NodeRenderGraphConnectionPointCustomObject } from "../../nodeRenderGraphConnectionPointCustomObject.js";
import { FrameGraphObjectRendererTask } from "../../../Tasks/Rendering/objectRendererTask.js";
/**
 * @internal
 */
export class NodeRenderGraphBaseObjectRendererBlock extends NodeRenderGraphBlock {
    /**
     * Gets the frame graph task associated with this block
     */
    get task() {
        return this._frameGraphTask;
    }
    /**
     * Create a new NodeRenderGraphBaseObjectRendererBlock
     * @param name defines the block name
     * @param frameGraph defines the hosting frame graph
     * @param scene defines the hosting scene
     * @param doNotChangeAspectRatio True (default) to not change the aspect ratio of the scene in the RTT
     * @param enableClusteredLights True (default) to enable clustered lights
     */
    constructor(name, frameGraph, scene, doNotChangeAspectRatio = true, enableClusteredLights = true) {
        super(name, frameGraph, scene);
        this._additionalConstructionParameters = [doNotChangeAspectRatio, enableClusteredLights];
        this.registerInput("target", NodeRenderGraphBlockConnectionPointTypes.AutoDetect);
        this.registerInput("depth", NodeRenderGraphBlockConnectionPointTypes.AutoDetect, true);
        this.registerInput("camera", NodeRenderGraphBlockConnectionPointTypes.Camera);
        this.registerInput("objects", NodeRenderGraphBlockConnectionPointTypes.ObjectList);
        this._addDependenciesInput();
        this.registerInput("shadowGenerators", NodeRenderGraphBlockConnectionPointTypes.AutoDetect, true);
        this.registerOutput("output", NodeRenderGraphBlockConnectionPointTypes.BasedOnInput);
        this.registerOutput("outputDepth", NodeRenderGraphBlockConnectionPointTypes.BasedOnInput);
        this.registerOutput("objectRenderer", NodeRenderGraphBlockConnectionPointTypes.Object, new NodeRenderGraphConnectionPointCustomObject("objectRenderer", this, 1 /* NodeRenderGraphConnectionPointDirection.Output */, NodeRenderGraphBaseObjectRendererBlock, "NodeRenderGraphBaseObjectRendererBlock"));
        this.target.addExcludedConnectionPointFromAllowedTypes(NodeRenderGraphBlockConnectionPointTypes.TextureAllButBackBufferDepthStencil | NodeRenderGraphBlockConnectionPointTypes.ResourceContainer);
        this.depth.addExcludedConnectionPointFromAllowedTypes(NodeRenderGraphBlockConnectionPointTypes.TextureDepthStencilAttachment | NodeRenderGraphBlockConnectionPointTypes.TextureBackBufferDepthStencilAttachment);
        this.shadowGenerators.addExcludedConnectionPointFromAllowedTypes(NodeRenderGraphBlockConnectionPointTypes.ShadowGenerator | NodeRenderGraphBlockConnectionPointTypes.ResourceContainer);
        this.output._typeConnectionSource = this.target;
        this.outputDepth._typeConnectionSource = this.depth;
        this._createFrameGraphObject();
    }
    _createFrameGraphObject() {
        this._frameGraphTask?.dispose();
        this._frameGraphTask = new FrameGraphObjectRendererTask(this.name, this._frameGraph, this._scene, {
            doNotChangeAspectRatio: this._additionalConstructionParameters[0],
            enableClusteredLights: this._additionalConstructionParameters[1],
        });
    }
    _saveState(state) {
        state.disabled = this._frameGraphTask.disabled;
        state.isMainObjectRenderer = this.isMainObjectRenderer;
        state.depthTest = this.depthTest;
        state.depthWrite = this.depthWrite;
        state.disableShadows = this.disableShadows;
        state.renderInLinearSpace = this.renderInLinearSpace;
        state.renderMeshes = this.renderMeshes;
        state.renderDepthOnlyMeshes = this.renderDepthOnlyMeshes;
        state.renderOpaqueMeshes = this.renderOpaqueMeshes;
        state.renderAlphaTestMeshes = this.renderAlphaTestMeshes;
        state.renderTransparentMeshes = this.renderTransparentMeshes;
        state.useOITForTransparentMeshes = this.useOITForTransparentMeshes;
        state.renderParticles = this.renderParticles;
        state.renderSprites = this.renderSprites;
        state.forceLayerMaskCheck = this.forceLayerMaskCheck;
        state.enableBoundingBoxRendering = this.enableBoundingBoxRendering;
        state.enableOutlineRendering = this.enableOutlineRendering;
    }
    _restoreState(state) {
        this._frameGraphTask.disabled = state.disabled;
        this.isMainObjectRenderer = state.isMainObjectRenderer;
        this.depthTest = state.depthTest;
        this.depthWrite = state.depthWrite;
        this.disableShadows = state.disableShadows;
        this.renderInLinearSpace = state.renderInLinearSpace;
        this.renderMeshes = state.renderMeshes;
        this.renderDepthOnlyMeshes = state.renderDepthOnlyMeshes;
        this.renderOpaqueMeshes = state.renderOpaqueMeshes;
        this.renderAlphaTestMeshes = state.renderAlphaTestMeshes;
        this.renderTransparentMeshes = state.renderTransparentMeshes;
        this.useOITForTransparentMeshes = state.useOITForTransparentMeshes;
        this.renderParticles = state.renderParticles;
        this.renderSprites = state.renderSprites;
        this.forceLayerMaskCheck = state.forceLayerMaskCheck;
        this.enableBoundingBoxRendering = state.enableBoundingBoxRendering;
        this.enableOutlineRendering = state.enableOutlineRendering;
    }
    _createFrameGraphObjectWithState(doNotChangeAspectRatio, enableClusteredLights) {
        const state = {};
        this._saveState(state);
        this._additionalConstructionParameters = [doNotChangeAspectRatio, enableClusteredLights];
        this._createFrameGraphObject();
        this._restoreState(state);
    }
    /** Indicates that this object renderer is the main object renderer of the frame graph. */
    get isMainObjectRenderer() {
        return this._frameGraphTask.isMainObjectRenderer;
    }
    set isMainObjectRenderer(value) {
        this._frameGraphTask.isMainObjectRenderer = value;
    }
    /** Indicates if depth testing must be enabled or disabled */
    get depthTest() {
        return this._frameGraphTask.depthTest;
    }
    set depthTest(value) {
        this._frameGraphTask.depthTest = value;
    }
    /** Indicates if depth writing must be enabled or disabled */
    get depthWrite() {
        return this._frameGraphTask.depthWrite;
    }
    set depthWrite(value) {
        this._frameGraphTask.depthWrite = value;
    }
    /** Indicates if meshes should be rendered */
    get renderMeshes() {
        return this._frameGraphTask.renderMeshes;
    }
    set renderMeshes(value) {
        this._frameGraphTask.renderMeshes = value;
    }
    /** Indicates if depth-only meshes should be rendered */
    get renderDepthOnlyMeshes() {
        return this._frameGraphTask.renderDepthOnlyMeshes;
    }
    set renderDepthOnlyMeshes(value) {
        this._frameGraphTask.renderDepthOnlyMeshes = value;
    }
    /** Indicates if opaque meshes should be rendered */
    get renderOpaqueMeshes() {
        return this._frameGraphTask.renderOpaqueMeshes;
    }
    set renderOpaqueMeshes(value) {
        this._frameGraphTask.renderOpaqueMeshes = value;
    }
    /** Indicates if alpha tested meshes should be rendered */
    get renderAlphaTestMeshes() {
        return this._frameGraphTask.renderAlphaTestMeshes;
    }
    set renderAlphaTestMeshes(value) {
        this._frameGraphTask.renderAlphaTestMeshes = value;
    }
    /** Indicates if transparent meshes should be rendered */
    get renderTransparentMeshes() {
        return this._frameGraphTask.renderTransparentMeshes;
    }
    set renderTransparentMeshes(value) {
        this._frameGraphTask.renderTransparentMeshes = value;
    }
    /** Indicates if use of Order Independent Transparency (OIT) for transparent meshes should be enabled */
    get useOITForTransparentMeshes() {
        return this._frameGraphTask.useOITForTransparentMeshes;
    }
    // eslint-disable-next-line @typescript-eslint/naming-convention
    set useOITForTransparentMeshes(value) {
        this._frameGraphTask.useOITForTransparentMeshes = value;
    }
    /** Defines the number of passes to use for Order Independent Transparency */
    get oitPassCount() {
        return this._frameGraphTask.oitPassCount;
    }
    set oitPassCount(value) {
        this._frameGraphTask.oitPassCount = value;
    }
    /** Indicates if particles should be rendered */
    get renderParticles() {
        return this._frameGraphTask.renderParticles;
    }
    set renderParticles(value) {
        this._frameGraphTask.renderParticles = value;
    }
    /** Indicates if sprites should be rendered */
    get renderSprites() {
        return this._frameGraphTask.renderSprites;
    }
    set renderSprites(value) {
        this._frameGraphTask.renderSprites = value;
    }
    /** Indicates if layer mask check must be forced */
    get forceLayerMaskCheck() {
        return this._frameGraphTask.forceLayerMaskCheck;
    }
    set forceLayerMaskCheck(value) {
        this._frameGraphTask.forceLayerMaskCheck = value;
    }
    /** Indicates if bounding boxes should be rendered */
    get enableBoundingBoxRendering() {
        return this._frameGraphTask.enableBoundingBoxRendering;
    }
    set enableBoundingBoxRendering(value) {
        this._frameGraphTask.enableBoundingBoxRendering = value;
    }
    /** Indicates if outlines/overlays should be rendered */
    get enableOutlineRendering() {
        return this._frameGraphTask.enableOutlineRendering;
    }
    set enableOutlineRendering(value) {
        this._frameGraphTask.enableOutlineRendering = value;
    }
    /** Indicates if shadows must be enabled or disabled */
    get disableShadows() {
        return this._frameGraphTask.disableShadows;
    }
    set disableShadows(value) {
        this._frameGraphTask.disableShadows = value;
    }
    /** If image processing should be disabled */
    get renderInLinearSpace() {
        return this._frameGraphTask.disableImageProcessing;
    }
    set renderInLinearSpace(value) {
        this._frameGraphTask.disableImageProcessing = value;
    }
    /** True (default) to not change the aspect ratio of the scene in the RTT */
    get doNotChangeAspectRatio() {
        return this._frameGraphTask.objectRenderer.options.doNotChangeAspectRatio;
    }
    set doNotChangeAspectRatio(value) {
        this._createFrameGraphObjectWithState(value, this.enableClusteredLights);
    }
    /** True (default) to enable clustered lights */
    get enableClusteredLights() {
        return this._frameGraphTask.objectRenderer.options.enableClusteredLights;
    }
    set enableClusteredLights(value) {
        this._createFrameGraphObjectWithState(this.doNotChangeAspectRatio, value);
    }
    /** If true, MSAA color textures will be resolved at the end of the render pass (default: true) */
    get resolveMSAAColors() {
        return this._frameGraphTask.resolveMSAAColors;
    }
    set resolveMSAAColors(value) {
        this._frameGraphTask.resolveMSAAColors = value;
    }
    /** If true, MSAA depth texture will be resolved at the end of the render pass (default: false) */
    get resolveMSAADepth() {
        return this._frameGraphTask.resolveMSAADepth;
    }
    set resolveMSAADepth(value) {
        this._frameGraphTask.resolveMSAADepth = value;
    }
    /**
     * Gets the current class name
     * @returns the class name
     */
    getClassName() {
        return "NodeRenderGraphBaseObjectRendererBlock";
    }
    /**
     * Gets the target texture input component
     */
    get target() {
        return this._inputs[0];
    }
    /**
     * Gets the depth texture input component
     */
    get depth() {
        return this._inputs[1];
    }
    /**
     * Gets the camera input component
     */
    get camera() {
        return this._inputs[2];
    }
    /**
     * Gets the objects input component
     */
    get objects() {
        return this._inputs[3];
    }
    /**
     * Gets the dependencies input component
     */
    get dependencies() {
        return this._inputs[4];
    }
    /**
     * Gets the shadowGenerators input component
     */
    get shadowGenerators() {
        return this._inputs[5];
    }
    /**
     * Gets the output component
     */
    get output() {
        return this._outputs[0];
    }
    /**
     * Gets the output depth component
     */
    get outputDepth() {
        return this._outputs[1];
    }
    /**
     * Gets the objectRenderer component
     */
    get objectRenderer() {
        return this._outputs[2];
    }
    _buildBlock(state) {
        super._buildBlock(state);
        this.output.value = this._frameGraphTask.outputTexture; // the value of the output connection point is the "output" texture of the task
        this.outputDepth.value = this._frameGraphTask.outputDepthTexture; // the value of the outputDepth connection point is the "outputDepth" texture of the task
        this.objectRenderer.value = this._frameGraphTask; // the value of the objectRenderer connection point is the task itself
        this._frameGraphTask.targetTexture = this._getConnectedTextures(this.target.connectedPoint); // Geometry renderer allows undefined for targetTexture
        this._frameGraphTask.depthTexture = this.depth.connectedPoint?.value;
        this._frameGraphTask.camera = this.camera.connectedPoint?.value;
        this._frameGraphTask.objectList = this.objects.connectedPoint?.value;
        this._frameGraphTask.shadowGenerators = [];
        const shadowGeneratorsConnectedPoint = this.shadowGenerators.connectedPoint;
        if (shadowGeneratorsConnectedPoint) {
            if (shadowGeneratorsConnectedPoint.type === NodeRenderGraphBlockConnectionPointTypes.ResourceContainer) {
                const container = shadowGeneratorsConnectedPoint.ownerBlock;
                for (const input of container.inputs) {
                    if (input.connectedPoint && input.connectedPoint.value !== undefined && NodeRenderGraphConnectionPoint.IsShadowGenerator(input.connectedPoint.value)) {
                        this._frameGraphTask.shadowGenerators.push(input.connectedPoint.value);
                    }
                }
            }
            else if (NodeRenderGraphConnectionPoint.IsShadowGenerator(shadowGeneratorsConnectedPoint.value)) {
                this._frameGraphTask.shadowGenerators[0] = shadowGeneratorsConnectedPoint.value;
            }
        }
    }
    _dumpPropertiesCode() {
        const codes = [];
        codes.push(`${this._codeVariableName}.isMainObjectRenderer = ${this.isMainObjectRenderer};`);
        codes.push(`${this._codeVariableName}.depthTest = ${this.depthTest};`);
        codes.push(`${this._codeVariableName}.depthWrite = ${this.depthWrite};`);
        codes.push(`${this._codeVariableName}.renderMeshes = ${this.renderMeshes};`);
        codes.push(`${this._codeVariableName}.renderDepthOnlyMeshes = ${this.renderDepthOnlyMeshes};`);
        codes.push(`${this._codeVariableName}.renderOpaqueMeshes = ${this.renderOpaqueMeshes};`);
        codes.push(`${this._codeVariableName}.renderAlphaTestMeshes = ${this.renderAlphaTestMeshes};`);
        codes.push(`${this._codeVariableName}.renderTransparentMeshes = ${this.renderTransparentMeshes};`);
        codes.push(`${this._codeVariableName}.useOITForTransparentMeshes = ${this.useOITForTransparentMeshes};`);
        codes.push(`${this._codeVariableName}.oitPassCount = ${this.oitPassCount};`);
        codes.push(`${this._codeVariableName}.renderParticles = ${this.renderParticles};`);
        codes.push(`${this._codeVariableName}.renderSprites = ${this.renderSprites};`);
        codes.push(`${this._codeVariableName}.forceLayerMaskCheck = ${this.forceLayerMaskCheck};`);
        codes.push(`${this._codeVariableName}.enableBoundingBoxRendering = ${this.enableBoundingBoxRendering};`);
        codes.push(`${this._codeVariableName}.enableOutlineRendering = ${this.enableOutlineRendering};`);
        codes.push(`${this._codeVariableName}.disableShadows = ${this.disableShadows};`);
        codes.push(`${this._codeVariableName}.renderInLinearSpace = ${this.renderInLinearSpace};`);
        codes.push(`${this._codeVariableName}.resolveMSAAColors = ${this.resolveMSAAColors};`);
        codes.push(`${this._codeVariableName}.resolveMSAADepth = ${this.resolveMSAADepth};`);
        return super._dumpPropertiesCode() + codes.join("\n");
    }
    serialize() {
        const serializationObject = super.serialize();
        serializationObject.isMainObjectRenderer = this.isMainObjectRenderer;
        serializationObject.depthTest = this.depthTest;
        serializationObject.depthWrite = this.depthWrite;
        serializationObject.renderMeshes = this.renderMeshes;
        serializationObject.renderDepthOnlyMeshes = this.renderDepthOnlyMeshes;
        serializationObject.renderOpaqueMeshes = this.renderOpaqueMeshes;
        serializationObject.renderAlphaTestMeshes = this.renderAlphaTestMeshes;
        serializationObject.renderTransparentMeshes = this.renderTransparentMeshes;
        serializationObject.useOITForTransparentMeshes = this.useOITForTransparentMeshes;
        serializationObject.oitPassCount = this.oitPassCount;
        serializationObject.renderParticles = this.renderParticles;
        serializationObject.renderSprites = this.renderSprites;
        serializationObject.forceLayerMaskCheck = this.forceLayerMaskCheck;
        serializationObject.enableBoundingBoxRendering = this.enableBoundingBoxRendering;
        serializationObject.enableOutlineRendering = this.enableOutlineRendering;
        serializationObject.disableShadows = this.disableShadows;
        serializationObject.renderInLinearSpace = this.renderInLinearSpace;
        serializationObject.resolveMSAAColors = this.resolveMSAAColors;
        serializationObject.resolveMSAADepth = this.resolveMSAADepth;
        return serializationObject;
    }
    _deserialize(serializationObject) {
        super._deserialize(serializationObject);
        this.isMainObjectRenderer = !!serializationObject.isMainObjectRenderer;
        this.depthTest = serializationObject.depthTest;
        this.depthWrite = serializationObject.depthWrite;
        this.renderMeshes = serializationObject.renderMeshes ?? true;
        this.renderDepthOnlyMeshes = serializationObject.renderDepthOnlyMeshes ?? true;
        this.renderOpaqueMeshes = serializationObject.renderOpaqueMeshes ?? true;
        this.renderAlphaTestMeshes = serializationObject.renderAlphaTestMeshes ?? true;
        this.renderTransparentMeshes = serializationObject.renderTransparentMeshes ?? true;
        this.useOITForTransparentMeshes = serializationObject.useOITForTransparentMeshes ?? false;
        this.oitPassCount = serializationObject.oitPassCount ?? 5;
        this.renderParticles = serializationObject.renderParticles ?? true;
        this.renderSprites = serializationObject.renderSprites ?? true;
        this.forceLayerMaskCheck = serializationObject.forceLayerMaskCheck ?? true;
        this.enableBoundingBoxRendering = serializationObject.enableBoundingBoxRendering ?? true;
        this.enableOutlineRendering = serializationObject.enableOutlineRendering ?? true;
        this.disableShadows = serializationObject.disableShadows;
        this.renderInLinearSpace = !!serializationObject.renderInLinearSpace;
        this.resolveMSAAColors = serializationObject.resolveMSAAColors ?? true;
        this.resolveMSAADepth = serializationObject.resolveMSAADepth ?? false;
    }
}
__decorate([
    editableInPropertyPage("Is main object renderer", 0 /* PropertyTypeForEdition.Boolean */, "GENERAL")
], NodeRenderGraphBaseObjectRendererBlock.prototype, "isMainObjectRenderer", null);
__decorate([
    editableInPropertyPage("Depth test", 0 /* PropertyTypeForEdition.Boolean */, "GENERAL")
], NodeRenderGraphBaseObjectRendererBlock.prototype, "depthTest", null);
__decorate([
    editableInPropertyPage("Depth write", 0 /* PropertyTypeForEdition.Boolean */, "GENERAL")
], NodeRenderGraphBaseObjectRendererBlock.prototype, "depthWrite", null);
__decorate([
    editableInPropertyPage("Render meshes", 0 /* PropertyTypeForEdition.Boolean */, "RENDERING")
], NodeRenderGraphBaseObjectRendererBlock.prototype, "renderMeshes", null);
__decorate([
    editableInPropertyPage("    Render depth-only meshes", 0 /* PropertyTypeForEdition.Boolean */, "RENDERING")
], NodeRenderGraphBaseObjectRendererBlock.prototype, "renderDepthOnlyMeshes", null);
__decorate([
    editableInPropertyPage("    Render opaque meshes", 0 /* PropertyTypeForEdition.Boolean */, "RENDERING")
], NodeRenderGraphBaseObjectRendererBlock.prototype, "renderOpaqueMeshes", null);
__decorate([
    editableInPropertyPage("    Render alpha test meshes", 0 /* PropertyTypeForEdition.Boolean */, "RENDERING")
], NodeRenderGraphBaseObjectRendererBlock.prototype, "renderAlphaTestMeshes", null);
__decorate([
    editableInPropertyPage("    Render transparent meshes", 0 /* PropertyTypeForEdition.Boolean */, "RENDERING")
], NodeRenderGraphBaseObjectRendererBlock.prototype, "renderTransparentMeshes", null);
__decorate([
    editableInPropertyPage("        Use OIT for transparent meshes", 0 /* PropertyTypeForEdition.Boolean */, "RENDERING")
    // eslint-disable-next-line @typescript-eslint/naming-convention
], NodeRenderGraphBaseObjectRendererBlock.prototype, "useOITForTransparentMeshes", null);
__decorate([
    editableInPropertyPage("            Pass count", 2 /* PropertyTypeForEdition.Int */, "RENDERING", { min: 1, max: 20 })
], NodeRenderGraphBaseObjectRendererBlock.prototype, "oitPassCount", null);
__decorate([
    editableInPropertyPage("Render particles", 0 /* PropertyTypeForEdition.Boolean */, "RENDERING")
], NodeRenderGraphBaseObjectRendererBlock.prototype, "renderParticles", null);
__decorate([
    editableInPropertyPage("Render sprites", 0 /* PropertyTypeForEdition.Boolean */, "RENDERING")
], NodeRenderGraphBaseObjectRendererBlock.prototype, "renderSprites", null);
__decorate([
    editableInPropertyPage("Force layer mask check", 0 /* PropertyTypeForEdition.Boolean */, "GENERAL")
], NodeRenderGraphBaseObjectRendererBlock.prototype, "forceLayerMaskCheck", null);
__decorate([
    editableInPropertyPage("Render bounding boxes", 0 /* PropertyTypeForEdition.Boolean */, "RENDERING")
], NodeRenderGraphBaseObjectRendererBlock.prototype, "enableBoundingBoxRendering", null);
__decorate([
    editableInPropertyPage("Render outlines/overlays", 0 /* PropertyTypeForEdition.Boolean */, "RENDERING")
], NodeRenderGraphBaseObjectRendererBlock.prototype, "enableOutlineRendering", null);
__decorate([
    editableInPropertyPage("Disable shadows", 0 /* PropertyTypeForEdition.Boolean */, "GENERAL")
], NodeRenderGraphBaseObjectRendererBlock.prototype, "disableShadows", null);
__decorate([
    editableInPropertyPage("Disable image processing", 0 /* PropertyTypeForEdition.Boolean */, "GENERAL")
], NodeRenderGraphBaseObjectRendererBlock.prototype, "renderInLinearSpace", null);
__decorate([
    editableInPropertyPage("Do not change aspect ratio", 0 /* PropertyTypeForEdition.Boolean */, "GENERAL")
], NodeRenderGraphBaseObjectRendererBlock.prototype, "doNotChangeAspectRatio", null);
__decorate([
    editableInPropertyPage("Enable clustered lights", 0 /* PropertyTypeForEdition.Boolean */, "GENERAL")
], NodeRenderGraphBaseObjectRendererBlock.prototype, "enableClusteredLights", null);
__decorate([
    editableInPropertyPage("Resolve MSAA colors", 0 /* PropertyTypeForEdition.Boolean */, "GENERAL")
], NodeRenderGraphBaseObjectRendererBlock.prototype, "resolveMSAAColors", null);
__decorate([
    editableInPropertyPage("Resolve MSAA depth", 0 /* PropertyTypeForEdition.Boolean */, "GENERAL")
], NodeRenderGraphBaseObjectRendererBlock.prototype, "resolveMSAADepth", null);
//# sourceMappingURL=baseObjectRendererBlock.js.map