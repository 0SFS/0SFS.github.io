import type { Nullable } from "@babylonjs/core/types.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { INode } from "../glTFLoaderInterfaces.js";
import type { IGLTFLoaderExtension } from "../glTFLoaderExtension.js";
import { GLTFLoader } from "../glTFLoader.js";
declare module "../../glTFFileLoader.js" {
    interface GLTFLoaderExtensionOptions {
        /**
         * Defines options for the EXT_lights_area extension.
         */
        ["EXT_lights_area"]: {};
    }
}
/**
 * [Specification](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Vendor/EXT_lights_area/README.md)
 */
export declare class EXT_lights_area implements IGLTFLoaderExtension {
    /**
     * The name of this extension.
     */
    readonly name = "EXT_lights_area";
    /**
     * Defines whether this extension is enabled.
     */
    enabled: boolean;
    /** hidden */
    private _loader;
    private _lights?;
    /**
     * @internal
     */
    constructor(loader: GLTFLoader);
    /** @internal */
    dispose(): void;
    /** @internal */
    onLoading(): void;
    /**
     * @internal
     */
    loadNodeAsync(context: string, node: INode, assign: (babylonTransformNode: TransformNode) => void): Nullable<Promise<TransformNode>>;
}
