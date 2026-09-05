export type RgbColor = [number, number, number];

export interface MarkerStyle {
  fill: RgbColor;
  stroke: RgbColor;
}

export const DEFAULT_DOT_TEXTURE_SIZE = 64;
export const DEFAULT_SPRITE_CAPACITY = 32_000;
export const EARTH_RADIUS_METERS = 6_371_000;

export function rgbToCss(rgb: RgbColor): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

export function markerStyleKey(style: MarkerStyle): string {
  return `${style.fill.join('-')}_${style.stroke.join('-')}`;
}
