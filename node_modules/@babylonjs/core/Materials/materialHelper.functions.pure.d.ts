/** This file must only contain pure code and pure imports */
import type { Scene } from "../scene.js";
import type { Effect } from "./effect.js";
/**
 * Binds the logarithmic depth information from the scene to the effect for the given defines.
 * @param defines The generated defines used in the effect
 * @param effect The effect we are binding the data to
 * @param scene The scene we are willing to render with logarithmic scale for
 */
export declare function BindLogDepth(defines: any, effect: Effect, scene: Scene): void;
