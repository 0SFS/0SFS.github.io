import type { AircraftId } from "../aircraft/aircraftIds";
import { getEngineAcousticDefinition, type EngineAcousticDefinition } from "./engineAcousticDefinitions";
import { rendererAdmission, type AudioRendererRegistration } from "./audioRendererRegistry";

/** Only this audio installation registry knows aircraft identities. */
export interface InstalledEngineSoundSource {
  readonly id: string;
  readonly engineIndex: number;
  readonly engineDefinitionId: string;
  readonly position: { readonly kind: "native-engine" };
}
export interface AircraftAudioInstallation {
  readonly engineSources: readonly InstalledEngineSoundSource[];
}
export interface ResolvedEngineSoundSource {
  readonly installation: InstalledEngineSoundSource;
  readonly definition: EngineAcousticDefinition;
}
export type AircraftAudioAdmission =
  | { supported: true; source: ResolvedEngineSoundSource; renderer: AudioRendererRegistration }
  | { supported: false; reason: string };

const engine = (engineDefinitionId: string): AircraftAudioInstallation => ({
  engineSources: [{ id: "main-exhaust", engineIndex: 0, engineDefinitionId, position: { kind: "native-engine" } }],
});
const INSTALLATIONS: Partial<Record<AircraftId, AircraftAudioInstallation>> = {
  "cirrus-vision-jet": engine("fj33-reference"),
  "cirrus-vision-jet-g2": engine("fj33-reference"),
  "cirrus-vision-jet-g3": engine("fj33-reference"),
  "f-35b": engine("f135-approximation"),
};

export function getAircraftAudioInstallation(id: AircraftId): AircraftAudioInstallation | undefined {
  return INSTALLATIONS[id];
}

/** No implicit FJ33/source-zero fallback and no silently dropped engine. */
export function resolveAircraftAudioInstallation(installation?: AircraftAudioInstallation,
  definitions: (id: string) => EngineAcousticDefinition | undefined = getEngineAcousticDefinition): AircraftAudioAdmission {
  if (!installation || installation.engineSources.length === 0) return { supported: false, reason: "No engine sound installation is defined." };
  const sources: ResolvedEngineSoundSource[] = [];
  let selected: AudioRendererRegistration | undefined;
  for (const source of installation.engineSources) {
    if (!source.id || !Number.isInteger(source.engineIndex) || source.engineIndex < 0 || source.position.kind !== "native-engine") {
      return { supported: false, reason: "Invalid engine sound source installation." };
    }
    const definition = definitions(source.engineDefinitionId);
    if (!definition) return { supported: false, reason: `Engine acoustic definition ${source.engineDefinitionId} is unavailable.` };
    const admitted = rendererAdmission(definition);
    if (!admitted.supported) return admitted;
    if (selected && selected.id !== admitted.renderer.id) return { supported: false, reason: "Mixed audio renderers are not implemented." };
    selected = admitted.renderer;
    sources.push({ installation: source, definition });
  }
  if (!selected || sources.length > selected.maxEngineSources) return { supported: false, reason: "Current audio renderer supports one engine source; multiple-source rendering is not implemented." };
  return { supported: true, source: sources[0], renderer: selected };
}

/** Compatibility query for Sound UI; playback uses the complete admission. */
export function getAircraftAudioProfile(id: AircraftId): EngineAcousticDefinition | undefined {
  const admitted = resolveAircraftAudioInstallation(getAircraftAudioInstallation(id));
  return admitted.supported ? admitted.source.definition : undefined;
}
export { ACOUSTIC_PROFILE_FIELDS, acousticProfileValues, FJ33_ACOUSTICS } from "./engineAcousticDefinitions";
export type { EngineAcousticProfile, EngineAcousticDefinition as AircraftAudioProfile } from "./engineAcousticDefinitions";
