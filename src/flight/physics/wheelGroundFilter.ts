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
 * A real wheel does not follow that noise: it is a circle roughly 0.29 m in
 * radius, so it bridges anything shorter than its contact patch and only
 * climbs what it cannot bridge. This filters the sampled height over DISTANCE
 * TRAVELLED with that radius as the length constant, which reproduces the
 * bridging without simulating the contact patch. Filtering over distance
 * rather than time matters: a parked aircraft must not drift, and a fast taxi
 * must not be over-smoothed.
 *
 * Steps taller than the wheel can climb are passed straight through. Those are
 * kerbs and cliffs, not surface noise, and hiding one would drive the aircraft
 * through it.
 */

/** Main tyre radius of a C172 on 6.00-6 wheels. */
export const WHEEL_RADIUS_METERS = 0.29;

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

export function createWheelGroundFilter(radiusMeters = WHEEL_RADIUS_METERS): WheelGroundFilter {
  const maxBridged = radiusMeters * 2;
  let filtered: number | null = null;
  return {
    height(rawMeters: number, movedMeters: number, snap: boolean): number {
      if (filtered === null || snap || !Number.isFinite(movedMeters)
        || Math.abs(rawMeters - filtered) > maxBridged) {
        filtered = rawMeters;
        return filtered;
      }
      filtered += (rawMeters - filtered) * (1 - Math.exp(-Math.max(movedMeters, 0) / radiusMeters));
      return filtered;
    },
    reset(): void { filtered = null; },
  };
}
