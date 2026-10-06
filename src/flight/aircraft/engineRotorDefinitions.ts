/** 0sfs aircraft instrument metadata: one representative rotor row per shaft. */
export interface EngineRotorBladeCounts {
  readonly outer: number;
  readonly inner: number | null;
  readonly outerEstimated: boolean;
  readonly innerEstimated: boolean;
}

// Counts refer to one representative row on each shaft, not every stage on
// that shaft. Sources and the limits of analogue estimates are documented in
// docs/proposals/flight-settings.md#engine-shaft-indicators.
export const C172_ROTOR_BLADES: EngineRotorBladeCounts = Object.freeze({
  // Installed JSBSim prop_75in2f.xml: <numblades>2</numblades>.
  outer: 2, inner: null, outerEstimated: false, innerEstimated: false,
});

export const FJ33_ROTOR_BLADES: EngineRotorBladeCounts = Object.freeze({
  // Williams FJ33-5A IPC, 2024-12-09, 72-00-31 p2, P/N79408: 16-blade fan.
  // HP compressor is centrifugal. Its unreported rim count is represented by
  // NASA TM107515's 15 full + 15 splitter blades; this is NOT an FJ33 part count.
  outer: 16, inner: 30, outerEstimated: false, innerEstimated: true,
});

export const F135_ROTOR_BLADES: EngineRotorBladeCounts = Object.freeze({
  // Neither count is confirmed F135 hardware data. Representative transonic
  // axial rows: NASA Rotor67 fan (22), Rotor37 core compressor inlet (36).
  // Stationary inlet guide vanes visible in front photographs are not blades.
  outer: 22, inner: 36, outerEstimated: true, innerEstimated: true,
});
