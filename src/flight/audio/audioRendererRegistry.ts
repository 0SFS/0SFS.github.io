import { audioDspWasmUrl, audioWorkletUrl } from "./audioAssets";
import { AUDIO_SNAPSHOT_VERSION } from "./audioSnapshot";
import { acousticProfileValues, type EngineAcousticDefinition } from "./engineAcousticDefinitions";

/** 0sfs owns renderer selection; hardware class is independent of the binary. */
export interface AudioRendererRegistration {
  readonly id: string;
  readonly wasmUrl: URL;
  readonly workletUrl: URL;
  readonly processorName: string;
  readonly abi: { readonly id: string; readonly snapshotVersion: number };
  readonly maxEngineSources: number;
  readonly telemetrySchemaIds: readonly string[];
  readonly engineClasses: readonly EngineAcousticDefinition["engineClass"][];
  readonly acousticStatus: "approximate-unvalidated";
  /** High is source synthesis. No recording bank is required or admitted. */
  readonly highSynthesis?: "procedural";
  encodeParameters(definition: EngineAcousticDefinition): number[];
}

const PROCEDURAL_JET: AudioRendererRegistration = Object.freeze({
  id: "procedural-jet-v1", wasmUrl: audioDspWasmUrl, workletUrl: audioWorkletUrl,
  processorName: "osfs-dsp", abi: { id: "osfs-audio-dynamics-v3", snapshotVersion: AUDIO_SNAPSHOT_VERSION },
  maxEngineSources: 1, telemetrySchemaIds: ["jsbsim-turbine-v1"], engineClasses: ["turbofan"] as const,
  acousticStatus: "approximate-unvalidated", highSynthesis: "procedural", encodeParameters: acousticProfileValues,
});
export const AUDIO_RENDERERS: Readonly<Record<string, AudioRendererRegistration>> = {
  [PROCEDURAL_JET.id]: PROCEDURAL_JET,
};
export const getAudioRenderer = (id: string): AudioRendererRegistration | undefined =>
  Object.hasOwn(AUDIO_RENDERERS, id) ? AUDIO_RENDERERS[id] : undefined;

export function rendererAdmission(definition: EngineAcousticDefinition,
  renderers: Readonly<Record<string, AudioRendererRegistration>> = AUDIO_RENDERERS):
  { supported: true; renderer: AudioRendererRegistration } | { supported: false; reason: string } {
  const renderer = Object.hasOwn(renderers, definition.rendererId) ? renderers[definition.rendererId] : undefined;
  if (!renderer) return { supported: false, reason: `Audio renderer ${definition.rendererId} is not implemented.` };
  if (renderer.abi.id !== "osfs-audio-dynamics-v3" || renderer.abi.snapshotVersion !== AUDIO_SNAPSHOT_VERSION) {
    return { supported: false, reason: `Audio renderer ${renderer.id} requires an unsupported dynamics ABI.` };
  }
  if (!renderer.engineClasses.includes(definition.engineClass)) return { supported: false, reason: `Renderer ${renderer.id} does not implement ${definition.engineClass} engines.` };
  if (!renderer.telemetrySchemaIds.includes(definition.telemetry.id)) return { supported: false, reason: `Renderer ${renderer.id} does not accept telemetry ${definition.telemetry.id}.` };
  try { renderer.encodeParameters(definition); } catch (error) {
    return { supported: false, reason: error instanceof Error ? error.message : String(error) };
  }
  return { supported: true, renderer };
}
