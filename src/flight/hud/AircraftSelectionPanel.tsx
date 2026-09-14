import { Plane } from "lucide-react";
import { useId, useState } from "react";
import {
  AIRCRAFT_FAMILIES,
  availableLods,
  getAircraftDefinition,
  getAircraftFamilyForAircraft,
  normalizeAircraftSelection,
  type AircraftFamilyDefinition,
  type AircraftFamilyId,
  type AircraftLodId,
  type AircraftModelCredit,
  type AircraftSelection,
} from "../aircraft/aircraftCatalog";
import type { AircraftModelStatus } from "../aircraft/createAircraftModel";
import type { FlightControlPanelSnapshot } from "./FlightControlPanel";

const MODEL_STATUS_LABEL: Record<AircraftModelStatus, string> = {
  placeholder: "Placeholder blocks",
  loading: "Loading mesh…",
  ready: "Mesh loaded",
  error: "Load failed",
};

interface AircraftSelectionPanelProps {
  snapshot: FlightControlPanelSnapshot;
  selection: AircraftSelection;
  onSelectionChange(selection: AircraftSelection): void;
  onFamilyChange(familyId: AircraftFamilyId): void;
  onApply(selection: AircraftSelection): string | null;
}

function ModelCredit({ credit, prefix = "" }: { credit: AircraftModelCredit; prefix?: string }) {
  return (
    <p className="flight-panel__hint">
      {prefix}<strong>{credit.artist}</strong>{` — ${credit.note}`}
      {credit.licence ? ` ${credit.licence}.` : null}
      {credit.sourceUrl ? <> <a href={credit.sourceUrl} target="_blank" rel="noreferrer noopener">Source</a></> : null}
    </p>
  );
}

function FamilyThumbnail({ family }: { family: AircraftFamilyDefinition }) {
  const [failed, setFailed] = useState(false);
  const path = family.thumbnail?.path;
  return (
    <span className="flight-panel__aircraft-image">
      {path && !failed ? (
        <img
          src={`${import.meta.env.BASE_URL}${path}`}
          alt=""
          width="640"
          height="400"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="flight-panel__aircraft-image-fallback">
          <Plane size={30} aria-hidden="true" />
          <span>Image unavailable</span>
        </span>
      )}
    </span>
  );
}

/** The gallery stages a complete choice; only Apply can change the live aircraft. */
export function AircraftSelectionPanel({
  snapshot, selection, onSelectionChange, onFamilyChange, onApply,
}: AircraftSelectionPanelProps) {
  const id = useId();
  const [applyError, setApplyError] = useState<string | null>(null);
  const definition = getAircraftDefinition(selection.aircraftId);
  const family = getAircraftFamilyForAircraft(selection.aircraftId);
  const activeDefinition = getAircraftDefinition(snapshot.aircraftId);
  const activeSelection = normalizeAircraftSelection(snapshot);
  const activeVariant = family.variants.find((variant) => variant.id === selection.generationId)
    ?? family.variants.find((variant) => variant.aircraftId === selection.aircraftId)
    ?? family.variants[0];
  const isActiveAircraft = selection.aircraftId === snapshot.aircraftId;
  const hasChanges = !isActiveAircraft
    || selection.lodId !== activeSelection.lodId
    || selection.optInLodsEnabled !== activeSelection.optInLodsEnabled
    || selection.generationId !== activeSelection.generationId;
  const offered = availableLods(definition, selection.optInLodsEnabled);
  const optInLods = definition.lods.filter(lod => lod.optIn);
  const currentModelLod = activeDefinition.lods.find(lod => lod.id === snapshot.modelActiveLodId);
  const activeLod = isActiveAircraft ? currentModelLod : undefined;
  // Include a still-loaded opt-in mesh's attribution while staging its removal.
  const credited = [...offered, ...(activeLod ? [activeLod] : [])].reduce<AircraftModelCredit[]>((keep, lod) => {
    if (!keep.some(credit => credit.artist === lod.credit.artist
      && credit.sourceUrl === lod.credit.sourceUrl && credit.licence === lod.credit.licence)) {
      keep.push(lod.credit);
    }
    return keep;
  }, []);

  const updateSelection = (next: AircraftSelection) => {
    setApplyError(null);
    onSelectionChange(normalizeAircraftSelection(next));
  };

  return (
    <div className="flight-panel__aircraft-picker">
      <fieldset className="flight-panel__fieldset">
        <legend>Aircraft family</legend>
        <div className="flight-panel__aircraft-gallery">
          {AIRCRAFT_FAMILIES.map(entry => (
            <label
              key={entry.id}
              className={`flight-panel__aircraft-card${entry.id === family.id ? " is-selected" : ""}`}
            >
              <input
                type="radio"
                name="flight-aircraft"
                value={entry.id}
                checked={entry.id === family.id}
                aria-labelledby={`${id}-${entry.id}-name`}
                onChange={() => { setApplyError(null); onFamilyChange(entry.id); }}
                onFocus={event => event.currentTarget.closest("label")?.scrollIntoView({ block: "nearest", inline: "nearest" })}
              />
              <FamilyThumbnail family={entry} />
              <span className="flight-panel__aircraft-card-caption">
                <strong id={`${id}-${entry.id}-name`}>{entry.label}</strong>
                <span aria-hidden="true">{entry.id === family.id ? "Selected" : "Select aircraft"}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <section className="flight-panel__aircraft-controls" aria-labelledby={`${id}-selected-name`}>
        <div className="flight-panel__section-heading">
          <strong id={`${id}-selected-name`}>{family.label}</strong>
          <details className="flight-panel__info-details">
            <summary className="flight-panel__info-summary" aria-label="Show aircraft details">?</summary>
            <div className="flight-panel__info-content">
              <p className="flight-panel__hint" role="status">
                {hasChanges
                  ? `Pending changes for ${definition.label}. ${isActiveAircraft ? "Apply to update model detail." : `Currently flying ${activeDefinition.label} until you apply.`}`
                  : `${definition.label} is active. No pending changes.`}
              </p>
              <p className="flight-panel__hint">Selected generation: <strong>{activeVariant.label}</strong></p>
              <p className="flight-panel__hint">Currently flying: <strong>{activeDefinition.label}</strong></p>
              <p className="flight-panel__hint">{definition.summary}</p>
              {family.developmentNote ? <p className="flight-panel__hint">{family.developmentNote}</p> : null}
              {isActiveAircraft ? (
                <div className="flight-panel__model-status" role="status" aria-label={`Current model for ${activeDefinition.label}`}>
                  <div className="flight-panel__metrics">
                    <div className="flight-panel__metric">
                      <span>Current model</span><strong>{MODEL_STATUS_LABEL[snapshot.modelStatus]}</strong>
                    </div>
                    <div className="flight-panel__metric">
                      <span>Triangles</span><strong>{snapshot.modelTriangles?.toLocaleString() ?? "—"}</strong>
                    </div>
                  </div>
                  {snapshot.lodId === "auto" && activeLod ? <p className="flight-panel__hint">Auto selected {activeLod.label}.</p> : null}
                  {snapshot.modelError ? <p className="flight-panel__hint is-error">{snapshot.modelError}</p> : null}
                </div>
              ) : <p className="flight-panel__hint">Model loading status will appear after this aircraft is activated.</p>}
              {credited.map(credit => <ModelCredit key={`${credit.artist}-${credit.sourceUrl ?? ""}`} credit={credit} />)}
              {offered.length === 0 ? (
                <p className="flight-panel__hint">No mesh exists for this airframe yet, so the block placeholder is drawn instead.</p>
              ) : null}
              {family.thumbnail ? <ModelCredit credit={family.thumbnail.credit} prefix="Gallery image: " /> : null}
              {!isActiveAircraft && currentModelLod?.credit.licence ? (
                <ModelCredit credit={currentModelLod.credit} prefix={`Currently flying ${activeDefinition.label}: `} />
              ) : null}
              {!isActiveAircraft ? <p className="flight-panel__hint">Applying reloads the simulation to activate the complete aircraft.</p> : null}
            </div>
          </details>
        </div>
        {family.variantLabel && family.variants.length > 1 ? (
          <label className="flight-panel__field flight-panel__generation-field">
            <span>{family.variantLabel}</span>
            <select
              className="flight-panel__select"
              value={activeVariant.id}
              onChange={event => {
                const variant = family.variants.find(entry => entry.id === event.target.value);
                if (variant) updateSelection({
                  ...selection,
                  generationId: variant.id,
                  aircraftId: variant.aircraftId,
                });
              }}
              >
              {family.variants.map(variant => (
                <option key={variant.id} value={variant.id}>{variant.label}</option>
              ))}
            </select>
          </label>
        ) : null}
        <fieldset className="flight-panel__fieldset flight-panel__model-controls">
          <legend>Model detail</legend>
          <label className="flight-panel__field">
            <span>Level of detail</span>
            <select
              className="flight-panel__select"
              value={selection.lodId}
              disabled={offered.length === 0}
              onChange={event => updateSelection({ ...selection, lodId: event.target.value as AircraftLodId })}
            >
              <option value="auto">Auto (by chase distance)</option>
              {offered.map(lod => (
                <option key={lod.id} value={lod.id}>{`${lod.label} — ${lod.triangles.toLocaleString()} tris`}</option>
              ))}
            </select>
          </label>
          {optInLods.length > 0 ? (
            <>
              <label className="flight-panel__field flight-panel__field--inline">
                <input
                  type="checkbox"
                  checked={selection.optInLodsEnabled}
                  onChange={event => updateSelection({ ...selection, optInLodsEnabled: event.target.checked })}
                />
                <span>{`Higher-detail models (${optInLods.map(lod => `${lod.triangles.toLocaleString()} tris`).join(", ")})`}</span>
              </label>
              {!selection.optInLodsEnabled ? optInLods.filter(lod => !credited.includes(lod.credit)).map(lod => (
                <ModelCredit key={lod.id} credit={lod.credit} prefix="Optional model: " />
              )) : null}
            </>
          ) : null}
        </fieldset>
        <button
          className="flight-panel__command"
          type="button"
          disabled={!hasChanges}
          onClick={() => setApplyError(onApply(selection))}
        >
          {!isActiveAircraft ? `Apply & fly ${definition.label}` : hasChanges ? "Apply model settings" : "Aircraft active"}
        </button>
        {hasChanges ? (
          <button
            className="flight-panel__command flight-panel__command--secondary"
            type="button"
            onClick={() => updateSelection(activeSelection)}
          >
            Return to active aircraft settings
          </button>
        ) : null}
        {applyError ? <p className="flight-panel__hint is-error" role="alert">{applyError}</p> : null}
      </section>
    </div>
  );
}
