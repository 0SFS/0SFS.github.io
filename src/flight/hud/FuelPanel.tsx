import "./fuelPanel.css";

import { useRef, type CSSProperties } from "react";
import type { AircraftFamilyId } from "../aircraft/aircraftIds";
import { fuelTankShape, getAircraftFuelLayout, type FuelTankShape } from "../aircraft/fuelTankLayouts";
import { distributeFuel, type FuelTankReading } from "../jsbsim/fuelTanks";

export interface FuelPanelState {
  familyId: AircraftFamilyId;
  /** Every tank the flight model has, as it stands. */
  tanks: readonly FuelTankReading[];
}

export interface FuelPanelProps {
  state: FuelPanelState;
  /** New contents in pounds, by JSBSim tank number; tanks not listed keep theirs. */
  onChange(contentsLbs: ReadonlyMap<number, number>): void;
  /** Release an external tank and its fuel, or attach an empty replacement. */
  onAttachmentChange?(index: number, attached: boolean): void;
}

/** Room around the aircraft, in inches, so no box touches the edge. */
const MARGIN_IN = 8;

function pounds(value: number): string {
  return `${Math.round(value).toLocaleString()} lb`;
}

function percent(contents: number, capacity: number): number {
  return capacity > 0 ? Math.round(contents / capacity * 100) : 0;
}

function describe(contents: number, capacity: number): string {
  return `${pounds(contents)} of ${pounds(capacity)}, ${percent(contents, capacity)}%`;
}

/** A gauge that is its own slider: drag or click anywhere along it, or use the arrow keys. */
function FuelGauge({ label, contents, capacity, vertical = false, detached = false, className, style, onChange, onSettled }: {
  label: string;
  contents: number;
  capacity: number;
  vertical?: boolean;
  detached?: boolean;
  className: string;
  style?: CSSProperties;
  onChange(value: number): void;
  onSettled?(): void;
}) {
  const level = `${capacity > 0 ? Math.min(100, Math.max(0, contents / capacity * 100)) : 0}%`;
  return (
    <div className={`flight-fuel__gauge ${className}${vertical ? " is-vertical" : ""}${detached ? " is-detached" : ""}`} style={style}
      title={`${label}: ${detached ? "Detached" : describe(contents, capacity)}`}>
      <div className="flight-fuel__level" style={vertical ? { height: level } : { width: level }} />
      <span className="flight-fuel__percent" aria-hidden="true">{detached ? "—" : `${percent(contents, capacity)}%`}</span>
      <input
        type="range"
        min={0}
        max={capacity}
        step={1}
        value={contents}
        disabled={detached}
        aria-label={label}
        aria-valuetext={detached ? "Detached" : describe(contents, capacity)}
        onChange={event => onChange(Number(event.target.value))}
        onPointerUp={onSettled}
        onKeyUp={onSettled}
        onBlur={onSettled}
      />
    </div>
  );
}

/**
 * Fuel: one gauge for everything on board, and the aircraft from above with
 * each tank drawn where the flight model puts it and a gauge of its own.
 */
export function FuelPanel({ state, onChange, onAttachmentChange }: FuelPanelProps) {
  // The load the total slider started from, kept until it is let go, so
  // dragging it back returns the pilot's own split exactly.
  const totalBase = useRef<{ tanks: readonly FuelTankReading[]; attachmentKey: string } | null>(null);
  const layout = getAircraftFuelLayout(state.familyId);
  // Left to right, as drawn, for the legend and for moving between gauges with Tab.
  const tanks = state.tanks.map(tank => ({ tank, shape: fuelTankShape(layout, tank.index, tank.yIn) }))
    .sort((a, b) => a.tank.yIn - b.tank.yIn || a.tank.xIn - b.tank.xIn);
  const attachedTanks = state.tanks.filter(tank => tank.attached !== false);
  const attachmentKey = `${state.familyId}:${state.tanks.map(tank => `${tank.index}:${tank.attached}:${tank.capacityLbs}`).join(",")}`;
  const capacity = attachedTanks.reduce((sum, tank) => sum + tank.capacityLbs, 0);
  const total = attachedTanks.reduce((sum, tank) => sum + tank.contentsLbs, 0);
  const gallons = attachedTanks.reduce((sum, tank) => sum + (tank.densityLbsPerGal > 0 ? tank.contentsLbs / tank.densityLbsPerGal : 0), 0);
  const externalTanks = state.tanks.filter(tank => tank.attached !== undefined);
  const externalCapacity = attachedTanks.reduce((sum, tank) => sum + (tank.attached ? tank.capacityLbs : 0), 0);

  if (state.tanks.length === 0) {
    return <div className="flight-panel__content">
      <p className="flight-panel__hint">The flight model reports no fuel tanks for this aircraft.</p>
    </div>;
  }

  const setTotal = (value: number): void => {
    // A tank released or replaced during a drag changes the available load.
    // Rebase before distributing so a stale split cannot refill a missing tank.
    if (totalBase.current?.attachmentKey !== attachmentKey) {
      totalBase.current = { tanks: attachedTanks, attachmentKey };
    }
    const base = totalBase.current.tanks;
    const contents = distributeFuel(base, value);
    onChange(new Map(base.map((tank, i) => [tank.index, contents[i]!])));
  };

  // The drawing: structural y across, x down, so the nose points up.
  const box = (tank: FuelTankReading, shape: FuelTankShape) => ({
    left: tank.yIn - shape.spanIn / 2, right: tank.yIn + shape.spanIn / 2,
    top: tank.xIn - shape.chordIn / 2, bottom: tank.xIn + shape.chordIn / 2,
  });
  const boxes = tanks.map(({ tank, shape }) => box(tank, shape));
  const minY = Math.min(layout.bounds.minY, ...boxes.map(b => b.left)) - MARGIN_IN;
  const maxY = Math.max(layout.bounds.maxY, ...boxes.map(b => b.right)) + MARGIN_IN;
  const minX = Math.min(layout.bounds.minX, ...boxes.map(b => b.top)) - MARGIN_IN;
  const maxX = Math.max(layout.bounds.maxX, ...boxes.map(b => b.bottom)) + MARGIN_IN;
  const width = maxY - minY;
  const height = maxX - minX;
  const share = (value: number, of: number) => `${value / of * 100}%`;

  return (
    <div className="flight-panel__content flight-fuel">
      <div className="flight-panel__field">
        <span>Total fuel<output>{`${describe(total, capacity)} · ${gallons.toFixed(1)} gal`}</output></span>
        <FuelGauge className="flight-fuel__total" label="Total fuel" contents={total} capacity={capacity}
          onChange={setTotal} onSettled={() => { totalBase.current = null; }} />
      </div>
      {externalTanks.length > 0 && <p className="flight-panel__hint">
        Capacity: internal {pounds(capacity - externalCapacity)} · attached external {pounds(externalCapacity)}.
      </p>}
      <p className="flight-panel__hint">
        Lowering the total takes the same share of every attached tank&apos;s fuel; raising it fills the same share of every attached tank&apos;s empty space.
      </p>
      <div className="flight-fuel__aircraft" style={{ "--flight-fuel-aspect": width / height } as CSSProperties}>
        <svg className="flight-fuel__outline" viewBox={`${minY} ${minX} ${width} ${height}`} aria-hidden="true">
          {layout.outlines.map((outline, i) => (
            <polygon key={i} points={outline.map(([x, y]) => `${y},${x}`).join(" ")} />
          ))}
        </svg>
        {tanks.map(({ tank, shape }, i) => {
          const b = boxes[i]!;
          return <FuelGauge key={tank.index} className="flight-fuel__tank" label={`${shape.label} tank`}
            contents={tank.attached === false ? 0 : tank.contentsLbs} capacity={tank.capacityLbs}
            detached={tank.attached === false} vertical={shape.chordIn > shape.spanIn}
            style={{
              left: share(b.left - minY, width), top: share(b.top - minX, height),
              width: share(shape.spanIn, width), height: share(shape.chordIn, height),
            }}
            onChange={value => onChange(new Map([[tank.index, value]]))} />;
        })}
      </div>
      <ul className="flight-fuel__legend" aria-label="Tanks">
        {tanks.map(({ tank, shape }) => (
          <li key={tank.index}>
            <strong>{shape.label}</strong>
            <span>{tank.attached === false ? "Detached" : describe(tank.contentsLbs, tank.capacityLbs)}</span>
            {tank.attached !== undefined && onAttachmentChange && <button type="button" className="flight-panel__command"
              aria-label={`${tank.attached ? "Jettison" : "Respawn"} ${shape.label.toLowerCase()} tank`}
              onClick={() => {
                totalBase.current = null;
                onAttachmentChange(tank.index, !tank.attached);
              }}>
              {tank.attached ? "Jettison" : "Respawn empty"}
            </button>}
          </li>
        ))}
      </ul>
      {externalTanks.length > 0 && onAttachmentChange && <p className="flight-panel__hint">
        Jettison releases a tank and its fuel. Respawn adds an empty tank.
      </p>}
      {layout.note && <p className="flight-panel__hint">{layout.note}</p>}
      {layout.credit && <p className="flight-panel__hint">{layout.credit}</p>}
      {layout.equipmentCredit && <p className="flight-panel__hint">
        {layout.equipmentCredit.text}{" "}
        <a href={`${import.meta.env.BASE_URL}${layout.equipmentCredit.url}`} target="_blank" rel="noreferrer noopener">Source and licence</a>
      </p>}
    </div>
  );
}
