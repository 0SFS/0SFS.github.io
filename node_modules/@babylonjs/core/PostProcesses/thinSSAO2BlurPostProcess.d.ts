import type { Nullable, AbstractEngine, EffectWrapperCreationOptions } from "../index.js";
import { EffectWrapper } from "../Materials/effectRenderer.js";
/**
 * @internal
 */
export declare class ThinSSAO2BlurPostProcess extends EffectWrapper {
    static readonly FragmentUrl = "ssao2";
    static readonly Uniforms: string[];
    static readonly Samplers: string[];
    protected _gatherImports(useWebGPU: boolean, list: Promise<any>[]): void;
    constructor(name: string, engine: Nullable<AbstractEngine> | undefined, isHorizontal: boolean, options?: EffectWrapperCreationOptions);
    private readonly _isHorizontal;
    private _bypassBlur;
    textureSize: number;
    bilateralSamples: number;
    bilateralSoften: number;
    bilateralTolerance: number;
    set bypassBlur(b: boolean);
    get bypassBlur(): boolean;
    private _expensiveBlur;
    set expensiveBlur(b: boolean);
    get expensiveBlur(): boolean;
    bind(noDefaultBindings?: boolean): void;
    private _getSamplersForBlur;
    private _getDefinesForBlur;
}
