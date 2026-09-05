export interface NorthButtonHandle {
  update(headingDeg: number): void;
  destroy(): void;
}

/**
 * Attaches a heading-tracking rotation to the north button's inner SVG.
 * Uses shortest-path angular interpolation to avoid snapping at the 0/360 boundary.
 */
export function createNorthButton(svg: SVGElement): NorthButtonHandle {
  let currentAngle = 0;

  function update(headingDeg: number): void {
    const target = -headingDeg;
    let delta = target - currentAngle;
    // Wrap delta into [-180, 180] for the shortest rotation path
    delta = ((delta + 180) % 360 + 360) % 360 - 180;
    currentAngle += delta;
    svg.style.transform = `rotate(${currentAngle}deg)`;
  }

  function destroy(): void {
    svg.style.transform = "";
  }

  return { update, destroy };
}
