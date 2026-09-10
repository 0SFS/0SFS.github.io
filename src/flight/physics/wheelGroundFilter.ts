/**
 * The ground height a wheel rides at, as opposed to the height directly under
 * a single point.
 *
 * JSBSim's contacts are points, and the surface handed to them is one scalar
 * elevation resampled every 120 Hz from photogrammetry. Photogrammetry is
 * noisy at the centimetre-to-decimetre scale, so a point sample makes the
 * whole ground plane twitch under a parked or taxiing aircraft and keeps the
 * oleos permanently excited - the aircraft buzzes over a surface a real
 * aeroplane would roll across smoothly.
 *
 * This heuristic filters the sampled height over DISTANCE TRAVELLED with a
 * tuned 0.29 m length constant, approximating how a tire bridges short surface
 * noise without simulating the contact patch. It is not a measured tire radius
 * or an exact circle-versus-ground query. Filtering over distance
 * rather than time matters: a parked aircraft must not drift, and a fast taxi
 * must not be over-smoothed.
 *
 * Steps taller than the wheel can climb are passed straight through. Those are
 * kerbs and cliffs, not surface noise, and hiding one would drive the aircraft
 * through it.
 */

/** Existing terrain smoothing tune; independent of the wheel-spin tire radii. */
export const GROUND_FILTER_LENGTH_METERS = 0.29;

export interface WheelGroundFilter {
  /**
   * @param rawMeters   height sampled from the displayed surface
   * @param movedMeters horizontal distance travelled since the last call
   * @param snap        adopt the raw height outright (placement, a refined
   *                    world, or too high for the wheels to be involved)
   */
  height(rawMeters: number, movedMeters: number, snap: boolean): number;
  reset(): void;
}

export function createWheelGroundFilter(lengthMeters = GROUND_FILTER_LENGTH_METERS): WheelGroundFilter {
  const maxBridged = lengthMeters * 2;
  let filtered: number | null = null;
  return {
    height(rawMeters: number, movedMeters: number, snap: boolean): number {
      if (filtered === null || snap || !Number.isFinite(movedMeters)
        || Math.abs(rawMeters - filtered) > maxBridged) {
        filtered = rawMeters;
        return filtered;
      }
      filtered += (rawMeters - filtered) * (1 - Math.exp(-Math.max(movedMeters, 0) / lengthMeters));
      return filtered;
    },
    reset(): void { filtered = null; },
  };
}
